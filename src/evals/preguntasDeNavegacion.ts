/**
 * El catálogo de preguntas que un desarrollador le hace a su proyecto XOne, y qué contesta
 * hoy `xone_navegacion`.
 *
 * **Para qué sirve, que no es para medir tokens.** El banco (`preguntas.ts`) mide lo que
 * cuesta enterarse; esto contesta otra cosa: **qué NO sabemos contestar**. Una tool de
 * navegación se juzga por su cobertura —cuántas de las preguntas reales caen dentro— y por su
 * precisión —si lo que contesta es cierto—. La segunda se comprueba sin modelo, contrastando
 * el índice con un oráculo independiente (`navegacion.precision.test.ts`); ésta es la primera.
 *
 * **Cada pregunta dice qué operación la contestaría**, y ahí está el valor: una pregunta con
 * `operacion: undefined` es un HUECO, no una pregunta mal escrita. El test de este fichero
 * exige que toda operación nombrada exista de verdad en la tool — si no, el catálogo diría que
 * cubrimos algo que no cubrimos, que es la peor forma de un inventario.
 *
 * **Y el hueco lleva su COSTE**, porque no todos valen lo mismo: `barato` es que el dato YA
 * está en el modelo de `xone-linter` y solo falta mapearlo (eventos, nodos, conexiones, la
 * config de `app`); `caro` es que hace falta trabajo nuevo — conservar rangos al parsear, o
 * analizar JavaScript de forma fiable. Sin esa distinción, una lista de huecos se lee como una
 * lista de trabajo igual de grande, y no lo es.
 *
 * Las preguntas están en español y como las diría alguien, no en la jerga de la tool: si se
 * escribieran como «llama a `referencias` con `Clientes`» estaríamos midiendo nuestra propia
 * nomenclatura en vez de lo que la gente pregunta.
 */

/** Las operaciones que `xone_navegacion` tiene HOY. Debe cuadrar con su esquema. */
export const OPERACIONES = [
  "inventario",
  "definicion",
  "referencias",
  "campos",
  "detalle",
  "app",
  "problemas",
  "estilos",
] as const;
export type Operacion = (typeof OPERACIONES)[number];

/** Qué costaría cerrar un hueco. Ver la cabecera: no todos valen lo mismo. */
export type CosteDelHueco = "barato" | "caro";

export interface PreguntaDeNavegacion {
  /** Identificador corto, para nombrarla en una tabla. */
  nombre: string;
  /** Tal como la diría una persona. */
  texto: string;
  /** Qué se está pidiendo de verdad, en una línea. */
  mide: string;
  /** La operación que la contesta hoy. Ausente = HUECO. */
  operacion?: Operacion;
  /** Solo en un hueco: qué costaría, y qué haría falta. */
  hueco?: { coste: CosteDelHueco; falta: string };
  /** Solo en una cubierta que lo está a MEDIAS: qué parte no se contesta. Una cobertura con
   *  asterisco y sin decir cuál es peor que un hueco declarado. */
  limite?: string;
}

