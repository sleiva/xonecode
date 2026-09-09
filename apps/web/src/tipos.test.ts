import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

// `new URL("./tipos.ts", import.meta.url)` —la forma que trae el brief— es EXACTAMENTE
// el patrón que el plugin `vite:asset-import-meta-url` reescribe para servir un asset:
// bajo el proyecto «cliente» (entorno jsdom, `environment.config.consumer === "client"`)
// lo convierte en una URL `http://localhost:.../…` en vez de dejarlo apuntar al fichero
// real, y `readFileSync` de esa URL falla con «must be of scheme file». Medido: hasta con
// `/* @vite-ignore */` delante de la cadena el resultado seguía sin ser la ruta real.
// `fileURLToPath` + `path.join` no coincide con ese patrón sintáctico, así que no lo activa.
const aqui = dirname(fileURLToPath(import.meta.url));
const RUTA_TIPOS = join(aqui, "tipos.ts");
const RUTA_ACTOS = join(aqui, "..", "..", "..", "src", "core", "actos.ts");
const RUTA_TRANSPORTE = join(aqui, "..", "..", "..", "src", "web", "servidor", "transporte.ts");
const RUTA_TAREAS = join(aqui, "..", "..", "..", "src", "core", "tareas.ts");

/**
 * `[a-z0-9_-]+` y no `[a-z]+`: la primera versión de este detector (la del brief) no veía
 * guion bajo ni guion. Medido en la ronda de revisión: un tipo llamado `"fantasma_review"`
 * metido a mano pasaba el test sin que nada chistara, porque el propio detector lo
 * truncaba a la parte anterior al `_` — o directamente no lo capturaba si el `_` iba al
 * principio del resto de la coincidencia. Un tipo real con guion bajo o guion sería
 * invisible a la comprobación de divergencia con la regex vieja.
 */
function literalesDe(campo: "tipo" | "clase", ruta: string): string[] {
  const regex = new RegExp(`\\{\\s*${campo}:\\s*"([a-z0-9_-]+)"`, "g");
  return [...readFileSync(ruta, "utf8").matchAll(regex)].map((m) => m[1]).sort();
}

describe("tipos del cliente", () => {
  it("los tipos de acto del cliente y del host no divergen", () => {
    expect(literalesDe("tipo", RUTA_TIPOS)).toEqual(literalesDe("tipo", RUTA_ACTOS));
  });

  /**
   * F1 de la revisión: el test de arriba solo miraba `Acto`. `MensajeDelCliente` se había
   * quedado sin `{ clase: "secreto"; valor: string }` (`transporte.ts:46`) y nada lo
   * delataba — `enviar()` no construye ese mensaje hoy, pero la Task 14 (el wizard, que usa
   * `leerSecreto`) se lo habría encontrado a mano. Se compara TODO literal `clase:` del
   * fichero —de las dos uniones, `MensajeAlCliente` y `MensajeDelCliente`, juntas— contra
   * todo literal `clase:` de `transporte.ts`: como `"secreto"` aparece una vez en cada
   * unión (la pregunta del servidor y la respuesta del cliente son mensajes DISTINTOS con
   * el mismo nombre de clase), la lista ordenada tiene que traer ese duplicado en los dos
   * ficheros para calzar.
   */
  it("los mensajes del transporte (clase:) del cliente y del host no divergen", () => {
    expect(literalesDe("clase", RUTA_TIPOS)).toEqual(literalesDe("clase", RUTA_TRANSPORTE));
  });

  it("el detector ve guion bajo y guion, no solo minúsculas: 'fantasma_review' no es invisible", () => {
    const conGuionBajo = '| { tipo: "fantasma_review"; texto: string }';
    const regex = /\{\s*tipo:\s*"([a-z0-9_-]+)"/g;
    expect([...conGuionBajo.matchAll(regex)].map((m) => m[1])).toEqual(["fantasma_review"]);
  });

  /**
   * Task 13: `AccionesDeTarea.tsx` decide qué botón ofrecer mirando `TRANSICIONES`, y esa
   * tabla vive en `core/tareas.ts` — la frontera del cliente no deja importarla, así que
   * `tipos.ts` la redeclara. Sin este test, la copia del cliente se podría quedar vieja el
   * día que alguien cambie una transición en el host y nadie lo note: exactamente la
   * divergencia silenciosa que esta tarea existe para cerrar.
   */
  it("TRANSICIONES del cliente y del host no divergen", () => {
    expect(transicionesDe(RUTA_TIPOS)).toEqual(transicionesDe(RUTA_TAREAS));
  });

  /**
   * **F1 de la revisión final, y la capa donde se cazaba antes de llegar a la pantalla.**
   * `veredicto` se añadió a `Tarea` y a `filaDeTarea` y NO a `TareaDelCable` del cliente ni
   * al store: la mitad del contrato de la entrega vivía en `core/` y en disco, y la mitad
   * que una persona lee no existía. Los literales `clase:` no lo veían —el mensaje seguía
   * llamándose `tareas`—, así que hacía falta comparar los CAMPOS.
   *
   * Por TEXTO y no por import, la razón de siempre: la frontera del cliente no deja tirar
   * de `src/`.
   */
  it("los campos de TareaDelCable del cliente y del host no divergen", () => {
    expect(camposDeInterfaz(RUTA_TIPOS, "TareaDelCable")).toEqual(
      camposDeInterfaz(RUTA_TRANSPORTE, "TareaDelCable")
    );
  });

  /**
   * Y la tercera capa: **la lista blanca del store**, que es donde este repo se ha
   * equivocado cuatro veces (`mime`, `recetas`, `ejecutable`, `veredicto`) y donde el
   * síntoma es siempre una interfaz vacía con los tests en verde.
   *
   * El test se pone rojo si un campo se CAE, no solo si sobra: se manda una fila con TODOS
   * los campos que el tipo declara y se comprueba que sobreviven TODOS. La lista de campos
   * se saca del propio tipo, así que un campo nuevo entra solo en la comprobación — con un
   * objeto de ejemplo escrito a mano habría que acordarse de ampliarlo, que es exactamente
   * lo que no pasó las cuatro veces anteriores.
   *
   * Vive aquí y no en `store.test.ts` porque el extractor de campos es este; importarlo de
   * un fichero de test volvería a registrar sus tests dentro del otro.
   */
  it("la lista blanca del store no se come ningún campo declarado de TareaDelCable", async () => {
    const { crearStoreDelCliente } = await import("./store.js");
    const s = crearStoreDelCliente();
    s.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true, lista: [FILA_COMPLETA] });
    const fila = s.leer().tareas!.lista[0]!;
    expect(Object.keys(fila).sort()).toEqual(camposDeInterfaz(RUTA_TIPOS, "TareaDelCable"));
    // Y con el mismo valor: copiar el campo con el nombre puesto y el contenido vacío sería
    // la misma mentira con más pasos.
    expect(fila).toEqual(FILA_COMPLETA);
  });
});

