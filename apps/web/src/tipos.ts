/**
 * Los tipos del transcript y del transporte, re-declarados — no importados de
 * `src/core/actos.ts` ni de `src/web/servidor/transporte.ts`. `src/web/frontera.test.ts`
 * prohíbe que `apps/web/` y `src/` compartan un módulo de EJECUCIÓN, y una importación de
 * tipos con `import type` desaparece en tiempo de ejecución pero igual ata el build del
 * cliente a la resolución de módulos de `src/` (su `tsconfig`, sus paths) — exactamente lo
 * que la frontera evita. Los dos ficheros pueden divergir en silencio; `tipos.test.ts`
 * compara los literales de `tipo:` de este fichero con los de `core/actos.ts`, Y los
 * literales de `clase:` de las dos uniones de mensaje con los de
 * `web/servidor/transporte.ts`, para que divergir dé un test en rojo y no un bug mudo en
 * producción. La comparación de `clase:` es la que faltó en la primera versión de este
 * fichero: a `MensajeDelCliente` le faltaba el miembro de clase «secreto» —la respuesta a
 * `leerSecreto`, con un campo `valor`— que `transporte.ts:46` sí declara, y nada lo delató
 * hasta que se amplió el test. (Este párrafo describe ese miembro EN PROSA a propósito: la
 * forma `{ clase: "…" }` en un comentario de este fichero contaría como un literal más
 * para el propio detector de divergencia que unas líneas más abajo se prueba contra
 * `[a-z0-9_-]+` — medido, dio un falso positivo hasta que se reescribió así.)
 *
 * Los campos de `aprobacion` van como `unknown[]`/`Record<string, unknown[]>` en vez de
 * traer aquí `PendienteDeAprobacion` y `LineaDeDiff`: esos dos tipos no llevan `tipo:` como
 * discriminante de unión (uno no tiene `tipo` en absoluto, el otro lo usa para OTRA cosa) y
 * duplicarlos no lo exige ningún test de esta tarea — quien pinte el modal de aprobación
 * los necesitará con forma, no aquí.
 */

export type Acto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  /** Lo que el modelo PENSÓ, cuando lo publica. Aparte de `asistente` porque no es la
   *  respuesta: se pinta apagado y plegado. */
  | { tipo: "razonamiento"; texto: string }
  | { tipo: "herramientas"; lineas: string[] }
  | { tipo: "sistema"; texto: string }
  | { tipo: "fase"; texto: string; ms: number }
  | { tipo: "fin"; ms: number; modelo?: string }
  | { tipo: "error"; texto: string };

/**
 * Los tres valores, redeclarados igual que todo lo demás de este fichero: son los de
 * `web/servidor/vestibulo.ts#PasoDelVestibulo`. Vive AQUÍ y no en `Wizard.tsx` porque el
 * mensaje del cable lo necesita, y un tipo del cable que colgara de un componente ataría
 * `tipos.ts` a un `.tsx` con React dentro.
 *
 * Solo DOS son pasos PENDIENTES de verdad hoy: «proyecto» salió del alta (cambio de
 * rumbo del usuario — se elige en la barra lateral) y `pasosPendientes()` nunca lo
 * devuelve, pero el valor sigue siendo válido porque el mismo tipo nombra también la
 * ACCIÓN de `MensajeDelCliente` para abrir un proyecto desde la barra.
 */
export type PasoDelWizard = "cuenta" | "entorno" | "proyecto";

export interface SelectorDeConsola {
  titulo: string;
  opciones: readonly { id: string; etiqueta: string; detalle?: string }[];
  /**
   * Por qué se pregunta esto, o por qué se vuelve a preguntar. Redeclarado igual que todo
   * lo demás de este fichero (`cli/consola.ts#SelectorDeConsola` es el original). Existe
   * por ESTA piel: durante el alta la web no pinta el transcript (`App.tsx`, rama
   * `enAlta`), así que el motivo tiene que viajar dentro del propio selector o no se ve.
   */
  aviso?: string;
}

