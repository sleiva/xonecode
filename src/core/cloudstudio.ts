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
}

/** Una operación de subida ya decidida. La ejecuta `agent/subida.ts`. */
export type OperacionDeSubida =
  | { tipo: "texto"; ruta: string }
  | { tipo: "binario"; ruta: string; bytes: number; modo: "base64" | "chunked" }
  | { tipo: "borrado"; ruta: string };