/**
 * Una fila con TODOS los campos que `TareaDelCable` declara. `Required<…>` no la vigila
 * —los `.test.ts` del cliente no los mira ningún `tsc` (su `tsconfig.json` los excluye a
 * propósito y el del host solo cubre `src/`)—, así que quien la vigila es el test de
 * arriba: si le falta un campo declarado, la comparación de claves se pone roja.
 */
const FILA_COMPLETA = {
  id: "t1",
  proyecto: "p1",
  proyectoNombre: "AppDemo",
  titulo: "Arregla el login",
  peticion: "arregla el login",
  encargo: "Arregla el login, con estos pasos…",
  adjuntos: [{ nombre: "captura.png", bytes: 12, mime: "image/png" }],
  estado: "requiere-atencion" as const,
  motivo: "el juez de QA dijo «rojo»: falta el campo",
  sesion: "s1",
  creada: "2026-09-08T10:00:00.000Z",
  empezada: "2026-09-08T10:01:00.000Z",
  acabada: "2026-09-08T10:09:00.000Z",
  autorizadas: ["app.xne"],
  feedback: [{ texto: "sí, con histórico", creado: "2026-09-08T10:05:00.000Z", consumido: true }],
  veredicto: {
    veredicto: "rojo" as const,
    resumen: "falta el campo",
    hallazgos: ["no hay título en la lista"],
    salvedad: "el turno no cambió ningún fichero",
  },
  terminadaAMano: true,
};

/**
 * Los campos declarados de una interfaz, por TEXTO y contando llaves para quedarse con el
 * PRIMER nivel: `proyecto: { … }` es un campo, y el `veredicto?: { … }` de varias líneas no
 * puede colar `resumen` como si fuera de la tarea. Los comentarios se quitan antes de
 * contar, porque los docblocks de este repo llevan llaves dentro (`{clase:"tareas"}`).
 *
 * Es gemelo del de `src/web/servidor/transporte.test.ts`, y la copia es la MISMA que obliga
 * a redeclarar los tipos del cable: desde aquí no se puede importar de `src/`.
 */
function camposDeInterfaz(ruta: string, nombre: string): string[] {
  const fuente = readFileSync(ruta, "utf8");
  const declaracion = new RegExp(`export interface ${nombre}\\s*\\{`).exec(fuente);
  if (declaracion === null) throw new Error(`no se encontró «export interface ${nombre}» en ${ruta}`);
  const cuerpo = fuente
    .slice(declaracion.index + declaracion[0].length)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const campos: string[] = [];
  let profundidad = 0;
  for (const linea of cuerpo.split("\n")) {
    if (profundidad === 0) {
      const campo = /^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/.exec(linea);
      if (campo !== null) campos.push(campo[1]);
    }
    for (const caracter of linea) {
      if (caracter === "{") profundidad += 1;
      else if (caracter === "}") {
        if (profundidad === 0) return campos.sort();
        profundidad -= 1;
      }
    }
  }
  throw new Error(`la interfaz ${nombre} de ${ruta} no cierra`);
}

/**
 * Extrae, para cada estado conocido, la lista de estados a los que puede ir — de un bloque
 * `TRANSICIONES: … = { … };`, por TEXTO y no por import (misma razón que `literalesDe`).
 * El regex acepta la clave con o sin comillas (`nuevo:` en el host, `"en-proceso":` al
 * lado) y no le importan los comentarios intercalados, porque solo mira dentro de cada
 * `[...]`.
 */
function transicionesDe(ruta: string): Record<string, string[]> {
  const fuente = readFileSync(ruta, "utf8");
  const bloque = fuente.match(/TRANSICIONES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (bloque === null) throw new Error(`no se encontró TRANSICIONES en ${ruta}`);
  const resultado: Record<string, string[]> = {};
  const regex = /"?([a-z][a-z-]*)"?:\s*\[([^\]]*)\]/g;
  for (const m of bloque[1].matchAll(regex)) {
    resultado[m[1]] = m[2]
      .split(",")
      .map((v) => v.trim().replace(/^"|"$/g, ""))
      .filter((v) => v !== "")
      .sort();
  }
  return resultado;
}
