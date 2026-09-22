/**
 * Qué se le deja escribir a un agente, mirando el CONTENIDO antes de escribirlo.
 *
 * XOne ignora en silencio lo desconocido: un atributo inventado, un `<frame>` sin cerrar o un
 * `font-size` en vez de `fontsize` no dan error, dan un bug mudo. Esa es la regla que gobierna
 * este harness entero, y hasta ahora solo la sostenían el prompt y el verificador del final
 * del turno. Esto la mueve al momento de escribir.
 *
 * **LA DECISIÓN QUE HACE QUE ESTO SEA USABLE: solo se rechaza lo que la escritura INTRODUCE.**
 *
 * Medido sobre siete proyectos reales antes de escribir una línea: con las reglas del linter
 * ya corregidas siguen quedando hallazgos en ficheros que están en producción y funcionan. Si
 * la guarda mirase solo el contenido nuevo, el día que entrara no se podría editar un fichero
 * que ya tuviera un defecto —el agente vendría a arreglar otra cosa y se le rechazaría por
 * algo que no escribió—. Esa es la guarda que se desactiva al segundo día.
 *
 * Así que se compara la HUELLA de antes con la de después, que es exactamente lo que
 * `agent/turno/turnoReal.ts#conVerificacion` ya hace con el simulador: la huella son los
 * hallazgos identificados por código+línea, y lo que estaba antes se arrastra sin estorbar.
 *
 * **Y la dirección de los dos fallos posibles NO es la misma**, que es la otra mitad del
 * diseño: si falla el CONTENIDO se rechaza (fail-closed); si falla el VALIDADOR —no está la
 * librería, revienta el parser— se DEJA ESCRIBIR y se cuenta. Un fallo del entorno no puede
 * convertirse en un veredicto sobre el trabajo del agente; es la misma frontera que
 * `ErrorDelSimulador` frente a un informe en rojo.
 */

/** Un hallazgo del linter, ya sin nada que no se pueda enseñar. */
export interface HallazgoDeEscritura {
  codigo: string;
  mensaje: string;
  /** La línea, si el hallazgo la sitúa. */
  linea?: number;
}

/**
 * La huella de un hallazgo: lo que lo identifica entre dos versiones del mismo fichero.
 *
 * **Código y línea, nunca el mensaje.** El mensaje lleva el nombre de la prop o el fragmento,
 * así que cambia en cuanto se toca la línea de al lado y haría «nuevo» a un hallazgo que
 * estaba. Es la misma huella que usa el verificador del turno.
 */
function huella(h: HallazgoDeEscritura): string {
  return `${h.codigo}|${h.linea ?? ""}`;
}

export interface VeredictoDeEscritura {
  /** Lo que ESTA escritura mete y antes no estaba. Vacío = se deja escribir. */
  introducidos: HallazgoDeEscritura[];
  /** Lo que ya estaba. Ni bloquea ni se cuenta: el agente no lo escribió. */
  preexistentes: HallazgoDeEscritura[];
}

/**
 * Compara el fichero que hay con el que se quiere escribir.
 *
 * `antes` ausente es un fichero NUEVO: ahí no hay nada preexistente y todo hallazgo es de esta
 * escritura. Es el caso en el que la guarda muerde más, y es el correcto — un fichero que se
 * crea ya roto no tiene ninguna excusa.
 *
 * Un hallazgo repetido cuenta las veces que esté: si antes había un `font-size` y ahora hay
 * dos, el segundo es nuevo. Por eso se descuentan por multiplicidad y no con un `Set`, que
 * dejaría colar todas las repeticiones a partir de la primera.
 */
export function veredictoDeEscritura(
  antes: HallazgoDeEscritura[] | undefined,
  despues: HallazgoDeEscritura[],
): VeredictoDeEscritura {
  const disponibles = new Map<string, number>();
  for (const h of antes ?? []) disponibles.set(huella(h), (disponibles.get(huella(h)) ?? 0) + 1);

  const introducidos: HallazgoDeEscritura[] = [];
  const preexistentes: HallazgoDeEscritura[] = [];
  for (const h of despues) {
    const clave = huella(h);
    const quedan = disponibles.get(clave) ?? 0;
    if (quedan > 0) {
      disponibles.set(clave, quedan - 1);
      preexistentes.push(h);
    } else {
      introducidos.push(h);
    }
  }
  return { introducidos, preexistentes };
}

/**
 * Cuántos hallazgos se enseñan en el rechazo.
 *
 * Esto acaba dentro del contexto de un modelo, así que tiene tope por lo mismo que las
 * observaciones del crítico visual: para que quepa. Lo que no cabe se CUENTA, que una lista
 * recortada en silencio se lee como la lista entera.
 */
export const TOPE_DE_HALLAZGOS = 10;

/**
 * El texto del rechazo, que es lo único que el modelo va a leer.
 *
 * Tres cosas deliberadas:
 *
 *  - **Dice que NO se ha escrito nada.** Sin eso, un modelo que recibe un error se queda sin
 *    saber si el fichero quedó a medias y lo siguiente que hace es releerlo para averiguarlo.
 *  - **Lleva el código, la línea y el mensaje** —que ya trae el arreglo cuando se sabe, como
 *    «"font-size" … el atributo que hace esto en XOne es "fontsize"»—. Es el patrón de
 *    `xone_navegacion`: el paso siguiente escrito, no un consejo.
 *  - **Y NO nombra lo preexistente.** Eso es ruido para quien viene a arreglar otra cosa, y
 *    peor: invita a tocar lo que nadie ha pedido, que es la deriva que este repo ya ha pagado
 *    tres veces.
 */
export function motivoDelRechazo(ruta: string, introducidos: HallazgoDeEscritura[]): string {
  const visibles = introducidos.slice(0, TOPE_DE_HALLAZGOS);
  const lineas = [
    `No he escrito «${ruta}»: el contenido introduce ${introducidos.length === 1 ? "un problema" : `${introducidos.length} problemas`} que antes no estaba${introducidos.length === 1 ? "" : "n"}.`,
    "El fichero se queda EXACTAMENTE como estaba — no hay nada a medias.",
    "",
  ];
  for (const h of visibles) {
    lineas.push(`- ${h.codigo}${h.linea === undefined ? "" : ` (línea ${h.linea})`}: ${h.mensaje}`);
  }
  if (introducidos.length > visibles.length) {
    lineas.push(`- … y ${introducidos.length - visibles.length} más.`);
  }
  lineas.push("", "Corrige eso en el contenido y vuelve a escribirlo.");
  return lineas.join("\n");
}
