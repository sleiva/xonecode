import { lazy, Suspense, useEffect, useState } from "react";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import { vistaParaElVisor } from "../imagenesDelDocumento.js";
import type { FicheroDelProyecto } from "../tipos.js";
import { protegerDolares } from "../protegerDolares.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import { arbolDeRutas } from "../arbolDeRutas.js";
import { lenguajeDe } from "../lenguajeDe.js";
import { Arbol } from "./Arbol.js";
import { Dibujo, kb } from "./Dibujo.js";
import { Visor } from "./Visor.js";
import estilos from "./Ficheros.module.css";
import { esEditable, motivoParaNoEditar } from "../edicion.js";
import { metadatosDelFichero } from "../tipoDeFichero.js";
import { IconoDeFichero } from "./IconoDeFichero.js";
import type { ControlDeEdicion } from "../usarEdicion.js";

/**
 * El editor, en DIFERIDO: CodeMirror solo se descarga al pulsar «Editar». Es la única puerta a
 * `editor/` desde fuera de él (`editor/frontera.test.ts`).
 */
const EditorDeFichero = lazy(() => import("../editor/EditorDeFichero.js"));

/**
 * El proyecto en el que se trabaja: el árbol a la derecha con un filtro encima, y el
 * fichero elegido en el centro, que se lee y, si es texto entero (UTF-8 o latin1), se EDITA
 * (`edicion`, cuyo estado vive en `App`: ver `usarEdicion.ts`).
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
  linea,
  edicion,
  cambiados,
  alPedirCambios,
}: {
  /** Ausente = todavía no ha llegado; con `error`, no se pudo listar. */
  arbol?: { rutas: string[]; recortado: boolean; error?: string };
  contenidos: Record<string, FicheroDelProyecto>;
  elegido?: string;
  alElegir: (ruta: string | undefined) => void;
  alRecargar: () => void;
  /** ¿Hay cable? Sin él no se pide nada: la petición se perdería sin decirlo. */
  conectado?: boolean;
  /**
   * La línea a la que se llega desde un hallazgo del verificador (1-based). Es del fichero
   * ELEGIDO: quien la pone y la quita es `App`, junto con él. Solo la usa el visor de código;
   * en la vista renderizada de un `.md` no hay líneas que numerar.
   */
  linea?: number;
  /** La edición (`usarEdicion.ts`), de `App`. Ausente = esta pestaña no edita y no hay «Editar». */
  edicion?: ControlDeEdicion;
  /** Lo que la sesión cambió según Revisión (las `M` del árbol). Ausente = no se sabe, y no se pinta ninguna. */
  cambiados?: ReadonlySet<string>;
  /** Pedir esa lista: se llama al montar si no se tiene, como el árbol. */
  alPedirCambios?: () => void;
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

  // Las `M` del árbol salen de la MISMA lista que Revisión, y se piden igual que el árbol: cuando no
  // se tienen (al montar, o porque el store las tiró al cambiar de sesión) y hay cable.
  useEffect(() => {
    if (conectado === false || cambiados !== undefined) return;
    alPedirCambios?.();
  }, [cambiados, conectado, alPedirCambios]);

  /**
   * Una edición con cambios cuyo proyecto ya NO es el abierto (`usarEdicion.ts#proyectoCambiado`).
   * El árbol y `elegido` son ya del proyecto nuevo —el store tiró el árbol al cambiar, y el que
   * llega no tiene por qué traer esa ruta—, así que la edición se enseña SOLA, sin el árbol, hasta
   * que se copie y se descarte: si dependiera de ellos, «Consultando el árbol…» la escondería y el
   * cierre de abajo sacaría el diálogo de «Cambios sin guardar» sin que nadie lo pidiera.
   */
  const huerfana = edicion?.actual?.proyectoCambiado === true ? edicion.actual : undefined;

  // Con el árbol RECORTADO no se cierra: la lista no es el proyecto entero, así que «no
  // está en el árbol» no significa «ya no existe». Un fichero real más allá del tope se
  // cerraría solo, y el usuario vería desaparecer lo que estaba leyendo sin motivo. Con una
  // edición huérfana tampoco: se cierra cuando se descarte (por eso va en las dependencias).
  useEffect(() => {
    if (
      huerfana === undefined &&
      elegido !== undefined &&
      arbol !== undefined &&
      arbol.error === undefined &&
      !arbol.recortado &&
      !arbol.rutas.includes(elegido)
    ) {
      alElegir(undefined);
    }
  }, [arbol, elegido, alElegir, huerfana]);

  const [filtro, setFiltro] = useState("");
  // Renderizado o fuente, para lo que tiene las dos caras. Se recuerda al cambiar de
  // fichero a propósito: quien se pasó a la fuente de un `.md` está leyendo fuentes, y
  // devolverle la vista en el siguiente sería deshacerle la elección cada vez.
  const [cara, setCara] = useState<"vista" | "fuente">("vista");

  if (huerfana !== undefined && edicion !== undefined) {
    const lenguajeHuerfano = lenguajeDe(huerfana.ruta);
    return (
      <div className={estilos.caja}>
        <div className={estilos.ficheros}>
          <div className={estilos.visor} data-editando="">
            <div className={estilos.cabecera}>
              <RutaDelFichero
                ruta={huerfana.ruta}
                sinGuardar
                metadatos={metadatosDelFichero(huerfana.ruta, comoFichero(huerfana.ruta, huerfana.original), huerfana.finDeLinea)}
              />
              <div className={estilos.acciones}>
                <button type="button" className={estilos.accionPrincipal} disabled>
                  Guardar
                </button>
              </div>
            </div>
            <div className={estilos.banda} role="alert">
              <span>El proyecto abierto ya no es este: guardar está desactivado. Copia tus cambios o descártalos.</span>
              <button type="button" className={estilos.accion} onClick={edicion.descartar}>
                Descartar
              </button>
            </div>
            <Suspense fallback={<p className={estilos.aviso}>Cargando el editor…</p>}>
              <EditorDeFichero
                key={`${huerfana.ruta}:${huerfana.generacion}`}
                texto={edicion.textoVivo()}
                {...(lenguajeHuerfano === undefined ? {} : { lenguaje: lenguajeHuerfano })}
                baseElegida={edicion.baseElegida}
                alCambiar={edicion.cambiar}
                alGuardar={edicion.guardar}
                alElegirBase={edicion.elegirBase}
              />
            </Suspense>
          </div>
        </div>
      </div>
    );
  }
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
  // Editando ESTE fichero: el editor sustituye al visor, y su estado manda sobre `contenido`
  // (que el store tira sin cable, y no por eso se pierde lo tecleado).
  const actual = edicion?.actual !== undefined && edicion.actual.ruta === elegido ? edicion.actual : undefined;

  return (
    // La caja de fuera es la que declara el CONTENEDOR de la consulta; `.ficheros` es su
    // hija porque una `@container` no puede estilar al elemento que la declara.
    <div className={estilos.caja}>
    <div className={estilos.ficheros}>
      <div className={estilos.visor} data-editando={actual !== undefined ? "" : undefined}>
        {elegido === undefined ? (
          <p className={estilos.aviso}>Elige un fichero del árbol.</p>
        ) : (
          <>
            <div className={estilos.cabecera}>
              <RutaDelFichero
                ruta={elegido}
                sinGuardar={actual?.sucio === true}
                metadatos={
                  // Editando, el contenido del store puede faltar (se tira sin cable) y el final de
                  // línea es el que la edición guardó aparte; sin editar, lo que llegó del disco.
                  actual === undefined
                    ? metadatosDelFichero(elegido, contenido)
                    : metadatosDelFichero(elegido, contenido ?? comoFichero(elegido, actual.original), actual.finDeLinea)
                }
              />
              {actual !== undefined && edicion !== undefined ? (
                <div className={estilos.acciones}>
                  <button
                    type="button"
                    className={estilos.accionPrincipal}
                    disabled={!actual.sucio || actual.guardando || actual.proyectoCambiado === true}
                    onClick={edicion.guardar}
                  >
                    {actual.guardando ? "Guardando…" : "Guardar"}
                  </button>
                  <button type="button" className={estilos.accion} onClick={edicion.cerrar}>
                    Cerrar
                  </button>
                </div>
              ) : (
                <div className={estilos.acciones}>
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
                  {/* Un control sin dato detrás no se pinta: sin `edicion`, o con un fichero que no
                      es texto entero, no hay botón — pero se DICE por qué (`motivoParaNoEditar`):
                      que desaparezca sin más parecía un fallo. */}
                  {edicion !== undefined && esEditable(contenido) ? (
                    <button type="button" className={estilos.accion} onClick={() => edicion.abrir(contenido)}>
                      Editar
                    </button>
                  ) : edicion !== undefined && motivoParaNoEditar(contenido) !== undefined ? (
                    <span className={estilos.motivoSinEditar}>{motivoParaNoEditar(contenido)}</span>
                  ) : null}
                </div>
              )}
            </div>
            {actual !== undefined && edicion !== undefined ? (
              <>
                {actual.proyectoCambiado === true ? (
                  <div className={estilos.banda} role="alert">
                    <span>El proyecto abierto ya no es este: guardar está desactivado. Copia tus cambios o descártalos.</span>
                    <button type="button" className={estilos.accion} onClick={edicion.descartar}>
                      Descartar
                    </button>
                  </div>
                ) : null}
                {actual.versionNueva !== undefined ? (
                  <div className={estilos.banda} role="alert">
                    <span>El fichero ha cambiado en el disco mientras lo editabas.</span>
                    <button type="button" className={estilos.accion} onClick={edicion.recargar}>
                      Recargar (pierdes los tuyos)
                    </button>
                    <button type="button" className={estilos.accion} onClick={edicion.seguirConLosMios}>
                      Seguir con los míos
                    </button>
                  </div>
                ) : null}
                {actual.sobrescribe === true ? (
                  <p className={estilos.banda} role="status">
                    Seguir con los míos: al guardar, tu versión sustituirá a la del disco
                  </p>
                ) : null}
                {actual.error !== undefined ? (
                  <p className={estilos.fallo} role="alert">
                    No se ha guardado: {actual.error}
                  </p>
                ) : null}
                <Suspense fallback={<p className={estilos.aviso}>Cargando el editor…</p>}>
                  <EditorDeFichero
                    // Otra `generacion` es otro texto venido de fuera (abrir, recargar): se remonta.
                    key={`${actual.ruta}:${actual.generacion}`}
                    texto={edicion.textoVivo()}
                    {...(lenguaje === undefined ? {} : { lenguaje })}
                    {...(edicion.base === undefined ? {} : { base: edicion.base })}
                    baseElegida={edicion.baseElegida}
                    alCambiar={edicion.cambiar}
                    alGuardar={edicion.guardar}
                    alElegirBase={edicion.elegirBase}
                  />
                </Suspense>
              </>
            ) : contenido === undefined ? (
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
                  // clase global que pinta el cuerpo (`estilos/markdown.css`). Con imágenes del
                  // proyecto se pinta su VISTA, con cada imagen pedida a la ruta que la sirve
                  // (`imagenesDelDocumento.ts`): enlazadas en relativo salían rotas.
                  <div className={`${estilos.markdown} md-cuerpo`}>
                    <MarkdownText
                      text={protegerDolares(
                        contenido.vista === undefined ? (contenido.texto ?? "") : vistaParaElVisor(contenido.vista, window.location.origin)
                      )}
                      codeLabels={ETIQUETAS_DE_CODIGO}
                    />
                  </div>
                ) : (
                  <Visor
                    texto={contenido.texto ?? ""}
                    {...(lenguaje === undefined ? {} : { lenguaje })}
                    {...(linea === undefined ? {} : { linea })}
                  />
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
          {...(cambiados === undefined && actual?.sucio !== true
            ? {}
            : {
                insignia: (ruta: string) =>
                  ruta === actual?.ruta && actual.sucio ? (
                    <span className={estilos.marcaDelArbol} aria-label="Sin guardar en el editor">●</span>
                  ) : cambiados?.has(ruta) === true ? (
                    <span className={estilos.marcaDelArbol} data-marca="cambiada" aria-label="Cambiado en la sesión">M</span>
                  ) : null,
              })}
        />
      </aside>
    </div>
    </div>
  );
}

/**
 * Lo que la edición sabe de su fichero, con la forma de uno llegado del disco. La codificación NO:
 * se edita en UTF-8 y en latin1 (`edicion.ts#esEditable`), y afirmar «UTF-8» de un latin1 sería
 * falso; ausente, la línea de metadatos no la nombra.
 */
function comoFichero(ruta: string, texto: string): FicheroDelProyecto {
  return { ruta, texto, recortado: false, binario: false, bytes: 0 };
}

/**
 * La ruta del fichero abierto en la cabecera: su icono, la carpeta en terciario, «/» y el nombre en
 * 600 —el nombre es lo que se busca con la vista; la carpeta, el contexto—, el «●» de sin guardar al
 * lado, y debajo la línea de lo que se SABE del contenido (`metadatosDelFichero`). Sin nada que
 * decir, la línea no se pinta.
 */
function RutaDelFichero({ ruta, sinGuardar, metadatos }: { ruta: string; sinGuardar: boolean; metadatos: readonly string[] }) {
  const corte = ruta.lastIndexOf("/");
  return (
    <div className={estilos.titulo} data-cabecera-del-fichero="">
      <IconoDeFichero ruta={ruta} tamano={24} />
      <div className={estilos.textos}>
        <span className={estilos.ruta}>
          {corte === -1 ? null : (
            <>
              <span className={estilos.carpetaDeRuta} data-parte="carpeta">
                {ruta.slice(0, corte)}
              </span>
              <span className={estilos.separador}>/</span>
            </>
          )}
          <span className={estilos.nombreDeRuta} data-parte="nombre">
            {ruta.slice(corte + 1)}
          </span>
          {sinGuardar ? (
            <span className={estilos.sinGuardar} aria-label="Hay cambios sin guardar" title="Hay cambios sin guardar">
              ●
            </span>
          ) : null}
        </span>
        {metadatos.length === 0 ? null : (
          <span className={estilos.metadatos} data-metadatos="">
            {metadatos.join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}
