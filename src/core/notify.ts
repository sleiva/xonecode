/**
 * La política de ruido: una línea por RACHA de la misma tool, no por llamada.
 *
 * Es del TURNO: se construye al empezar el turno y muere con él. Un colapsador de proceso
 * contaría las llamadas de todos los turnos juntos.
 *
 * La línea lleva ICONO por familia (`→` leer, `←` escribir, `✱` buscar) y VERBO en
 * español, no el nombre crudo de la tool — «→ lee app.xne» cuenta lo mismo que
 * «🔧 read_file» y se lee a la primera, que es lo que llena los 100-300 s de un turno.
 * Una tool desconocida no se disfraza: `⚙` y su nombre tal cual, porque un nombre que
 * no está en el mapa puede significar cualquier cosa (una tool MCP de Studio, por
 * ejemplo) y inventarle un verbo sería mentir.
 *
 * Devuelve una LISTA de líneas, nunca una cadena con dos pegadas: cuando una racha se
 * cierra Y otra tool arranca en el mismo evento —el caso normal de "tres read_file y luego
 * un glob"— hay DOS cosas que decir, y quien pinta escribe tantas líneas como haya.
 */

import type { OrigenDeLaTool } from "./events.js";

export interface EventoTool {
  nombre: string;
  /**
   * Ruta o patrón, SOLO eso: lo permite la lista blanca de `agent/turno/resumenDeTool.ts`
   * (file_path/path/pattern según la tool). El contenido del fichero y los tokens de
   * autenticación NO caben aquí por diseño — ver la cabecera de `core/events.ts`.
   */
  detalle?: string;
  /** Vacío si fue bien. Un error nunca se colapsa. */
  error?: string;
  /** Quién la pidió (`core/events.ts#OrigenDeLaTool`). Ausente = no consta. */
  origen?: OrigenDeLaTool;
}

/** Qué icono abre la línea, por familia. Sin entrada: `⚙`, genérico. */
const ICONO: Record<string, string> = {
  read_file: "→",
  ls: "→",
  write_file: "←",
  edit_file: "←",
  glob: "✱",
  grep: "✱",
  regex_search: "✱",
  task: "⊙",
  // Un icono PROPIO, y no el genérico `⚙`: en un turno donde se lanza una app, la línea del
  // comando es la que dice qué está pasando de verdad — y no puede leerse igual que una tool
  // cualquiera que no está en la tabla.
  execute: "$",
};

/** El verbo de cada tool conocida, en español. */
const VERBO: Record<string, string> = {
  read_file: "lee",
  ls: "lista",
  write_file: "escribe",
  edit_file: "edita",
  glob: "busca",
  grep: "busca",
  regex_search: "regex",
  task: "delega en",
  execute: "corre",
};

/**
 * Una línea del colapsador, con la tool de la que habla.
 *
 * El texto ya no viaja solo porque quien pinta necesita saber DE QUÉ es la línea sin
 * re-parsear la prosa: «→ lee» no dice `read_file` en ninguna parte, y deducirlo del icono
 * sería reconstruir a mano el mapa que está diez líneas más arriba — con la garantía de que
 * las dos copias divergen el día que alguien añada un verbo. El nombre ya lo tenía el
 * evento; lo que se arregla es que dejara de estar al llegar a la piel.
 *
 * `nombre` es el de la tool de la RACHA que la línea cuenta, que en un cierre es la
 * ANTERIOR y no la que acaba de llegar — es justo el caso que un `piel.tool(evento)`
 * ingenuo habría etiquetado mal.
 */
export interface LineaDeTool {
  texto: string;
  nombre: string;
  /** Presente solo en la línea de un error, que nunca se colapsa. */
  error?: string;
  /** El origen de la RACHA, que es uno solo: dos orígenes son dos rachas. */
  origen?: OrigenDeLaTool;
}

/** `→ lee app.xne` para una conocida; `⚙ studio_edit_file` para el resto. */
function frase(nombre: string, detalle?: string): string {
  const icono = ICONO[nombre];
  // La genérica también enseña su detalle cuando lo hay. Antes lo TIRABA, y eso dejaba
  // mudo justo lo que más falta hace: con `task` fuera de la tabla, la línea decía
  // «⚙ task» y no a quién se delegaba. No filtra nada nuevo — un `detalle` solo existe si
  // `resumenDeTool.ts` lo eligió a mano de su lista blanca.
  if (icono === undefined) {
    return detalle === undefined || detalle === "" ? `⚙ ${nombre}` : `⚙ ${nombre} ${detalle}`;
  }
  const verbo = VERBO[nombre]!;
  return detalle === undefined || detalle === "" ? `${icono} ${verbo}` : `${icono} ${verbo} ${detalle}`;
}

