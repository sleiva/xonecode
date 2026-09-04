import { useCallback, useEffect, useMemo, useRef } from "react";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import clsx from "clsx";
import estilos from "./Aprobacion.module.css";

/**
 * El modal de aprobación: fail-closed, igual que el de la TUI lo es por TECLA.
 *
 * Aquí lo es por SALIDA: solo el botón «Aprobar» aprueba, y todo lo demás —«Rechazar»,
 * Escape, y desmontar sin haber decidido— manda rechazo EXPLÍCITO. Explícito y no
 * silencio: el servidor ya rechaza por timeout (`consolaWeb.ts#MS_DE_ESPERA_POR_OMISION`,
 * diez minutos), pero un rechazo que llega enseguida devuelve el turno al usuario en vez
 * de dejarlo esperando el plazo entero.
 *
 * Este es el ÚNICO sitio de toda la web donde el contenido de un fichero se enseña entero,
 * y es correcto que así sea: es el paso donde se DECIDE sobre él. Por eso tampoco hay
 * techo de líneas — la TUI recorta a 25 (`cli/tui/aprobarTui.tsx`) porque un terminal no
 * hace scroll y aquí sí.
 *
 * **Qué se adoptó de `@deepseek-ai/dsh-client-ui-primitives` y qué no.** `Modal` sí: pone
 * el portal sobre `document.body`, el `role="dialog"`/`aria-modal` y el manejador de
 * Escape —que aquí ES el rechazo—, y su `className` cae en la tarjeta, que es lo único que
 * hay que colocar. Sus 22 CSS Modules son stubs vacíos en este release candidate, así que
 * el `mask` no tiene ni clase ni prop con la que llegar a él: el velo se pinta desde la
 * capa que sí acepta clase. `DiffBlock` NO: colapsa el medio a 16 filas por omisión
 * (justo lo contrario del invariante de este modal), agrupa el lado quitado y el añadido
 * en dos bloques en vez de intercalarlos como el LCS de `core/diff.ts` ya los da, pide
 * `{oldText, newText}` en vez de líneas, y trae los rótulos «复制» y «展开其余 N 行差异»
 * escritos a pelo, sin prop para traducirlos. `RiskConfirmation` tampoco: deja el botón
 * primario `disabled` mientras no se marque una casilla de reconocimiento, y el criterio
 * de esta pantalla es que un clic en «Aprobar» apruebe.
 */

/**
 * Las dos formas del cable, declaradas AQUÍ y no en `tipos.ts`. Ese fichero se compara
 * literal a literal contra `core/actos.ts` (`tipos.test.ts`), y un `tipo: "anadido"` allí
 * sería un tipo de acto inventado para su detector de divergencia. Estas dos son
 * `PendienteDeAprobacion` (`core/events.ts:56`) y `LineaDeDiff` (`core/diff.ts:12`).
 */
export interface PendienteDeAprobacion {
  id: string;
  origen: string;
  descripcion: string;
  decisionesPermitidas: string[];
}

export type LineaDeDiff = { tipo: "igual" | "anadido" | "quitado"; texto: string };

/**
 * El vocabulario del cable, que es el `Decision["type"]` de `vendor/hitl.ts` y no un «sí»
 * traducible: `consolaWeb.ts` compara contra la cadena EXACTA `"approve"` y todo lo demás
 * queda rechazado, porque su mapa nace rechazado entero.
 */
const APROBAR = "approve";
const RECHAZAR = "reject";

const TIPOS_DE_LINEA = { igual: true, anadido: true, quitado: true };

function esPendiente(valor: unknown): valor is PendienteDeAprobacion {
  if (typeof valor !== "object" || valor === null) return false;
  const p = valor as { id?: unknown; descripcion?: unknown };
  return typeof p.id === "string" && typeof p.descripcion === "string";
}

function esLineaDeDiff(valor: unknown): valor is LineaDeDiff {
  if (typeof valor !== "object" || valor === null) return false;
  const l = valor as { tipo?: unknown; texto?: unknown };
  return (
    typeof l.texto === "string" &&
    typeof l.tipo === "string" &&
    Object.prototype.hasOwnProperty.call(TIPOS_DE_LINEA, l.tipo)
  );
}

/** El prefijo que un diff lleva desde siempre; va en su propio nodo para no ensuciar el texto. */
const SIGNO = { anadido: "+", quitado: "-", igual: " " };

