/**
 * Cuándo una tarea está TERMINADA: las condiciones que comprueba el código, más el
 * veredicto de un juez, y por qué ninguna de las dos mitades basta sola.
 *
 * `core/`, o sea datos y reglas puras: ni disco, ni git, ni modelos. Quien MIDE es el
 * corredor (`web/servidor/corredorDeTareas.ts`); aquí solo se decide con lo medido.
 *
 * **Por qué el veredicto del juez no basta solo.** Es la regla que este repo ya tenía
 * escrita, palabra por palabra, para la subida autónoma
 * (`core/cloudstudio.ts#PoliticaDeAprobacion`): «el veredicto del juez no bastará solo:
 * exigirá además condiciones que comprueba el código (verificador en verde, árbol limpio,
 * nada pendiente de aprobar), porque en este repo los avisos son código y no prompt
 * precisamente porque a un modelo se le puede pedir que avise y no avisa». Este fichero es
 * esa frase hecha código. Si el juez pudiera entregar solo, «terminada» valdría lo que
 * valga la buena voluntad de un modelo esa vez.
 *
 * **Y por qué las condiciones tampoco bastan solas**: las tres son propiedades del
 * PROCESO —se escribió, se midió, se puede revisar—, y ninguna dice si lo escrito es lo
 * que se pedía. Eso es lo único que aporta el juez, y es también lo único que se le
 * pregunta.
 *
 * **La tercera condición NO es «árbol de git limpio», y eso está MEDIDO.** El plan la
 * escribía como `arbolSucio: false`, con `arbolLimpio` (`agent/gitSync.ts`) detrás. Medido
 * sobre un repo de verdad: una tarea que escribe UN fichero deja `git status --porcelain`
 * con `?? Clientes.xne`, o sea `arbolLimpio === false` — el árbol de una tarea que ha
 * trabajado está sucio POR DEFINICIÓN, así que con esa condición NINGUNA tarea se
 * entregaría nunca. Lo que hay que exigir es otra cosa, y es la que el §0 del diseño
 * nombra: «sin aprobación previa, la revisión posterior es la única forma de mirar». O
 * sea, que lo que la tarea escribió se pueda REVISAR — que exista la marca de git de su
 * sesión y el diff salga (`agent/sesionGit.ts#cambiosDeSesion` con `via: "git"`, la misma
 * función que pinta la pestaña Revisión, no una parecida). Un campo llamado `arbolSucio`
 * que midiera eso sería la misma clase de mentira que `aplicados` habría sido para
 * `Tarea.autorizadas`, así que se llama `revisable`.
 */
import type { HallazgoDelTurno } from "./events.js";

/**
 * Cómo acabó el verificador en el turno, con TRES valores y no un booleano.
 *
 * Por la misma razón que los estados de una herramienta en `dispositivos.ts`: «no se
 * sabe» no es «está bien». Un turno que no escribió no corre el simulador, otro no lo
 * encuentra en el PATH y otro se cortó antes de llegar — y ninguno de los tres es verde.
 */
export type EstadoDeVerificador = "verde" | "rojo" | "no-corrio";

/**
 * Lo que un TURNO puede decir de sí mismo, y que hasta ahora se tiraba.
 *
 * **Este tipo existe por una deuda medida.** `EjecutorDeTurno` devolvía `Promise<void>` y
 * `crearEjecutorReal` (`cli/main.ts`) descartaba el retorno de `sesion.turno`, así que el
 * `cortadoPorTope` que sabe que quedaron escrituras sin aplicar no salía de ahí. Medido
 * con las tareas autónomas: cuatro ficheros escritos, una escritura abandonada al agotarse
 * el tope de rondas, el verificador sin correr ni una vez, y el kanban diciendo
 * «terminada». Sin abrir este canal, la condición `pendientes: 0` no tiene con qué
 * medirse.
 *
 * Nada de aquí lleva contenido de ficheros: el estado del verificador, cuántas escrituras
 * quedaron colgando, y los hallazgos en la misma forma que ya viaja en el evento
 * `verificacion` —código, severidad, mensaje, fichero RELATIVO y línea—.
 */
export interface ResultadoDeTurno {
  verificador: EstadoDeVerificador;
  /**
   * Escrituras que quedaron esperando aprobación y **no se aplicaron**.
   *
   * Se mide al final del turno y no se deduce de `cortadoPorTope`: por ahí se sale por
   * tres puertas distintas (el tope de rondas, el tope de tandas automáticas y «no hay
   * quién apruebe») y las tres dejan escrituras colgando. El número es lo accionable.
   */
  pendientes: number;
  /**
   * Los hallazgos del turno, si el verificador corrió. Es lo que el informe del verificador
   * ya declara que viaja «al ejecutor como brief, al juez como hecho»
   * (`core/ports.ts#InformeVerificacion`).
   */
  hallazgos?: HallazgoDelTurno[];
  /**
   * Por qué NO corrió, cuando se sabe: el binario que falta, o que esta ejecución no
   * tiene verificador. Ausente con `no-corrio` significa que el turno no llegó a
   * intentarlo — casi siempre porque no escribió nada, o porque se cortó antes.
   */
  motivoSinVerificar?: string;
}

