/**
 * Todo offline: el catálogo de modelos es el doble de `core/ports.ts`, la conexión con
 * CloudStudio y las cuatro escrituras entran inyectadas, y ningún test toca el
 * `~/.xonecode` de verdad — las rutas que se afirman son las que devuelven los dobles.
 *
 * Correcciones al enunciado, y por qué: `ModeloDisponible` (`core/ports.ts:83`) es
 * `{proveedor, id, nombre?}`, no `{id, etiqueta}`, así que el doble del catálogo se
 * escribe con la forma que existe — un doble con la forma inventada compila mal y, si
 * compilara, probaría un contrato que nadie implementa. Y `dobles()` gana los entornos
 * registrados y el escritor de `config.json`: sin ellos, `completarProyecto` escribiría en
 * el workspace de verdad del usuario que corre los tests.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearVestibulo, ENTORNOS_OFICIALES, escribirProyectoEnDisco } from "./vestibulo.js";
import { CatalogoModelosEnMemoria } from "../../core/ports.js";
import type { Acto } from "../../core/actos.js";
import type { Entorno } from "../../core/settings.js";
import { validar } from "../../core/config.js";

function dobles() {
  const escrituras: string[] = [];
  const entornos: Entorno[] = [
    { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
  ];
  return {
    catalogoModelos: new CatalogoModelosEnMemoria({
      anthropic: [{ proveedor: "anthropic" as const, id: "claude-x", nombre: "Claude X" }],
    }),
    guardarCredencial: (p: string) => {
      escrituras.push(`cred:${p}`);
      return { ruta: "/casa/.xonecode/auth.json" };
    },
    guardarEntorno: (e: { id: string }) => {
      escrituras.push(`entorno:${e.id}`);
      return { ruta: "/casa/.xonecode/settings.json" };
    },
    guardarConfigDeProyecto: (raiz: string) => {
      escrituras.push(`config:${raiz}`);
      return { ruta: `${raiz}/.xonecode/config.json` };
    },
    descargar: async () => {
      escrituras.push("descarga");
    },
    adoptarLegado: (e: { id: string }) => {
      escrituras.push(`legado:${e.id}`);
    },
    guardarModeloGlobal: (papel: string, id: string) => {
      escrituras.push(`modelo:${papel}`);
      return { ruta: "/casa/.xonecode/config.json", id };
    },
    entornos,
    baseDeWorkspace: "/w",
    escrituras,
  };
}

/** Un puerto de sesiones en memoria: los tests no escriben en ningún `.xonecode`. */
function sesionesEnMemoria() {
  const jsonl = new Map<string, Acto[]>();
  return {
    jsonl,
    puerto: {
      crear: (raiz: string) => {
        const id = `s${jsonl.size + 1}`;
        jsonl.set(`${raiz}|${id}`, []);
        return id;
      },
      anotar: (raiz: string, id: string, acto: Acto) => {
        const clave = `${raiz}|${id}`;
        jsonl.set(clave, [...(jsonl.get(clave) ?? []), acto]);
      },
      reabrir: (raiz: string, id: string) => ({
        id,
        actos: [...(jsonl.get(`${raiz}|${id}`) ?? [])],
        historica: true,
      }),
    },
  };
}

