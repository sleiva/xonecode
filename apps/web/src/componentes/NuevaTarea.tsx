import { useState } from "react";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { nombreDeAdjuntoSeguro } from "../nombreDeAdjunto.js";
import estilos from "./NuevaTarea.module.css";

/**
 * Crear una TAREA en background: la petición, el encargo revisado y los adjuntos.
 *
 * **Esta ventana es donde se concede la autorización, y es el único sitio del producto donde
 * se puede decir antes de que ocurra.** Una tarea aplica sus escrituras sin pedir permiso
 * —§0 del diseño: «la autorización no es un interruptor nuevo, es el acto de crear la
 * tarea»—, así que aquí no hay un diff que mirar después: hay una frase que hay que leer
 * ahora. Por eso lo dice con palabras y arriba, no con un icono ni en una nota al pie.
 *
 * Tres partes, y el orden es el de la decisión:
 * 1. **La petición**, tal como se apunta.
 * 2. **El encargo propuesto, EDITABLE.** Se pide a un modelo («Preparar el encargo») y se
 *    enseña para revisarlo: es lo que ocupa el sitio del diff. Sin él también se puede
 *    encolar —con el texto tal cual— porque que no haya modelo no puede impedir apuntar un
 *    encargo, y si el aumentador falla se DICE con su motivo.
 * 3. **Los adjuntos**, que el agente verá en `/adjuntos/` de solo lectura. Con la limitación
 *    declarada: los LEE, no los ve. Prometer que «mira» una captura sería la peor clase de
 *    mentira aquí, porque quien se la cree es el modelo.
 *
 * Y **no empieza sola**, la misma regla que `NuevaSesion`: cerrar no encola nada.
 */
