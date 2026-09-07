import type { EstadoDelCliente } from "../store.js";
import type { Receta as RecetaDelCable } from "../tipos.js";
import { BotonDeCopiar } from "./BotonDeCopiar.js";
import estilos from "./Receta.module.css";

/**
 * Cómo conseguir lo que a esta máquina le falta: los pasos, para PEGARLOS en un terminal.
 *
 * **Por qué se copia y no se pulsa.** La regla de esta casa es que solo se ofrece ejecutar
 * lo que se puede cumplir, y `brew` puede pedir la contraseña de administrador: un hijo sin
 * terminal detrás se quedaría esperándola para siempre, y un botón que se cuelga es peor que
 * no tener botón. Lo que sí se puede lanzar sin pedir entrada —`sdkmanager` y `avdmanager`,
 * que son los pasos largos— es la fase siguiente, y necesita un canal de progreso: son 2-3 GB
 * y un botón mudo durante diez minutos se lee como que se ha colgado.
 *
 * **Cada paso se marca por lo MEDIDO**, nunca por recordar que alguien pulsó: una marca
 * guardada seguiría diciendo «hecho» después de desinstalar el SDK, que es justo cuando hay
 * que decir que falta. Por eso el estado llega en el informe y este componente solo lo pinta.
 *
 * Y el estado va en TEXTO además de en color (`aria-label`): un punto verde no lo lee nadie
 * con un lector de pantalla, y aquí la diferencia entre hecho y pendiente ES el dato.
 */