describe("vestíbulo", () => {
  it("el paso de cuenta NO aparece si ya hay una elección", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global" });
    expect(await v.pasosPendientes()).not.toContain("cuenta");
  });

  it("el paso de cuenta aparece si `trabajo` resuelve por omisión, sin marca de primer arranque", async () => {
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "omision" });
    expect(await v.pasosPendientes()).toContain("cuenta");
  });

  it("el paso de entorno solo falta si no hay ninguno registrado", async () => {
    const con = crearVestibulo({ ...dobles(), origenDeTrabajo: "global" });
    expect(await con.pasosPendientes()).not.toContain("entorno");
    const sin = crearVestibulo({ ...dobles(), entornos: [], origenDeTrabajo: "global" });
    expect(await sin.pasosPendientes()).toContain("entorno");
  });

  it("el paso de entorno ofrece los dos oficiales y un «otro»", async () => {
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "omision" });
    const opciones = v.opcionesDeEntorno();
    expect(opciones.map((o) => o.id)).toContain("webstudio");
    expect(opciones.map((o) => o.id)).toContain("manager");
    expect(opciones.map((o) => o.id)).toContain("otro");
  });

  it("los dos oficiales van pre-rellenados y «otro» no inventa una URL", () => {
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "omision" });
    const porId = new Map(v.opcionesDeEntorno().map((o) => [o.id, o]));
    expect(porId.get("webstudio")!.url).toBe("https://mcp.xonewebstudio.com/mcp");
    expect(porId.get("manager")!.url).toMatch(/^https:\/\//);
    expect(porId.get("otro")!.url).toBe("");
    expect(ENTORNOS_OFICIALES).toHaveLength(2);
  });

  it("cancelar antes de elegir no escribe NADA", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "omision" });
    await v.cancelar();
    expect(d.escrituras).toEqual([]);
  });

  it("una credencial tecleada queda escrita aunque se cancele después, y se DICE", async () => {
    const d = dobles();
    const dichos: string[] = [];
    const v = crearVestibulo({ ...d, origenDeTrabajo: "omision", informar: (t) => dichos.push(t) });
    await v.guardarCredencialDe("anthropic", "sk-…");
    await v.cancelar();
    expect(d.escrituras).toContain("cred:anthropic");
    expect(dichos.join("\n")).toMatch(/auth\.json/);
  });

  it("registrar un entorno adopta el fichero OAuth plano de antes de los entornos", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, entornos: [], origenDeTrabajo: "global" });
    await v.registrarEntorno({ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" });
    expect(d.escrituras).toEqual(["entorno:webstudio", "legado:webstudio"]);
    // Y queda registrado, así que el paso de entorno deja de faltar.
    expect(await v.pasosPendientes()).not.toContain("entorno");
  });

  it("un entorno con URL que no es HTTPS no se registra", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, entornos: [], origenDeTrabajo: "global" });
    await expect(v.registrarEntorno({ id: "malo", nombre: "Malo", url: "http://interno/mcp" })).rejects.toThrow(/HTTPS/);
    expect(d.escrituras).toEqual([]);
  });

  it("abrir un proyecto con otro abierto cierra el primero", async () => {
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    const a = await v.abrirProyecto({ raiz: "/w/a" });
    const b = await v.abrirProyecto({ raiz: "/w/b" });
    expect(a.cerrada).toBe(true);
    expect(b.cerrada).toBe(false);
    expect(v.proyectoAbierto()).toBe(b);
    await v.cerrar();
  });

  it("el lazo anterior TERMINA antes de que arranque el siguiente, no solo se le pide que acabe", async () => {
    const s = sesionesEnMemoria();
    // La costura `correr` registra el orden de inicio y fin de cada lazo. Es lo único que
    // distingue «se esperó al retorno» de «se pidió el cierre y se siguió»: sin el `await`,
    // los dos `correrConsola` conviven un rato y comparten el ejecutor real, que es
    // exactamente lo que «una consola de proyecto a la vez» prohíbe.
    const traza: string[] = [];
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      correr: async (consola, estado) => {
        traza.push(`inicio ${estado.raiz}`);
        for await (const _linea of consola.lineas) {
          // El lazo real consume líneas hasta el EOF; aquí basta con llegar a él.
        }
        // El EOF no devuelve al instante: `correrConsola` puede estar DENTRO de un turno
        // cuando llega, y no lo mira hasta que ese turno acaba. Sin esta espera el test no
        // distingue nada — el cierre resuelve la cola en el mismo microtask y el orden sale
        // bien incluso sin esperar al retorno (medido).
        await new Promise((r) => setTimeout(r, 5));
        traza.push(`fin ${estado.raiz}`);
        return 0;
      },
    });
    await v.abrirProyecto({ raiz: "/w/a" });
    await v.abrirProyecto({ raiz: "/w/b" });
    expect(traza).toEqual(["inicio /w/a", "fin /w/a", "inicio /w/b"]);
    await v.cerrar();
    expect(traza).toEqual(["inicio /w/a", "fin /w/a", "inicio /w/b", "fin /w/b"]);
  });

  it("cerrar la consola de proyecto ABORTA la sesión real: si no, un turno en vuelo la colgaría", async () => {
    const s = sesionesEnMemoria();
    let cerrada = false;
    // Un ejecutor que no resuelve NUNCA por su cuenta: solo el `cerrar()` de la sesión
    // real puede desbloquearlo. Es el turno largo del caso real, sin esperar minutos.
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: (alAbrirSesion) => {
        return async () => {
          await new Promise<void>((resuelto) => {
            alAbrirSesion({
              cerrar: () => {
                cerrada = true;
                resuelto();
              },
            });
          });
        };
      },
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    proyecto.recibir({ clase: "prosa", texto: "haz algo largo" });
    // La consola arranca el turno en cuanto la línea entra en la cola.
    await new Promise((r) => setTimeout(r, 0));
    await proyecto.cerrar();
    expect(cerrada).toBe(true);
    expect(proyecto.cerrada).toBe(true);
  });

  it("cerrar DURANTE la construcción de la sesión real también aborta: el aviso llega tarde", async () => {
    const s = sesionesEnMemoria();
    let cerrada = false;
    // `crearEjecutorReal` avisa de la sesión DESPUÉS de `inspeccionar` y `abrirSesionReal`.
    // Este ejecutor reproduce esa ventana: el `cerrar()` del vestíbulo llega antes de que
    // `sesionReal` exista, así que solo la bandera de «cerrando» puede salvarlo.
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: (alAbrirSesion) => async () => {
        await new Promise<void>((r) => setTimeout(r, 5));
        await new Promise<void>((resuelto) => {
          alAbrirSesion({
            cerrar: () => {
              cerrada = true;
              resuelto();
            },
          });
        });
      },
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    proyecto.recibir({ clase: "prosa", texto: "haz algo largo" });
    await new Promise((r) => setTimeout(r, 0));
    await proyecto.cerrar();
    expect(cerrada).toBe(true);
  });

  it("dos aperturas A LA VEZ siguen dejando una sola consola viva", async () => {
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    // Sin serializar, las dos ven `abierto === undefined` en el `await` de cierre y las dos
    // arrancan su `correrConsola`: la primera se queda viva y sin nadie que la cierre.
    const [a, b] = await Promise.all([v.abrirProyecto({ raiz: "/w/a" }), v.abrirProyecto({ raiz: "/w/b" })]);
    expect(a.cerrada).toBe(true);
    expect(b.cerrada).toBe(false);
    expect(v.proyectoAbierto()).toBe(b);
    await v.cerrar();
  });

  it("una sesión reabierta es histórica hasta el PRIMER turno nuevo", async () => {
    const s = sesionesEnMemoria();
    s.jsonl.set("/w/a|vieja", [{ tipo: "usuario", texto: "lo de ayer" }]);
    const v = crearVestibulo({
      ...dobles(),
      origenDeTrabajo: "global",
      sesiones: s.puerto,
      crearEjecutor: () => async () => {},
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a", sesion: "vieja" });
    expect(proyecto.historica).toBe(true);
    // Lo releído se enseña, pero no se vuelve a escribir.
    expect(proyecto.actos()).toHaveLength(1);

    proyecto.recibir({ clase: "prosa", texto: "sigue por aquí" });
    await new Promise((r) => setTimeout(r, 0));
    expect(proyecto.historica).toBe(false);
    await proyecto.cerrar();
    // El acto del usuario se volcó a la MISMA sesión, sin duplicar lo releído.
    expect(s.jsonl.get("/w/a|vieja")).toEqual([
      { tipo: "usuario", texto: "lo de ayer" },
      { tipo: "usuario", texto: "sigue por aquí" },
    ]);
  });

  it("un proyecto abierto y cerrado sin decir nada no deja una sesión vacía", async () => {
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...dobles(), origenDeTrabajo: "global", sesiones: s.puerto });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    await proyecto.cerrar();
    expect(s.jsonl.size).toBe(0);
    expect(proyecto.sesion).toBeUndefined();
  });

  it("las dos consolas reciben el guardarModeloGlobal REAL: sin inyectarlo, consolaWeb lanza", async () => {
    const d = dobles();
    const s = sesionesEnMemoria();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global", sesiones: s.puerto });
    expect(v.consola.consola.guardarModeloGlobal("trabajo", "anthropic/claude-x")).toEqual({
      ruta: "/casa/.xonecode/config.json",
      id: "anthropic/claude-x",
    });
    const proyecto = await v.abrirProyecto({ raiz: "/w/a" });
    expect(() => proyecto.consola.consola.guardarModeloGlobal("trabajo", "anthropic/claude-x")).not.toThrow();
    expect(d.escrituras).toEqual(["modelo:trabajo", "modelo:trabajo"]);
    await v.cerrar();
  });

  it("completar el proyecto escribe el alta y baja la copia al workspace del entorno", async () => {
    const d = dobles();
    const dichos: string[] = [];
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global", informar: (t) => dichos.push(t) });
    const { raiz } = await v.completarProyecto({ entorno: "webstudio", proyecto: "MinitMT", rama: "master" });
    expect(raiz).toBe("/w/webstudio/workspace/MinitMT");
    // El alta se escribe ANTES de bajar: el consejo «/sync bajar» de un fallo posterior
    // solo es cierto si el proyecto y la rama ya están en disco.
    expect(d.escrituras).toEqual(["config:/w/webstudio/workspace/MinitMT", "descarga"]);
  });

  it("un fallo de descarga NO crea .xonecode a medias y dice cómo reintentar", async () => {
    const d = dobles();
    const dichos: string[] = [];
    const v = crearVestibulo({
      ...d,
      origenDeTrabajo: "global",
      informar: (t) => dichos.push(t),
      descargar: async () => {
        throw new Error("el ZIP vino vacío");
      },
    });
    await expect(v.completarProyecto({ entorno: "webstudio", proyecto: "MinitMT", rama: "master" })).rejects.toThrow();
    expect(dichos.join("\n")).toMatch(/\/sync bajar/);
  });

  it("no se puede completar un proyecto de un entorno que no está registrado", async () => {
    const d = dobles();
    const v = crearVestibulo({ ...d, origenDeTrabajo: "global" });
    await expect(
      v.completarProyecto({ entorno: "on-prem", proyecto: "MinitMT", rama: "master" })
    ).rejects.toThrow(/no está registrado/);
    expect(d.escrituras).toEqual([]);
  });
});

describe("el config.json que escribe el alta", () => {
  it("gana «entorno» y CONSERVA cloudstudio.url, que es lo que lee la sincronización", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-vestibulo-"));
    const { ruta } = escribirProyectoEnDisco(raiz, {
      entorno: "webstudio",
      url: "https://mcp.xonewebstudio.com/mcp",
      scopes: ["mcp.read"],
      proyecto: { id: "42", nombre: "MinitMT" },
      rama: "master",
    });
    const bruto: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    const { config, avisos } = validar(bruto, ruta, "proyecto");
    expect(config.entorno).toBe("webstudio");
    expect(config.cloudstudio?.url).toBe("https://mcp.xonewebstudio.com/mcp");
    expect(config.cloudstudio?.proyecto).toEqual({ id: "42", nombre: "MinitMT" });
    expect(config.cloudstudio?.rama).toBe("master");
    expect(config.modo).toBe("cloud");
    // Y «entorno» no es un campo desconocido: si lo fuera, /config lo cantaría en cada arranque.
    expect(avisos).toEqual([]);
  });
});
