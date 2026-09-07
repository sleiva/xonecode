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
export function Receta({ receta }: { receta: RecetaDelCable }) {
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
