/**
 * DETENER y replanificar (IXCODE-4): la persona pulsa el botón mientras el agente trabaja, los
 * especialistas que estaban en marcha cierran con un resumen de lo hecho y lo que les quedaba, y
 * el orquestador recibe esos resúmenes con el mensaje de la persona y replanifica.
 *
 * **No es una `Nota`, y a propósito**: una nota se entrega a CADA hilo como encargo (`notas.ts`),
 * y una orden de parar repartida así haría que el hijo parase y el raíz… volviera a encargar lo
 * mismo. Aquí cada destinatario recibe SU texto: el hijo, «para y resume»; el raíz, «replanifica
 * sin repetir lo hecho».
 *
 * **A quién se detiene**: a los hijos nacidos de una llamada del raíz que empezó ANTES de pulsar.
 * No basta «los vivos al pulsar»: si se pulsa mientras el raíz está decidiendo delegar, el hijo
 * que sale de esa decisión nace después, pero de un plan que la persona ya no quiere. Y los que
 * el raíz delegue DESPUÉS de leer la orden corren normal —son el plan nuevo—.
 *
 * **Cómo para un hijo, sin tocar la librería**: la orden entra por `preLLMProcessors` antes de su
 * siguiente llamada, y SU modelo (`modeloParaTrueforge`, construido por hilo en `crearHijo`) tira
 * las tool calls de esa respuesta: una respuesta sin tool calls cierra el hilo con normalidad
 * (`AGENT_DONE`) y su texto le llega al padre como resultado de `create_sub_agent`. Se FILTRA lo
 * que devuelve el modelo, no se le quitan las tools: con el historial lleno de llamadas, algún
 * proveedor rechaza una petición sin la definición de tools.
 *
 * **Y una llamada EN CURSO se corta** (`corte`): medido con el botón, el analista estaba dentro de
 * una llamada de 60 s generando un informe entero cuando se pulsó, y sin corte esa llamada acababa
 * escribiéndolo. Cada hijo lleva su `AbortController`, que aborta SOLO su stream; el modelo del
 * hijo lo captura y pide el resumen en el acto (`modeloLangchain.ts#corte`). Lo que NO se corta:
 * un comando de shell en curso, que termina primero —la orden llega en la llamada siguiente—.
 */

/** Lo que llega al padre si el hijo, tras filtrar, no dejó texto. */
export const RESUMEN_DE_RELLENO = "[Detenido a petición de la persona antes de poder resumir lo hecho.]";

const cita = (texto: string): string => (texto.trim() === "" ? "" : `: «${texto.trim()}»`);

export function textoDeDetencionParaHijo(texto: string): string {
  return (
    `[La persona ha pulsado DETENER${cita(texto)}. Para aquí: no hagas ninguna llamada más —no se ejecutaría—. ` +
    "Contesta YA a quien te delegó con: (1) lo que has hecho y dónde (ficheros leídos o escritos, hallazgos con su fichero), " +
    "(2) lo que te quedaba por hacer. Con eso se replanifica, y lo que digas como hecho no se repetirá.]"
  );
}

export function textoDeDetencionParaRaiz(texto: string): string {
  return (
    `[La persona ha pulsado DETENER y replanificar mientras trabajabas${cita(texto)}. ` +
    "Los especialistas que estaban trabajando han parado; lo que hicieron y lo que les quedaba está en su respuesta. " +
    "Replanifica con esto: lo que ya está hecho NO se repite, y si vuelves a delegar, el encargo nuevo dice qué está hecho y qué cambia.]"
  );
}

/** El estado de la detención de UN turno. Lo crea la sesión y lo vacía al cerrar el turno. */
export interface Detencion {
  /** Lo que la persona escribió al pulsar; puede ir vacío. */
  texto: string;
  /** Se detienen los hijos nacidos de una llamada del raíz con índice ≤ éste. */
  hastaLlamadaDelRaiz: number;
  /** Hilos hijo que ya recibieron la orden (y cuyo modelo, desde entonces, no llama tools). */
  avisados: Set<string>;
  raizAvisado: boolean;
}