export function Aprobacion({
  pendientes,
  ficheros,
  diffs,
  alDecidir,
}: {
  /**
   * Lo que trae el mensaje `aprobacion` tal cual sale de `JSON.parse` (`store.ts` lo
   * guarda como `unknown[]`): este componente es el primero que le da forma, y valida en
   * vez de castear — un objeto raro entre las líneas no puede tumbar el modal donde se
   * decide si se escriben ficheros.
   */
  pendientes: readonly unknown[];
  /** Id del pendiente → RUTA del fichero que se va a escribir (no su contenido). */
  ficheros: Record<string, string>;
  /** Id del pendiente → sus líneas de diff. */
  diffs: Record<string, readonly unknown[]>;
  alDecidir: (decisiones: Record<string, string>) => void;
}) {
  const lista = useMemo(() => pendientes.filter(esPendiente), [pendientes]);

  // `decidido` es lo que hace que haya UNA sola decisión por aprobación: aprobar y que
  // después el desmontaje mandara un rechazo sería peor que no tener rechazo al desmontar.
  const decidido = useRef(false);
  const tarjeta = useRef<HTMLDivElement>(null);

  const decidir = useCallback(
    (valor: string): void => {
      if (decidido.current) return;
      decidido.current = true;
      // Todos los pendientes a la vez, y no uno por tarjeta: el servidor TERMINA la
      // aprobación con el primer mensaje `decision` que le llega y deja rechazado lo que
      // no venía (`consolaWeb.ts`, el `finally`). Un botón por pendiente daría a entender
      // que se puede contestar en dos veces, y la segunda no llegaría a tiempo.
      alDecidir(Object.fromEntries(lista.map((p) => [p.id, valor])));
    },
    [alDecidir, lista]
  );

  // El `decidir` de la limpieza se lee por referencia para que el efecto no dependa de él:
  // con `decidir` en las dependencias, cada render con `pendientes` nuevo ejecutaría la
  // limpieza, y aunque el guardián de abajo la desactivara, el efecto diría algo que no es.
  const ultimoDecidir = useRef(decidir);
  ultimoDecidir.current = decidir;

  useEffect(() => {
    // El nodo se captura al MONTAR, no en la limpieza: al desmontar de verdad, React ya ha
    // puesto la ref a null.
    const nodo = tarjeta.current;
    return () => {
      // `main.tsx` envuelve la app en `<StrictMode>`, que en desarrollo monta, desmonta y
      // vuelve a montar cada componente nuevo — y esta limpieza se ejecuta en ese falso
      // desmontaje. Medido en este repo, y con el modal significaría rechazar solo cada
      // aprobación en el instante de aparecer, durante todo el desarrollo. El
      // discriminador es síncrono y también está medido: en el desmontaje simulado el nodo
      // SIGUE conectado al documento (portal incluido), y en uno de verdad no.
      if (nodo?.isConnected === true) return;
      ultimoDecidir.current(RECHAZAR);
    };
  }, []);

  return (
    <Modal
      open
      // Escape y el clic en el velo llegan por aquí: en este modal cerrar es RECHAZAR, no
      // «dejarlo para luego» — al otro lado hay un turno esperando una respuesta.
      onClose={() => decidir(RECHAZAR)}
      title="Aprobación de escrituras"
      headless
      className={estilos.capa}
    >
      <div className={estilos.tarjeta} ref={tarjeta}>
        <h2 className={estilos.titulo}>
          {lista.length === 1 ? "1 escritura pide aprobación" : `${lista.length} escrituras piden aprobación`}
        </h2>
        <div className={estilos.cuerpo}>
          {lista.map((p) => {
            const ruta = ficheros[p.id];
            const lineas = (diffs[p.id] ?? []).filter(esLineaDeDiff);
            return (
              <section key={p.id} className={estilos.pendiente}>
                <p className={estilos.descripcion}>{p.descripcion}</p>
                {typeof ruta === "string" && ruta !== "" ? <p className={estilos.ruta}>{ruta}</p> : null}
                <p className={estilos.origen}>quién: {p.origen}</p>
                <div className={estilos.diff}>
                  {lineas.map((l, i) => (
                    <div key={i} className={clsx(estilos.linea, estilos[l.tipo])}>
                      <span className={estilos.signo} aria-hidden="true">
                        {SIGNO[l.tipo]}
                      </span>
                      <span>{l.texto}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className={estilos.acciones}>
          <Button variant="outline" className={estilos.accion} onClick={() => decidir(RECHAZAR)}>
            Rechazar
          </Button>
          <Button variant="primary" className={estilos.accion} onClick={() => decidir(APROBAR)}>
            Aprobar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
