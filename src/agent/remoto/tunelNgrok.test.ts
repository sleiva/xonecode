/**
 * El túnel con un `ngrok` FALSO: un script de `sh` en un temporal que escribe líneas de verdad
 * de ngrok v3 (`core/__oro__/ngrok-v3*.jsonl`) y se queda vivo, o sale. Lanza procesos de
 * verdad a propósito, como `matarGrupoReal.integracion.test.ts`: lo que se prueba —que cerrar
 * mata el GRUPO, nieto incluido— no se ve con un `EventEmitter`. Ni ngrok, ni red, ni el paquete:
 * el puente es un módulo falso que apunta si se cerró.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MOTIVOS_DEL_TUNEL } from "../../core/tunel.js";
import { matarGrupoReal } from "../dispositivos/procesosEnMaquina.js";
import type { ModuloServidorRemoto } from "./puenteWebSocket.js";
import { crearTunelNgrok, type DependenciasDelTunel } from "./tunelNgrok.js";

const ORO = join(import.meta.dirname, "..", "..", "core", "__oro__");
const linea = (fichero: string, msg: string) =>
  readFileSync(join(ORO, fichero), "utf8")
    .split("\n")
    .find((l) => l.includes(`"msg":"${msg}"`))!;

const carpetas: string[] = [];
afterEach(() => {
  for (const c of carpetas.splice(0)) {
    // Si un test falló a medias, que no quede un `sleep` huérfano.
    const nieto = join(c, "nieto");
    if (existsSync(nieto)) {
      try {
        process.kill(Number(readFileSync(nieto, "utf8")), "SIGKILL");
      } catch {
        // ya no estaba
      }
    }
    rmSync(c, { recursive: true, force: true });
  }
});

/** Un `ngrok` de mentira con este cuerpo de `sh`; `$D` es su carpeta y deja ahí sus argumentos. */
function ngrokFalso(cuerpo: string): { binario: string; carpeta: string } {
  const carpeta = mkdtempSync(join(tmpdir(), "xonecode-ngrok-falso-"));
  carpetas.push(carpeta);
  const binario = join(carpeta, "ngrok");
  writeFileSync(binario, `#!/bin/sh\nD='${carpeta}'\necho "$@" > "$D/args"\n${cuerpo}\n`);
  chmodSync(binario, 0o755);
  return { binario, carpeta };
}

/** Escribe el fichero `nombre` en la carpeta y lo devuelve citado para el script. */
function fichero(carpeta: string, nombre: string, texto: string): string {
  const ruta = join(carpeta, nombre);
  writeFileSync(ruta, texto);
  return `'${ruta}'`;
}

/**
 * Un `sleep` HIJO del script (no `exec`): así matar el grupo tiene que llevarse al nieto. Su pid
 * se apunta ANTES de escribir el log, para que esté en disco cuando el túnel ya tiene dirección.
 */
const NIETO = 'sleep 600 &\necho $! > "$D/nieto"';
const QUEDARSE_VIVO = `${NIETO}\nwait`;

function puenteFalso() {
  const registro = { arrancados: 0, cerrados: 0, puertos: [] as number[] };
  const modulo: ModuloServidorRemoto = {
    async arrancarServidor({ puerto }) {
      registro.arrancados += 1;
      registro.puertos.push(puerto);
      return {
        urlHttp: "http://127.0.0.1:45678",
        urlWs: "ws://127.0.0.1:45678/ws",
        cerrar: async () => {
          registro.cerrados += 1;
        },
      };
    },
  };
  return { registro, modulo };
}

function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function deps(binario: string | undefined, modulo: ModuloServidorRemoto | undefined, extra: DependenciasDelTunel = {}): DependenciasDelTunel {
  return {
    localizar: () => binario,
    cargarServidor: async () => modulo,
    alSalirDelProceso: () => () => {},
    esperaAlMatarMs: 2_000,
    ...extra,
  };
}