export type MensajeAlCliente =
  | { clase: "acto"; acto: Acto }
  /** Sustituye el ÚLTIMO acto en vez de anexar: ver `store.ts#aplicar` para el porqué. */
  | { clase: "sustitucion"; acto: Acto }
  /** El transcript completo: lo que trae (re)conectar, y el arreglo de cualquier desajuste. */
  | { clase: "reemision"; actos: Acto[] }
  /**
   * El saludo, SUELTO del `alta` — llega al conectar, ANTES de que el paso de cuenta
   * resuelva (`web/servidor/arranque.ts` lo manda antes de `conducirCuenta()`), porque el
   * nombre no depende de ninguna cuenta: es local (`agent/persona.ts#nombreDePersona`).
   * `alta.nombre` sigue existiendo con el MISMO dato — no porque una conexión pueda ver
   * `alta` sin haber visto este mensaje antes (no puede: el SSE arranca de cero cada vez
   * y siempre manda éste primero), sino porque tocar ese campo cambiaría el contrato de
   * `alta` y su test, que no es parte de este arreglo.
   */
  | { clase: "bienvenida"; nombre?: string }
  | { clase: "pregunta"; texto: string }
  | { clase: "selector"; selector: SelectorDeConsola }
  /**
   * Los modelos: cuál está en vigor (`actual`, «proveedor/modelo») y qué se puede elegir.
   * Redeclarado como todo lo demás de este fichero; el original es
   * `web/servidor/transporte.ts`. `actual` ausente = no hay sesión abierta y por tanto no
   * hay modelo que afirmar — se enseña «Elige modelo», nunca una fila inventada.
   */
  | { clase: "modelos"; actual?: string; proveedores: ProveedorDeModelos[] }
  /** Hay un turno EN VUELO, o dejó de haberlo: apaga el compositor y saca el botón de
   *  parar. No se deduce de los actos — un turno que revienta no siempre deja `fin`. */
  | { clase: "turno"; activo: boolean }
  | { clase: "secreto"; pregunta: string }
  /**
   * El registro de comandos de barra (`COMANDOS` en `cli/consola.ts`), para que el
   * compositor sugiera sin llevar una copia — `nombre` con la «/» delante, tal cual se
   * teclea.
   */
  | { clase: "comandos"; comandos: { nombre: string; descripcion: string }[] }
  /**
   * El alta que falta, para el wizard (`vestibulo.ts#pasosPendientes` del lado servidor).
   * `pasos` vacío = no hay wizard que pintar — pero puede seguir sin haber proyecto
   * abierto (`proyectoAbierto`, más abajo): el paso de proyecto salió del alta, y con él
   * la implicación de que `pasos: []` significaba «hay proyecto abierto». `proyectos` y
   * `ramas` vienen vacíos mientras no haya entorno (y proyecto) elegidos: son dos
   * consultas a CloudStudio y una lista de relleno sería un dato inventado.
   *
   * La clave de API NO llega por aquí: el paso de cuenta lo conduce el servidor sobre los
   * mensajes de clase «selector» y «secreto».
   */
  | {
      clase: "alta";
      pasos: PasoDelWizard[];
      proveedores: { id: string; nombre: string }[];
      entornos: { id: string; nombre: string; url: string }[];
      /**
       * Los REGISTRADOS de verdad (`settings.json`), que no son los ofrecidos de arriba.
       * `proyectos` es la elección de qué proyectos suyos se enseñan; AUSENTE significa que
       * nadie lo ha dicho —y manda la omisión de la barra—, mientras que una lista vacía es
       * una elección: ninguno.
       */
      registrados: { id: string; nombre: string; url: string; proyectos?: string[] }[];
      /** De qué entorno son los `proyectos` de este mensaje. Ausente = de ninguno todavía. */
      entornoActivo?: string;
      /**
       * CUÁL está abierto, y cuál es su sesión. `proyectoAbierto` (booleano) dice SI hay
       * uno; esto dice cuál, que es lo que la barra necesita para marcarlo. `sesionActiva`
       * puede faltar con proyecto abierto: el id no existe hasta el primer acto volcado.
       */
      proyectoActivo?: string;
      sesionActiva?: string;
      proyectos: {
        id: string;
        nombre: string;
        sesiones?: { id: string; titulo: string }[];
        /** La copia local ya existe: abrirlo no baja nada ni pregunta rama. */
        local?: boolean;
      }[];
      ramas: string[];
      /** Qué falló en el paso anterior; ausente si no falló nada. Lo pinta el propio paso:
       *  un acto de sistema se va a la Trayectoria, que no es la pestaña que se está viendo. */
      aviso?: string;
      /** El saludo (`agent/persona.ts#nombreDePersona`, servidor). Nunca en un acto ni en
       *  una sesión guardada: solo lo pinta `Bienvenida.tsx`. Ausente = sin nombre. */
      nombre?: string;
      /** Si hay un proyecto abierto en ESTA conexión — hace falta desde que `pasos: []`
       *  dejó de implicarlo (ver arriba). */
      proyectoAbierto: boolean;
      /**
       * El `modo` del `.xonecode/config.json` del proyecto abierto, para la pastilla de
       * la cabecera. **Ausente cuando no se sabe**, y eso incluye tres casos que no se
       * distinguen desde aquí: no hay proyecto abierto, el fichero no se pudo leer, o
       * lleva un valor que no es ninguno de los dos. Ausente NO significa «offline»:
       * pintar «offline» sobre un fichero que no se pudo leer sería afirmar lo que no se
       * sabe, que es la misma clase de mentira que un alias de color inventado. Es lo
       * único que se le extrae al config: ni la URL del entorno, ni el proyecto, ni la
       * rama, que son datos del despliegue y no tienen por qué acabar en el transcript.
       */
      modo?: "offline" | "cloud";
    }
  | {
      clase: "aprobacion";
      pendientes: unknown[];
      ficheros: Record<string, string>;
      diffs: Record<string, unknown[]>;
    };

