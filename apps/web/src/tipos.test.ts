import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import type { DecisionDeConsola } from "./tipos.js";

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
const RUTA_APROBAR = join(aqui, "..", "..", "..", "src", "cli", "aprobar.ts");
const RUTA_STORE = join(aqui, "store.ts");

/**
 * `[A-Za-z0-9_-]+` y no `[a-z0-9_-]+`: la primera versión de este detector (la del brief) no
 * veía guion bajo ni guion. Medido en la ronda de revisión: un tipo llamado `"fantasma_review"`
 * metido a mano pasaba el test sin que nada chistara, porque el propio detector lo
 * truncaba a la parte anterior al `_` — o directamente no lo capturaba si el `_` iba al
 * principio del resto de la coincidencia. Un tipo real con guion bajo o guion sería
 * invisible a la comprobación de divergencia con la regex vieja.
 *
 * **Y la segunda ronda quitó la MINÚSCULA obligatoria, que era el mismo agujero un piso más
 * arriba.** Medido al ensanchar: el árbol tenía TRES literales `clase:` en `camelCase`
 * —`modelosDeMotor`, `proyectosDeEntorno` y `sesionAccion`— que la regex vieja no veía en
 * NINGUNO de los dos ficheros. Salía verde porque el agujero era el mismo en los dos lados de la
 * comparación, que es exactamente cómo este test se queda quieto sin estar midiendo: no había
 * caído nada por él, pero la red no cubría la grafía que este repo usa para toda ACCIÓN del
 * cable. Los tres aparecen en el cliente y en el host, así que el cuadre se mantiene.
 */
function literalesDe(campo: "tipo" | "clase", ruta: string): string[] {
  const regex = new RegExp(`\\{\\s*${campo}:\\s*"([A-Za-z0-9_-]+)"`, "g");
  return [...readFileSync(ruta, "utf8").matchAll(regex)].map((m) => m[1]).sort();
}