describe.skipIf(process.platform === "win32")("el túnel de ngrok, con un ngrok falso", () => {
  it("lee la dirección del log JSON, devuelve wss://…/ws, y cerrar mata el GRUPO y luego el puente", async () => {
    const { binario, carpeta } = ngrokFalso("");
    const log = fichero(carpeta, "log", readFileSync(join(ORO, "ngrok-v3.jsonl"), "utf8").split("\n").slice(0, 6).join("\n") + "\n");
    writeFileSync(binario, readFileSync(binario, "utf8") + `${NIETO}\ncat ${log}\nwait\n`);
    const { registro, modulo } = puenteFalso();

    const tunel = await crearTunelNgrok(deps(binario, modulo)).abrir({});
    expect(tunel.servidor).toBe("wss://1a2b-203-0-113-7.ngrok-free.app/ws");
    expect(registro.puertos).toEqual([0]);
    expect(readFileSync(join(carpeta, "args"), "utf8").trim()).toBe("http 127.0.0.1:45678 --log stdout --log-format json");

    const nieto = Number(readFileSync(join(carpeta, "nieto"), "utf8"));
    expect(vivo(nieto)).toBe(true);
    const caidas: string[] = [];
    tunel.alCaer((m) => caidas.push(m));

    await tunel.cerrar();
    await expect.poll(() => vivo(nieto)).toBe(false);
    expect(registro.cerrados).toBe(1);
    await tunel.cerrar();
    expect(registro.cerrados).toBe(1);
    // Cerrar a propósito no es caerse.
    expect(caidas).toEqual([]);
  });

  it("con dominio, se lo pide a ngrok con --url", async () => {
    const { binario, carpeta } = ngrokFalso("");
    const log = fichero(carpeta, "log", linea("ngrok-v3.jsonl", "started tunnel") + "\n");
    writeFileSync(binario, readFileSync(binario, "utf8") + `${NIETO}\ncat ${log}\nwait\n`);
    const tunel = await crearTunelNgrok(deps(binario, puenteFalso().modulo)).abrir({ dominio: "mi-app.ngrok.app" });
    expect(readFileSync(join(carpeta, "args"), "utf8").trim()).toBe(
      "http 127.0.0.1:45678 --url mi-app.ngrok.app --log stdout --log-format json"
    );
    await tunel.cerrar();
  });

  it("un authtoken que ngrok no acepta da el motivo FIJO, y el puente se cierra", async () => {
    const { binario, carpeta } = ngrokFalso("");
    const oro = readFileSync(join(ORO, "ngrok-v3-authtoken-invalido.jsonl"), "utf8").split("\n");
    const json = fichero(carpeta, "json", oro.filter((l) => l.startsWith("{")).join("\n") + "\n");
    const err = fichero(carpeta, "err", oro.filter((l) => l.startsWith("ERROR")).join("\n") + "\n");
    writeFileSync(binario, readFileSync(binario, "utf8") + `cat ${json}\ncat ${err} >&2\nexit 1\n`);
    const { registro, modulo } = puenteFalso();

    const fallo = await crearTunelNgrok(deps(binario, modulo))
      .abrir({})
      .then(
        () => undefined,
        (e: Error) => e
      );
    expect(fallo?.message).toBe(MOTIVOS_DEL_TUNEL.autenticacion);
    expect(fallo?.message).not.toMatch(/ERR_NGROK|authtoken:|redactado/);
    expect(registro.cerrados).toBe(1);
  });

  it("el error de dominio, aunque llegue SOLO por stderr", async () => {
    const { binario, carpeta } = ngrokFalso("");
    const err = fichero(
      carpeta,
      "err",
      readFileSync(join(ORO, "ngrok-v3-dominio-ajeno.jsonl"), "utf8")
        .split("\n")
        .filter((l) => l.startsWith("ERROR"))
        .join("\n") + "\n"
    );
    writeFileSync(binario, readFileSync(binario, "utf8") + `cat ${err} >&2\nexit 1\n`);
    await expect(crearTunelNgrok(deps(binario, puenteFalso().modulo)).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.dominio);
  });

  it("un ngrok que no dice nada: tiempo agotado, y no queda nadie vivo", async () => {
    const { binario, carpeta } = ngrokFalso(QUEDARSE_VIVO);
    const { registro, modulo } = puenteFalso();
    await expect(crearTunelNgrok(deps(binario, modulo, { topeMs: 400 })).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.sinDireccion);
    await expect.poll(() => vivo(Number(readFileSync(join(carpeta, "nieto"), "utf8")))).toBe(false);
    expect(registro.cerrados).toBe(1);
  });

  it("si ngrok sale DESPUÉS de dar la dirección: alCaer una vez, con texto fijo, y el puente se cierra", async () => {
    const { binario, carpeta } = ngrokFalso("");
    const log = fichero(carpeta, "log", linea("ngrok-v3.jsonl", "started tunnel") + "\n");
    writeFileSync(binario, readFileSync(binario, "utf8") + `cat ${log}\nsleep 0.3\nexit 1\n`);
    const { registro, modulo } = puenteFalso();
    const tunel = await crearTunelNgrok(deps(binario, modulo)).abrir({});
    const caidas = await new Promise<string[]>((resolver) => {
      const vistas: string[] = [];
      tunel.alCaer((m) => {
        vistas.push(m);
        setTimeout(() => resolver(vistas), 100);
      });
    });
    expect(caidas).toEqual([MOTIVOS_DEL_TUNEL.seCerro]);
    expect(registro.cerrados).toBe(1);
    // Quien se apunta tarde se entera igual.
    const tarde = await new Promise<string>((r) => tunel.alCaer(r));
    expect(tarde).toBe(MOTIVOS_DEL_TUNEL.seCerro);
    await tunel.cerrar();
    expect(registro.cerrados).toBe(1);
  });

  it("un binario que no se puede lanzar es «no instalado», con el puente cerrado", async () => {
    const { registro, modulo } = puenteFalso();
    await expect(crearTunelNgrok(deps("/no/existe/ngrok", modulo)).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.noInstalado);
    expect(registro.cerrados).toBe(1);
  });
});

