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
    correcta: (r) => tiene(r, "default.css") && tiene(r, "app.xml"),
  },
  {
    nombre: "login",
    mide: "distinguir dos conceptos parecidos",
    texto: "¿La app pide login al arrancar? Di qué colección lo hace y en qué fichero está.",
    correcta: (r) => tiene(r, "Login.xne") || tiene(r, "LoginColl"),
  },
] as const;