/** Lo del turno más lo que solo se puede medir desde fuera. */
export interface MedidaDeEntrega extends ResultadoDeTurno {
  /**
   * ¿Se puede REVISAR lo que la tarea escribió? O sea: existe la marca de git de su sesión
   * y el diff sale (`cambiosDeSesion(...).via === "git"`).
   *
   * No es «el árbol está limpio» (ver la cabecera): es que lo escrito sea visible. Sin
   * aprobación previa, ese diff es el ÚNICO momento en que una persona puede mirar lo que
   * hizo una tarea; entregar trabajo que nadie puede ver sería exactamente el sitio vacío
   * que el modal de aprobación dejó.
   */
  revisable: boolean;
}

/** El veredicto de un juez de QA. Texto para leer y hallazgos, nunca contenido de ficheros. */
export interface VeredictoDeTarea {
  /** `indeterminado` = no se entendió lo que contestó. No es verde. */
  veredicto: "verde" | "rojo" | "indeterminado";
  /** Una o dos frases. Es lo que una persona lee en la tarjeta. */
  resumen: string;
  /** Lo que le falta o le sobra, una frase por hallazgo. */
  hallazgos?: string[];
}

/** ¿Se entrega? Y si no, POR QUÉ — que es lo único accionable de una tarjeta aparcada. */
export interface Entrega {
  entregable: boolean;
  motivo?: string;
}

/**
 * La medida a partir de lo que el turno informó. **Ausente no es vacío.**
 *
 * Un ejecutor que no informa —el guionizado, o una piel que no reenvíe el retorno— no ha
 * dicho que el verificador esté verde: ha dicho nada. Darlo por verde sería la entrega
 * silenciosa que todo esto existe para impedir, así que se traduce a `no-corrio` DICIENDO
 * que nadie informó, que es otra cosa que «el simulador no está».
 */
export function medidaDeEntrega(
  resultado: ResultadoDeTurno | undefined,
  revisable: boolean
): MedidaDeEntrega {
  if (resultado === undefined) {
    return {
      verificador: "no-corrio",
      pendientes: 0,
      revisable,
      motivoSinVerificar: "el ejecutor de este turno no informa de lo que pasó",
    };
  }
  return { ...resultado, revisable };
}

/** Cuántos ERRORES trae un veredicto rojo. Los avisos no tumban la entrega. */
const erroresDe = (hallazgos: readonly HallazgoDelTurno[] | undefined): number =>
  (hallazgos ?? []).filter((h) => h.severidad === "error").length;

/**
 * Las tres condiciones que comprueba el CÓDIGO. Pura.
 *
 * El motivo nombra TODAS las que fallaron y no la primera: es el caso medido de la deuda
 * que esta pieza hereda —un turno cortado por el tope tiene escrituras pendientes Y un
 * verificador que no corrió—, y decir solo una de las dos manda a adivinar la otra. Es la
 * misma regla del aviso de honestidad que saca los NOMBRES de los ficheros en vez de un
 * contador.
 */
export function condicionesDeEntrega(medida: MedidaDeEntrega): Entrega {
  const fallos: string[] = [];
  if (medida.verificador === "rojo") {
    const errores = erroresDe(medida.hallazgos);
    fallos.push(
      errores > 0
        ? `el verificador dejó ${errores} error(es) sin corregir`
        : "el verificador acabó en rojo"
    );
  } else if (medida.verificador === "no-corrio") {
    fallos.push(
      `el verificador no corrió en este turno${
        medida.motivoSinVerificar === undefined ? "" : ` (${medida.motivoSinVerificar})`
      }`
    );
  }
  if (medida.pendientes > 0) {
    fallos.push(`quedaron ${medida.pendientes} escritura(s) esperando aprobación, y no se aplicaron`);
  }
  if (!medida.revisable) {
    fallos.push("no se puede revisar lo que ha escrito: la sesión no dejó marca de git con la que comparar");
  }
  if (fallos.length === 0) return { entregable: true };
  return { entregable: false, motivo: fallos.join("; ") };
}

/**
 * La decisión final: las condiciones Y el juez.
 *
 * El orden importa y es el de siempre, fail-closed: si una condición falla, el veredicto
 * del juez no se mira siquiera — su motivo sería ruido sobre un hecho. Quien llama puede
 * además preguntar primero por `condicionesDeEntrega` para no gastar una llamada del
 * modelo más caro cuando ya se sabe que no se entrega; esta función vuelve a comprobarlas
 * porque la garantía no puede depender de que quien llama lo haya hecho en ese orden.
 *
 * **Sin veredicto no se entrega.** Es lo que hace que «el juez no se puede usar» sea un
 * fallo del entorno con la tarea esperando feedback, y no una entrega en silencio.
 */
export function decisionDeEntrega(
  medida: MedidaDeEntrega,
  veredicto: VeredictoDeTarea | undefined
): Entrega {
  const condiciones = condicionesDeEntrega(medida);
  if (!condiciones.entregable) return condiciones;
  if (veredicto === undefined) {
    return {
      entregable: false,
      motivo: "no hay veredicto del juez de QA, y sin él una tarea no se entrega",
    };
  }
  if (veredicto.veredicto !== "verde") {
    return {
      entregable: false,
      motivo: `el juez de QA dijo «${veredicto.veredicto}»: ${veredicto.resumen}`,
    };
  }
  return { entregable: true };
}
