import { useEffect, useState } from "react";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import type { FicheroDelProyecto } from "../tipos.js";
import { protegerDolares } from "../protegerDolares.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import { arbolDeRutas } from "../arbolDeRutas.js";
import { lenguajeDe } from "../lenguajeDe.js";
import { Arbol } from "./Arbol.js";
import { Dibujo, kb } from "./Dibujo.js";
import { Visor } from "./Visor.js";
import estilos from "./Ficheros.module.css";

/**
 * El proyecto en el que se trabaja: el árbol a la derecha con un filtro encima, y el
 * fichero elegido en el centro, de SOLO lectura.
 *
 * Lo que se lista y lo que se lee es lo que ve el agente y nada más (`.xonecode`, `.env`,
 * `.git` y los `.xml` aplanados no salen): lo decide el servidor
 * (`agent/arbolDeProyecto.ts`), no este componente. Aquí solo se pinta lo que llega y se
 * DICE lo que no se puede pintar —un binario, un fichero recortado, uno que no es UTF-8,
 * una ruta rechazada— en vez de dejar el centro en blanco.
 *
 * El árbol se pide al montar y `App` lo vuelve a pedir al terminar un turno: el agente
 * puede haber creado ficheros. Si el elegido ya no está en el árbol nuevo, se cierra: un
 * visor enseñando un fichero que ya no existe es una foto vieja sin decirlo — salvo que el
 * árbol venga RECORTADO, porque entonces la ausencia no dice nada.
 *
 * **Un fichero se enseña como lo que ES, no siempre como código.** Un proyecto XOne no es
 * solo `.xne`, `.js` y `.css`: lleva iconos, capturas, mockups y un `README.md`, y
 * enseñarlos como «es un fichero binario» o como una pared de almohadillas era decirle al
 * usuario que mirase en otro sitio.
 *   - **Imagen**: la pinta un `<img>` con una URL de datos que trae el servidor
 *     (`mime` + `base64`). Nunca se inyecta el marcado de un SVG en el DOM: un `.svg` del
 *     proyecto puede llevar un `<script>` dentro, y dentro de un `<img>` el navegador no lo
 *     ejecuta. Si la imagen pesó más del tope, el servidor manda el `mime` sin los bytes y
 *     aquí se dice eso mismo — no es «un binario cualquiera».
 *   - **El SVG enseña el dibujo Y el código, uno debajo del otro.** Es las dos cosas a la
 *     vez, y quien lo abre aquí suele estar comprobando que ese código produce ese dibujo:
 *     un interruptor escondería la mitad de la respuesta.
 *   - **El markdown sí lleva interruptor Vista/Fuente**, con la vista por omisión: el
 *     documento renderizado y su fuente son la MISMA información dos veces, y quien abre un
 *     `README` quiere leerlo.
 * Lo demás sigue igual: el código va al `Visor` con su resaltador, y lo que no se puede
 * enseñar se DICE.
 */