/**
 * La lista de ficheros del cierre: los tres primeros y «y N ficheros más». El `×N` cuenta
 * LLAMADAS y la lista cuenta ficheros DISTINTOS (una relectura se cuenta una), así que las
 * dos cifras no suman: medido en pantalla, «lee ×35 — a, b, c y 29 más» enumeraba 32 y se
 * leía como una cuenta que no cuadra. Decir «ficheros» es lo que separa las dos cifras.
 */
function listaDe(detalles: string[]): string {
  const unicos = [...new Set(detalles)];
  if (unicos.length <= 3) return unicos.join(", ");
  const resto = unicos.length - 3;
  return `${unicos.slice(0, 3).join(", ")} y ${resto} ${resto === 1 ? "fichero" : "ficheros"} más`;
}

/**
 * La clave de una racha: el origen forma parte de ella. Con solo el nombre, tres lecturas de
 * dos especialistas distintos se contaban como UNA racha y la línea atribuía las tres al primero
 * — un origen que miente es peor que no llevarlo. El precio, declarado: en el terminal, donde el
 * origen no se pinta, una racha se parte cuando cambia quién la pide.
 */
function claveDeOrigen(origen: OrigenDeLaTool | undefined): string {
  if (origen === undefined) return "";
  return origen.rol === "orquestador" ? "o" : `e:${origen.nombre ?? ""}`;
}

function conOrigen(origen: OrigenDeLaTool | undefined): { origen?: OrigenDeLaTool } {
  return origen === undefined ? {} : { origen };
}

export class Colapsador {
  private nombre = "";
  private origen: OrigenDeLaTool | undefined = undefined;
  private cuenta = 0;
  private detalles: string[] = [];

  /** Las líneas que toca escribir por este evento, EN ORDEN. 0, 1 o 2. */
  lineas(evento: EventoTool): LineaDeTool[] {
    const salida: LineaDeTool[] = [];

    if (evento.error) {
      // Cierra la racha en curso y canta el error aparte, sin colapsar.
      const pendiente = this.cerrarRacha();
      if (pendiente) salida.push(pendiente);
      salida.push({
        texto: `✗ ${frase(evento.nombre, evento.detalle).slice(2)}: ${evento.error}`,
        nombre: evento.nombre,
        error: evento.error,
        ...conOrigen(evento.origen),
      });
      return salida;
    }

    if (evento.nombre === this.nombre && claveDeOrigen(evento.origen) === claveDeOrigen(this.origen)) {
      this.cuenta++;
      if (evento.detalle !== undefined) this.detalles.push(evento.detalle);
      return salida; // misma racha: calla
    }

    const pendiente = this.cerrarRacha();
    if (pendiente) salida.push(pendiente);
    this.nombre = evento.nombre;
    this.origen = evento.origen;
    this.cuenta = 1;
    this.detalles = evento.detalle === undefined ? [] : [evento.detalle];
    salida.push({ texto: frase(evento.nombre, evento.detalle), nombre: evento.nombre, ...conOrigen(evento.origen) });
    return salida;
  }

  /** La cuenta de la última racha. Se llama al terminar el turno, incluso si reventó. */
  cierre(): LineaDeTool | null {
    return this.cerrarRacha();
  }

  private cerrarRacha(): LineaDeTool | null {
    // Una racha de 1 ya se anunció al abrirla: repetirla como "×1" es ruido.
    if (this.cuenta <= 1) {
      this.reiniciar();
      return null;
    }
    const base = frase(this.nombre);
    const texto =
      this.detalles.length > 0 ? `${base} ×${this.cuenta} — ${listaDe(this.detalles)}` : `${base} ×${this.cuenta}`;
    // El nombre y el origen se leen ANTES de reiniciar: son los de la racha que se cierra, no
    // los de la que viene.
    const cierre: LineaDeTool = { texto, nombre: this.nombre, ...conOrigen(this.origen) };
    this.reiniciar();
    return cierre;
  }

  private reiniciar(): void {
    this.nombre = "";
    this.origen = undefined;
    this.cuenta = 0;
    this.detalles = [];
  }
}
