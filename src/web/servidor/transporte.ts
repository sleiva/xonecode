/**
 * SSE del servidor al cliente, `POST /accion` del cliente al servidor.
 *
 * No es WebSocket a propósito: aquí hay UN stream, no un mux de streams lógicos con
 * decenas de clientes hablando a la vez. Con SSE la reconexión es trivial porque el
 * servidor guarda la lista de actos y la reemite entera; con WS habría que reimplementar
 * generaciones y reanudación para no ganar nada.
 *
 * La regla que gobierna este fichero: **el contenido de fichero y el diff viajan en UN
 * solo mensaje**, `aprobacion`, que es el paso donde el humano DECIDE sobre ellos. Ni los
 * actos ni la traza de emisión los tocan, y por eso `emitir` no registra ese mensaje: lo
 * guarda quien lo tiene en vuelo, que lo suelta en cuanto hay decisión.
 */
import type { Acto } from "../../core/actos.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { LineaDeDiff } from "../../core/diff.js";
import type { SelectorDeConsola } from "../../cli/consola.js";
// Solo TIPO, y por eso no es un ciclo: `vestibulo.ts` importa este módulo para ejecutar,
// y esta importación se borra al compilar. Se traen de allí en vez de redeclararlos aquí
// porque son los MISMOS pasos y los MISMOS entornos que el vestíbulo calcula; una segunda
// declaración en este fichero sería el tipo de copia que diverge sin que nada chiste.
import type { OpcionDeEntorno, PasoDelVestibulo } from "./vestibulo.js";

export type MensajeAlCliente =
  | { clase: "acto"; acto: Acto }
  /**
   * SUSTITUYE el último acto del cliente. Existe porque `pielWeb.alActo` avisa también
   * de ACTUALIZACIONES: el cierre de una racha de tools reemplaza a su apertura dentro
   * del mismo acto `herramientas` (`core/actos.ts#conLineaDeTool`). Un cliente que
   * anexara a ciegas enseñaría las dos líneas para siempre.
   *
   * Solo se emite cuando el acto que cambia ES el último; si algo se escribió después,
   * el transporte manda una `reemision` entera — sustituir «el último» tocaría otro acto.
   */
  | { clase: "sustitucion"; acto: Acto }
  /** El transcript completo: lo que recibe quien (re)conecta, y el arreglo de cualquier desajuste. */
  | { clase: "reemision"; actos: Acto[] }
  | { clase: "pregunta"; texto: string }
  | { clase: "selector"; selector: SelectorDeConsola }
  | { clase: "secreto"; pregunta: string }
  /**
   * El registro de comandos de barra, para que el compositor sugiera sin llevar una
   * copia: `nombre` va con la «/» delante (lo que el usuario teclea), `descripcion` es
   * la misma que `COMANDOS[nombre].descripcion` en `cli/consola.ts`. Quien registre la
   * ruta de conexión lo arma recorriendo ese registro — no hay lista escrita a mano en
   * ningún punto de este cable.
   */
  | { clase: "comandos"; comandos: { nombre: string; descripcion: string }[] }
  /**
   * El alta que FALTA, para el wizard del navegador. `pasos` sale de
   * `vestibulo.ts#pasosPendientes`, que los calcula preguntándole al sistema y nunca a una
   * marca de «primer arranque»; vacío significa que no hay alta que hacer y el cliente no
   * pinta nada.
   *
   * `proyectos` y `ramas` llegan vacíos hasta que hay entorno (y proyecto) elegidos: son
   * dos consultas a CloudStudio y no se pueden inventar. Lista vacía es «todavía no lo
   * sé», que es la verdad, y no un dato de relleno.
   *
   * **La clave de API NO viaja aquí.** El paso de cuenta lo conduce
   * `vestibulo.pasoDeCuenta()` sobre `seleccionar` y `leerSecreto`, así que la clave sigue
   * entrando por el mensaje de clase «secreto» y por ninguno más — el mismo trato que
   * documentan `consolaWeb.ts#leerSecreto` y la cabecera de `Wizard.tsx`.
   */
  | {
      clase: "alta";
      pasos: PasoDelVestibulo[];
      proveedores: { id: string; nombre: string }[];
      entornos: OpcionDeEntorno[];
      proyectos: { id: string; nombre: string }[];
      ramas: string[];
    }
  /** El ÚNICO mensaje que lleva contenido de fichero: es el paso donde se DECIDE sobre él. */
  | {
      clase: "aprobacion";
      pendientes: PendienteDeAprobacion[];
      ficheros: Record<string, string>;
      diffs: Record<string, LineaDeDiff[]>;
    };

