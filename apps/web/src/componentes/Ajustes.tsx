import { useState, type FormEvent } from "react";
import { Modal, Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ProveedorDeModelos } from "../tipos.js";
import { Pregunta } from "./Pregunta.js";
import { urlDeEntornoAceptable, AVISO_DE_URL } from "./Wizard.js";
import { PROYECTOS_POR_OMISION } from "./Barra.js";
import estilos from "./Ajustes.module.css";

/**
 * La ventana de ajustes: apariencia, modelos y entornos, con la navegación a la izquierda
 * y una sola sección a la vista — la disposición del panel de ajustes del harness de
 * DeepSeek, que es de donde salió el encargo.
 *
 * **Lo que se enseña aquí tiene detrás un dato o una acción real, o no se enseña.** Es la
 * misma regla por la que el compositor no copió la pastilla de permisos: un control sin
 * nada detrás es la misma mentira que una lista vacía rellenada con un placeholder. De ahí
 * tres ausencias deliberadas:
 *
 * - **Los temas de terminal no están.** `TEMAS` (`cli/tema.ts`) son paletas ANSI para la
 *   consola de terminal; en un navegador no pintan nada. Lo que sí es real aquí es el
 *   claro/oscuro del propio cliente, que es lo que esta sección ofrece.
 * - **No hay «proveedor personalizado».** El harness lo tiene porque su adaptador `pi-ai`
 *   sabe hablar con cualquier endpoint compatible con OpenAI; aquí los proveedores son una
 *   lista CERRADA (`core/modelos.ts#PROVEEDORES`) y declarar uno a mano no llevaría a
 *   ninguna parte.
 * - **Borrar una credencial solo se ofrece si está en `auth.json`** (`enFichero`). Una que
 *   viene de una variable de entorno no la podemos quitar: desexportar la shell de nadie
 *   no está a nuestro alcance, y un botón que no puede cumplir es peor que ninguno.
 *
 * **La clave no entra en el estado de este componente.** Cambiarla manda `/provider <id>`,
 * que hace que el servidor PREGUNTE por ella (`leerSecreto`); la respuesta viaja por el
 * único mensaje del cable que la lleva. Este componente solo decide DÓNDE se pinta esa
 * pregunta: dentro de la fila que se está editando, para que no aparezca detrás de la
 * ventana.
 */
export type SeccionDeAjustes = "apariencia" | "modelos" | "entornos";

const SECCIONES: readonly { id: SeccionDeAjustes; etiqueta: string }[] = [
  { id: "apariencia", etiqueta: "Apariencia" },
  { id: "modelos", etiqueta: "Modelos" },
  { id: "entornos", etiqueta: "Entornos" },
];

export type Apariencia = "sistema" | "claro" | "oscuro";

const APARIENCIAS: readonly { id: Apariencia; etiqueta: string; detalle: string }[] = [
  { id: "sistema", etiqueta: "Como el sistema", detalle: "sigue la preferencia del navegador" },
  { id: "claro", etiqueta: "Claro", detalle: "fondo claro, siempre" },
  { id: "oscuro", etiqueta: "Oscuro", detalle: "fondo oscuro, siempre" },
];

