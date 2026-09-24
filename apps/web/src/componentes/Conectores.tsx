import { useState } from "react";
import clsx from "clsx";
import type { AutenticacionDeConector, ConectorDelCable } from "../tipos.js";
import { IconoDeConector } from "./IconoDeConector.js";
import estilos from "./Conectores.module.css";

/**
 * La sección de conectores MCP de la ventana de ajustes, debajo de Skills.
 *
 * Un conector es un servidor MCP REMOTO con el que esta consola se conecta: hoy solo eso —
 * conectar y probar—, y el propio catálogo lo dice al pie de la ventana: **todavía no llegan
 * a ningún agente**. Es la mitad que faltaba de la pieza siguiente, y esta ventana no
 * pretende ser más que la configuración.
 *
 * Dos cosas que no son de forma:
 *
 * - **DOS grupos siempre visibles, no dos pestañas.** «Configurados» y «Disponibles»
 *   contestan preguntas distintas —qué tengo y qué podría añadir— y en una lista de tres
 *   conectores del catálogo no hay tanto que esconder detrás de una pestaña. Es la misma
 *   decisión que separa Ficheros de Revisión: dos listas que se leen juntas.
 * - **El icono es un MONOGRAMA propio, no un logo copiado.** `IconoDeProveedor` copia ocho
 *   trazados a mano porque su catálogo es fijo y con licencia que revisar; el de conectores
 *   crece con una fila de una tabla (`core/conectores.ts#CATALOGO_DE_CONECTORES`), así que un
 *   servidor MCP nuevo no puede esperar a que alguien le dibuje un logo aquí.
 *
 * La pastilla de estado tiene CINCO valores y el orden de la comprobación importa: `prueba.ok`
 * manda sobre todo lo demás —si acaba de responder, eso es lo que se enseña—, luego
 * `autorizando` (hay un navegador esperando), luego `falta-autorizar` (el disco dice que no
 * hay tokens), luego `prueba.ok === false` (la última vez que se probó, no respondió) y solo
 * si nada de eso aplica, «Sin probar»: ausente ≠ fallo, es que nadie ha preguntado.
 */

export interface PropsDeConectores {
  /** El catálogo entero, sin `url`: no hace falta en pantalla y así no hay una ruta remota
   *  que discutir por el cable. */
  catalogo: { id: string; nombre: string; descripcion: string; autenticacion: AutenticacionDeConector }[];
  /** Los que esta consola tiene AÑADIDOS. */
  conectores: ConectorDelCable[];
  /** Ids del fichero en disco que esta versión no reconoce (un catálogo más viejo). */
  desconocidos: string[];
  /** El fichero de conectores no se pudo leer: no se ha tocado, y `conectores` llega vacío. */
  ilegible?: true;
  /** La frase de la última operación que falló (añadir, quitar, probar, autorizar…). */
  error?: string;
  alAccion: (accion: "anadir" | "quitar" | "probar" | "autorizar" | "desconectar", id: string) => void;
}

const ETIQUETA_DE_AUTENTICACION: Record<AutenticacionDeConector, string> = {
  ninguna: "Sin autenticación",
  oauth: "OAuth",
};

