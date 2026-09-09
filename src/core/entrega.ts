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
   * Cuántos hallazgos del simulador quedaron FUERA del reparto: los que caen en ficheros
   * que este turno no tocó. El otro lado de `hallazgos`, y hasta ahora solo se pintaba en
   * la consola (evento `verificacion`) y se tiraba.
   *
   * **Viaja porque el juez de QA lo necesita para no acusar al agente de lo que no hizo.**
   * `hallazgos` ya está filtrada por el reparto de `agent/turnoReal.ts#conVerificacion`,
   * pero quien la recibe no puede saber que lo está: en la primera ejecución real del juez
   * eso acabó en un rojo que decía que el turno había modificado los ficheros de los que
   * hablaban los hallazgos. Con este número, la lista se lee por lo que es.
   *
   * **Ausente y CERO no son lo mismo**, como siempre por aquí: `0` es «el verificador
   * corrió y no había ningún otro», y ausente es «no se midió» — el turno que no escribió,
   * el que no tiene simulador, el que se cortó antes. El evento lo omite en cero porque
   * ahí es una línea de consola que no diría nada; esto es un dato, y cero es un dato.
   */
  preexistentes?: number;
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
  /**
   * ¿Cambió la sesión algún fichero, **SEGÚN GIT**? `undefined` = no se sabe.
   *
   * De aquí depende que una tarea de SOLO LECTURA se pueda entregar, y la fuente importa:
   * lo dice `cambiosDeSesion` —la misma que `revisable`— y **nunca `autorizadas`**. Aquello
   * es una pista de lo que el agente quiso escribir, y puede llevar rutas que las guardas
   * rechazaron; decidir con ella sería decidir con la intención en vez de con el hecho.
   *
   * Solo se puede afirmar cuando hay marca (`via: "git"`): sin ella no es que no escribiera,
   * es que no hay con qué mirarlo — y entonces esto queda `undefined` y la condición del
   * verificador se exige como siempre. Es la distinción de siempre entre «ninguno» y «no se
   * sabe», y aquí colapsarla sería un camino para entregar sin verificar.
   */
  escribio?: boolean;
  /**
   * QUÉ cambió, según git: las rutas RELATIVAS del mismo diff del que sale `escribio`
   * (`corredorDeTareas.ts#revisionConGit`, una sola medida para las dos cosas, así que no
   * pueden discrepar). De aquí sale el HECHO que se le cuenta al juez de QA.
   *
   * **Existe porque `autorizadas` no puede hacer este trabajo.** Aquello se apunta al
   * autorizar la escritura y es la intención del agente; esto es un diff contra el «antes»
   * de la sesión. Todo el modo de fallo medido del juez era «no puedo comprobar la
   * existencia ni el contenido de X»: darle el hecho fichero a fichero lo quita de raíz, y
   * de paso le deja juzgar la cobertura del encargo ruta por ruta.
   *
   * **Ausente y VACÍA no son lo mismo**: ausente es «no se pudo preguntar a git» —sin marca
   * no hay con qué comparar— y `[]` es «git dice que no cambió nada». Colapsarlas haría que
   * un proyecto sin marca pareciera un proyecto intacto.
   */
  cambiados?: readonly string[];
  /**
   * Cuántas escrituras AUTORIZÓ el turno (`Tarea.autorizadas`), si consta.
   *
   * No es del turno ni de git: es de la tarea, y entra por su propio parámetro. Está aquí
   * para una sola condición —autorizó escrituras y git no ve ni un cambio—, y **ausente es
   * «no consta»**: una tarea de antes de que esto existiera, o un ejecutor que no lo informa.
   * Acusar con un dato que no se tiene es exactamente lo que estas condiciones no hacen.
   */
  autorizadas?: number;
}

/** El veredicto de un juez de QA. Texto para leer y hallazgos, nunca contenido de ficheros. */
export interface VeredictoDeTarea {
  /** `indeterminado` = no se entendió lo que contestó. No es verde. */
  veredicto: "verde" | "rojo" | "indeterminado";
  /** Una o dos frases. Es lo que una persona lee en la tarjeta. */
  resumen: string;
  /** Lo que le falta o le sobra, una frase por hallazgo. */
  hallazgos?: string[];
  /**
   * Con qué condición de MENOS se entregó. **Lo pone el CÓDIGO, no el juez**, y viaja aquí
   * porque el `motivo` de una tarea terminada no existe (`conEstado` lo borra a propósito:
   * «el motivo vive SOLO en el estado que lo explica») y este es el único sitio que
   * sobrevive a una entrega.
   *
   * Hoy la única es `SALVEDAD_SIN_ESCRITURAS`. Una entrega con una condición menos no puede
   * parecer una entrega normal — y eso solo es cierto porque este campo VIAJA: el veredicto
   * entero sale por el cable (`web/servidor/transporte.ts#filaDeTarea`) y lo pinta
   * `apps/web/src/componentes/EntregaDeTarea.tsx`. Estuvo un tiempo sin cablearse, y
   * entonces esta frase era falsa en la única pantalla donde importa.
   */
  salvedad?: string;
}