export function Ajustes({
  proveedores = [],
  entornos = [],
  proyectos = [],
  entornoActivo,
  apariencia,
  secreto,
  alCambiarApariencia,
  alPedirClave,
  alBorrarClave,
  alRegistrarEntorno,
  alElegirProyectos,
  alResponderSecreto,
  alCerrar,
}: {
  /** Los del mensaje «modelos». Vacío = todavía no ha llegado, y se dice. */
  proveedores?: readonly ProveedorDeModelos[];
  /** Los entornos REGISTRADOS (`settings.json`), no los ofrecidos por el alta. `proyectos`
   *  es la elección de cuáles se enseñan; ausente = no se ha dicho. */
  entornos?: readonly { id: string; nombre: string; url: string; proyectos?: readonly string[] }[];
  /**
   * Los proyectos del entorno ACTIVO, tal cual los devolvió CloudStudio. Solo hay listado
   * del activo: pedir el de todos serían tantas conexiones como entornos, y hoy nada del
   * cable dice cuál está activo más allá del primero.
   */
  proyectos?: readonly { id: string; nombre: string }[];
  entornoActivo?: string;
  apariencia: Apariencia;
  /** La pregunta oculta en vuelo, si la hay: se pinta DENTRO de la fila que se edita. */
  secreto?: string;
  alCambiarApariencia: (apariencia: Apariencia) => void;
  /** Abre la petición de clave de ese proveedor (`/provider <id>` del otro lado). */
  alPedirClave: (proveedor: string) => void;
  alBorrarClave: (proveedor: string) => void;
  alRegistrarEntorno: (url: string) => void;
  /** Qué proyectos de ese entorno se enseñan en la barra. Vacío = ninguno, y es elección. */
  alElegirProyectos: (entorno: string, proyectos: string[]) => void;
  alResponderSecreto: (valor: string) => void | Promise<unknown>;
  alCerrar: () => void;
}) {
  const [seccion, setSeccion] = useState<SeccionDeAjustes>("modelos");
  /** Qué fila está pidiendo clave: es donde se pinta la pregunta del servidor. */
  const [editando, setEditando] = useState<string | undefined>(undefined);
  /** Qué fila ha pedido confirmación de borrado. Nombrar al proveedor en la pregunta es
   *  lo que impide borrar el de al lado por un clic de más. */
  const [borrando, setBorrando] = useState<string | undefined>(undefined);
  const [url, setUrl] = useState("");
  /**
   * Lo marcado ahora mismo. Arranca en la elección guardada del entorno activo y, si no hay
   * ninguna, en lo que la barra está enseñando por omisión — así la ventana refleja la
   * pantalla la primera vez en vez de contradecirla. Es estado LOCAL porque cada clic viaja
   * al servidor: esperar a que vuelva el mensaje para pintar la casilla la dejaría dando
   * saltos.
   */
  const guardados = entornos.find((e) => e.id === entornoActivo)?.proyectos;
  const [elegidos, setElegidos] = useState<string[]>(() => [
    ...(guardados ?? proyectos.slice(0, PROYECTOS_POR_OMISION).map((p) => p.id)),
  ]);
  const [avisoDeUrl, setAvisoDeUrl] = useState<string | undefined>(undefined);

  const registrar = (evento: FormEvent): void => {
    evento.preventDefault();
    if (!urlDeEntornoAceptable(url)) {
      setAvisoDeUrl(AVISO_DE_URL);
      return;
    }
    setAvisoDeUrl(undefined);
    alRegistrarEntorno(url);
    setUrl("");
  };

  return (
    // `headless` como el modal de aprobación: la cabecera y el pie que trae `Modal` no se
    // usan —la ventana tiene su propia navegación y su propio cierre—, pero `title` sigue
    // siendo obligatorio y es lo que anuncia el diálogo a un lector de pantalla.
    //
    // La CAPA y el VELO son nuestros, y no un adorno: los CSS Modules del primitivo son
    // stubs vacíos, así que su `dialog` y su máscara no traen ni posición ni tamaño. Sin
    // esto la ventana se pintaba al final del `body`, debajo de la aplicación entera —
    // montada y fuera de la vista, que desde fuera se lee como «el botón no hace nada».
    <Modal open onClose={alCerrar} title="Ajustes" headless className={estilos.capa}>
      <div
        className={estilos.velo}
        // Pinchar FUERA cierra; la comprobación de `target` es lo que distingue «fuera» de
        // «dentro», porque un clic en cualquier botón de la ventana burbujea hasta aquí.
        // Cerrar aquí no decide nada —a diferencia del modal de aprobación—, así que no
        // hace falta más ceremonia.
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) alCerrar();
        }}
      >
      <div className={estilos.ventana}>
        <nav className={estilos.navegacion} aria-label="Secciones de ajustes">
          <p className={estilos.titulo}>Ajustes</p>
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={estilos.seccion}
              data-actual={s.id === seccion ? "" : undefined}
              aria-current={s.id === seccion ? "page" : undefined}
              onClick={() => setSeccion(s.id)}
            >
              {s.etiqueta}
            </button>
          ))}
        </nav>
        <div className={estilos.panel}>
          {seccion === "apariencia" ? (
            <>
              <h2 className={estilos.encabezado}>Apariencia</h2>
              <p className={estilos.nota}>
                Solo afecta a esta ventana del navegador; se recuerda en este equipo. Los temas
                de la consola de terminal son otra cosa y se cambian ahí con «/themes».
              </p>
              <ul className={estilos.filas}>
                {APARIENCIAS.map((a) => (
                  <li key={a.id} className={estilos.fila}>
                    <span className={estilos.nombre}>{a.etiqueta}</span>
                    <span className={estilos.detalle}>{a.detalle}</span>
                    <Button
                      variant={a.id === apariencia ? "primary" : "outline"}
                      className={estilos.accion}
                      onClick={() => alCambiarApariencia(a.id)}
                    >
                      {a.id === apariencia ? "En uso" : "Usar"}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {seccion === "modelos" ? (
            <>
              <h2 className={estilos.encabezado}>Modelos</h2>
              <p className={estilos.nota}>
                La clave se guarda en el fichero de credenciales de xonecode, con permisos 0600,
                y nunca en el navegador. El modelo en uso se elige en la pastilla del compositor.
              </p>
              {proveedores.length === 0 ? (
                <p className={estilos.vacio}>Todavía no ha llegado el estado de modelos.</p>
              ) : (
                <ul className={estilos.filas}>
                  {proveedores.map((p) => (
                    <li key={p.id} className={estilos.fila} data-columna="">
                      <div className={estilos.cabeceraDeFila}>
                        {/* Sin punto para quien no necesita credencial: no hay nada que afirmar. */}
                        {p.credencial === "nativa" ? null : (
                          <span
                            className={estilos.punto}
                            data-credencial={p.credencial}
                            aria-label={p.credencial === "puesta" ? "con credencial" : "sin credencial"}
                          />
                        )}
                        <span className={estilos.nombre}>{p.id}</span>
                        <span className={estilos.detalle}>
                          {p.credencial === "nativa"
                            ? "local, no necesita clave"
                            : p.credencial === "puesta"
                              ? p.enFichero === true
                                ? "clave guardada"
                                : "clave puesta por una variable de entorno"
                              : "sin clave"}
                        </span>
                        {p.credencial === "nativa" ? null : (
                          <Button
                            variant="outline"
                            className={estilos.accion}
                            onClick={() => {
                              setBorrando(undefined);
                              setEditando(p.id);
                              alPedirClave(p.id);
                            }}
                          >
                            {p.credencial === "puesta" ? "Cambiar clave" : "Añadir clave"}
                          </Button>
                        )}
                        {p.enFichero === true ? (
                          <Button
                            variant="outline"
                            className={estilos.accion}
                            onClick={() => {
                              setEditando(undefined);
                              setBorrando(p.id);
                            }}
                          >
                            Eliminar
                          </Button>
                        ) : null}
                      </div>
                      {editando === p.id && secreto !== undefined ? (
                        <Pregunta
                          texto={secreto}
                          oculta
                          anidado
                          alResponder={async (valor) => {
                            await alResponderSecreto(valor);
                            setEditando(undefined);
                          }}
                        />
                      ) : null}
                      {borrando === p.id ? (
                        <p className={estilos.confirmacion} role="alert">
                          <span>¿Borrar la clave de {p.id} del fichero de credenciales?</span>
                          <Button
                            variant="outline"
                            className={estilos.accion}
                            onClick={() => {
                              setBorrando(undefined);
                              alBorrarClave(p.id);
                            }}
                          >
                            Borrar la de {p.id}
                          </Button>
                          <Button variant="outline" className={estilos.accion} onClick={() => setBorrando(undefined)}>
                            Cancelar
                          </Button>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}

          {seccion === "entornos" ? (
            <>
              <h2 className={estilos.encabezado}>Entornos de CloudStudio</h2>
              <p className={estilos.nota}>
                Un entorno es un servidor CloudStudio. Lo único que se teclea es su URL: el nombre
                lo dice el propio servidor al conectarse.
              </p>
              {entornos.length === 0 ? (
                <p className={estilos.vacio}>No hay ninguno registrado todavía.</p>
              ) : (
                <ul className={estilos.filas}>
                  {entornos.map((e) => (
                    <li key={e.id} className={estilos.fila}>
                      <span className={estilos.nombre}>{e.nombre}</span>
                      <span className={estilos.detalle}>{e.url}</span>
                    </li>
                  ))}
                </ul>
              )}
              {/*
                Qué proyectos se enseñan, del entorno activo. La casilla marcada es lo que
                se ve en la barra; sin ninguna elección hecha se marcan los que la barra
                está enseñando por omisión, para que la primera vez la ventana refleje la
                pantalla en vez de contradecirla.
              */}
              {entornoActivo !== undefined && proyectos.length > 0 ? (
                <>
                  <h3 className={estilos.subencabezado}>Proyectos en la barra</h3>
                  <p className={estilos.nota}>
                    Sin elegir ninguno se enseñan los {PROYECTOS_POR_OMISION} primeros. Lo que marques
                    aquí manda sobre ese tope.
                  </p>
                  <ul className={estilos.filas}>
                    {proyectos.map((p) => (
                      <li key={p.id} className={estilos.fila}>
                        <label className={estilos.casilla}>
                          <input
                            type="checkbox"
                            checked={elegidos.includes(p.id)}
                            onChange={(e) => {
                              const siguiente = e.target.checked
                                ? [...elegidos, p.id]
                                : elegidos.filter((id) => id !== p.id);
                              setElegidos(siguiente);
                              alElegirProyectos(entornoActivo, siguiente);
                            }}
                          />
                          <span className={estilos.nombre}>{p.nombre}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {/*
                Registrar reutiliza el MISMO camino que el paso de entorno del alta
                (`{clase:"alta", paso:"entorno"}`): id y nombre vacíos, que los deduce el
                servidor. Un segundo camino para registrar lo mismo es cómo divergen.
              */}
              <form className={estilos.formulario} onSubmit={registrar}>
                <label className={estilos.etiqueta} htmlFor="ajustes-url">
                  URL del MCP
                </label>
                <Input
                  id="ajustes-url"
                  className={estilos.campo}
                  value={url}
                  placeholder="https://mcp.ejemplo.com/mcp"
                  onChange={(e) => setUrl(e.target.value)}
                />
                {avisoDeUrl !== undefined ? (
                  <p className={estilos.aviso} role="alert">
                    {avisoDeUrl}
                  </p>
                ) : null}
                <Button type="submit" variant="primary" className={estilos.accion}>
                  Registrar
                </Button>
              </form>
            </>
          ) : null}
        </div>
        <button type="button" className={estilos.cerrar} aria-label="Cerrar ajustes" onClick={alCerrar}>
          ✕
        </button>
      </div>
      </div>
    </Modal>
  );
}
