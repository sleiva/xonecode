/**
 * Qué puede escribir un agente externo con motor **codex**, y quién lo autoriza.
 *
 * Este fichero es el gemelo de `escrituraExterna.ts` para el otro motor, y existe por la
 * misma razón: las rutas que Codex propone son **absolutas** y van al disco directas, así
 * que ninguna de las cuatro capas que protegen al proyecto por el camino de LangGraph
 * —`permisosDe`, el `virtualMode`, las vistas aplanadas y las guardas de artefactos y
 * descargas— las ve. Lo que NO se hace aquí es volver a escribir esas guardas: se llama a
 * `veredictoDeRuta`, la misma función, porque un segundo sitio donde decidir sobre una ruta
 * sería un segundo sitio donde el fail-closed puede dejar de estarlo.
 *
 * Lo propio de Codex es solo la FORMA, y está medida contra el binario real (codex-cli
 * 0.152.1, 11-09-2026, tres ejecuciones):
 *
 * - **La palanca es `approvalPolicy`, no `sandbox`.** Con `sandbox: "workspace-write"` las
 *   escrituras dentro del cwd ocurren solas y no vuelven a xonecode — que es exactamente el
 *   motivo por el que `core/agentes.ts` rechazaba un `.md` de codex que pidiera escribir.
 *   Con `sandbox: "read-only"` + `approvalPolicy: "on-request"`, la denegación la sigue
 *   poniendo la caja del sistema operativo y cada escritura llega como una PETICIÓN que
 *   contestamos nosotros: el mismo papel que el `ask` del hook `PreToolUse` en Claude Code.
 *   Medido: al contestar `accept` el fichero se escribe, y al contestar `decline` no queda
 *   fichero, el item queda `declined` y el turno SIGUE (el agente lo cuenta en su respuesta).
 *   Por eso el sandbox se queda en `read-only` SIEMPRE, también con la escritura concedida:
 *   no existe ningún modo en el que Codex escriba sin pasar por aquí.
 *
 * - **La petición no dice sobre QUÉ se decide.** `item/fileChange/requestApproval` trae
 *   `{threadId, turnId, itemId, startedAtMs, reason, grantRoot}` y nada más; los ficheros
 *   vienen ANTES, en el `item/started` cuyo `item.id` es ese `itemId`. De ahí que el
 *   adaptador lleve un registro de items: sin él no hay diff que enseñar, y sin diff no hay
 *   decisión que tomar.
 *
 * - **`add` y `update` no traen lo mismo en `diff`**: en `add` es el CONTENIDO entero
 *   (`"medido.\n"`), y en `update` un hunk unificado
 *   (`"@@ -1,3 +1,3 @@\n uno\n-dos\n+DOS\n tres\n"`). Por eso `cambioDe()` no sirve aquí
 *   —espera los argumentos de un `Write`/`Edit`— y hay una traducción propia a
 *   `LineaDeDiff[]`, que es lo único que las tres pieles saben pintar.
 */

import type { LineaDeDiff } from "../core/diff.js";
import type { EscrituraExternaPedida, PoliticaDeEscrituraExterna } from "../core/ports.js";
import { veredictoDeRuta } from "./escrituraExterna.js";

/** Un `FileUpdateChange` tal y como llega. Se tipa flojo a propósito: viene de fuera. */
export interface CambioDeCodex {
  path?: unknown;
  kind?: { type?: unknown; move_path?: unknown } | undefined;
  diff?: unknown;
}

export type VeredictoDeCambios =
  | { admitidos: true; escrituras: EscrituraExternaPedida[] }
  | { admitidos: false; motivo: string };

/**
 * El diff de un cambio, traducido a lo que pintan las pieles.
 *
 * Dos formas y no una, porque el binario manda dos (medido):
 * - `add`: el contenido entero, sin cabeceras. Todo es línea AÑADIDA.
 * - `update`: hunks unificados. Se tira la cabecera `@@ …@@` y la marca
 *   `\ No newline at end of file`, que no son contenido del fichero; el primer carácter de
 *   lo demás dice el tipo.
 *
 * **Límite declarado**: con varios hunks, las líneas de uno y de otro salen seguidas, sin
 * decir que en medio hay fichero que no cambia. Meter un separador exigiría inventar una
 * línea que no está en el fichero, y `LineaDeDiff` no tiene forma de marcarla como tal.
 */
export function lineasDeCambioDeCodex(kind: string, diff: unknown): LineaDeDiff[] {
  if (typeof diff !== "string" || diff === "") return [];
  const crudas = diff.split("\n");
  // El salto final de un texto normal no es una línea vacía — la misma regla que
  // `core/diff.ts#lineasDe`, y por lo mismo: si no, todo diff acabaría con una línea de más.
  if (crudas.length > 0 && crudas[crudas.length - 1] === "") crudas.pop();

  if (kind === "add") return crudas.map((texto): LineaDeDiff => ({ tipo: "anadido", texto }));

  const salida: LineaDeDiff[] = [];
  for (const linea of crudas) {
    if (linea.startsWith("@@")) continue;
    if (linea.startsWith("\\")) continue;
    if (linea.startsWith("-")) salida.push({ tipo: "quitado", texto: linea.slice(1) });
    else if (linea.startsWith("+")) salida.push({ tipo: "anadido", texto: linea.slice(1) });
    // Una línea de contexto llega con un espacio delante; una vacía llega vacía de verdad,
    // y entonces no hay prefijo que quitar.
    else salida.push({ tipo: "igual", texto: linea.startsWith(" ") ? linea.slice(1) : linea });
  }
  return salida;
}