/** ¿Se entrega? Y si no, POR QUÉ — que es lo único accionable de una tarjeta aparcada. */
export interface Entrega {
  entregable: boolean;
  motivo?: string;
  /**
   * Con qué condición de MENOS se entregó, cuando fue el caso. Texto para leer.
   *
   * Una entrega con una condición menos no puede parecer una entrega normal: hoy la única
   * es la tarea que no escribió nada, donde el verificador no aplica y el veredicto del
   * juez queda como la única condición de contenido. Quien lo lea tiene derecho a saberlo.
   */
  salvedad?: string;
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
  /** Lo que dice git de la sesión. `escribio` y `cambiados` solo se afirman con marca: ver
   *  los campos. Ausente no se rellena con nada, en las dos. */
  revision: { revisable: boolean; escribio?: boolean; cambiados?: readonly string[] },
  /** Cuántas escrituras autorizó el turno, si consta. Ver `MedidaDeEntrega.autorizadas`. */
  autorizadas?: number
): MedidaDeEntrega {
  const deGit = {
    revisable: revision.revisable,
    ...(revision.escribio === undefined ? {} : { escribio: revision.escribio }),
    ...(revision.cambiados === undefined ? {} : { cambiados: revision.cambiados }),
    ...(autorizadas === undefined ? {} : { autorizadas }),
  };
  if (resultado === undefined) {
    return {
      verificador: "no-corrio",
      pendientes: 0,
      ...deGit,
      motivoSinVerificar: "el ejecutor de este turno no informa de lo que pasó",
    };
  }
  return { ...resultado, ...deGit };
}

/** Cuántos ERRORES trae un veredicto rojo. Los avisos no tumban la entrega. */
const erroresDe = (hallazgos: readonly HallazgoDelTurno[] | undefined): number =>
  (hallazgos ?? []).filter((h) => h.severidad === "error").length;

/**
 * Lo que se dice de una entrega a la que le faltó una condición porque no APLICABA.
 *
 * Se exporta para que quien la lea (y quien la pruebe) no la reescriba a mano.
 */
export const SALVEDAD_SIN_ESCRITURAS =
  "el turno no cambió ningún fichero, así que no había nada que verificar: la entrega va " +
  "solo con la valoración del juez";

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
  /**
   * **El verificador no aplica cuando no se escribió nada, y eso NO es relajar la regla.**
   *
   * «Un verificador que no corrió no es verde» existe porque una tarea que ESCRIBIÓ sin
   * verificarse está sin verificar. Una que no cambió ningún fichero no tiene nada que
   * verificar: el dominio del verificador son las escrituras, así que ahí la condición no
   * aplica en vez de fallar — y cuando no aplica, se DICE (ver `salvedad`), porque una
   * entrega con una condición menos no puede parecer una entrega normal.
   *
   * Se compara con `=== false` y no con un `!`: `undefined` es «no se sabe» y entonces la
   * condición se exige como siempre.
   */
  /**
   * **Autorizó escrituras y git no ve ni un cambio: nada aterrizó.**
   *
   * `Tarea.autorizadas` se apunta al AUTORIZAR, o sea antes de que el backend escriba, así
   * que una ruta que las guardas rechazan —`/artifacts/`, una vista aplanada, `/.env`— sale
   * ahí sin tocar el disco. Si git no ve ningún cambio y el turno autorizó escrituras,
   * TODAS se quedaron por el camino (o escribieron lo que ya estaba): la tarea se cree que
   * trabajó y no cambió el proyecto. Es un hecho comprobable, así que se mide aquí en vez de
   * contárselo al juez — la misma razón por la que su veredicto no basta solo.
   *
   * Y **manda sobre la salvedad de la tarea de solo lectura**: eso significa «el dominio del
   * verificador son las escrituras y no hubo ninguna», y aquí sí las hubo, solo que no
   * llegaron. Tratarlo como solo lectura entregaría el caso al revés.
   */
  const nadaAterrizo = medida.escribio === false && (medida.autorizadas ?? 0) > 0;
  if (nadaAterrizo) {
    fallos.push(
      `el turno autorizó ${medida.autorizadas} escritura(s) y git no ve ningún cambio en el ` +
        "proyecto: o las rechazó una guarda de ruta, o escribieron lo que ya estaba"
    );
  }
  const nadaQueVerificar = medida.escribio === false && !nadaAterrizo;
  if (nadaQueVerificar) {
    // Nada. Las otras dos condiciones siguen enteras: unas escrituras que quedaron
    // esperando aprobación son escrituras que el turno quiso hacer y no hizo, y sin marca de
    // git no se puede afirmar que no escribiera nada — ese caso no llega aquí.
  } else if (medida.verificador === "rojo") {
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
  if (fallos.length === 0) {
    return { entregable: true, ...(nadaQueVerificar ? { salvedad: SALVEDAD_SIN_ESCRITURAS } : {}) };
  }
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
  // La salvedad de las condiciones viaja hasta aquí: es la entrega la que hay que poder
  // leer, no un paso intermedio. Con el verificador fuera de juego, el veredicto del juez
  // es la única condición de CONTENIDO que quedaba, y eso es lo que dice.
  return { entregable: true, ...(condiciones.salvedad === undefined ? {} : { salvedad: condiciones.salvedad }) };
}
