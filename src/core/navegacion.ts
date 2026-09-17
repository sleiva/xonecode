/**
 * El índice de navegación XOne: qué hay en el proyecto y qué apunta a qué.
 *
 * **Este módulo es PURO**, y esa es la mitad del diseño. Quién lee el disco y quién entiende
 * el XML es `agent/navegacion/` apoyándose en `xone-linter`; aquí solo vive la forma de las
 * respuestas y cómo se consultan. Así la regla se prueba sin un proyecto delante, y el día
 * que la fuente del modelo cambie no cambia nada de esto.
 *
 * **Por qué existe.** Medido sobre un proyecto real (AppDemo, 41 `.xne`): contestar «¿qué
 * colecciones tiene el proyecto?» leyendo ficheros cuesta unos 18.000 tokens —son todos los
 * `.xne`—, y contestarla desde el modelo cuesta 141. La pregunta cara no es leer un fichero
 * (un `.xne` son un par de kilobytes): es **no saber cuál de los cuarenta y uno leer**. Eso
 * es lo que esto contesta, y por eso la primera versión va POR NOMBRE y no por posición.
 *
 * **Por qué no por posición todavía.** Un editor pregunta «¿qué hay bajo el cursor?»; un
 * agente no tiene cursor, tiene nombres. Y saber la posición exacta de un atributo exige
 * conservar su rango al parsear, que hoy `xone-linter` no hace (su `loc()` devuelve solo el
 * fichero). Lo caro está justo en la mitad que no hace falta para lo que se ha medido.
 *
 * **Las rutas que entran aquí son VIRTUALES** (`/Clientes.xne`), nunca de la máquina. Quien
 * traduce es el adaptador, y no es higiene: esto viaja al modelo y de ahí al cable.
 */

/** Qué clase de cosa es un símbolo. Dos, porque son las dos que el modelo nombra. */
export type ClaseDeSimbolo = "coleccion" | "campo";

/** Dónde se declara algo. Sin línea: hoy no la hay, y ausente ≠ «línea 1». */
export interface Declaracion {
  nombre: string;
  clase: ClaseDeSimbolo;
  /** Ruta VIRTUAL. La real no sale nunca de `agent/`. */
  fichero: string;
  /** Solo en un campo: la colección que lo declara. */
  coleccion?: string;
  /** El tipo declarado de un campo (`T`, `N`, `D`…). Ausente si el `.xne` no lo dice. */
  tipo?: string;
}

/** Quién apunta a quién, y por qué atributo. El atributo importa: no es lo mismo un
 *  `mapcol` que un `inherits`, y el que pregunta suele querer justo esa diferencia. */
export interface Referencia {
  /** Quién referencia: `Citas.CLIENTE`, o `ConsolaReplica` si es la coll entera. */
  desde: string;
  /** El atributo que lo hace: `mapcol`, `mapfld`, `linkedfield`, `contents`, `inherits`. */
  por: string;
  /** A qué apunta: `Clientes` o `Clientes.NOMBRE`. */
  hacia: string;
  /** Ruta VIRTUAL del fichero que contiene la referencia. */
  fichero: string;
}

/**
 * El modelo mínimo del que sale el índice.
 *
 * Es NUESTRO y no el de `xone-linter` a propósito: el suyo trae el proyecto entero —runtime,
 * estilos, conexiones, imágenes— y atarnos a su forma haría que un cambio suyo se propagara
 * hasta aquí. El adaptador se queda con lo que estas consultas necesitan y nada más, que es
 * además la lista de lo que puede viajar.
 */
export interface ModeloDeNavegacion {
  colecciones: readonly ColeccionDeNavegacion[];
  app: AppDeNavegacion;
  /**
   * Las referencias que salen de un SCRIPT y no de un atributo XML.
   *
   * Van aparte porque no son de una colección: una puede vivir en un `.js` suelto. Y existen
   * porque **así es como navega una app XOne de verdad** — medido sobre un proyecto real: los
   * botones del menú abren colecciones con
   * `onclick="javascript:appData.getCollection('Deportes')…"`, no con `mapcol`. Sin ellas, «¿quién
   * usa Deportes?» contestaba «nadie» teniendo dos botones delante.
   */
  referenciasDeScript: readonly Referencia[];
}

export interface ColeccionDeNavegacion {
  nombre: string;
  /** Ruta VIRTUAL. */
  fichero: string;
  campos: readonly { nombre: string; tipo?: string }[];
  /** Lo que esta colección apunta hacia fuera, ya resuelto por el adaptador. */
  referencias: readonly Omit<Referencia, "fichero">[];
  /**
   * Los eventos declarados, por nombre. Un `onchange` lleva el campo que lo dispara entre
   * paréntesis, porque sin él no se sabe a qué reacciona — y eso es justo lo que hace falta
   * antes de tocarlo.
   */
  eventos: readonly string[];
  /** Los nodos personalizados, por nombre. */
  nodos: readonly string[];
  /** Las conexiones propias de la colección, por nombre. */
  conexiones: readonly string[];
}