export function NuevaTarea({
  proyecto,
  local,
  alAbrirProyecto,
  puedeAugmentar = true,
  encargoPropuesto,
  alAugmentar,
  alSubirAdjunto,
  alEncolar,
  alCerrar,
}: {
  proyecto: { id: string; nombre: string };
  /**
   * ¿Existe ya la copia local del proyecto? Lo dice el SERVIDOR (`proyectos[].local`), no se
   * adivina — la misma regla que `NuevaSesion`. **Sin ella no se deja crear la tarea**, y esa
   * decisión pasó por dos versiones equivocadas antes de esta:
   *
   * 1. Primero decía «se encola igual, pero no arrancará hasta que se descargue». Es FALSO,
   *    medido en el corredor: `siguientesAEjecutar` la coge igual, `abrirParaTarea`
   *    (`vestibulo.ts`) lanza porque falta el `.xonecode/config.json`, `correr` la aparca en
   *    `requiere-atencion` y `renunciarSiSigueNueva` impide que este proceso la vuelva a
   *    coger. No espera: arranca, se aparca y se queda quieta.
   * 2. Después lo decía bien —se aparca, descárgalo y reinténtala—. Mejor, pero el problema no
   *    era la redacción: **el control ofrecía un camino cuyo único final posible es un
   *    fallo**, que es el botón muerto de siempre, aquí encima prometiendo una autorización de
   *    escritura.
   *
   * Así que se RECHAZA con el motivo y se manda al camino que ya existe: abrir el proyecto,
   * que es donde se descarga (`NuevaSesion`, que además avisa de que baja el proyecto entero).
   * Lo que NO se hace es encolar y disparar la descarga de rebote: eso metería una descarga
   * entera como efecto secundario de crear una tarea, y esa otra ventana existe justamente
   * para que descargar no sea un accidente.
   *
   * Y el rechazo se pinta EN LUGAR del formulario, no como un aviso encima. Es la parte con
   * consecuencia: subir un adjunto escribe bytes en `~/.xonecode/tareas/<borrador>/` antes de
   * que la tarea exista, así que un formulario usable aquí dejaría documentos de una persona
   * en una carpeta que ninguna tarea va a nombrar nunca.
   */
  local: boolean;
  /**
   * Lleva al camino que sí puede descargar el proyecto (`NuevaSesion`).
   *
   * **Obligatorio, y a propósito**, aunque con copia local no se use nunca: un rechazo sin
   * salida es un callejón, o sea la misma clase de fallo que el rechazo viene a quitar.
   * Siendo opcional, el día que alguien monte esta ventana sin pasarlo, el mensaje diría «no
   * se puede crear» y no habría nada que pulsar. Pedirlo en el tipo lo hace imposible.
   */
  alAbrirProyecto: () => void;
  /** ¿Tiene esta consola con qué augmentar? Falso = el botón no se pinta, y se dice por qué:
   *  un control que no puede cumplir lo que ofrece es el botón muerto de siempre. */
  puedeAugmentar?: boolean;
  /**
   * Lo último que contestó el aumentador: el encargo, o el motivo por el que no pudo. Llega
   * por el cable (el store), no lo produce este componente — y **no pisa lo que la persona
   * haya escrito ya**: ese mensaje va a todas las pestañas.
   */
  encargoPropuesto?: { encargo?: string; error?: string };
  alAugmentar: (peticion: string) => void;
  /**
   * Sube los bytes de un adjunto. El `nombre` ya viene convertido a segmento llano por
   * `nombreDeAdjuntoSeguro`; quien decide si vale es el servidor, dos veces.
   */
  alSubirAdjunto: (fichero: File, nombre: string) => Promise<{ ok: boolean; motivo?: string }>;
  alEncolar: (tarea: { peticion: string; encargo: string }) => void;
  alCerrar: () => void;
}) {
  const [peticion, setPeticion] = useState("");
  /**
   * El encargo EDITADO a mano, si lo hay. `undefined` significa «lo que diga el propuesto»,
   * y esa distinción es la que hace que un `augmentado` que llegue de otra pestaña no borre
   * lo que esta persona está escribiendo.
   */
  const [editado, setEditado] = useState<string | undefined>(undefined);
  const [adjuntos, setAdjuntos] = useState<
    { nombre: string; bytes: number; estado: "subiendo" | "listo" | "falló"; motivo?: string }[]
  >([]);

  const encargo = editado ?? encargoPropuesto?.encargo ?? "";
  const enVuelo = adjuntos.some((a) => a.estado === "subiendo");
  const algunoFalló = adjuntos.some((a) => a.estado === "falló");
  // Sin petición no hay nada que encolar; con un adjunto a medias o roto tampoco: los bytes
  // tienen que estar en disco ANTES, porque crear la tarea dispara la revisión de la cola y
  // el corredor puede arrancarla en el acto — leería un `/adjuntos/` incompleto.
  const sePuedeEncolar = peticion.trim() !== "" && !enVuelo && !algunoFalló;

  const añadir = async (elegidos: FileList | null): Promise<void> => {
    /**
     * Los nombres ya tomados, en una variable LOCAL y no leídos del estado.
     *
     * Esta es la parte delicada. El «¿ya hay uno con este nombre?» se leía de dentro del
     * actualizador de `setAdjuntos`, y React solo ejecuta ese actualizador en el acto por su
     * vía de estado *eager* —con la fibra sin trabajo pendiente—. Con `<input multiple>` y dos
     * ficheros del mismo nombre en UNA elección, la segunda vuelta del bucle llega después de
     * un `await` con una actualización posiblemente en cola: veía `false`, subía igual, y el
     * servidor sobrescribía el fichero en silencio. Medido: `alSubirAdjunto` se llamaba dos
     * veces con «captura.png» mientras la fila decía «ya hay un adjunto con ese nombre».
     *
     * El Set se siembra con lo que hay en el estado —esta ventana solo AÑADE adjuntos, así
     * que lo que se leyó al pintar sigue siendo cierto— y crece dentro del bucle, que es lo
     * único que la vía eager no garantizaba.
     */
    const tomados = new Set(adjuntos.map((a) => a.nombre));
    for (const fichero of Array.from(elegidos ?? [])) {
      const nombre = nombreDeAdjuntoSeguro(fichero.name);
      if (nombre === undefined) {
        // No se inventa uno: se dice, y la persona elige otro fichero.
        setAdjuntos((ya) => [
          ...ya,
          { nombre: fichero.name, bytes: fichero.size, estado: "falló", motivo: "no se puede usar ese nombre aquí" },
        ]);
        continue;
      }
      const repetido = tomados.has(nombre);
      tomados.add(nombre);
      setAdjuntos((ya) => [
        ...ya,
        repetido
          ? { nombre, bytes: fichero.size, estado: "falló" as const, motivo: "ya hay un adjunto con ese nombre" }
          : { nombre, bytes: fichero.size, estado: "subiendo" as const },
      ]);
      // El segundo con el mismo nombre se rechaza aquí y no se sube, porque el servidor lo
      // sobrescribiría en silencio.
      if (repetido) continue;
      const r = await alSubirAdjunto(fichero, nombre);
      setAdjuntos((ya) =>
        ya.map((a) =>
          a.nombre === nombre && a.estado === "subiendo"
            ? {
                ...a,
                estado: r.ok ? "listo" : "falló",
                ...(r.ok || r.motivo === undefined ? {} : { motivo: r.motivo }),
              }
            : a
        )
      );
    }
  };

  return (
    // Capa y velo propios: los CSS Modules del primitivo son stubs vacíos y su diálogo no
    // trae ni posición ni tamaño. Mismo motivo y misma solución que en `NuevaSesion`.
    <Modal open onClose={alCerrar} title="Nueva tarea" headless className={estilos.capa}>
      <div
        className={estilos.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) alCerrar();
        }}
      >
        <div className={estilos.ventana}>
          <h2 className={estilos.titulo}>Nueva tarea en {proyecto.nombre}</h2>
          {local ? null : (
            <>
              <p className={estilos.fallo} role="alert">
                Este proyecto todavía no está en tu equipo, así que <strong>no se puede crear
                una tarea</strong> para él: al cogerla se aparcaría diciendo que el proyecto no
                está, y ahí se quedaría.
              </p>
              <p className={estilos.nota}>
                Ábrelo una vez para traértelo —desde ahí se descarga— y luego vuelve a esta
                ventana.
              </p>
              <div className={estilos.acciones}>
                <Button variant="outline" className={estilos.accion} onClick={alCerrar}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className={`${estilos.accion} ${estilos.principal}`}
                  onClick={alAbrirProyecto}
                >
                  Abrir el proyecto
                </Button>
              </div>
            </>
          )}
          {local ? (
            <>
              {/*
                LA FRASE. No es un aviso de cortesía: crear esta tarea ES la autorización para
                que el agente escriba en el proyecto sin que nadie apruebe cada fichero, y este
                es el único momento en que se puede decir antes de que pase.

                Va DENTRO de la rama en que se puede crear, y no arriba para las dos. En el
                estado de rechazo no se está creando ninguna tarea, así que ahí esta frase
                explica una acción que no está disponible y compite con lo único que esa
                pantalla tiene que conseguir: «no puedes crearla aquí, abre el proyecto
                primero». Una pantalla que dice dos cosas a la vez consigue que se lea la menos
                importante. Hay test de AUSENCIA.
              */}
              <p className={estilos.autorizacion}>
                Esta tarea trabaja sola: <strong>escribe en el proyecto sin pedirte permiso</strong> fichero
                por fichero. Crearla es autorizarlo. Después se puede revisar lo que tocó, en la pestaña
                Revisión de su sesión.
              </p>

          <label className={estilos.etiqueta} htmlFor="nueva-tarea-peticion">
            Qué hay que hacer
          </label>
          <textarea
            id="nueva-tarea-peticion"
            className={estilos.campo}
            rows={3}
            value={peticion}
            onChange={(e) => setPeticion(e.target.value)}
            placeholder="Que la lista de clientes se pueda buscar por NIF"
          />

          <div className={estilos.filaDeEncargo}>
            <label className={estilos.etiqueta} htmlFor="nueva-tarea-encargo">
              Encargo (lo que se le manda al agente)
            </label>
            {puedeAugmentar ? (
              <Button
                variant="outline"
                className={estilos.accion}
                disabled={peticion.trim() === ""}
                onClick={() => alAugmentar(peticion)}
              >
                Preparar el encargo
              </Button>
            ) : null}
          </div>
          {puedeAugmentar ? null : (
            <p className={estilos.nota}>
              En esta consola no hay con qué preparar el encargo, así que se manda tu texto tal cual.
            </p>
          )}
          {encargoPropuesto?.error === undefined ? null : (
            <p className={estilos.fallo} role="alert">
              No se pudo preparar el encargo ({encargoPropuesto.error}). Puedes encolarla con tu texto
              tal cual.
            </p>
          )}
          <textarea
            id="nueva-tarea-encargo"
            className={estilos.campo}
            rows={8}
            value={encargo}
            onChange={(e) => setEditado(e.target.value)}
            placeholder="Se rellena con «Preparar el encargo», y se puede editar. Vacío, se manda tu texto tal cual."
          />

          <label className={estilos.etiqueta} htmlFor="nueva-tarea-adjuntos">
            Adjuntar ficheros
          </label>
          <input
            id="nueva-tarea-adjuntos"
            className={estilos.campo}
            type="file"
            multiple
            onChange={(e) => {
              void añadir(e.target.files);
              // El mismo fichero se puede volver a elegir tras un fallo: sin esto el
              // `change` no vuelve a dispararse con el mismo nombre.
              e.target.value = "";
            }}
          />
          {/*
            La limitación declarada del §2 del diseño. Va aquí y no en una ayuda escondida:
            quien adjunta un mockup está a punto de suponer que el agente lo va a mirar.
          */}
          <p className={estilos.nota}>
            El agente puede <strong>leer</strong> estos ficheros en «/adjuntos/», de solo lectura; una
            imagen <strong>no la ve</strong> todavía. Si el trabajo depende de mirar una captura,
            descríbela por escrito.
          </p>
          {adjuntos.length === 0 ? null : (
            <ul className={estilos.adjuntos}>
              {adjuntos.map((a, i) => (
                <li key={`${a.nombre}-${i}`} className={estilos.adjunto} data-estado={a.estado}>
                  <span className={estilos.nombreDeAdjunto}>{a.nombre}</span>
                  <span className={estilos.peso}>{peso(a.bytes)}</span>
                  <span className={estilos.estado}>
                    {a.estado === "subiendo" ? "subiendo…" : a.estado === "listo" ? "listo" : (a.motivo ?? "no se pudo subir")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className={estilos.acciones}>
            <Button variant="outline" className={estilos.accion} onClick={alCerrar}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className={`${estilos.accion} ${estilos.principal}`}
              disabled={!sePuedeEncolar}
              onClick={() => {
                if (!sePuedeEncolar) return;
                // Sin encargo escrito se manda la petición TAL CUAL: es lo que hace que un
                // aumentador caído no impida apuntar el trabajo.
                alEncolar({ peticion: peticion.trim(), encargo: encargo.trim() === "" ? peticion.trim() : encargo });
              }}
            >
              Encolar
            </Button>
          </div>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/** Un tamaño para leer. KB de 1000, como el resto de la interfaz. */
function peso(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
