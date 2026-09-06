import type { Acto } from "../tipos.js";
import estilos from "./Trazas.module.css";

/**
 * Las TRAZAS del turno: la vista técnica, con la pinta de la de deepseek —filas
 * monoespaciadas de una línea, etiquetadas por tipo— pero **sin lo que ellos ponen dentro**.
 *
 * Se llamaba «Trayectoria», y el nombre nuevo lo pidió el usuario con su encargo detrás:
 * esta pestaña es para desarrollar el HARNESS, no para trabajar en una app XOne. Quien está
 * escribiendo una colección mira el chat y los ficheros; quien viene aquí está depurando
 * qué hizo el agente y en qué orden. «Trayectoria» sonaba a resumen para el usuario final;
 * «Trazas» dice lo que es. Que el destinatario sea otro también explica por qué esta vista
 * puede permitirse ser densa y fea a propósito.
 *
 * Deepseek enseña `bash {"command": "cd /Users/…"}`. Aquí eso no puede pasar por TIPO: el
 * acto de herramientas ya viene con líneas resumidas por `agent/resumenDeTool.ts`, una
 * lista blanca de campos por nombre de tool —ruta o patrón, nunca contenido—, porque
 * `write_file` lleva el fichero entero y una tool MCP lleva el bearer. Esta vista no
 * añade nada al texto de esas líneas: si algún día `resumenDeTool.ts` empezara a colar un
 * argumento, esta fila lo repetiría — la barrera vive allí, no aquí.
 */
export interface FilaDeTrazas {
  etiqueta: string;
  texto: string;
}

const LARGO_MAXIMO_DE_FILA = 200;

/** Colapsa saltos de línea y recorta: la fila es de una línea por contrato del componente. */
function aUnaLinea(texto: string): string {
  const plana = texto.replace(/\s+/g, " ").trim();
  return plana.length > LARGO_MAXIMO_DE_FILA ? plana.slice(0, LARGO_MAXIMO_DE_FILA) : plana;
}

function fila(etiqueta: string, texto: string): FilaDeTrazas {
  return { etiqueta, texto: aUnaLinea(texto) };
}

/**
 * Un acto puede dar VARIAS filas (`herramientas` trae una lista de líneas ya resumidas);
 * el resto da una sola. `satisfies`-style exhaustivo por `switch`: añadir un `tipo` a
 * `Acto` sin tocar este `switch` falla en `tsc` por la rama `default` tipada `never`,
 * igual que `TIPOS_DE_ACTO` en `store.ts` falla al olvidar un caso.
 */
function filasDe(acto: Acto): FilaDeTrazas[] {
  switch (acto.tipo) {
    case "usuario":
      return [fila("USUARIO", acto.texto)];
    case "asistente":
      return [fila("ASISTENTE", acto.texto)];
    case "razonamiento":
      // Las trazas son el registro COMPLETO: lo que el modelo pensó también consta, con
      // su propia etiqueta para no confundirlo con lo que dijo.
      return [fila("PIENSA", acto.texto)];
    case "herramientas":
      return acto.lineas.map((linea) => fila("TOOL", linea));
    case "sistema":
      return [fila("SISTEMA", acto.texto)];
    case "fase":
      return [fila("FASE", acto.texto)];
    case "fin":
      return [fila("FIN", acto.modelo !== undefined ? `${acto.modelo} · ${acto.ms} ms` : `${acto.ms} ms`)];
    case "error":
      return [fila("ERROR", acto.texto)];
    default: {
      const _exhaustivo: never = acto;
      return _exhaustivo;
    }
  }
}

export function filasDeTrazas(actos: readonly Acto[]): FilaDeTrazas[] {
  return actos.flatMap(filasDe);
}

export function Trazas({ actos }: { actos: readonly Acto[] }) {
  const filas = filasDeTrazas(actos);
  return (
    <ol className={estilos.trazas}>
      {filas.map((f, indice) => (
        // El índice como parte de la key es correcto aquí: las filas no tienen identidad
        // propia (dos líneas de tool pueden ser el texto exacto, «grep coleccion» dos
        // veces) y el array se sustituye entero en cada render, nunca se reordena.
        <li key={`${indice}-${f.etiqueta}`} className={estilos.fila}>
          <span className={estilos.etiqueta}>{f.etiqueta}</span>
          <span className={estilos.texto}>{f.texto}</span>
        </li>
      ))}
    </ol>
  );
}