describe.skipIf(process.platform === "win32")("el túnel de ngrok: orden, señales, entorno y avisos", () => {
  /** Un `ngrok` falso que da la dirección y se queda vivo con su nieto. */
  function conDireccion(antes = ""): { binario: string; carpeta: string } {
    const f = ngrokFalso("");
    const log = fichero(f.carpeta, "log", linea("ngrok-v3.jsonl", "started tunnel") + "\n");
    writeFileSync(f.binario, readFileSync(f.binario, "utf8") + `${antes}\n${NIETO}\ncat ${log}\nwait\n`);
    return f;
  }

  it("cerrar mata ngrok ANTES de cerrar el puente", async () => {
    const { binario } = conDireccion();
    const orden: string[] = [];
    const modulo: ModuloServidorRemoto = {
      arrancarServidor: async () => ({
        urlHttp: "http://127.0.0.1:45678",
        urlWs: "ws://127.0.0.1:45678/ws",
        cerrar: async () => void orden.push("puente"),
      }),
    };
    const matarGrupo = (pid: number, senal: string) => {
      orden.push(senal);
      matarGrupoReal(pid, senal);
    };
    const tunel = await crearTunelNgrok(deps(binario, modulo, { matarGrupo })).abrir({});
    await tunel.cerrar();
    expect(orden).toEqual(["SIGTERM", "puente"]);
  });

  it("un ngrok que ignora SIGTERM recibe SIGKILL tras la espera, y el grupo muere", async () => {
    // `trap '' TERM` se hereda: el `sleep` nieto también lo ignora.
    const { binario, carpeta } = conDireccion("trap '' TERM");
    const senales: string[] = [];
    const matarGrupo = (pid: number, senal: string) => {
      senales.push(senal);
      matarGrupoReal(pid, senal);
    };
    const tunel = await crearTunelNgrok(deps(binario, puenteFalso().modulo, { matarGrupo, esperaAlMatarMs: 300 })).abrir({});
    await tunel.cerrar();
    expect(senales).toEqual(["SIGTERM", "SIGKILL"]);
    // Con poll: el nieto muerto por SIGKILL puede seguir un instante como zombi hasta que lo recoja init.
    await expect.poll(() => vivo(Number(readFileSync(join(carpeta, "nieto"), "utf8")))).toBe(false);
  });

  it("ngrok NO hereda las claves de los proveedores; sí NGROK_* y PATH", async () => {
    const { binario, carpeta } = conDireccion('/usr/bin/env > "$D/env"');
    const entorno = {
      PATH: process.env.PATH,
      HOME: "/casa",
      ANTHROPIC_API_KEY: "sk-ant-secreta",
      DEEPSEEK_API_KEY: "sk-ds-secreta",
      XONECODE_CLAVE_MIO: "personalizada",
      NGROK_AUTHTOKEN: "2abc_token",
    };
    const tunel = await crearTunelNgrok(deps(binario, puenteFalso().modulo, { entorno })).abrir({});
    await tunel.cerrar();
    const env = readFileSync(join(carpeta, "env"), "utf8");
    expect(env).not.toMatch(/ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|XONECODE_CLAVE_MIO|secreta/);
    expect(env).toContain("NGROK_AUTHTOKEN=2abc_token");
    expect(env).toContain("HOME=/casa");
    expect(env).toMatch(/^PATH=/m);
  });

  it("el fallo se clasifica por las ÚLTIMAS líneas, aunque antes haya habido muchas", async () => {
    const { binario, carpeta } = ngrokFalso("");
    const ruido = Array.from({ length: 500 }, (_, i) => `{"lvl":"info","msg":"ruido ${i}"}`).join("\n");
    const oro = readFileSync(join(ORO, "ngrok-v3-authtoken-invalido.jsonl"), "utf8").split("\n").filter((l) => l.startsWith("{"));
    const log = fichero(carpeta, "log", `${ruido}\n${oro.join("\n")}\n`);
    writeFileSync(binario, readFileSync(binario, "utf8") + `cat ${log}\nexit 1\n`);
    await expect(crearTunelNgrok(deps(binario, puenteFalso().modulo)).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.autenticacion);
  });

  it("al caer: el puente ya está cerrado al avisar, y un aviso que lanza no tumba a los demás", async () => {
    const { binario, carpeta } = ngrokFalso("");
    const log = fichero(carpeta, "log", linea("ngrok-v3.jsonl", "started tunnel") + "\n");
    writeFileSync(binario, readFileSync(binario, "utf8") + `cat ${log}\nsleep 0.3\nexit 1\n`);
    const { registro, modulo } = puenteFalso();
    const tunel = await crearTunelNgrok(deps(binario, modulo)).abrir({});
    const cerradosAlAvisar: number[] = [];
    tunel.alCaer(() => {
      throw new Error("un oyente roto");
    });
    const segundo = new Promise<string>((r) =>
      tunel.alCaer((m) => {
        cerradosAlAvisar.push(registro.cerrados);
        r(m);
      })
    );
    expect(await segundo).toBe(MOTIVOS_DEL_TUNEL.seCerro);
    expect(cerradosAlAvisar).toEqual([1]);
  });

  it("engancha UN aviso de salida del proceso, que mata el grupo, y lo suelta cuando ngrok sale", async () => {
    const { binario, carpeta } = conDireccion();
    const enganchados: (() => void)[] = [];
    let soltados = 0;
    const alSalirDelProceso = (f: () => void) => {
      enganchados.push(f);
      return () => void (soltados += 1);
    };
    const tunel = await crearTunelNgrok(deps(binario, puenteFalso().modulo, { alSalirDelProceso })).abrir({});
    expect(enganchados).toHaveLength(1);
    expect(soltados).toBe(0);
    // Lo que haría el `exit` del proceso: matar el grupo en el acto.
    enganchados[0]!();
    const nieto = Number(readFileSync(join(carpeta, "nieto"), "utf8"));
    await expect.poll(() => vivo(nieto)).toBe(false);
    await expect.poll(() => soltados).toBe(1);
    await tunel.cerrar();
    expect(soltados).toBe(1);
  });
});

