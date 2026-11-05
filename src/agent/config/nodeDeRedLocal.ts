/**
 * Los efectos del `node` de red local (`core/nodeDeRedLocal.ts` tiene el porqué medido): montar la `.app` con una copia
 * del `node` con que se lanzó XOneCode, firmarla ad hoc, abrirla una vez para que macOS saque el aviso de Red local, y
 * relanzar XOneCode con su `node`.
 *
 * **Falla ABIERTO**: lo que no se puede hacer (sin `codesign`, sin espacio, la casa de solo lectura) se dice en UNA línea
 * y XOneCode sigue con el `node` de siempre, que funciona igual salvo en la red local.
 *
 * **Se ADOPTA la app que ya hay** si su `node` es el mismo que el de origen (tamaño y contenido): rehacerla cambiaría su
 * firma y macOS volvería a preguntar. Se rehace SOLO cuando cambia el origen, en una carpeta temporal que se renombra al
 * final, para que dos arranques a la vez no dejen una app a medias.
 */
import { createHash } from "node:crypto";
import { execFile, execFileSync, spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { constants } from "node:os";
import { join } from "node:path";
import {
  CARPETA_DE_RED_LOCAL,
  codigoDeSalidaDelRelanzado,
  debeEnvolverNode,
  destinosDelAviso,
  infoPlistDeLaApp,
  MARCA_DE_RELANZADO,
  mismoOrigen,
  NOMBRE_DE_LA_APP,
  NOMBRE_VISIBLE,
  programaDelAviso,
  SENALES_QUE_SE_REENVIAN,
  type OrigenDelNode,
} from "../../core/nodeDeRedLocal.js";

export interface DependenciasDelNodeDeRedLocal {
  /** La carpeta `~/.xonecode/` (los tests la mudan). */
  casa?: string;
  /** El `node` de origen: el que corre ahora. */
  origen?: string;
  /** Firma la app ad hoc (`codesign --force --sign -`); lanza si no puede. */
  firmar?: (app: string) => void;
  /** Abre la app por LaunchServices (`open -n`) con esos argumentos, sin esperarla. */
  abrir?: (app: string, argumentos: readonly string[]) => void;
  /** Los destinos del aviso (`destinosDelAviso` sobre las interfaces de la máquina). */
  destinos?: () => string[];
  informar?: (texto: string) => void;
}

const huella = (ruta: string): string => createHash("sha256").update(readFileSync(ruta)).digest("hex");

/**
 * El `node` de la app, listo para relanzar; o `{motivo}` si no se pudo (y se sigue con el de siempre). Monta la app si
 * no está o si cambió el `node` de origen, y entonces la abre una vez para que macOS pregunte.
 */
export function prepararNodeDeRedLocal(deps: DependenciasDelNodeDeRedLocal = {}): { node: string } | { motivo: string } {
  const casa = deps.casa ?? join(homedir(), ".xonecode");
  const origen = deps.origen ?? process.execPath;
  const informar = deps.informar ?? ((t: string) => void process.stderr.write(`${t}\n`));
  const carpeta = join(casa, CARPETA_DE_RED_LOCAL);
  const app = join(carpeta, NOMBRE_DE_LA_APP);
  const nodeDeLaApp = join(app, "Contents", "MacOS", "node");
  const ficha = join(carpeta, "origen.json");
  const temporal = join(carpeta, `.${NOMBRE_DE_LA_APP}.${String(process.pid)}`);
  try {
    const s = statSync(origen);
    const actual: OrigenDelNode = { ruta: origen, tamano: s.size, mtimeMs: s.mtimeMs };
    if (existsSync(nodeDeLaApp)) {
      let guardado: unknown;
      try {
        guardado = JSON.parse(readFileSync(ficha, "utf8"));
      } catch {
        guardado = undefined;
      }
      if (mismoOrigen(guardado, actual)) return { node: nodeDeLaApp };
      // Sin ficha (montada a mano) o con otra: si su node es el mismo, se ADOPTA tal cual y se conserva el permiso.
      if (statSync(nodeDeLaApp).size === actual.tamano && huella(nodeDeLaApp) === huella(origen)) {
        writeFileSync(ficha, `${JSON.stringify(actual)}\n`);
        return { node: nodeDeLaApp };
      }
    }
    informar(`XOneCode: preparando «${NOMBRE_VISIBLE}» para que macOS le deje hablar con la red local (la granja); la primera vez macOS te preguntará: permítelo.`);
    mkdirSync(carpeta, { recursive: true });
    rmSync(temporal, { recursive: true, force: true });
    mkdirSync(join(temporal, "Contents", "MacOS"), { recursive: true });
    copyFileSync(origen, join(temporal, "Contents", "MacOS", "node"));
    chmodSync(join(temporal, "Contents", "MacOS", "node"), 0o755);
    writeFileSync(join(temporal, "Contents", "Info.plist"), infoPlistDeLaApp());
    (deps.firmar ?? ((a: string) => void execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", a], { stdio: "ignore" })))(temporal);
    rmSync(app, { recursive: true, force: true });
    try {
      renameSync(temporal, app);
    } catch (error) {
      // Otro arranque la acabó a la vez: vale la suya.
      rmSync(temporal, { recursive: true, force: true });
      if (!existsSync(nodeDeLaApp)) throw error;
    }
    writeFileSync(ficha, `${JSON.stringify(actual)}\n`);
    // Medido: ejecutada directamente, una app nueva NO saca el aviso; abierta por LaunchServices, sí.
    const destinos = (deps.destinos ?? (() => destinosDelAviso(networkInterfaces())))();
    if (destinos.length > 0) (deps.abrir ?? abrirConOpen)(app, ["-e", programaDelAviso(destinos)]);
    return { node: nodeDeLaApp };
  } catch (error) {
    rmSync(temporal, { recursive: true, force: true });
    const codigo = (error as { code?: unknown } | null)?.code;
    return { motivo: typeof codigo === "string" ? codigo : "no se pudo montar" };
  }
}

function abrirConOpen(app: string, argumentos: readonly string[]): void {
  execFile("/usr/bin/open", ["-n", app, "--args", ...argumentos], () => undefined);
}

/**
 * Si toca, relanza ESTE proceso con el `node` de la app y devuelve `true`: el proceso sigue vivo solo para esperar al
 * hijo y salir con su código. `false` = sigue aquí (no es un Mac, ya relanzado, apagado o no se pudo montar).
 */
export function relanzarConNodeDeRedLocal(deps: DependenciasDelNodeDeRedLocal = {}): boolean {
  if (!debeEnvolverNode(process.platform, process.env)) return false;
  const preparado = prepararNodeDeRedLocal(deps);
  if ("motivo" in preparado) {
    (deps.informar ?? ((t: string) => void process.stderr.write(`${t}\n`)))(
      `XOneCode: no se pudo preparar «${NOMBRE_VISIBLE}» (${preparado.motivo}); sigo con este node, que en un Mac puede no llegar a la red local.`,
    );
    return false;
  }
  // Los mismos argumentos de node (los cargadores de tsx en desarrollo) y el mismo guion: solo cambia el binario.
  const hijo = spawn(preparado.node, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, [MARCA_DE_RELANZADO]: "1" },
  });
  // Ctrl+C lo recibe ya el hijo por la terminal: aquí solo se espera a que salga.
  process.on("SIGINT", () => undefined);
  for (const senal of SENALES_QUE_SE_REENVIAN) process.on(senal, () => void hijo.kill(senal));
  hijo.on("exit", (codigo, senal) => {
    process.exit(codigoDeSalidaDelRelanzado(codigo, senal, (s) => (constants.signals as Record<string, number | undefined>)[s]));
  });
  hijo.on("error", () => {
    // No arrancó (se borró la app entre medias): no hay nada que esperar.
    process.exit(70);
  });
  return true;
}
