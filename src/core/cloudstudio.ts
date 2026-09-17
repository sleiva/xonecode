/**
 * Los tipos que cruzan la frontera CloudStudio ↔ xonecode.
 *
 * Viven en `core/` a propósito: son datos, no transporte. El SDK MCP se queda en `agent/`.
 */

/** Una entrada del inventario remoto, tal cual la da `get_project_structure`. */
export interface EntradaRemota {
  /** Ruta POSIX relativa a la raíz del proyecto. */
  ruta: string;
  bytes: number;
}

export type ManifiestoRemoto = EntradaRemota[];

/**
 * Lo que devuelve `estructura()`: las entradas vistas Y si el servidor las recortó.
 *
 * `studio_get_project_structure` trunca (medido: con `maxFiles:60` ya venía
 * `truncated:true`; el tope duro es 2000). Tirar ese dato y devolver solo el array deja
 * al llamador sin forma de saber que quedó algo fuera — y el manifiesto es lo que
 * sostiene el candado de borrado en CloudStudio.
 */
export interface EstructuraRemota {
  entradas: ManifiestoRemoto;
  truncado: boolean;
}

/** Qué proyecto y qué rama tiene abiertos el servidor AHORA. */
export interface ContextoRemoto {
  proyecto: string;
  rama: string;
}

/** Lo que queda escrito en `.xonecode/cloudstudio/sync.json`: diagnóstico, no estado. */
export interface EstadoDeSync {
  proyecto: { id: string; nombre: string };
  rama: string;
  fecha: string;
  /** Cómo se bajó. `parcial` obliga al candado de borrado. */
  via: "zip" | "parcial";
  /** El inventario del remoto en el momento de bajar. */
  manifiesto: ManifiestoRemoto;
  /** Las rutas que REALMENTE se pudieron traer. */
  descargados: string[];
  /** Por qué falló el ZIP, cuando `via` es `parcial`. Es la pista para arreglarlo. */
  motivo?: string;
  /**
   * El listado de la raíz llegó truncado al enumerar el remoto (`enumerarRemoto`).
   *
   * El manifiesto es lo que sostiene el candado de borrado: si vino incompleto, puede
   * faltarle una ruta que sí existe en Studio, y esa ausencia no se puede demostrar
   * después. Se declara aquí, en el propio `sync.json`, en vez de vivir solo en un aviso
   * de consola que nadie vuelve a leer una vez pasa el turno.
   */
  raizTruncada?: boolean;
}

/**
 * Una operación de subida ya decidida. La ejecuta `agent/cloudstudio/subida.ts`.
 *
 * El binario solo tiene modo `base64`. El modo `chunked` del servidor NO está
 * implementado: `CloudStudioPort.subirBinario` ni siquiera lleva el modo, y el adaptador
 * manda siempre base64. Mientras siga así, un binario que no cabe en base64 no es una
 * operación pendiente sino una operación IMPOSIBLE (`OperacionOmitida`) — dejarla en el
 * plan atascaba la subida entera para siempre, porque la ref solo avanza sin fallos.
 *
 * **`clase` viaja porque es lo que se MIRA al decidir, y `tipo` no lo dice.** Un texto que
 * ya estaba en Studio y se edita y un texto que es nuevo se suben igual —con la misma
 * tool—, así que mirando `tipo` son la misma operación: quien decide cuál de los dos es ve
 * «no se modifica» / «se añade», y eso es justo lo que se comprueba antes de publicar algo
 * en un servidor remoto. Es el dato de `CambioLocal.clase` (`core/planDeSubida.ts`), que
 * hasta ahora se calculaba y se tiraba en la puerta. El borrado NO la lleva: su `tipo` ya
 * la dice, y un campo que solo puede valer una cosa es una invitación a contradecirse.
 */
export type OperacionDeSubida =
  | { tipo: "texto"; ruta: string; clase: "nuevo" | "modificado" }
  | { tipo: "binario"; ruta: string; bytes: number; modo: "base64"; clase: "nuevo" | "modificado" }
  | { tipo: "borrado"; ruta: string };

/**
 * Algo que había que sincronizar y NO se puede, con el porqué.
 *
 * Es el camino de escape: sale del plan, se declara (por consola y en `sync.log`) y deja
 * que la ref avance con el resto. Sin él, una sola operación imposible —la primera imagen
 * borrada, el primer `.db` de más de 5 MB— dejaba `/sync subir` inútil de forma
 * PERMANENTE: fallaba, la ref no se movía, el siguiente `/sync` recalculaba el mismo plan
 * y volvía a fallar, para siempre.
 */
export interface OperacionOmitida {
  ruta: string;
  /** En castellano y accionable: qué hacer con esto, no solo que no se hizo. */
  motivo: string;
}

/**
 * El hueco de política que autoriza una subida — NO «preguntar al humano»: quién lo
 * rellena es una decisión de la piel, no del motor. `agent/cloudstudio/subida.ts` solo exige que
 * ALGUIEN lo rellene (fail-closed por TIPO: no hay forma de llamar a `subir()` sin decir
 * cómo se autoriza) y no presupone que detrás haya una persona.
 *
 * Dos políticas previstas:
 * - **Interactiva** (la única implementada hoy, en `cli/`): un humano ve el plan y
 *   responde sí/no. Sin TTY, sin un sí explícito, no se sube.
 * - **Autónoma** (futura, NO implementada): la rellenará el papel `afilado` — el juez —
 *   cuando el usuario trabaje sin mirar. Pero un veredicto de juez a secas no basta: hace
 *   falta ADEMÁS que el código compruebe condiciones deterministas antes de invocarlo
 *   siquiera —verificador en verde, árbol limpio, plan sin pendientes—, porque a un
 *   modelo se le puede pedir que avise de algo y no avisar; en este repo los avisos son
 *   código, no prompt. Hoy no existe el lazo plan→ejecuta→verifica→juzga que la
 *   sustentaría, así que esta política no se implementa todavía: el hueco queda limpio
 *   para enchufarla el día que exista.
 */
export type PoliticaDeAprobacion = (plan: readonly OperacionDeSubida[]) => Promise<boolean>;

/**
 * Las TRES acciones de `/sync`, con nombre propio.
 *
 * Existían escritas tres veces —en el puerto `Consola.sincronizar`, en el manejador del comando
 * y en la ayuda— y una cuarta estaba a punto al aparecer el acto `sincronizacion`, que también
 * tiene que decir cuál fue. Nombradas aquí, que es donde vive la sincronización, y no en `cli/`:
 * el acto que las guarda es de `core/`.
 */
export type AccionDeSincronizacion = "estado" | "bajar" | "subir";