describe("el túnel, antes de lanzar nada", () => {
  it("sin ngrok en el PATH: no instalado, y el puente ni arranca", async () => {
    const { registro, modulo } = puenteFalso();
    await expect(crearTunelNgrok(deps(undefined, modulo)).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.noInstalado);
    expect(registro.arrancados).toBe(0);
  });

  it("un paquete sin el puente: el motivo de versión vieja", async () => {
    await expect(crearTunelNgrok(deps("/x/ngrok", undefined)).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.paqueteViejo);
  });

  it("un puente que no arranca: su motivo fijo, sin el error de Node", async () => {
    const modulo: ModuloServidorRemoto = {
      arrancarServidor: async () => {
        throw Object.assign(new Error("listen EADDRINUSE /Users/x"), { code: "EADDRINUSE" });
      },
    };
    await expect(crearTunelNgrok(deps("/x/ngrok", modulo)).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.puente);
  });

  it("un dominio sin forma no llega a ngrok", async () => {
    const { registro, modulo } = puenteFalso();
    await expect(crearTunelNgrok(deps("/x/ngrok", modulo)).abrir({ dominio: "https://x.ngrok.app/" })).rejects.toThrow(
      MOTIVOS_DEL_TUNEL.dominio
    );
    expect(registro.arrancados).toBe(0);
  });
});