/** Lo que `app.xml` declara del conjunto. Contesta «¿por dónde arranca esto?». */
export interface AppDeNavegacion {
  /** Las colecciones de entrada. Vacío = no consta, que no es «no hay». */
  entrada: readonly string[];
  /** Las colecciones de login, si el proyecto tiene. */
  login: readonly string[];
  /** Las hojas de estilo declaradas, por URL. */
  estilos: readonly string[];
  /** Las conexiones declaradas a nivel de aplicación. */
  conexiones: readonly string[];
}

/** Todo lo que se sabe de UNA colección, para la pregunta «háblame de Clientes». */
export interface DetalleDeColeccion {
  nombre: string;
  fichero: string;
  campos: readonly Declaracion[];
  eventos: readonly string[];
  nodos: readonly string[];
  conexiones: readonly string[];
  /** Lo que ELLA apunta hacia fuera. Lo que apunta hacia ella es `referencias`. */
  apuntaA: readonly Referencia[];
}

/**
 * Lo que no cuadra en el proyecto, cruzando referencias con inventario.
 *
 * **Esto NO convierte el índice en un validador**, y la diferencia importa: el linter valida
 * —tiene reglas, severidades y un informe— y esto solo cruza dos listas que ya tiene. Lo que
 * contesta es la pregunta de orientación «¿hay algo roto por aquí?», que hoy no se puede hacer
 * sin saber ya el nombre que falta.
 */
export interface ProblemasDelProyecto {
  /** Referencias a una colección que no existe. */
  rotas: readonly Referencia[];
}

/**
 * **Por qué NO hay «colecciones huérfanas», y está medido.**
 *
 * Se implementó y se tiró. Sobre un proyecto real de 42 colecciones daba 33 huérfanas; con las
 * referencias de script dentro bajaba a 22 — la mitad del proyecto. Una lista donde el 50 % son
 * falsos positivos no es un hallazgo, es ruido con autoridad: quien la lea o la ignora o borra
 * código vivo. El motivo es que en XOne se llega a una colección por caminos que este índice no
 * modela (menús, `ExecuteNode`, nombres compuestos en tiempo de ejecución), y un aviso al pie no
 * arregla una señal equivocada. Vuelve el día que se pueda acotar el falso positivo, no antes.
 */

/** Lo que el índice sabe contestar. Cuatro preguntas, que son las que se han medido. */
export interface IndiceDeNavegacion {
  /** Todas las colecciones, por nombre. La pregunta de los 18.000 tokens. */
  inventario(): readonly Declaracion[];
  /** Dónde se declara algo. `Clientes` o `Clientes.NOMBRE`. Varias si está duplicado. */
  definicion(nombre: string): readonly Declaracion[];
  /** Quién apunta a ello. Acepta la coll (`Clientes`) o el campo (`Clientes.NOMBRE`). */
  referencias(nombre: string): readonly Referencia[];
  /** Los campos de una colección, con su tipo. Vacío si la colección no existe. */
  campos(coleccion: string): readonly Declaracion[];
  /** Lo que declara `app.xml`: por dónde arranca, login, estilos y conexiones. */
  app(): AppDeNavegacion;
  /** Todo lo de UNA colección. `undefined` si no existe — que no es lo mismo que vacía. */
  detalle(coleccion: string): DetalleDeColeccion | undefined;
  /** Lo que no cuadra: referencias a lo que no existe, y colecciones que nadie usa. */
  problemas(): ProblemasDelProyecto;
}

/** Parte `Coll.CAMPO` en sus dos mitades. Sin punto, es una colección a secas. */
export function partirNombre(nombre: string): { coleccion: string; campo?: string } {
  const i = nombre.indexOf(".");
  if (i === -1) return { coleccion: nombre.trim() };
  return { coleccion: nombre.slice(0, i).trim(), campo: nombre.slice(i + 1).trim() };
}

