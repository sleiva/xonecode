/**
 * Las preguntas del banco y sus jueces.
 *
 * Son preguntas de SOLO LECTURA sobre el esqueleto «Hola Mundo» (`core/esqueleto.ts`), que es
 * lo único cuyo contenido controlamos y por tanto lo único sobre lo que se puede juzgar una
 * respuesta. Miden lo que cuesta ENTERARSE de algo, que es el grueso del trabajo de este
 * harness y donde se fue el 86 % del gasto en la primera medida.
 *
 * **El juez es lo que separa un ahorro de una respuesta peor**: una pasada barata y equivocada
 * no es una mejora, y sin juez el banco premiaría al modelo que menos mira. Por eso viven aquí,
 * puros y con test —igual que los de `tareas.ts`—: un juez que juzgue mal invalida el banco
 * entero sin que nadie lo note.
 *
 * Los jueces piden el HECHO (el nombre que hay que acertar) y rechazan la respuesta que además
 * afirma el contrario. No piden una redacción: eso mediría el estilo del modelo, no si se enteró.
 */

export interface Pregunta {
  nombre: string;
  /** Qué se mide con ella, para la tabla. */
  mide: string;
  texto: string;
  /** El proyecto del banco lleva login: hay preguntas que dependen de ello. */
  correcta(respuesta: string): boolean;
}

const tiene = (respuesta: string, aguja: string): boolean => respuesta.toLowerCase().includes(aguja.toLowerCase());

export const PREGUNTAS: readonly Pregunta[] = [
  {
    nombre: "entrypoint",
    mide: "leer una declaración de app.xml",
    texto: "¿Qué colección del proyecto es el entrypoint? Contesta en una línea.",
    // `MenuPrincipal` es el señuelo: suena a entrada y no lo es. Afirmarlo es fallar aunque
    // también se nombre la buena.
    correcta: (r) => tiene(r, "EntradaApp") && !tiene(r, "el entrypoint es MenuPrincipal"),
  },
  {
    nombre: "estilo",
    mide: "seguir una referencia entre ficheros",
    texto: "¿Qué hoja de estilos usa la aplicación y desde qué fichero se declara? Contesta en una línea.",
    /**
     * **Vale cualquiera de los dos ficheros, y esto lo arregló el banco a sí mismo.**
     *
     * El esqueleto declara `<style url="default.css" />` en `app.xml` Y en `mappings.xne`, así
     * que exigir `app.xml` suspendía a quien lo encontraba con un `grep` en el otro — una
     * respuesta igual de cierta y por el camino más barato. Medido: la pasada suspendida había
     * contestado `mappings.xne:4`. El ✗ era del juez, como las dos primeras veces del corredor
     * de evals, y por eso las respuestas suspendidas se guardan.
     */
    correcta: (r) => tiene(r, "default.css") && (tiene(r, "app.xml") || tiene(r, "mappings.xne")),
  },
  {
    nombre: "capacidad",
    mide: "criterio sobre la plataforma, no lectura del proyecto",
    texto: "¿Puedo usar XOne para hacer un CRM móvil? Di si es viable y con qué mecanismos de la plataforma se modelarían los clientes y sus visitas.",
    /**
     * **La clase CARA, y por eso está aquí**: una pregunta de capacidad no se contesta mirando
     * el proyecto, así que no tiene criterio de parada natural — medida real, 426k de entrada y
     * 24 llamadas frente a los 9-12k de una de estructura. Es la que decide si el orquestador
     * delega lo que es de criterio o se pone a investigar la plataforma él.
     *
     * El juez es DELIBERADAMENTE flojo: pide el mecanismo real (las colecciones) y descarta la
     * negación plana, y nada más. Un juez fino sobre una respuesta abierta mediría la redacción
     * del modelo en vez de si acertó, que es el error que ya costó una tarde en `estilo`. Lo que
     * se viene a medir aquí es el COSTE; el juez solo tiene que cazar la respuesta degenerada.
     *
     * Nada de exigir que NO diga «módulo CRM»: la respuesta buena medida decía literalmente «no
     * hay un módulo CRM», así que esa comprobación habría suspendido justo a la correcta.
     */
    correcta: (r) => (tiene(r, "colecc") || tiene(r, "<coll")) && !/\bno (se puede|es posible|puedes)\b/i.test(r),
  },
  {
    nombre: "cambio",
    mide: "preparar un CAMBIO: dos ficheros y el ayudante que YA existe",
    texto:
      "El botón «Saludar» de MenuPrincipal solo muestra un toast. Quiero que antes pida "
      + "confirmación al usuario. Dime en qué fichero está ese botón y, si el proyecto ya tiene "
      + "una función para pedir confirmación, cuál es y en qué fichero está. No cambies nada.",
    /**
     * **La familia que faltaba: un encargo de CAMBIO.** Las otras cuatro preguntan por un dato
     * suelto; ésta pide lo que hay que saber ANTES de tocar nada, que es donde se midió el
     * problema el 19-09-2026 — seis turnos reales en los que cada especialista repetía las
     * mismas búsquedas (`grep` ×42 en uno solo) y el orquestador se llevaba el 38-50 % del
     * gasto averiguando.
     *
     * **Va redactada en SOLO LECTURA a propósito, y es un límite declarado.** Una orden de
     * verdad chocaría con el invariante del banco: aquí la aprobación RECHAZA, así que el turno
     * acabaría con escrituras sin resolver, el texto final tras un rechazo no es fiable
     * —a veces es «no se aplicó nada»— y el bucle de rondas mete un ruido de otra clase encima
     * del que se viene a medir. Así que esto mide **lo que cuesta PREPARAR un cambio**, no la
     * cadena entera hasta quien escribe. Lo segundo sigue sin instrumento.
     *
     * **Por qué ESTE cambio y no otro**: la respuesta vive en DOS ficheros —el botón en
     * `MenuPrincipal.xne`, el ayudante en `functions.js`— y el proyecto ya tiene `confirmar()`.
     * La respuesta degenerada es la cara: proponer un `ui.msgBox` a pelo sin haber mirado si ya
     * existía algo, que es exactamente lo que hace quien no se entera. Exigir `confirmar` la
     * caza sin tener que juzgar la redacción.
     *
     * El juez es flojo a propósito, por la lección de `estilo` y de `capacidad`: pide los tres
     * hechos y nada más. Un juez fino sobre una respuesta abierta mide el estilo del modelo.
     */
    correcta: (r) => tiene(r, "confirmar") && tiene(r, "functions.js") && tiene(r, "MenuPrincipal"),
  },
  {
    nombre: "login",
    mide: "distinguir dos conceptos parecidos",
    texto: "¿La app pide login al arrancar? Di qué colección lo hace y en qué fichero está.",
    correcta: (r) => tiene(r, "Login.xne") || tiene(r, "LoginColl"),
  },
] as const;
