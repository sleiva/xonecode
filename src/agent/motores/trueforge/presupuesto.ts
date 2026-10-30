/**
 * El PRESUPUESTO de llamadas de cada especialista: al agotarse, cierra con un resumen de lo que
 * hizo en vez de cortarse mudo.
 *
 * **Por qué no basta el `iterationLimit` de la librería**: al agotarse, el hilo termina en error y
 * al padre le llega «You have reached iteration limit of N, please request again», nada más.
 * Medido (20-10-2026, login de Maset): 150 llamadas y 30 min del `device-controller` y el
 * orquestador no recibió ni una medida. Y un tope que no devuelve nada no se puede bajar: el
 * orquestador re-delega y cada arranque empieza de cero (ver `TOPE_DE_LLAMADAS_DEL_CONDUCTOR`).
 *
 * **Cómo cierra, sin tocar la librería**: la MISMA pieza que DETENER (`detencion.ts`). Antes de
 * la llamada número `limite` se le mete la orden por `preLLMProcessors` y su modelo tira las tool
 * calls de esa respuesta (`modeloLangchain.ts#soloTexto`), así que el hilo cierra con normalidad y
 * su texto llega al padre. El `iterationLimit` se queda POR ENCIMA (`MARGEN_SOBRE_EL_PRESUPUESTO`)
 * como red, por si el modelo no contesta.
 */

/** Lo que llega al padre si el hijo, tras filtrar, no dejó texto. */
export const RESUMEN_DE_RELLENO_DEL_PRESUPUESTO = "[Se le acabó el presupuesto de llamadas antes de poder resumir lo hecho.]";

/** Cuánto queda el tope de la librería por encima del presupuesto: la llamada del resumen y holgura. */
export const MARGEN_SOBRE_EL_PRESUPUESTO = 5;

/**
 * La orden de cerrar por el TOPE DE VUELTAS de ajuste (recargas o despliegues tras cambiar la pantalla), no por llamadas.
 * Medido en la prueba de la calculadora (30-10-2026): el desarrollador encadenaba vueltas de pulido visual —editar,
 * recargar, capturar, describir, medir— y el orquestador le encargaba otra tras cada entrega: cuatro encargos y unos
 * 4 M de tokens. El aviso de `textoDeVueltas` solo avisaba. Empieza como la del presupuesto para que la memoria del
 * especialista la quite igual (`memoriaDeEspecialistas.ts#sinOrdenDePresupuesto`).
 */
export function textoDeVueltasAgotadas(vueltas: number, delTurno: boolean): string {
  return (
    `[Se acabó tu tope de ${vueltas} vueltas de ajuste${delTurno ? " en este turno" : " en este encargo"}. Para aquí: no hagas ninguna llamada más —no se ejecutaría—. ` +
    "Contesta YA a quien te delegó con: (1) lo que FUNCIONA, comprobado en el aparato, con lo que leíste; " +
    "(2) lo que dijo la ÚLTIMA crítica visual (rojo o verde, y qué); (3) lo que queda por ajustar, concreto. " +
    "Lo que sigue lo decide quien te lo encargó, sin otra vuelta tuya a ciegas.]"
  );
}

export function textoDePresupuestoAgotado(limite: number): string {
  return (
    `[Se acabó tu presupuesto de ${limite} llamadas. Para aquí: no hagas ninguna llamada más —no se ejecutaría—. ` +
    "Contesta YA a quien te delegó con: (1) lo que hiciste y lo que MEDISTE, con la salida literal y sus ficheros; " +
    "(2) lo que no te cuadró o no pudiste comprobar; (3) lo que te quedaba por hacer. " +
    "Con eso se decide el siguiente paso, y lo que digas como hecho no se repetirá.]"
  );
}

/** La cuenta de cada hijo. Uno por sesión; `reiniciar` al empezar cada turno. */
export function crearControlDePresupuesto() {
  const limites = new Map<string, number>();
  const llamadas = new Map<string, number>();
  const agotados = new Set<string>();
  /** Un corte pedido desde fuera (el tope de vueltas): se entrega en la SIGUIENTE llamada de ese hilo. */
  const cortesPedidos = new Map<string, string>();

  return {
    reiniciar() {
      limites.clear();
      llamadas.clear();
      agotados.clear();
      cortesPedidos.clear();
    },
    /** Cierra ESE hilo en su próxima llamada con `orden`, como al agotar el presupuesto. Solo un hijo registrado. */
    cortar(threadId: string, orden: string) {
      if (!limites.has(threadId) || agotados.has(threadId)) return;
      cortesPedidos.set(threadId, orden);
    },
    /** Al crear un hijo, con su presupuesto. El raíz no se registra: tiene su propio tope. */
    nacio(threadId: string, limite: number) {
      limites.set(threadId, limite);
      llamadas.set(threadId, 0);
    },
    /** Antes de cada llamada de ESE hilo: la orden de cerrar, la vez que la llamada es la `limite`. */
    antesDeLlamar(threadId: string): string | undefined {
      const limite = limites.get(threadId);
      if (limite === undefined || agotados.has(threadId)) return undefined;
      const pedido = cortesPedidos.get(threadId);
      if (pedido !== undefined) {
        cortesPedidos.delete(threadId);
        agotados.add(threadId);
        return pedido;
      }
      const n = (llamadas.get(threadId) ?? 0) + 1;
      llamadas.set(threadId, n);
      if (n < limite) return undefined;
      agotados.add(threadId);
      return textoDePresupuestoAgotado(limite);
    },
    /** Para el modelo de un hijo: si ya recibió la orden, su respuesta no puede llamar tools. */
    soloTexto(threadId: string): boolean {
      return agotados.has(threadId);
    },
    /** El presupuesto que agotó ese hilo, si lo agotó. */
    agotado(threadId: string): number | undefined {
      return agotados.has(threadId) ? limites.get(threadId) : undefined;
    },
  };
}

export type ControlDePresupuesto = ReturnType<typeof crearControlDePresupuesto>;