/**
 * Construye el índice. Puro: el modelo entra ya resuelto y traducido.
 *
 * **No cachea, y quien lo llama tampoco debería.** Construirlo sobre un proyecto real cuesta
 * unas decenas de milisegundos —medido— contra los segundos de una llamada al modelo, así
 * que rehacerlo en cada consulta sale gratis y quita de en medio la pregunta de cuándo
 * invalidarlo. Un índice viejo que dice que un campo existe cuando el agente acaba de
 * borrarlo es peor que no tener índice: es una respuesta con autoridad y equivocada.
 *
 * **La comparación de nombres NO distingue mayúsculas.** En XOne se escribe `NOMBRE` en la
 * declaración y `Nombre` en un `mapfld` con la misma intención, y un índice que conteste «no
 * existe» por la caja manda a buscar un fallo que no está. Lo que se DEVUELVE es siempre el
 * nombre tal como está declarado, no el que se preguntó.
 */
export function construirIndice(modelo: ModeloDeNavegacion): IndiceDeNavegacion {
  const igual = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

  const declaracionDeColeccion = (c: ColeccionDeNavegacion): Declaracion => ({
    nombre: c.nombre,
    clase: "coleccion",
    fichero: c.fichero,
  });

  const declaracionDeCampo = (c: ColeccionDeNavegacion, campo: { nombre: string; tipo?: string }): Declaracion => ({
    nombre: campo.nombre,
    clase: "campo",
    fichero: c.fichero,
    coleccion: c.nombre,
    ...(campo.tipo === undefined ? {} : { tipo: campo.tipo }),
  });

  return {
    inventario: () => modelo.colecciones.map(declaracionDeColeccion),

    definicion(nombre) {
      const { coleccion, campo } = partirNombre(nombre);
      const suyas = modelo.colecciones.filter((c) => igual(c.nombre, coleccion));
      // Sin campo, se pregunta por la colección: se devuelven TODAS las que se llamen así.
      // Dos declaraciones con el mismo nombre no es un caso imposible y callarse una sería
      // contestar a medias sobre justo el proyecto que tiene el problema.
      if (campo === undefined || campo === "") return suyas.map(declaracionDeColeccion);
      return suyas.flatMap((c) =>
        c.campos.filter((f) => igual(f.nombre, campo)).map((f) => declaracionDeCampo(c, f))
      );
    },

    referencias(nombre) {
      const { coleccion, campo } = partirNombre(nombre);
      const encaja = (hacia: string): boolean => {
        const destino = partirNombre(hacia);
        if (!igual(destino.coleccion, coleccion)) return false;
        // Preguntando por la coll entera valen todas las que apunten a ella, lleven campo o
        // no: quien pregunta «¿quién usa Clientes?» quiere también los `mapfld`.
        if (campo === undefined || campo === "") return true;
        return destino.campo !== undefined && igual(destino.campo, campo);
      };

      const salida: Referencia[] = [];
      for (const c of modelo.colecciones) {
        for (const r of c.referencias) if (encaja(r.hacia)) salida.push({ ...r, fichero: c.fichero });
      }
      // Y las de script, que ya traen su fichero porque pueden venir de un `.js` suelto.
      for (const r of modelo.referenciasDeScript) if (encaja(r.hacia)) salida.push(r);
      return salida;
    },

    campos(coleccion) {
      const { coleccion: soloColl } = partirNombre(coleccion);
      return modelo.colecciones
        .filter((c) => igual(c.nombre, soloColl))
        .flatMap((c) => c.campos.map((f) => declaracionDeCampo(c, f)));
    },

    app: () => modelo.app,

    detalle(coleccion) {
      const { coleccion: soloColl } = partirNombre(coleccion);
      const c = modelo.colecciones.find((x) => igual(x.nombre, soloColl));
      // `undefined` y no un detalle vacío: «no existe» y «existe y está vacía» son dos cosas,
      // y contestar lo segundo sobre lo primero hace que el agente deje de buscar.
      if (c === undefined) return undefined;
      return {
        nombre: c.nombre,
        fichero: c.fichero,
        campos: c.campos.map((f) => declaracionDeCampo(c, f)),
        eventos: c.eventos,
        nodos: c.nodos,
        conexiones: c.conexiones,
        apuntaA: c.referencias.map((r) => ({ ...r, fichero: c.fichero })),
      };
    },

    problemas() {
      const existe = (nombre: string): boolean =>
        modelo.colecciones.some((c) => igual(c.nombre, nombre));

      const rotas: Referencia[] = [];
      const todas: Referencia[] = [
        ...modelo.colecciones.flatMap((c) => c.referencias.map((r) => ({ ...r, fichero: c.fichero }))),
        // Las de script cuentan: dos de las tres referencias rotas de un proyecto real solo se
        // ven desde ahí (`appData.getCollection('Login')`, que no existe).
        ...modelo.referenciasDeScript,
      ];
      for (const r of todas) if (!existe(partirNombre(r.hacia).coleccion)) rotas.push(r);

      return { rotas };
    },
  };
}