export function Conectores({ catalogo, conectores, desconocidos, ilegible, error, alAccion }: PropsDeConectores) {
  const [abierto, setAbierto] = useState<string | undefined>(undefined);

  const porId = new Map(catalogo.map((c) => [c.id, c]));
  const idsAnadidos = new Set(conectores.map((c) => c.id));
  const disponibles = catalogo.filter((c) => !idsAnadidos.has(c.id));

  return (
    <>
      {/* Un catálogo más viejo que el fichero en disco: quien tiene que arreglarlo está
          mirando esta ventana. No se pintan como filas —no hay `nombre` ni `descripcion`
          que enseñar de un id que esta versión no conoce. */}
      {desconocidos.length > 0 ? (
        <p className={estilos.problemas} role="alert">
          En tu configuración hay conectores que esta versión no conoce: {desconocidos.join(", ")}.
        </p>
      ) : null}

      {error !== undefined ? (
        <p className={estilos.estado} role="status">
          {error}
        </p>
      ) : null}

      {ilegible === true ? (
        // Ausente ≠ vacío: con el fichero ilegible no se afirma «Configurados · 0», que
        // sería una cuenta MEDIDA sobre un fichero que no se pudo leer.
        <p className={estilos.estado} role="status">
          No se pudo leer tu <code>conectores.json</code>: no se ha tocado; revísalo o bórralo.
        </p>
      ) : (
        <section>
          <h3 className={estilos.grupo}>Configurados · {conectores.length}</h3>
          {conectores.length === 0 ? (
            <p className={estilos.vacio}>Ninguno todavía: añade uno de los disponibles.</p>
          ) : (
            <ul className={estilos.filas}>
              {conectores.map((c) => (
                <FilaDeConector
                  key={c.id}
                  conector={c}
                  entrada={porId.get(c.id)}
                  abierta={abierto === c.id}
                  alAbrir={() => setAbierto((previo) => (previo === c.id ? undefined : c.id))}
                  alAccion={(accion) => alAccion(accion, c.id)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h3 className={estilos.grupo}>Disponibles · {disponibles.length}</h3>
        {disponibles.length === 0 ? (
          <p className={estilos.vacio}>Ya has añadido todo el catálogo.</p>
        ) : (
          <ul className={estilos.filas}>
            {disponibles.map((c) => (
              <li key={c.id} className={estilos.fila}>
                <div className={estilos.cabeceraDeFila}>
                  <IconoDeConector nombre={c.nombre} className={estilos.monograma} />
                  <span className={estilos.nombre}>{c.nombre}</span>
                  <span className={estilos.autenticacion}>{ETIQUETA_DE_AUTENTICACION[c.autenticacion]}</span>
                  <span className={estilos.relleno} />
                  <button
                    type="button"
                    className={estilos.accionDeFila}
                    onClick={() => {
                      // Con OAuth, «Añadir» hace las DOS cosas: añadir Y autorizar. Medido en
                      // el navegador con él delante: separarlas en dos clics dejaba un paso
                      // intermedio, «Falta autorizar», que se leía como un error y no como
                      // «pulsa Conectar». `anadir` va primero por orden natural de lectura, pero
                      // son dos `POST /accion` sin garantía de orden entre ellos — la que de
                      // verdad sostiene esto es el SERVIDOR: `autorizar` rechaza sin tocar la
                      // red si el id no está en lo añadido (`servicioDeConectores.ts`), así que
                      // un `anadir` que falla —fichero ilegible, disco lleno— no deja un OAuth
                      // real completándose para un conector que la lista nunca mostró como
                      // añadido. Sin OAuth no hay nada que autorizar, así que DeepWiki se queda
                      // con el único `anadir` de siempre.
                      alAccion("anadir", c.id);
                      if (c.autenticacion === "oauth") alAccion("autorizar", c.id);
                    }}
                  >
                    Añadir
                  </button>
                </div>
                <p className={estilos.descripcion}>{c.descripcion}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Las dos notas de límite, al PIE: lo primero que hay que ver al abrir la sección es
          lo que hay y lo que se puede añadir, no el aviso. */}
      <p className={estilos.nota}>
        Estos conectores todavía no llegan a ningún agente: aquí se conectan y se prueban.
      </p>
      <p className={estilos.nota}>
        La autorización se abre en el navegador de la máquina donde corre la consola; por un
        túnel no vuelve.
      </p>
    </>
  );
}

/**
 * La pastilla de un conector, y el ORDEN en que se decide: ver la cabecera del fichero.
 *
 * `motivo` SOLO viaja en la rama `noResponde`: una prueba vieja con `ok:false` no se pisa
 * cuando `autorizando` o `falta-autorizar` ya cambiaron la historia —un Jira recién pedido
 * sin tokens todavía arrastraba «falta autorizar» de la ÚLTIMA prueba fallida, y un conector
 * que se acaba de mandar a autorizar podía enseñar un «no responde (HTTP 503)» de ayer bajo
 * «Esperando al navegador…»—. La pastilla que gana es la única que puede hablar.
 */
function pastillaDe(conector: ConectorDelCable): { texto: string; clase: string; motivo?: string } {
  if (conector.prueba !== undefined && conector.prueba.ok) {
    return { texto: `Conectado · ${conector.prueba.tools.length} tools`, clase: estilos.conectado };
  }
  if (conector.autorizando === true) {
    return { texto: "Esperando al navegador…", clase: estilos.esperando };
  }
  if (conector.estado === "falta-autorizar") {
    return { texto: "Falta autorizar", clase: estilos.faltaAutorizar };
  }
  if (conector.prueba !== undefined && !conector.prueba.ok) {
    return { texto: "No responde", clase: estilos.noResponde, motivo: conector.prueba.motivo };
  }
  return { texto: "Sin probar", clase: estilos.sinProbar };
}

function FilaDeConector({
  conector,
  entrada,
  abierta,
  alAbrir,
  alAccion,
}: {
  conector: ConectorDelCable;
  /** Ausente solo si el catálogo y lo añadido han divergido — defensivo, no se espera. */
  entrada?: { id: string; nombre: string; descripcion: string; autenticacion: AutenticacionDeConector };
  abierta: boolean;
  alAbrir: () => void;
  alAccion: (accion: "quitar" | "probar" | "autorizar" | "desconectar") => void;
}) {
  const nombre = entrada?.nombre ?? conector.id;
  const pastilla = pastillaDe(conector);
  // Solo el OAuth tiene autorización que pedir o retirar: el que no lleva autenticación pasa
  // directo a «autorizado» y nunca ve estos dos botones.
  const esOauth = entrada?.autenticacion === "oauth";

  return (
    <li className={estilos.fila}>
      <div className={estilos.cabeceraDeFila}>
        <IconoDeConector nombre={nombre} className={estilos.monograma} />
        <span className={estilos.nombre}>{nombre}</span>
        <span
          className={clsx(estilos.pastilla, pastilla.clase)}
          {...(pastilla.motivo === undefined ? {} : { title: pastilla.motivo })}
        >
          {pastilla.texto}
        </span>
        <span className={estilos.relleno} />
        <button type="button" className={estilos.accionDeFila} aria-expanded={abierta} onClick={alAbrir}>
          {abierta ? "Ocultar" : "Ver"}
        </button>
        {esOauth && conector.estado !== "autorizado" ? (
          // Sigue AHÍ mientras se espera al navegador, con otro rótulo: es como se recupera
          // quien cerró la pestaña de la autorización a medias.
          <button type="button" className={estilos.accionDeFila} onClick={() => alAccion("autorizar")}>
            {conector.autorizando === true ? "Volver a abrir" : "Conectar"}
          </button>
        ) : null}
        <button type="button" className={estilos.accionDeFila} onClick={() => alAccion("probar")}>
          Probar
        </button>
        {esOauth && conector.estado === "autorizado" ? (
          <button type="button" className={estilos.accionDeFila} onClick={() => alAccion("desconectar")}>
            Desconectar
          </button>
        ) : null}
        <button type="button" className={estilos.accionDeFila} onClick={() => alAccion("quitar")}>
          Quitar
        </button>
      </div>

      {entrada !== undefined ? <p className={estilos.descripcion}>{entrada.descripcion}</p> : null}

      {/* El motivo del «No responde», bajo la fila y no solo en el `title` de la pastilla:
          un `title` no lo lee nadie que no pase el ratón por encima. Sale de la MISMA
          pastilla —no de `conector.prueba` a pelo— para no repetir una prueba vieja que ya
          no es la que se está contando (ver el porqué en `pastillaDe`). */}
      {pastilla.motivo !== undefined ? <p className={estilos.motivo}>{pastilla.motivo}</p> : null}

      {abierta ? (
        <div className={estilos.cuerpo}>
          {conector.prueba !== undefined && conector.prueba.ok ? (
            conector.prueba.tools.length === 0 ? (
              <p className={estilos.vacio}>no expone ninguna tool</p>
            ) : (
              <ul className={estilos.tools}>
                {conector.prueba.tools.map((t) => (
                  <li key={t.nombre} className={estilos.tool}>
                    <span className={estilos.nombreDeTool}>{t.nombre}</span>
                    {t.soloLectura === true ? <span className={estilos.soloLectura}>solo lectura</span> : null}
                    {t.descripcion !== undefined ? (
                      <p className={estilos.descripcionDeTool}>{t.descripcion}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className={estilos.vacio}>Pruébalo para ver qué tools ofrece.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}