describe("tipos del cliente", () => {
  it("los tipos de acto del cliente y del host no divergen", () => {
    expect(literalesDe("tipo", RUTA_TIPOS)).toEqual(literalesDe("tipo", RUTA_ACTOS));
  });

  /**
   * **La lista blanca del store, que es donde un tipo nuevo se cae SIN SÍNTOMA.**
   *
   * `TIPOS_DE_ACTO` (`store.ts`) es un `satisfies Record<Acto["tipo"], true>`, así que en el
   * editor un tipo sin su clave sale en rojo — pero **`tsc` no mira `apps/web/`**: ni
   * `npm run typecheck` (su `include` es `src/**`) ni el `build` de Vite, que transpila sin
   * comprobar. O sea que la red que existe se dispara solo en la máquina de quien escribe, y
   * en CI el olvido es un acto que el store filtra en silencio: la operación ocurre, se
   * persiste, y no se ve en ninguna parte. Este test es esa red, puesta donde sí corre.
   *
   * Se compara por TEXTO y no por import —la frontera del cliente no deja tirar de `src/`, y
   * `store.ts` no exporta la tabla—, y la lista de tipos sale de `tipos.ts`, que a su vez está
   * atado a `core/actos.ts` por el test de arriba: una cadena de tres eslabones que se rompe
   * en el eslabón que se toque.
   *
   * **Sin duplicados**, y no es un detalle de estilo: `tipos.ts` escribe el literal de un tipo
   * dos veces —una en la variante de la unión y otra en el `Extract` del alias que estrecha esa
   * variante (`ActoDeSincronizacion`)—, así que la lista cruda trae repetido el que tenga alias.
   * La tabla del store, en cambio, tiene una clave por tipo. Se compara contra el conjunto, que
   * es lo que las dos listas quieren decir; el test de literales de arriba sigue comparando las
   * listas crudas contra el host, donde el duplicado también existe.
   */
  it("la lista blanca de actos del store no se deja ningún tipo del cliente", () => {
    expect(clavesDeLaListaBlanca(RUTA_STORE)).toEqual([
      ...new Set(literalesDe("tipo", RUTA_TIPOS)),
    ]);
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
   * El hermano del de arriba, y por el mismo motivo: `camelCase` es la grafía que este repo usa
   * para TODA acción del cable (`modelosDeMotor`, `sesionAccion`, `revisarLanzamiento`), así que
   * un detector que exija minúscula es ciego justo en la clase de nombre que más se escribe. Se
   * fija con un literal que no existe en el repo: si alguien vuelve a estrechar la regex, este
   * test se pone rojo sin depender de que haya por casualidad un `camelCase` que lo delate.
   */
  it("el detector ve camelCase: 'arranqueDeApp' no es invisible", () => {
    const conMayusculas = '| { clase: "arranqueDeApp"; proyecto: string }';
    const regex = /\{\s*clase:\s*"([A-Za-z0-9_-]+)"/g;
    expect([...conMayusculas.matchAll(regex)].map((m) => m[1])).toEqual(["arranqueDeApp"]);
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

  /**
   * Y lo mismo para `SesionDelCable`, que es la fila de la que cuelga el gasto de cada sesión
   * en la barra. Nació con nombre propio por esto mismo: su tipo vivía ESCRITO DENTRO del alta
   * de `transporte.ts`, y una fila embebida en otra interfaz no se puede comparar.
   */
  it("los campos de SesionDelCable del cliente y del host no divergen", () => {
    expect(camposDeInterfaz(RUTA_TIPOS, "SesionDelCable")).toEqual(
      camposDeInterfaz(RUTA_TRANSPORTE, "SesionDelCable")
    );
  });

  it("la lista blanca del store no se come ningún campo declarado de SesionDelCable", async () => {
    const { crearStoreDelCliente } = await import("./store.js");
    const s = crearStoreDelCliente();
    s.aplicar({
      clase: "alta",
      pasos: [],
      proveedores: [],
      entornos: [],
      registrados: [],
      ramas: [],
      // El alta entera se descarta si esto no es un booleano de verdad: es el campo que
      // distingue la maqueta completa del hueco de «elige un proyecto».
      proyectoAbierto: true,
      proyectos: [{ id: "p1", nombre: "Tienda", sesiones: [FILA_COMPLETA_DE_SESION] }],
    });
    const fila = s.leer().alta!.proyectos[0]!.sesiones![0]!;
    expect(Object.keys(fila).sort()).toEqual(camposDeInterfaz(RUTA_TIPOS, "SesionDelCable"));
    expect(fila).toEqual(FILA_COMPLETA_DE_SESION);
  });

  /**
   * `EstadoDeSync` nació con nombre propio por esta misma razón: sus campos vivían ESCRITOS
   * DENTRO de la unión (`| { clase: "sync"; … }`), y unos campos embebidos en un mensaje no
   * se pueden comparar. Es la fila de la que cuelga la pestaña CloudStudio, y lo que se cae
   * sin síntoma es la MEDIDA: un `pendientes` que no llegue se pinta como «no consta», que
   * se lee como «no lo he mirado» y no como «el store se lo comió».
   */
  it("los campos de EstadoDeSync del cliente y del host no divergen", () => {
    expect(camposDeInterfaz(RUTA_TIPOS, "EstadoDeSync")).toEqual(
      camposDeInterfaz(RUTA_TRANSPORTE, "EstadoDeSync")
    );
  });

  it("la lista blanca del store no se come ningún campo declarado de EstadoDeSync", async () => {
    const { crearStoreDelCliente } = await import("./store.js");
    const s = crearStoreDelCliente();
    // Con TODOS los campos declarados, sacados del propio tipo: si uno se cae del `case`,
    // la comparación de claves se pone roja sin que nadie tenga que acordarse de ampliarla.
    const completa: Record<string, unknown> = {
      proyecto: "Tienda",
      rama: "main",
      pendientes: 3,
      deLaSesion: 1,
      error: "no se pudo medir",
    };
    s.aplicar({ clase: "sync", ...completa });
    const fila = s.leer().sync!;
    expect(Object.keys(fila).sort()).toEqual(camposDeInterfaz(RUTA_TIPOS, "EstadoDeSync"));
    expect(fila).toEqual(completa);
  });

  /**
   * **La forma de la pregunta, que es lo que separa una tarjeta con botones de un campo de
   * texto.** `DecisionDeConsola` se compara campo a campo como `TareaDelCable`, y por una
   * razón que aquí pesa más que en ningún otro sitio: perderla NO da un error, da la
   * pantalla de siempre —el editor— justo en el paso que sube un proyecto a un servidor
   * remoto, con todo en verde.
   */
  it("los campos de DecisionDeConsola del cliente y del host no divergen", () => {
    expect(camposDeInterfaz(RUTA_TIPOS, "DecisionDeConsola")).toEqual(
      camposDeInterfaz(RUTA_APROBAR, "DecisionDeConsola")
    );
  });

  /**
   * Y la línea del plan, que es de donde cuelga el COLOR de lo que se añade y lo que se
   * borra. Es la misma trampa que `DecisionDeConsola` un nivel más abajo: comparar solo la
   * interfaz de fuera dejaría al cliente con una `linea` sin `cambio`, que se pinta entera
   * en gris —con la tarjeta y los botones en su sitio— y no se lee como un fallo.
   */
  it("los campos de LineaDelPlan del cliente y del host no divergen", () => {
    expect(camposDeInterfaz(RUTA_TIPOS, "LineaDelPlan")).toEqual(
      camposDeInterfaz(RUTA_APROBAR, "LineaDelPlan")
    );
  });

  /**
   * Y la variante del mensaje, que vive DENTRO de la unión: aquí no hay `interface` que
   * comparar —el mismo motivo por el que `EstadoDeSync` tuvo que nacer con nombre propio—,
   * así que se comparan los nombres de campo de la línea. Si el cliente dejara de declarar
   * `decision`, el `case "pregunta"` del store lo seguiría leyendo igual y nada chistaría.
   */
  it("los campos de la variante «pregunta» del mensaje no divergen", () => {
    expect(camposDeLaVariante(RUTA_TIPOS, "pregunta")).toEqual(
      camposDeLaVariante(RUTA_TRANSPORTE, "pregunta")
    );
  });

  it("la lista blanca del store no se come la forma de la pregunta, ni una sola línea", async () => {
    const { crearStoreDelCliente } = await import("./store.js");
    const s = crearStoreDelCliente();
    const decision = {
      lineas: [
        { texto: "SUBIDA A CLOUDSTUDIO — 1 operación" },
        { texto: "  + app/Clientes.xne", cambio: "nuevo" as const },
      ],
    };

    s.aplicar({ clase: "pregunta", texto: "¿Subir a CloudStudio?", decision });

    const pregunta = s.leer().pregunta!;
    expect(Object.keys(pregunta.decision!).sort()).toEqual(camposDeInterfaz(RUTA_TIPOS, "DecisionDeConsola"));
    expect(pregunta).toEqual({ texto: "¿Subir a CloudStudio?", decision });
    // Y un nivel más abajo, que es donde se cae el COLOR sin síntoma: cada línea se copia
    // NOMBRANDO sus campos, así que una que solo copie `texto` deja el plan entero en gris
    // con la tarjeta, los botones y los textos exactamente donde tienen que estar.
    expect(Object.keys(pregunta.decision!.lineas[1]!).sort()).toEqual(camposDeInterfaz(RUTA_TIPOS, "LineaDelPlan"));
    // La cabecera NO hereda el `cambio` de la línea de al lado: ausente es ausente, y
    // heredarlo pintaría de verde un recuento.
    expect(pregunta.decision!.lineas[0]).toEqual({ texto: "SUBIDA A CLOUDSTUDIO — 1 operación" });
  });

  /**
   * Lo que NO se entiende se cae, pero se cae solo: un `cambio` de otro color deja la línea
   * SIN color y no tira la decisión. La asimetría importa porque la otra mitad de este
   * fallo —devolver el campo de texto— es donde teclear «s» autoriza igual, y aquí se está
   * autorizando una subida a un servidor remoto.
   */
  it("una línea con un `cambio` que no se entiende pierde el color, no la decisión", async () => {
    const { crearStoreDelCliente } = await import("./store.js");
    const s = crearStoreDelCliente();

    s.aplicar({
      clase: "pregunta",
      texto: "¿Subir a CloudStudio?",
      decision: { lineas: [{ texto: "  + app/Clientes.xne", cambio: "verde" }] } as unknown as DecisionDeConsola,
    });

    const pregunta = s.leer().pregunta!;
    expect(pregunta.decision).toEqual({ lineas: [{ texto: "  + app/Clientes.xne" }] });
    expect("decision" in pregunta).toBe(true);
  });

  it("y una pregunta de texto libre no hereda la forma de la ANTERIOR", async () => {
    // El `case` construye el objeto entero, así que no debería poder heredarla — pero esto
    // es justo el dato que decide si hay campo o botones, y heredarlo dejaría dos botones
    // sobre una pregunta abierta: la mitad peligrosa del mismo fallo.
    const { crearStoreDelCliente } = await import("./store.js");
    const s = crearStoreDelCliente();

    s.aplicar({ clase: "pregunta", texto: "¿Subir?", decision: { lineas: [{ texto: "  + a.xne" }] } });
    s.aplicar({ clase: "pregunta", texto: "URL MCP de CloudStudio: " });

    expect(s.leer().pregunta).toEqual({ texto: "URL MCP de CloudStudio: " });
  });
});

/**
 * Una fila de sesión con TODOS los campos que `SesionDelCable` declara, por el mismo motivo que
 * `FILA_COMPLETA`: quien la vigila es el test de arriba, no un `tsc` —los `.test.ts` del cliente
 * no entran en ningún proyecto de `tsc`, y el del host solo cubre `src/`—.
 */
const FILA_COMPLETA_DE_SESION = {
  id: "s1",
  titulo: "Arregla el alta",
  ultimoTurno: "2026-09-12T09:14:02.000Z",
  deTarea: true as const,
  trabajando: true as const,
  consumo: { modelo: { entrada: 11_000, salida: 200, cache: 9_000 }, externo: { entrada: 7, salida: 3, cache: 0 } },
};

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
 * Las claves de `TIPOS_DE_ACTO` (`store.ts`), por TEXTO: se queda con el bloque que va del
 * `= {` al `} satisfies` y con las líneas `clave: true,` de dentro. Cualquier otra forma de
 * escribir la tabla —una constante aparte, un `new Set`— dejaría este test sin nada que leer,
 * y por eso el `expect` compara LISTAS enteras y no busca una clave concreta: una tabla que se
 * reescriba de otra manera pone el test rojo en vez de aprobarlo por vacío.
 */
function clavesDeLaListaBlanca(ruta: string): string[] {
  const fuente = readFileSync(ruta, "utf8");
  const bloque = /const TIPOS_DE_ACTO = \{([\s\S]*?)\}\s*satisfies/.exec(fuente);
  if (bloque === null) throw new Error(`no se encontró TIPOS_DE_ACTO en ${ruta}`);
  return [...bloque[1].matchAll(/^\s*([a-z0-9_-]+):\s*true,\s*$/gm)].map((m) => m[1]).sort();
}

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
 * Los campos de una VARIANTE de la unión de mensajes, por el nombre de su `clase` y por
 * TEXTO (misma razón que `camposDeInterfaz`: la frontera del cliente no deja importar de
 * `src/`). Existe porque hay campos que viven dentro de la unión —la forma de la pregunta,
 * `decision`— y embebidos en un mensaje no hay `interface` que comparar.
 */
function camposDeLaVariante(ruta: string, clase: string): string[] {
  const fuente = readFileSync(ruta, "utf8");
  const variante = new RegExp(`\\{\\s*clase:\\s*"${clase}"\\s*;([^}]*)\\}`).exec(fuente);
  if (variante === null) throw new Error(`no se encontró la variante «${clase}» en ${ruta}`);
  return [...variante[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\??\s*:/g)].map((m) => m[1]).sort();
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
