/**
 * El RESPALDO de una conversación al reencolar una tarea, para poder dejarla como estaba si se REVIERTE la continuación.
 *
 * La continuación sigue en el hilo de su tarea (recuerda lo que hizo), así que lo que haga queda en ESA conversación: su
 * chat, la memoria del agente y sus artefactos. Revertir solo los ficheros dejaba todo eso en la tarea padre (medido: su
 * contexto y sus artefactos se quedaban), y al reencolarla otra vez el agente recordaba un trabajo que ya no está.
 *
 * La memoria de TrueForge es UNA foto que cada turno sobrescribe, así que no hay un «antes» al que volver salvo que se
 * guarde: por eso se guarda AL REENCOLAR. Lo que se respalda:
 * - cuántas líneas tenía el chat (`<id>.jsonl` solo crece: se corta por ahí);
 * - la foto de la memoria (`memoria-trueforge.json`), o que no había;
 * - qué ficheros había en `artefactos/` y `hotswap/` (lo nuevo se borra).
 *
 * **Límite**: un artefacto que la continuación REESCRIBIÓ con el mismo nombre se queda con lo de ella.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { carpetaDeLaSesion, rutaDeActosDeSesion } from "./sesiones.js";
import { rutaDeMemoria } from "../../agent/motores/trueforge/memoriaTrueforge.js";

const CARPETAS_DE_ARTEFACTOS = ["artefactos", "hotswap"] as const;

interface EstadoDelRespaldo {
  lineas: number;
  memoria: boolean;
  ficheros: string[];
}

const carpetaDelRespaldo = (raiz: string, sesion: string, clave: string): string =>
  join(carpetaDeLaSesion(raiz, sesion), "respaldos", clave);

const lineasDe = (texto: string): string[] => texto.split("\n").filter((l) => l.trim() !== "");

function ficherosDe(carpeta: string, base: string): string[] {
  if (!existsSync(carpeta)) return [];
  const salida: string[] = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) salida.push(...ficherosDe(ruta, base));
    else if (entrada.isFile()) salida.push(relative(base, ruta));
  }
  return salida;
}

const ficherosDeArtefactos = (raiz: string, sesion: string): string[] => {
  const base = carpetaDeLaSesion(raiz, sesion);
  return CARPETAS_DE_ARTEFACTOS.flatMap((c) => ficherosDe(join(base, c), base));
};

/** Guarda cómo está la conversación AHORA, bajo `clave` (el id de la tarea que la va a continuar). */
export function guardarRespaldoDeSesion(raiz: string, sesion: string, clave: string): void {
  const carpeta = carpetaDelRespaldo(raiz, sesion, clave);
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  const chat = rutaDeActosDeSesion(raiz, sesion);
  const memoria = rutaDeMemoria(raiz, sesion);
  const hayMemoria = memoria !== undefined && existsSync(memoria);
  if (hayMemoria) {
    copyFileSync(memoria, join(carpeta, "memoria-trueforge.json"));
    chmodSync(join(carpeta, "memoria-trueforge.json"), 0o600);
  }
  const estado: EstadoDelRespaldo = {
    lineas: existsSync(chat) ? lineasDe(readFileSync(chat, "utf8")).length : 0,
    memoria: hayMemoria,
    ficheros: ficherosDeArtefactos(raiz, sesion),
  };
  writeFileSync(join(carpeta, "estado.json"), JSON.stringify(estado), { mode: 0o600 });
}

export function hayRespaldoDeSesion(raiz: string, sesion: string, clave: string): boolean {
  return existsSync(join(carpetaDelRespaldo(raiz, sesion, clave), "estado.json"));
}

/**
 * Deja la conversación como estaba al guardar el respaldo, y lo BORRA. Quien llama la ha soltado antes
 * (`Vestibulo.soltarSesion`): una consola abierta pisaría lo restaurado. `false` si no había respaldo.
 */
export function restaurarRespaldoDeSesion(raiz: string, sesion: string, clave: string): boolean {
  const carpeta = carpetaDelRespaldo(raiz, sesion, clave);
  const rutaDelEstado = join(carpeta, "estado.json");
  if (!existsSync(rutaDelEstado)) return false;
  const estado = JSON.parse(readFileSync(rutaDelEstado, "utf8")) as EstadoDelRespaldo;

  // El chat, cortado donde estaba: escrito aparte y renombrado, para no dejarlo a medias.
  const chat = rutaDeActosDeSesion(raiz, sesion);
  if (existsSync(chat)) {
    const conservadas = lineasDe(readFileSync(chat, "utf8")).slice(0, estado.lineas);
    const temporal = `${chat}.respaldo-tmp`;
    writeFileSync(temporal, conservadas.length === 0 ? "" : `${conservadas.join("\n")}\n`, { mode: statSync(chat).mode & 0o777 });
    renameSync(temporal, chat);
  }

  // La memoria: la foto de entonces, o ninguna si no la había.
  const memoria = rutaDeMemoria(raiz, sesion);
  if (memoria !== undefined) {
    if (estado.memoria) {
      copyFileSync(join(carpeta, "memoria-trueforge.json"), memoria);
      chmodSync(memoria, 0o600);
    } else rmSync(memoria, { force: true });
  }

  // Los artefactos que dejó la continuación, fuera.
  const habia = new Set(estado.ficheros);
  const base = carpetaDeLaSesion(raiz, sesion);
  for (const fichero of ficherosDeArtefactos(raiz, sesion)) {
    if (!habia.has(fichero)) rmSync(join(base, fichero), { force: true });
  }

  rmSync(carpeta, { recursive: true, force: true });
  return true;
}