/**
 * Un proveedor visto por el selector de modelos. `credencial` tiene TRES valores porque hay
 * tres cosas distintas que decir: confirmada, confirmada ausente, y «no necesita ninguna»
 * (Ollama local) — a ese no se le pinta punto, ni verde ni rojo, porque no hay nada que
 * afirmar. `modelos` ausente = su catálogo aún no se ha pedido.
 */
export interface ProveedorDeModelos {
  id: string;
  credencial: "puesta" | "falta" | "nativa";
  /** La credencial está en `auth.json` y por tanto se puede borrar desde aquí. Una que solo
   *  viene del entorno no lo lleva: desexportar la shell de nadie no está a nuestro alcance. */
  enFichero?: boolean;
  modelos?: { id: string; nombre?: string }[];
  error?: string;
}

export type MensajeDelCliente =
  | { clase: "prosa"; texto: string }
  /**
   * «Ponme este modelo», dicho por un control: `proveedor/modelo` y nada más. El cliente no
   * manda comandos — ni se apunta actos de usuario que nadie tecleó, ni habla en la
   * sintaxis de otra piel. Cómo se aplica es cosa del servidor.
   */
  | { clase: "modelo"; id: string }
  /** Abrir una sesión de un proyecto: la nombrada, o una NUEVA si no se nombra ninguna. */
  | { clase: "sesion"; proyecto: string; sesion?: string }
  /** Qué proyectos de un entorno se enseñan en la barra. Vacío = ninguno, que es elección. */
  | { clase: "entorno"; accion: "visibles"; entorno: string; proyectos: string[] }
  /** Cambiar de entorno activo: el de cuyos proyectos se habla. */
  | { clase: "entorno"; accion: "activo"; entorno: string }
  | { clase: "respuesta"; texto: string }
  /**
   * La respuesta a `seleccionar`. **Sin `id` (o con `id: null`) es CANCELAR** — la misma
   * salida que en el terminal («número, Enter cancela»). El servidor lo traduce a
   * `undefined`; un id vacío o desconocido NO es cancelar, es un id que no existe. Ver
   * `web/servidor/transporte.ts` para el razonamiento entero: este fichero es su copia
   * declarada, y `tipos.test.ts` solo compara los literales `clase:`, no los CAMPOS de
   * dentro de una variante — o sea que esta pareja hay que cuidarla a mano.
   */
  | { clase: "eleccion"; id?: string | null }
  /** La respuesta a la pregunta secreta de `MensajeAlCliente` — otro mensaje, otra forma: aquel lleva `pregunta`, este `valor`. */
  | { clase: "secreto"; valor: string }
  /**
   * Un paso del alta, resuelto por el wizard. Con `paso` «proyecto» y sin `rama` no se
   * abre nada: pide las ramas del proyecto elegido, y el servidor contesta con otro
   * mensaje de alta. Sin campo para la clave de API, que va por «secreto».
   */
  | {
      clase: "alta";
      paso: PasoDelWizard;
      entorno?: { id: string; nombre: string; url: string };
      proyecto?: string;
      rama?: string;
    }
  /** «Dime qué modelos sirve este proveedor»: una llamada de red, y por eso bajo demanda. */
  | { clase: "catalogo"; proveedor: string }
  /** Borrar la credencial de `auth.json`. Guardar no pasa por aquí: la clave viaja por
   *  «secreto», contestando al `leerSecreto` que abre `/provider`. */
  | { clase: "credencial"; accion: "pedir" | "borrar"; proveedor: string }
  /** Parar el turno en vuelo, dejando la sesión viva. */
  | { clase: "cancelar" }
  | { clase: "decision"; decisiones: Record<string, string> };