export function Receta({
  receta,
  instalacion,
  alEjecutar,
  alCancelar,
}: {
  receta: RecetaDelCable;
  /** Lo que el SERVIDOR dice del paso que corre. Uno para toda la máquina. */
  instalacion?: EstadoDelCliente["instalacion"];
  /** Lanzar el paso `numero` (1-indexado, como se numera en la ventana). Ausente = esta
   *  ejecución no lanza nada y el botón no se pinta: no hay botón muerto. */
  alEjecutar?: (numero: number) => void;
  alCancelar?: () => void;
}) {
  /** El estado, solo si habla de ESTE paso: sin comprobarlo, el log del 3 saldría bajo el 4. */
  const deEstePaso = (numero: number): EstadoDelCliente["instalacion"] =>
    instalacion !== undefined && instalacion.receta === receta.id && instalacion.paso === numero
      ? instalacion
      : undefined;
  return (
    <section className={estilos.receta} aria-label={receta.titulo}>
      <h4 className={estilos.titulo}>{receta.titulo}</h4>
      {receta.completa ? (
        // Con todo hecho, los pasos son ruido para quien ya lo tiene: se dice y se calla.
        <p className={estilos.hecha}>Ya está: esta máquina lo tiene todo.</p>
      ) : (
        <>
          <p className={estilos.descripcion}>{receta.descripcion}</p>
          <ol className={estilos.pasos}>
            {receta.pasos.map((paso, i) => (
              <li key={paso.titulo} className={estilos.paso} data-hecho={paso.hecho ? "" : undefined}>
                <span className={estilos.numero} aria-hidden>
                  {i + 1}
                </span>
                <div className={estilos.cuerpo}>
                  <p className={estilos.pasoTitulo}>
                    <span
                      className={estilos.marca}
                      data-hecho={paso.hecho ? "" : undefined}
                      aria-label={paso.hecho ? "hecho" : "pendiente"}
                      role="img"
                    />
                    {paso.titulo}
                  </p>
                  {paso.nota === undefined ? null : <p className={estilos.nota}>{paso.nota}</p>}
                  <div className={estilos.bloque}>
                    {/* Los comandos de un paso van JUNTOS: son un paso, y copiarlos de uno
                        en uno invita a pegar el primero y olvidarse del segundo. */}
                    <pre className={estilos.comandos}>{paso.comandos.join("\n")}</pre>
                    <BotonDeCopiar texto={paso.comandos.join("\n")} etiqueta={`Copiar los comandos del paso ${i + 1}`} />
                  </div>
                  {(() => {
                    const enCurso = deEstePaso(i + 1);
                    const corriendo = enCurso?.estado === "corriendo";
                    if (corriendo) {
                      return (
                        <div className={estilos.trabajo}>
                          <p className={estilos.estado}>
                            <span className={estilos.girando} aria-hidden />
                            {enCurso.titulo} · {duracion(enCurso.ms)}
                            {alCancelar === undefined ? null : (
                              <button type="button" className={estilos.cancelar} onClick={alCancelar}>
                                Cancelar
                              </button>
                            )}
                          </p>
                          {/* El log: la cola, que es lo que dice que avanza. El tiempo de al
                              lado es lo que dice que sigue vivo cuando la última línea lleva
                              un rato quieta —descomprimir 3 GB no imprime nada—. */}
                          <pre className={estilos.log}>{enCurso.lineas.join("\n")}</pre>
                        </div>
                      );
                    }
                    return (
                      <div className={estilos.trabajo}>
                        {enCurso === undefined ? null : (
                          <p className={estilos.estado} data-estado={enCurso.estado}>
                            {/*
                              «Terminó bien» y «ya está» son dos cosas distintas, y aquí se
                              pueden contradecir: el proceso puede salir con código 0 y la
                              MEDIDA seguir sin encontrar nada. Cuando pasa se dice, en vez de
                              poner «Hecho» al lado de una marca hueca y dejar que el lector
                              decida a cuál de las dos creer. La medida es la que manda: es la
                              misma regla que ya sigue el botón de instalar una herramienta.
                            */}
                            {enCurso.estado === "ok" && !paso.hecho
                              ? "Terminó sin error, pero la medida sigue sin encontrarlo"
                              : TEXTO_DE_ESTADO[enCurso.estado]}
                            {enCurso.motivo === undefined ? null : `: ${enCurso.motivo}`}
                          </p>
                        )}
                        {!paso.ejecutable ? (
                          // Sin botón cuando no puede cumplirse, y con el motivo: un botón
                          // apagado sin explicación se lee como que la ventana está rota.
                          paso.porQueNo === undefined ? null : (
                            <p className={estilos.nota}>No se puede lanzar todavía: {paso.porQueNo}.</p>
                          )
                        ) : alEjecutar === undefined ? null : (
                          <>
                            <button
                              type="button"
                              className={estilos.ejecutar}
                              disabled={instalacion?.estado === "corriendo"}
                              onClick={() => alEjecutar(i + 1)}
                            >
                              Ejecutar este paso
                            </button>
                            {paso.acepta === undefined ? null : (
                              // Pulsar ES la aceptación, así que se dice al lado y no dentro
                              // del botón: aceptar una licencia en nombre de alguien no puede
                              // ser un efecto de rebote de algo que dice «Ejecutar».
                              <span className={estilos.acepta}>Al pulsar aceptas {paso.acepta}.</span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {/* Lo que viene DESPUÉS se dice siempre, completa o no: arrancar un emulador todavía
          no está cableado aquí, y el comando es lo único honesto que se puede dar. */}
      <p className={estilos.despues}>{receta.despues}</p>
    </section>
  );
}

/** Cómo se dice cada final. «colgada» no es «fallo»: se distingue porque el remedio es otro. */
const TEXTO_DE_ESTADO: Record<NonNullable<EstadoDelCliente["instalacion"]>["estado"], string> = {
  corriendo: "En marcha",
  ok: "Hecho",
  fallo: "No salió bien",
  cancelada: "Cancelado por ti",
  colgada: "Se quedó sin decir nada y se paró",
};

/**
 * El tiempo, para leer. En minutos y segundos a partir del minuto: un contador de 700 s no
 * se lee, y lo que se quiere saber es si esto lleva un rato o acaba de empezar.
 */
export function duracion(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