export const PREGUNTAS_DE_NAVEGACION: readonly PreguntaDeNavegacion[] = [
  // ─── Lo que ya se contesta ────────────────────────────────────────────────────────────
  {
    nombre: "inventario",
    texto: "¿Cuántas colecciones tiene mi proyecto y cómo se llaman?",
    mide: "el mapa del proyecto de un vistazo",
    operacion: "inventario",
  },
  {
    nombre: "donde-vive",
    texto: "¿En qué fichero está definida la colección Empresas?",
    mide: "encontrar la declaración sin adivinar el nombre del fichero",
    // El caso que lo hace valioso: en AppDemo, `Empresas` vive en `mappings.xne` y no en un
    // `Empresas.xne`. Buscar por nombre de fichero no la encuentra.
    operacion: "definicion",
  },
  {
    nombre: "campos",
    texto: "¿Qué campos tiene Clientes y de qué tipo es cada uno?",
    mide: "el esquema de una colección sin abrir su fichero",
    operacion: "campos",
  },
  {
    nombre: "quien-usa",
    texto: "¿Quién usa la colección Clientes?",
    mide: "el impacto de tocar una colección",
    operacion: "referencias",
  },
  {
    nombre: "que-rompo",
    texto: "Si renombro el campo NOMBRE de Clientes, ¿qué deja de funcionar?",
    mide: "impacto de un cambio, que es la pregunta de antes de refactorizar",
    operacion: "referencias",
  },
  {
    nombre: "herencia",
    texto: "¿Qué colecciones heredan de Pedidos?",
    mide: "seguir `inherits`",
    operacion: "referencias",
  },
  {
    nombre: "maestro-detalle",
    texto: "¿Qué colección es el detalle de SitiosVerano?",
    mide: "seguir `contents src`, que es como XOne modela maestro-detalle",
    operacion: "referencias",
  },
  {
    nombre: "existe",
    texto: "¿Existe una colección que se llame Facturas?",
    mide: "que un «no» sea un no medido y no una búsqueda que no encontró nada",
    operacion: "definicion",
  },

  // ─── Huecos BARATOS: el dato ya está en el modelo del linter ──────────────────────────
  {
    nombre: "entrypoint",
    texto: "¿Por qué colección arranca la aplicación?",
    mide: "leer la configuración de `app.xml`",
    operacion: "app",
  },
  {
    nombre: "eventos",
    texto: "¿Qué eventos tiene la colección Clientes?",
    mide: "la superficie de comportamiento de una colección",
    operacion: "detalle",
  },
  {
    nombre: "conexiones",
    texto: "¿Contra qué origen de datos va la colección Pedidos?",
    mide: "de dónde salen los datos",
    operacion: "detalle",
  },
  {
    nombre: "rotas",
    texto: "¿Hay referencias rotas en el proyecto?",
    mide: "apuntar a algo que no existe",
    // Encontrado midiendo sobre un proyecto real: `ConsolaReplica` declara
    // `contents src="OperQueue"` y esa colección no existe. El índice TIENE la referencia
    // —`referencias("OperQueue")` la devuelve— pero no hay forma de preguntarlo sin saber ya
    // el nombre que falta, que es justo lo que se quiere descubrir.
    operacion: "problemas",
  },
  {
    nombre: "estilo-efectivo",
    texto: "¿De qué tamaño y color se ve este botón, y de dónde sale?",
    mide: "la CASCADA de estilos: qué le toca de verdad a un control",
    operacion: "estilos",
    /**
     * **Era el hueco más caro y no estaba en esta lista.** Medido el 19-09-2026 sobre diez
     * pasadas del mismo encargo visual: `xone_navegacion` es la PRIMERA tool en ocho de ellas
     * y luego deja de servir, porque indexa el modelo `.xne` y el arreglo visual vive en los
     * estilos. Lo que quedaba eran 30-42 `grep` —~22 de cada 30, la misma clase con variantes—
     * más cinco ficheros CSS y varios `.xne` ajenos buscando ejemplos.
     */
    limite:
      "Contesta por el control (`Coleccion.CONTROL`), no por la clase: «quién usa .btnPrimario» " +
      "sigue siendo `grep`. Y la cascada la resuelve `xone-linter`, así que hereda sus límites.",
  },
  {
    nombre: "huerfanas",
    texto: "¿Qué colecciones no usa nadie?",
    mide: "código muerto, la otra mitad de «quién usa»",
    // **Se implementó y se tiró, midiendo.** Sobre un proyecto real de 42 colecciones daba 33
    // huérfanas; metiendo las referencias de script bajaba a 22 — la mitad del proyecto. Una
    // lista con 50 % de falsos positivos no es un hallazgo: o se ignora o se borra código
    // vivo. En XOne se llega a una colección por caminos que este índice no modela, y un
    // aviso al pie no arregla una señal equivocada.
    hueco: {
      coste: "caro",
      falta: "una forma de ACOTAR el falso positivo; medido, la mitad del proyecto sale como huérfana y eso no se arregla con un aviso",
    },
  },

  // ─── Huecos CAROS: hace falta trabajo nuevo ───────────────────────────────────────────
  {
    nombre: "desde-js",
    texto: "¿Desde qué scripts se usa la colección Clientes?",
    mide: "referencias que no están en un atributo XML sino en JavaScript",
    // El linter SÍ las detecta (su aviso «Script referencia a colección X no encontrada»),
    // pero por regex sobre los scripts unidos: sirve para avisar y no para afirmar dónde.
    // Cubierta desde que `referenciasDeScript` reconoce `appData.getCollection("X")`, que es
    // como navega de verdad una app XOne: medido sobre un proyecto real, «¿quién usa
    // Deportes?» pasó de «nadie» a sus dos botones de menú.
    operacion: "referencias",
    limite:
      "reconoce el patrón `getCollection(\"X\")` con literal; no ve un nombre en variable ni dice en qué línea está",
  },
  {
    nombre: "en-que-linea",
    texto: "¿En qué línea del fichero está declarado el campo NOMBRE?",
    mide: "ir al sitio exacto, no al fichero",
    hueco: {
      coste: "caro",
      falta: "rangos: `loc()` del linter devuelve solo el fichero y ninguno de sus dos parsers conserva la posición de un atributo",
    },
  },
  {
    nombre: "quien-llama-metodo",
    texto: "¿Quién llama al método CalcularTotal?",
    mide: "navegación dentro del JavaScript del proyecto",
    hueco: { coste: "caro", falta: "lo mismo que `desde-js`, más resolución de ámbitos ES5" },
  },
];

/** Las que hoy tienen respuesta. */
export const CUBIERTAS = PREGUNTAS_DE_NAVEGACION.filter((p) => p.operacion !== undefined);

/** Las que no. Son la lista de trabajo, ordenada por lo que cuesta. */
export const HUECOS = PREGUNTAS_DE_NAVEGACION.filter((p) => p.operacion === undefined);