export type MensajeDelCliente =
  | { clase: "prosa"; texto: string }
  | { clase: "respuesta"; texto: string }
  /**
   * La respuesta a `seleccionar`. **Sin `id` (o con `id: null`) es CANCELAR**, que es
   * exactamente lo que `seleccionar` ya devuelve al desconectarse y al vencer su plazo — en
   * el terminal cancelar es una salida de primera clase («número, Enter cancela»), así que
   * la web no puede tener menos. Se aprovecha esta clase en vez de añadir otra: el contrato
   * del cable no crece y la traducción a `undefined` vive en un solo sitio
   * (`consolaWeb.ts#recibir`). `undefined` viaja como la AUSENCIA del campo, porque
   * `JSON.stringify` descarta las claves con ese valor; `null` se admite porque es lo que
   * escribiría un cliente que lo serialice explícitamente, y dice lo mismo.
   *
   * Un `id` vacío o desconocido NO es cancelar: es un id que no existe, y así se lo pasa a
   * quien llamó. Traducirlo aquí a cancelación convertiría el bug de un cliente en un
   * usuario que se echó atrás.
   */
  | { clase: "eleccion"; id?: string | null }
  | { clase: "secreto"; valor: string }
  /**
   * Un paso del alta, resuelto por el wizard. Es UNA clase y no tres porque los tres son
   * el mismo trámite —el alta— y quien la atiende es un solo sitio (`web/servidor/arranque.ts`);
   * tres clases obligarían a mantener tres ramas del cable de acuerdo entre sí sin ganar
   * nada.
   *
   * Con `paso` «proyecto» y SIN `rama` no se abre nada: significa «he elegido proyecto,
   * dime sus ramas», y el servidor contesta con otro mensaje de alta con `ramas` llenas.
   * Es lo que evita inventarse las ramas del primer proyecto de la lista antes de que
   * nadie haya elegido — el mismo «lista vacía, no dato inventado» del otro extremo.
   *
   * Aquí NO hay campo para la clave de API: el paso de cuenta va por «secreto».
   */
  | {
      clase: "alta";
      paso: PasoDelVestibulo;
      entorno?: { id: string; nombre: string; url: string };
      proyecto?: string;
      rama?: string;
    }
  /**
   * El valor es el `Decision["type"]` que el pendiente declara en `decisionesPermitidas`,
   * no una respuesta tecleada: el cliente son botones. `consolaWeb` lo traduce a la
   * respuesta que `interpretAnswer` entiende, en vez de comparar cadenas por su cuenta.
   */
  | { clase: "decision"; decisiones: Record<string, string> };

/** A dónde escribe el SSE. Ausente = no hay nadie al otro lado. */
export type Sumidero = (mensaje: MensajeAlCliente) => void;

export interface Transporte {
  /**
   * El cliente abre el SSE. Devuelve los actos que hay que reemitirle: quien registra la
   * ruta los manda como una `reemision` con su propia escritura, así que esto NO los
   * emite — hacerlo duplicaría la reemisión en el sumidero que se acaba de instalar.
   */
  conectar(enviar?: Sumidero): readonly Acto[];
  /** El SSE se cae, o la pestaña se cierra. Fail-closed: quien esperaba deja de esperar. */
  desconectar(): void;
  conectado(): boolean;
  /**
   * Produce un mensaje: lo anota en la traza y, si hay cliente, lo escribe. Anota aunque
   * no haya nadie porque la traza cuenta lo que el servidor PRODUJO — que es lo que los
   * tests de «esto no viaja» tienen que poder mirar.
   */
  emitir(mensaje: MensajeAlCliente): void;
  /**
   * La traza de todo lo producido MENOS la aprobación. No es una lista arbitraria: es la
   * frontera del invariante — el contenido de fichero está en el mensaje de aprobación y
   * en ninguna otra clase de mensaje, y así un test lo puede afirmar sobre todo el resto.
   */
  emitidos(): readonly MensajeAlCliente[];
  /** Se llama al desconectar: por aquí se despierta a todo el que esperaba respuesta. */
  alDesconectar(escucha: () => void): void;
}

export function crearTransporte(actos: () => readonly Acto[]): Transporte {
  const traza: MensajeAlCliente[] = [];
  const escuchasDeCorte: (() => void)[] = [];
  let sumidero: Sumidero | undefined;
  let hayCliente = false;

  return {
    conectar(enviar) {
      hayCliente = true;
      sumidero = enviar;
      return [...actos()];
    },
    desconectar() {
      hayCliente = false;
      sumidero = undefined;
      for (const escucha of escuchasDeCorte) escucha();
    },
    conectado: () => hayCliente,
    emitir(mensaje) {
      if (mensaje.clase !== "aprobacion") traza.push(mensaje);
      sumidero?.(mensaje);
    },
    emitidos: () => traza,
    alDesconectar(escucha) {
      escuchasDeCorte.push(escucha);
    },
  };
}