export function Ficheros({
  arbol,
  contenidos,
  elegido,
  alElegir,
  alRecargar,
  conectado,
}: {
  /** Ausente = todavía no ha llegado; con `error`, no se pudo listar. */
  arbol?: { rutas: string[]; recortado: boolean; error?: string };
  contenidos: Record<string, FicheroDelProyecto>;
  elegido?: string;
  alElegir: (ruta: string | undefined) => void;
  alRecargar: () => void;
  /** ¿Hay cable? Sin él no se pide nada: la petición se perdería sin decirlo. */
  conectado?: boolean;
}) {
  /**
   * Se pide el árbol siempre que NO se tenga, no solo al montar.
   *
   * Al montar era lo que había, y se quedaba colgado en «Consultando el árbol…» para
   * siempre en cuanto el store tiraba el árbol sin que este componente se desmontara —que
   * es justo lo que pasa **al cambiar de proyecto**: la sesión activa es otra, `store.ts`
   * tira `arbol` y `contenidos` (y hace bien: son del proyecto anterior), la pestaña sigue
   * delante y nadie volvía a preguntar. Medido en el navegador con dos proyectos.
   *
   * `conectado` está en las dependencias por el otro caso de la misma forma: al caerse el
   * cable el store también tira el árbol, y sin esto la reconexión no lo recuperaría —el
   * árbol seguiría ausente y el efecto no tendría por qué volver a correr—. El guardia
   * evita además pedirlo mientras no hay a quién pedírselo.
   *
   * No hay lazo posible: la respuesta define `arbol` —también cuando trae `error`— y el
   * efecto no vuelve a disparar.
   */
  useEffect(() => {
    if (conectado === false || arbol !== undefined) return;
    alRecargar();
  }, [arbol, conectado, alRecargar]);

  // Con el árbol RECORTADO no se cierra: la lista no es el proyecto entero, así que «no
  // está en el árbol» no significa «ya no existe». Un fichero real más allá del tope se
  // cerraría solo, y el usuario vería desaparecer lo que estaba leyendo sin motivo.
  useEffect(() => {
    if (
      elegido !== undefined &&
      arbol !== undefined &&
      arbol.error === undefined &&
      !arbol.recortado &&
      !arbol.rutas.includes(elegido)
    ) {
      alElegir(undefined);
    }
  }, [arbol, elegido, alElegir]);

  const [filtro, setFiltro] = useState("");
  // Renderizado o fuente, para lo que tiene las dos caras. Se recuerda al cambiar de
  // fichero a propósito: quien se pasó a la fuente de un `.md` está leyendo fuentes, y
  // devolverle la vista en el siguiente sería deshacerle la elección cada vez.
  const [cara, setCara] = useState<"vista" | "fuente">("vista");

  if (arbol === undefined) {
    return <p className={estilos.aviso}>Consultando el árbol del proyecto…</p>;
  }
  if (arbol.error !== undefined) {
    return <p className={estilos.aviso}>No se ha podido listar el proyecto: {arbol.error}</p>;
  }

  const contenido = elegido === undefined ? undefined : contenidos[elegido];
  const lenguaje = elegido === undefined ? undefined : lenguajeDe(elegido);
  // Hay dibujo si el servidor mandó el MIME Y los bytes. Sin bytes (pasó del tope) no hay
  // nada que pintar, aunque se sepa que es una imagen.
  const hayDibujo = contenido?.mime !== undefined && contenido.base64 !== undefined;
  // **El SVG enseña las DOS cosas a la vez, y no un interruptor**: es un dibujo y es
  // código, y quien abre uno en esta pestaña suele estar comprobando justamente que el
  // código de al lado produce ese dibujo. Obligar a alternar esconde la mitad de la
  // respuesta. Un PNG no tiene código que enseñar y un `.md` sí es lo uno O lo otro —el
  // documento renderizado y su fuente son la misma información dos veces—, así que el
  // interruptor se queda solo para el markdown.
  const svgConDibujo = hayDibujo && contenido?.mime === "image/svg+xml" && contenido.texto !== undefined;
  const dosCaras = contenido?.error === undefined && contenido?.texto !== undefined && lenguaje === "markdown";
  // Una imagen que NO es un SVG con fuente ocupa el visor entera: no hay otra cara a la que ir.
  const soloDibujo = hayDibujo && !svgConDibujo;

  return (
    <div className={estilos.ficheros}>
      <div className={estilos.visor}>
        {elegido === undefined ? (
          <p className={estilos.aviso}>Elige un fichero del árbol.</p>
        ) : (
          <>
            <div className={estilos.cabecera}>
              <span className={estilos.ruta}>{elegido}</span>
              {dosCaras ? (
                <div className={estilos.caras} role="group" aria-label="Cómo se enseña el fichero">
                  {(["vista", "fuente"] as const).map((cual) => (
                    <button
                      key={cual}
                      type="button"
                      className={estilos.cara}
                      // `aria-pressed` y no `aria-current`: son dos interruptores de un
                      // mismo grupo, no la posición dentro de una lista.
                      aria-pressed={cara === cual}
                      data-activa={cara === cual ? "" : undefined}
                      onClick={() => setCara(cual)}
                    >
                      {cual === "vista" ? "Vista" : "Fuente"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {contenido === undefined ? (
              <p className={estilos.aviso}>Trayendo {elegido}…</p>
            ) : contenido.error !== undefined ? (
              <p className={estilos.aviso}>No se puede enseñar este fichero: {contenido.error}.</p>
            ) : soloDibujo ? (
              <Dibujo mime={contenido.mime!} base64={contenido.base64!} alt={elegido} bytes={contenido.bytes} />
            ) : contenido.mime !== undefined && contenido.base64 === undefined && contenido.binario ? (
              // Se sabe que es una imagen aunque sus bytes no hayan viajado: eso es lo que
              // el `mime` a secas significa, y decir «un binario» sería perder el dato.
              <p className={estilos.aviso}>
                Es una imagen de {kb(contenido.bytes)} KB: pesa más de lo que se trae por el cable, así que no se
                enseña. Ábrela en tu editor.
              </p>
            ) : contenido.binario ? (
              <p className={estilos.aviso}>
                Es un fichero binario, {kb(contenido.bytes)} KB. No se enseña su contenido.
              </p>
            ) : (
              <>
                {/* El SVG: primero el dibujo, y debajo su código. Las dos caras a la vez. */}
                {svgConDibujo ? (
                  <>
                    <Dibujo mime={contenido.mime!} base64={contenido.base64!} alt={elegido} bytes={contenido.bytes} />
                    <p className={estilos.rotulo}>Código</p>
                  </>
                ) : null}
                {contenido.recortado ? (
                  <p className={estilos.nota}>
                    Recortado a {kb(contenido.texto?.length ?? 0)} KB de {kb(contenido.bytes)} KB: míralo entero en tu editor.
                  </p>
                ) : null}
                {contenido.codificacion === "latin1" ? (
                  <p className={estilos.nota}>Leído como latin1: el fichero no es UTF-8.</p>
                ) : null}
                {lenguaje === "markdown" && cara === "vista" ? (
                  // El mismo renderizador que el chat, con los dólares escapados por lo
                  // mismo (`protegerDolares.ts`): en un `.md` de un proyecto XOne aparece
                  // `$http`, y sin escapar se lo come el lector de TeX. `md-cuerpo` es la
                  // clase global que pinta el cuerpo (`estilos/markdown.css`).
                  <div className={`${estilos.markdown} md-cuerpo`}>
                    <MarkdownText text={protegerDolares(contenido.texto ?? "")} codeLabels={ETIQUETAS_DE_CODIGO} />
                  </div>
                ) : (
                  <Visor texto={contenido.texto ?? ""} {...(lenguaje === undefined ? {} : { lenguaje })} />
                )}
              </>
            )}
          </>
        )}
      </div>

      <aside className={estilos.arbol} aria-label="Ficheros del proyecto">
        <input
          type="search"
          className={estilos.filtro}
          placeholder="Filtrar ficheros…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          aria-label="Filtrar ficheros"
        />
        {arbol.recortado ? (
          <p className={estilos.nota}>El árbol está recortado a {arbol.rutas.length} entradas.</p>
        ) : null}
        {/* Todo plegado: esto es el proyecto ENTERO, y con el primer nivel abierto se abría
            como una lista de cien ficheros. En Revisión, que enseña solo lo que la sesión
            tocó, la omisión del componente sigue valiendo. */}
        <Arbol
          nodos={arbolDeRutas(arbol.rutas)}
          {...(elegido === undefined ? {} : { elegida: elegido })}
          alElegir={alElegir}
          filtro={filtro}
          abiertas="ninguna"
        />
      </aside>
    </div>
  );
}
