import { useEffect, useState } from "react";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import type { FicheroDelProyecto } from "../tipos.js";
import { protegerDolares } from "../protegerDolares.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import { lenguajeDe } from "../lenguajeDe.js";
import { Dibujo, kb } from "./Dibujo.js";
import { Visor } from "./Visor.js";
import estilos from "./Artefactos.module.css";

/** El prefijo virtual con el que el agente los escribe (`core/artefactos.ts`). */
const PREFIJO = "/artefactos/";

/**
 * Un artefacto tal como lo conoce el cliente: lo que ya trae su ACTO del transcript.
 *
 * La lista no se pide: sale de los actos, que llevan ruta, nombre, peso y mime y sobreviven
 * a reabrir la sesión (van en el `.jsonl`). Preguntarle al disco cuáles hay sería una
 * segunda fuente para lo mismo, y podría contradecir a la conversación que se está leyendo.
 */
export interface ArtefactoEnLista {
  /** La ruta VIRTUAL, `/artefactos/<nombre>`: es la clave de todo. */
  ruta: string;
  nombre: string;
  bytes: number;
  /** Por extensión, o ausente si no se sabe. Nunca se adivina (`core/artefactos.ts`). */
  mime?: string;
}

/** El nombre que se le manda al servidor: la ruta sin el prefijo, así que un artefacto en
 *  una subcarpeta también se pide bien — el `nombre` del acto es solo el último segmento. */
const parametroDe = (ruta: string): string =>
  ruta.startsWith(PREFIJO) ? ruta.slice(PREFIJO.length) : ruta;

/** La URL de la ruta HTTP. El nombre va escapado: un `+` en una query se lee como espacio,
 *  así que sin escapar se pediría otro fichero. */
export function urlDeArtefacto(ruta: string, descargar = false): string {
  return `/artefacto?n=${encodeURIComponent(parametroDe(ruta))}${descargar ? "&descargar=1" : ""}`;
}

/**
 * Lo que el agente DIBUJÓ en esta sesión: diagramas, paneles, capturas, informes.
 *
 * No son ficheros del proyecto —viven en `.xonecode/sesiones/<id>/artefactos/`, no entran en
 * git y no suben a CloudStudio—, y por eso se escriben SIN aprobación. Hasta ahora la
 * consola decía dónde estaban y nada más: había que salir a abrir el fichero desde el disco,
 * que es justo lo que hace que nadie mire lo único que se escribió sin que nadie lo
 * aprobara.
 *
 * **El HTML se pinta en un iframe SANDBOXEADO, y ahí está toda la decisión.** Lo escribió un
 * modelo: servirlo en el mismo origen que tiene la cookie del token sería darle la consola
 * entera —un `fetch("/accion")` desde dentro podría abrir un proyecto o pedir una clave—.
 * Con `sandbox="allow-scripts"` y SIN `allow-same-origin` el documento tiene un origen
 * opaco: no ve la cookie, no ve a este padre, y sus peticiones salen con `Origin: null`, que
 * el servidor ya rechaza. Las dos mitades importan: `allow-scripts` es lo que deja correr un
 * diagrama de Mermaid, y `allow-same-origin` al lado anularía el sandbox entero. La segunda
 * capa la pone la respuesta (`Content-Security-Policy: sandbox allow-scripts`), que cubre lo
 * que este atributo no puede: abrir esa URL en una pestaña del navegador.
 *
 * Cada tipo se enseña como lo que ES, con las mismas reglas que la pestaña Ficheros:
 *   - **HTML**: iframe, con interruptor a su FUENTE — son la misma información dos veces, y
 *     la vista no gasta cable porque el iframe pide el documento por HTTP.
 *   - **Imagen**: un `<img>` con URL de datos, nunca el marcado inyectado en el DOM (un SVG
 *     puede traer un `<script>`, y dentro de un `<img>` no se ejecuta). El SVG enseña además
 *     su código debajo: quien lo abre está comprobando que ese código da ese dibujo.
 *   - **Markdown**: renderizado, con interruptor a la fuente y los dólares protegidos.
 *   - **Texto, JSON, CSV**: el visor con su resaltador.
 *   - **Lo que no sabemos enseñar**: se DICE, y se descarga. Adivinar el tipo es cómo un
 *     fichero cualquiera acaba interpretándose como HTML.
 */