/**
 * Los cambios de un item, comprobados uno a uno contra las guardas del proyecto.
 *
 * **Una sola negativa tumba el item entero**, y no es una elección de estilo: Codex lo
 * aplica todo o nada y se contesta con un único `decision`, así que admitir «los que pasen»
 * sería prometer algo que el protocolo no sabe hacer.
 *
 * **`delete` y `move_path` se deniegan, y está declarado.** En Claude Code esa escritura no
 * existe —no hay tool de borrar ni de renombrar, así que las listas de `escrituraExterna.ts`
 * ni la nombran—, `cambioDe` no sabe componer su diff, y un renombrado son DOS destinos que
 * habría que guardar por separado. Es la paridad conservadora entre los dos motores, y se
 * afloja el día que se mida, no antes.
 */
export function veredictoDeCambiosDeCodex(opciones: {
  cwd: string;
  agente: string;
  cambios: unknown;
  ficheros: ReadonlySet<string>;
  real?: (ruta: string) => string;
}): VeredictoDeCambios {
  const { cambios } = opciones;
  if (!Array.isArray(cambios) || cambios.length === 0) {
    return { admitidos: false, motivo: "no dijiste qué ficheros cambiabas, y sin eso no hay nada que autorizar" };
  }
  const escrituras: EscrituraExternaPedida[] = [];
  for (const crudo of cambios as CambioDeCodex[]) {
    const tipo = crudo?.kind?.type;
    if (tipo === "delete") {
      return {
        admitidos: false,
        motivo:
          "xonecode no autoriza que un agente externo BORRE ficheros del proyecto: solo crear y modificar. " +
          "Di qué habría que borrar y por qué.",
      };
    }
    if (crudo?.kind?.move_path !== undefined && crudo.kind.move_path !== null) {
      return {
        admitidos: false,
        motivo:
          "xonecode no autoriza que un agente externo RENOMBRE ni mueva ficheros del proyecto: solo crear y modificar.",
      };
    }
    if (tipo !== "add" && tipo !== "update") {
      // Lo que no se reconoce se deniega: es la misma regla que las tres listas de tools.
      return { admitidos: false, motivo: `xonecode no reconoce este tipo de cambio y no lo autoriza: ${String(tipo)}` };
    }
    const veredicto = veredictoDeRuta({
      cwd: opciones.cwd,
      ruta: crudo?.path,
      ficheros: opciones.ficheros,
      ...(opciones.real === undefined ? {} : { real: opciones.real }),
    });
    if (!veredicto.admitida) return { admitidos: false, motivo: veredicto.motivo };
    escrituras.push({
      agente: opciones.agente,
      ruta: veredicto.ruta,
      lineas: lineasDeCambioDeCodex(tipo, crudo?.diff),
    });
  }
  return { admitidos: true, escrituras };
}

/**
 * La decisión entera: guardas de ruta y DESPUÉS la política.
 *
 * **Vive aquí y no en el cierre del adaptador a propósito.** El patrón de fallo de esta
 * arquitectura está medido nueve veces y siempre es el mismo: una composición de producción
 * viviendo dentro de algo que todos los tests doblan. Con el adaptador de Codex sería literal
 * —los tests no lanzan el binario—, así que la composición sale fuera, entera y pura salvo
 * por la política que entra por parámetro.
 *
 * Fail-closed en los cuatro caminos: sin política, con una ruta rechazada, si la política
 * revienta, o si contesta que no.
 */
export async function decisionDeEscrituraDeCodex(opciones: {
  cwd: string;
  agente: string;
  cambios: unknown;
  ficheros: ReadonlySet<string>;
  real?: (ruta: string) => string;
  /** Ausente = nadie autoriza en esta sesión, y «nadie a quien preguntar» nunca es «sí». */
  aprobar?: PoliticaDeEscrituraExterna;
}): Promise<{ concedida: boolean; motivo?: string }> {
  if (opciones.aprobar === undefined) {
    return {
      concedida: false,
      motivo:
        "xonecode no tiene a quién pedir la autorización de esta escritura en esta sesión, así que no se concede.",
    };
  }
  const veredicto = veredictoDeCambiosDeCodex(opciones);
  if (!veredicto.admitidos) return { concedida: false, motivo: veredicto.motivo };
  try {
    return { concedida: await opciones.aprobar(veredicto.escrituras) };
  } catch {
    // El «sin humano» de `cli/run.ts` corta LANZANDO desde `pedirAprobacion`. Eso es una
    // respuesta, no un fallo: nadie ha autorizado nada.
    return { concedida: false };
  }
}