/** Lleva la cuenta que decide a quién se detiene: cuántas llamadas lleva el raíz, y de cuál nació
 *  cada hijo. Uno por sesión; `reiniciar` al empezar cada turno. */
export function crearControlDeDetencion(hiloRaiz: string) {
  let llamadasDelRaiz = 0;
  const nacimiento = new Map<string, number>();
  /** El corte de cada hijo: aborta SOLO su stream en curso. */
  const cortes = new Map<string, AbortController>();
  let detencion: Detencion | undefined;

  const debeParar = (threadId: string): boolean => {
    if (detencion === undefined || threadId === hiloRaiz) return false;
    const n = nacimiento.get(threadId);
    return n !== undefined && n <= detencion.hastaLlamadaDelRaiz;
  };

  return {
    reiniciar() {
      llamadasDelRaiz = 0;
      nacimiento.clear();
      cortes.clear();
      detencion = undefined;
    },
    /** Al crear un hijo: nace de la llamada del raíz en curso. */
    nacio(threadId: string) {
      nacimiento.set(threadId, llamadasDelRaiz);
      cortes.set(threadId, new AbortController());
    },
    detener(texto: string) {
      // Una segunda pulsación en el mismo turno alcanza a lo que haya nacido desde entonces; quien
      // ya recibió la orden no la recibe otra vez. Su texto se JUNTA solo con lo que el raíz aún no
      // leyó: medido, juntarlo con lo ya leído lo volvía a mandar —y tras Parar, como un turno
      // nuevo que nadie pidió—.
      const pendiente = detencion === undefined || detencion.raizAvisado ? "" : detencion.texto;
      detencion = {
        texto: [pendiente, texto].filter((t) => t.trim() !== "").join("\n\n"),
        hastaLlamadaDelRaiz: llamadasDelRaiz,
        avisados: detencion?.avisados ?? new Set(),
        raizAvisado: false,
      };
      // Y a quien esté a mitad de una llamada, se le corta: pedirá el resumen en el acto.
      for (const [hilo, control] of cortes) if (debeParar(hilo) && !detencion.avisados.has(hilo)) control.abort();
    },
    /** Para el modelo de un hijo, al empezar cada llamada: su señal de corte y la orden que se le da
     *  si se corta. Darla lo cuenta como avisado —no la recibe otra vez por el procesador—. */
    corte(threadId: string): { senal: AbortSignal; orden: () => string } | undefined {
      const control = cortes.get(threadId);
      if (control === undefined) return undefined;
      return {
        senal: control.signal,
        orden: () => {
          detencion!.avisados.add(threadId);
          return textoDeDetencionParaHijo(detencion!.texto);
        },
      };
    },
    /** Para el modelo de un hijo: si ya recibió la orden, su respuesta no puede llamar tools. */
    soloTexto(threadId: string): boolean {
      return detencion?.avisados.has(threadId) === true;
    },
    /** Lo que se le mete a ESE hilo antes de su llamada, si algo. Cuenta las llamadas del raíz. */
    antesDeLlamar(threadId: string): string | undefined {
      if (threadId === hiloRaiz) {
        llamadasDelRaiz += 1;
        if (detencion === undefined || detencion.raizAvisado) return undefined;
        detencion.raizAvisado = true;
        return textoDeDetencionParaRaiz(detencion.texto);
      }
      if (!debeParar(threadId) || detencion!.avisados.has(threadId)) return undefined;
      detencion!.avisados.add(threadId);
      return textoDeDetencionParaHijo(detencion!.texto);
    },
    /** La orden que NADIE llegó a leer —ni el raíz— sale como el turno siguiente, igual que una
     *  nota sobrante. Con texto vacío no queda nada que mandar. */
    sobrante(): string | undefined {
      if (detencion === undefined || detencion.raizAvisado || detencion.texto.trim() === "") return undefined;
      return detencion.texto;
    },
  };
}

export type ControlDeDetencion = ReturnType<typeof crearControlDeDetencion>;