export function Artefactos({
  lista,
  contenidos,
  elegido,
  alElegir,
  alPedir,
  conectado,
}: {
  lista: ArtefactoEnLista[];
  /** Los contenidos ya traídos, por ruta virtual. */
  contenidos: Record<string, FicheroDelProyecto>;
  elegido?: string;
  alElegir: (ruta: string | undefined) => void;
  /** Pide el contenido por el cable, por su nombre. */
  alPedir: (nombre: string) => void;
  /** ¿Hay cable? Sin él no se pide nada: la petición se perdería sin decirlo. */
  conectado?: boolean;
}) {
  // Renderizado o fuente, para lo que tiene las dos caras. Se recuerda al cambiar de
  // artefacto, igual que en Ficheros: quien se pasó a la fuente está leyendo fuentes.
  const [cara, setCara] = useState<"vista" | "fuente">("vista");

  const actual = lista.find((a) => a.ruta === elegido);

  /**
   * Sin elegido, se abre el ÚLTIMO: es el que se acaba de dibujar, y es lo que se viene a
   * ver. Y un elegido que ya no está en la lista se suelta —cambió la sesión— en vez de
   * dejar el visor enseñando una foto de la conversación anterior.
   */
  useEffect(() => {
    if (lista.length === 0) return;
    if (elegido === undefined) {
      alElegir(lista[lista.length - 1]!.ruta);
      return;
    }
    if (!lista.some((a) => a.ruta === elegido)) alElegir(undefined);
  }, [lista, elegido, alElegir]);

  const mime = actual?.mime;
  const esHtml = mime === "text/html";
  const esImagen = mime !== undefined && mime.startsWith("image/");
  const esMarkdown = mime === "text/markdown";
  const esTexto = mime === "text/plain" || mime === "application/json" || mime === "text/csv";
  const sabemosEnsenar = esHtml || esImagen || esMarkdown || esTexto;
  const contenido = elegido === undefined ? undefined : contenidos[elegido];

  /**
   * El contenido se pide solo cuando hace falta ENSEÑARLO por el cable.
   *
   * La vista de un HTML no lo necesita: el iframe pide el documento por HTTP, y mandar
   * además los cientos de kilobytes de un panel por el cable sería pagarlos dos veces. Su
   * FUENTE sí, y solo cuando se pulsa. Lo que no sabemos enseñar tampoco: no hay visor al
   * que darle el texto, y solo queda la descarga.
   */
  const necesitaContenido = sabemosEnsenar && !(esHtml && cara === "vista");

  useEffect(() => {
    if (conectado === false || elegido === undefined || !necesitaContenido) return;
    if (contenidos[elegido] !== undefined) return;
    alPedir(parametroDe(elegido));
  }, [conectado, elegido, necesitaContenido, contenidos, alPedir]);

  // Hay dibujo si el servidor mandó el MIME Y los bytes. Sin bytes (pasó del tope) se sabe
  // que es una imagen y no hay nada que pintar, que es otra cosa que decir.
  const hayDibujo = contenido?.mime !== undefined && contenido.base64 !== undefined;
  const svgConDibujo = hayDibujo && contenido?.mime === "image/svg+xml" && contenido.texto !== undefined;
  const soloDibujo = hayDibujo && !svgConDibujo;
  const dosCaras = esHtml || (esMarkdown && contenido?.error === undefined);

  if (lista.length === 0) {
    return (
      <p className={estilos.aviso}>
        Esta sesión no ha dejado ningún artefacto todavía. Los dibuja el agente cuando le
        pides un diagrama, un panel o un informe.
      </p>
    );
  }

  return (
    <div className={estilos.artefactos}>
      <div className={estilos.visor}>
        {actual === undefined ? (
          <p className={estilos.aviso}>Elige un artefacto de la lista.</p>
        ) : (
          <>
            <div className={estilos.cabecera}>
              <span className={estilos.nombre}>{actual.nombre}</span>
              <div className={estilos.mandos}>
                {dosCaras ? (
                  <div className={estilos.caras} role="group" aria-label="Cómo se enseña el artefacto">
                    {(["vista", "fuente"] as const).map((cual) => (
                      <button
                        key={cual}
                        type="button"
                        className={estilos.cara}
                        aria-pressed={cara === cual}
                        data-activa={cara === cual ? "" : undefined}
                        onClick={() => setCara(cual)}
                      >
                        {cual === "vista" ? "Vista" : "Fuente"}
                      </button>
                    ))}
                  </div>
                ) : null}
                {/* Descargar está SIEMPRE, y es lo único que funciona para todos los tipos.
                    Va por la misma ruta HTTP con `descargar=1`, que contesta con
                    `Content-Disposition: attachment` y sin adivinar el tipo. */}
                <a className={estilos.descargar} href={urlDeArtefacto(actual.ruta, true)} download={actual.nombre}>
                  Descargar
                </a>
              </div>
            </div>

            {esHtml && cara === "vista" ? (
              <div className={estilos.marco}>
                {/* Ver la cabecera del componente: `allow-scripts` sin `allow-same-origin`. */}
                <iframe
                  className={estilos.iframe}
                  src={urlDeArtefacto(actual.ruta)}
                  title={actual.nombre}
                  sandbox="allow-scripts"
                />
                <p className={estilos.nota}>
                  Corre aislado: no puede hablar con la consola ni leer tus datos. Las skills que
                  lo escriben cargan tipografías y diagramas de un CDN, así que{" "}
                  <strong>sin conexión no se ve entero</strong>.
                </p>
              </div>
            ) : !sabemosEnsenar ? (
              <p className={estilos.aviso}>
                No se sabe enseñar este artefacto aquí ({kb(actual.bytes)} KB): no reconocemos su
                tipo, y adivinarlo sería peor que decirlo. Descárgalo para abrirlo con tu editor.
              </p>
            ) : contenido === undefined ? (
              <p className={estilos.aviso}>Trayendo {actual.nombre}…</p>
            ) : contenido.error !== undefined ? (
              <p className={estilos.aviso}>No se puede enseñar este artefacto: {contenido.error}.</p>
            ) : soloDibujo ? (
              <Dibujo mime={contenido.mime!} base64={contenido.base64!} alt={actual.nombre} bytes={contenido.bytes} />
            ) : contenido.mime !== undefined && contenido.base64 === undefined && contenido.binario ? (
              <p className={estilos.aviso}>
                Es una imagen de {kb(contenido.bytes)} KB: pesa más de lo que se trae por el cable.
                Descárgala para verla.
              </p>
            ) : contenido.binario ? (
              <p className={estilos.aviso}>
                Son {kb(contenido.bytes)} KB de datos binarios. No se enseña su contenido.
              </p>
            ) : (
              <>
                {svgConDibujo ? (
                  <>
                    <Dibujo mime={contenido.mime!} base64={contenido.base64!} alt={actual.nombre} bytes={contenido.bytes} />
                    <p className={estilos.rotulo}>Código</p>
                  </>
                ) : null}
                {contenido.recortado ? (
                  <p className={estilos.nota}>
                    Recortado a {kb(contenido.texto?.length ?? 0)} KB de {kb(contenido.bytes)} KB:
                    descárgalo para verlo entero.
                  </p>
                ) : null}
                {esMarkdown && cara === "vista" ? (
                  <div className={`${estilos.markdown} md-cuerpo`}>
                    <MarkdownText text={protegerDolares(contenido.texto ?? "")} codeLabels={ETIQUETAS_DE_CODIGO} />
                  </div>
                ) : (
                  <Visor
                    texto={contenido.texto ?? ""}
                    {...(lenguajeDe(actual.nombre) === undefined ? {} : { lenguaje: lenguajeDe(actual.nombre)! })}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      <aside className={estilos.lista} aria-label="Artefactos de la sesión">
        {lista.map((a) => (
          <button
            key={a.ruta}
            type="button"
            className={estilos.fila}
            // Dos señales y no una, como la sesión activa de la barra: el fondo solo no
            // basta cuando la fila de al lado está en `:hover` con ese mismo alias.
            aria-current={a.ruta === elegido || undefined}
            data-elegido={a.ruta === elegido ? "" : undefined}
            onClick={() => alElegir(a.ruta)}
          >
            <span className={estilos.filaNombre}>{a.nombre}</span>
            <span className={estilos.filaPeso}>{kb(a.bytes)} KB</span>
          </button>
        ))}
        <p className={estilos.nota}>
          Viven con esta sesión: no entran en git ni suben a CloudStudio, y se van si la
          borras.
        </p>
      </aside>
    </div>
  );
}
