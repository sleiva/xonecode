import { useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  AutenticacionDeConector,
  ConectorDelCable,
  DefinicionDeConector,
  FilaDeCatalogo,
} from "../tipos.js";
import { esAutenticacionDeConector } from "../tipos.js";
import { IconoDeConector } from "./IconoDeConector.js";
import { Pregunta } from "./Pregunta.js";
import { AVISO_DE_URL, urlDeEntornoAceptable } from "./Wizard.js";
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
 * - **El icono es la MARCA del servicio cuando la hay, y un monograma cuando no.** Los tres del
 *   catálogo la tienen, copiada del catálogo de TrueForge —que la sirve desde su servidor de
 *   assets, así que aquí es un fichero empaquetado y nunca un `<img>` a un CDN—; un conector que
 *   se añada mañana sin marca cae en el monograma, derivado del `nombre` que ya viaja por el
 *   cable. El porqué de los dos carriles, en `IconoDeConector.tsx`.
 * - **Un servidor escrito a mano es una DEFINICIÓN, y de ahí para abajo nada lo distingue de
 *   una fila del catálogo**: se añade, se prueba, se autoriza, se desconecta y se quita igual,
 *   porque el servidor resuelve las dos familias a la misma fila. «Añadir servidor» despliega
 *   un formulario EN LÍNEA —los cuatro campos del diálogo de la maqueta, el `select` de
 *   autenticación y la nota de DCR—, y el id **no se teclea**: lo deriva el servidor del
 *   nombre, como en un proveedor personalizado. El detalle que gobierna esto es que **la clave
 *   no está en el formulario**: «Clave de API» es un TIPO de autenticación y la clave se pide
 *   DESPUÉS, por la costura que este repo ya tiene para eso (`Consola.leerSecreto`), que es el
 *   único mensaje del cable que la lleva.
 *
 * La pastilla de estado tiene CINCO valores y el orden de la comprobación importa: `prueba.ok`
 * manda sobre todo lo demás —si acaba de responder, eso es lo que se enseña—, luego
 * `autorizando` (hay un navegador esperando), luego `falta-autorizar` (el disco dice que no
 * hay tokens), luego `prueba.ok === false` (la última vez que se probó, no respondió) y solo
 * si nada de eso aplica, «Sin probar»: ausente ≠ fallo, es que nadie ha preguntado.
 */

export interface PropsDeConectores {
  /** El catálogo entero —las filas de código MÁS las definiciones—, sin `url`: no hace falta en
   *  pantalla y así no hay una ruta remota que discutir por el cable. */
  catalogo: FilaDeCatalogo[];
  /** Los que esta consola tiene AÑADIDOS. */
  conectores: ConectorDelCable[];
  /** Ids del fichero en disco que esta versión no reconoce (un catálogo más viejo). */
  desconocidos: string[];
  /** El fichero de conectores no se pudo leer: no se ha tocado, y `conectores` llega vacío. */
  ilegible?: true;
  /** La frase de la última operación que falló (añadir, quitar, probar, autorizar…). */
  error?: string;
  alAccion: (accion: "anadir" | "quitar" | "probar" | "autorizar" | "desconectar", id: string) => void;
  /**
   * Da de alta un servidor escrito a mano. Va SEPARADO de `alAccion` y no como un séptimo
   * valor suyo: es la única acción que no lleva `id` —el id lo deriva el servidor del
   * nombre—, así que fundirlas obligaría a un segundo parámetro que para cinco de las seis
   * acciones no existe, y a comprobar de qué forma es en cada llamada.
   */
  alCrear: (definicion: DefinicionDeConector) => void;
  /**
   * La pregunta que esta sección está esperando: la clave de un conector `api-key`. La pinta
   * SOLO si fue esta sección la que la pidió (ver `pidiendoClave`), y no por el mero hecho de
   * que haya una en vuelo: mientras Ajustes está abierto el centro no pinta ninguna
   * (`App.tsx`), así que una pregunta vieja de otra sección —o una del alta— aparecería aquí
   * como si fuera de un conector.
   */
  secreto?: string;
  /**
   * Manda la respuesta de esa pregunta y la retira. Es el MISMO `alResponderSecreto` que usa la
   * fila de un proveedor: un solo camino para el único mensaje del cable que lleva una
   * credencial.
   */
  alResponderSecreto: (valor: string) => void | Promise<unknown>;
}

/**
 * La etiqueta de cada carril de autenticación, y **el ORDEN de este objeto es el orden del
 * desplegable de «Añadir servidor»** (`AUTENTICACIONES`): primero lo que no pide nada, luego la
 * clave y luego el navegador. Derivar las opciones de aquí y no de una segunda lista es lo que
 * impide que un carril nuevo tenga etiqueta y no se pueda elegir — el `Record` obliga a la
 * etiqueta, la lista no.
 */
const ETIQUETA_DE_AUTENTICACION: Record<AutenticacionDeConector, string> = {
  ninguna: "Sin autenticación",
  "api-key": "Clave de API",
  oauth: "OAuth",
};

/** Las tres, en el orden en que se ofrecen. Ver la cabecera de `ETIQUETA_DE_AUTENTICACION`. */
const AUTENTICACIONES: readonly AutenticacionDeConector[] = ["ninguna", "api-key", "oauth"];

export function Conectores({
  catalogo,
  conectores,
  desconocidos,
  ilegible,
  error,
  alAccion,
  alCrear,
  secreto,
  alResponderSecreto,
}: PropsDeConectores) {
  const [abierto, setAbierto] = useState<string | undefined>(undefined);
  const [anadiendo, setAnadiendo] = useState(false);
  /**
   * Esta sección está esperando la pregunta de una clave, PORQUE la provocó ella. Nace en los
   * tres sitios que la provocan —el «Añadir» de una fila del catálogo, el «Conectar» de una ya
   * añadida y el alta de un servidor a mano— y muere al contestarla.
   *
   * **Es lo que impide que la pregunta se le atribuya a un conector cuando no es suya.** Con
   * Ajustes abierto el centro no pinta ninguna (`App.tsx` la calla a propósito), así que sin
   * esta marca una pregunta en vuelo de OTRA sección —la clave de un proveedor de modelo, la
   * de un alta— aparecería aquí debajo como si fuera de un conector. El carril de la clave es
   * el único que pregunta al usuario en esta ventana, y su dueño tiene que estar declarado.
   */
  const [pidiendoClave, setPidiendoClave] = useState(false);
  /**
   * Cuántos conectores había cuando se envió el formulario, o `undefined` si no se ha enviado.
   * Es lo que decide CUÁNDO se cierra, y no es al enviar: el servidor puede rechazar la
   * definición —un nombre repetido, el fichero ilegible, una URL que aquí pasa y allí no— y
   * cerrar en ese momento tiraría los cuatro campos que alguien acaba de teclear. Se cierra
   * cuando lo añadido CRECE, que es el hecho de que salió bien.
   */
  const [enviado, setEnviado] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (enviado !== undefined && conectores.length > enviado) {
      setAnadiendo(false);
      setEnviado(undefined);
    }
  }, [enviado, conectores.length]);

  const porId = new Map(catalogo.map((c) => [c.id, c]));
  const idsAnadidos = new Set(conectores.map((c) => c.id));
  const disponibles = catalogo.filter((c) => !idsAnadidos.has(c.id));

  /**
   * Marca que la sección está esperando una clave, si es que el carril de ese conector la pide.
   * Se llama ANTES de mandar la intención, porque lo que se declara es lo que va a pasar: el
   * servidor decide por su lado si de verdad pregunta (un `api-key` sin clave la pide; un
   * `oauth` abre un navegador), y aquí solo se lee la fila del catálogo para saber cuál de los
   * dos carriles es. Si el servidor no pregunta —un `api-key` que ya tenía clave— la marca se
   * queda puesta sin pregunta detrás y no pinta nada: el render exige `secreto !== undefined`.
   */
  const esperarClaveSiEsApiKey = (autenticacion: AutenticacionDeConector | undefined): void => {
    if (autenticacion === "api-key") setPidiendoClave(true);
  };

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
                  alAccion={(accion) => {
                    // «Conectar» de una fila ya añadida es la SEGUNDA puerta que pide una
                    // clave, y es la que se usa cuando la del alta se contestó mal o se cerró
                    // Ajustes a mitad. Se declara aquí y no dentro de la fila para que las
                    // tres puertas pasen por la misma función.
                    if (accion === "autorizar") esperarClaveSiEsApiKey(porId.get(c.id)?.autenticacion);
                    alAccion(accion, c.id);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* La clave de un conector `api-key`, y SOLO si fue esta sección la que la pidió: ver
          `pidiendoClave`. Va entre los dos grupos porque es la continuación del gesto —se
          pulsa «Añadir» o «Conectar» arriba y la pregunta cae aquí—, y con `anidado` para no
          traer su propio marco: ya está dentro de la tarjeta de Ajustes, igual que la fila de
          un proveedor. Al responder se retira la marca, que es lo que apaga la pregunta; el
          `secreto` de verdad lo limpia `alResponderSecreto` en el store. */}
      {pidiendoClave && secreto !== undefined ? (
        <div ref={traerALaVista}>
          <Pregunta
            texto={secreto}
            oculta
            anidado
            alResponder={async (valor) => {
              await alResponderSecreto(valor);
              setPidiendoClave(false);
            }}
          />
        </div>
      ) : null}

      <section>
        <h3 className={estilos.grupo}>Disponibles · {disponibles.length}</h3>
        {/* Añadir un servidor a mano es una TAREA: mientras dura, la sección enseña solo el
            formulario. Mismo molde —y mismo motivo— que el alta de un proveedor personalizado
            en `Ajustes.tsx`: un formulario al final de una lista queda fuera de la vista justo
            después de pulsar el botón que lo abre. */}
        {anadiendo ? (
          <FormularioDeAlta
            alCerrar={() => {
              setAnadiendo(false);
              setEnviado(undefined);
            }}
            alCrear={(definicion) => {
              setEnviado(conectores.length);
              esperarClaveSiEsApiKey(definicion.autenticacion);
              alCrear(definicion);
            }}
          />
        ) : (
          <>
            {disponibles.length === 0 ? (
              <p className={estilos.vacio}>Ya has añadido todo el catálogo.</p>
            ) : (
              <ul className={estilos.filas}>
                {disponibles.map((c) => (
                  <li key={c.id} className={estilos.fila}>
                    <div className={estilos.cabeceraDeFila}>
                      <IconoDeConector id={c.id} nombre={c.nombre} className={estilos.icono} />
                      <span className={estilos.nombre}>{c.nombre}</span>
                      <span className={estilos.autenticacion}>{ETIQUETA_DE_AUTENTICACION[c.autenticacion]}</span>
                      <span className={estilos.relleno} />
                      <button
                        type="button"
                        className={estilos.accionDeFila}
                        onClick={() => {
                          // Un conector que pide autorización hace las DOS cosas al añadirse:
                          // añadir Y autorizar. Medido en el navegador con él delante:
                          // separarlas en dos clics dejaba un paso intermedio, «Falta
                          // autorizar», que se leía como un error y no como «pulsa Conectar».
                          // `anadir` va primero por orden natural de lectura, pero son dos
                          // `POST /accion` sin garantía de orden entre ellos — la que de
                          // verdad sostiene esto es el SERVIDOR: `autorizar` rechaza sin tocar
                          // la red si el id no está en lo añadido (`servicioDeConectores.ts`),
                          // así que un `anadir` que falla —fichero ilegible, disco lleno— no
                          // deja una autorización completándose para un conector que la lista
                          // nunca mostró como añadido. Sin autenticación no hay nada que
                          // autorizar, así que DeepWiki se queda con el único `anadir` de
                          // siempre.
                          alAccion("anadir", c.id);
                          if (c.autenticacion !== "ninguna") {
                            esperarClaveSiEsApiKey(c.autenticacion);
                            alAccion("autorizar", c.id);
                          }
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
            {/* Debajo de la lista aunque esté VACÍA: «ya has añadido todo el catálogo» habla de
                las tres filas de código, y un servidor propio sigue siendo posible — es de
                hecho el único caso en el que este botón es lo que hay que pulsar. */}
            <div className={estilos.botones}>
              <Button variant="outline" className={estilos.accion} onClick={() => setAnadiendo(true)}>
                Añadir servidor
              </Button>
            </div>
          </>
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
  entrada?: FilaDeCatalogo;
  abierta: boolean;
  alAbrir: () => void;
  alAccion: (accion: "quitar" | "probar" | "autorizar" | "desconectar") => void;
}) {
  const nombre = entrada?.nombre ?? conector.id;
  const pastilla = pastillaDe(conector);
  // «Pide autorización» son DOS carriles y no uno: un OAuth pide un navegador y un `api-key`
  // pide una clave, pero para esta fila son la misma pregunta —¿hay algo que conceder y algo
  // que retirar?—, y de ella salen los dos botones. El que no lleva autenticación pasa directo
  // a «autorizado» y nunca los ve. Ausente cae del lado conservador, que es el que deja el
  // botón alcanzable.
  const pideAutorizacion = entrada?.autenticacion !== "ninguna";

  return (
    <li className={estilos.fila}>
      <div className={estilos.cabeceraDeFila}>
        {/* La marca la ata el ID y el monograma sale del nombre: ver `IconoDeConector.tsx`. */}
        <IconoDeConector id={conector.id} nombre={nombre} className={estilos.icono} />
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
        {pideAutorizacion && conector.estado !== "autorizado" ? (
          // Sigue AHÍ mientras se espera al navegador, con otro rótulo: es como se recupera
          // quien cerró la pestaña de la autorización a medias.
          <button type="button" className={estilos.accionDeFila} onClick={() => alAccion("autorizar")}>
            {conector.autorizando === true ? "Volver a abrir" : "Conectar"}
          </button>
        ) : null}
        <button type="button" className={clsx(estilos.accionDeFila, estilos.exito)} onClick={() => alAccion("probar")}>
          Probar
        </button>
        {pideAutorizacion && conector.estado === "autorizado" ? (
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

/**
 * Traer el formulario a la vista al montarse, que es lo que se pierde al abrir algo al final de
 * una lista. La guarda del `typeof` es obligatoria: **jsdom no implementa `scrollIntoView`**, así
 * que sin ella cualquier test que abra el formulario revienta con «is not a function». Es la
 * misma guarda —y la misma trampa— que `Ajustes.tsx#traerALaVista` documenta.
 */
function traerALaVista(nodo: HTMLElement | null): void {
  if (nodo !== null && typeof nodo.scrollIntoView === "function") {
    nodo.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/**
 * El alta de un servidor MCP escrito a mano: los cuatro campos del diálogo de la maqueta, el
 * `select` de autenticación y la nota del OAuth manual. En LÍNEA y no en un modal aunque la
 * maqueta sea un modal: en esta ventana TODOS los formularios son en línea, y el único modal del
 * repo (`Pregunta.tsx`) existe por un motivo que aquí no aplica —en el chat la tarjeta caía al
 * fondo de una columna flex, pegada al compositor—.
 *
 * Tres cosas que no son de forma:
 *
 * - **La clave NO está aquí, y eso es el diseño.** «Clave de API» es un TIPO de autenticación: la
 *   clave se pide DESPUÉS, al añadirlo, por `leerSecreto` — el único mensaje del cable que la
 *   lleva. Un campo más en este formulario sería un segundo camino para una credencial, y el
 *   segundo camino es justo el que se olvida de la criba.
 * - **El id no se teclea**: lo DERIVA el servidor del nombre, con la misma regla de slug que un
 *   proveedor personalizado. Por eso lo que sale de aquí es una definición SIN id.
 * - **La URL se comprueba AQUÍ y no se manda si no pasa** (`urlDeEntornoAceptable`, la copia
 *   declarada de la regla de `core/modelos.ts`): el servidor la rechazaría igual —la guarda es
 *   fail-closed y no se apoya en esto—, pero un viaje de ida y vuelta para una frase que ya se
 *   sabe es un viaje que no hacía falta.
 *
 * El rechazo del servidor —un nombre repetido, el fichero ilegible— **no se pinta aquí**: sale en
 * la banda de `error` de la sección, que ya existe, y el formulario se queda abierto con lo
 * tecleado dentro. La misma frase en dos sitios se lee como dos fallos.
 */
function FormularioDeAlta({
  alCerrar,
  alCrear,
}: {
  alCerrar: () => void;
  alCrear: (definicion: DefinicionDeConector) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [url, setUrl] = useState("");
  const [autenticacion, setAutenticacion] = useState<AutenticacionDeConector>("ninguna");
  /** La frase de lo que no pasa la comprobación LOCAL. Lo que conteste el servidor va a `error`. */
  const [problema, setProblema] = useState<string | undefined>(undefined);

  const incompleto = nombre.trim() === "" || descripcion.trim() === "" || url.trim() === "";

  const enviar = (evento: FormEvent): void => {
    evento.preventDefault();
    // El botón ya está apagado con un campo vacío; esto es la segunda llave, porque un `disabled`
    // es presentación y el `onSubmit` es lo que manda.
    if (incompleto) return;
    if (!urlDeEntornoAceptable(url.trim())) {
      setProblema(AVISO_DE_URL);
      return;
    }
    setProblema(undefined);
    alCrear({ nombre: nombre.trim(), descripcion: descripcion.trim(), url: url.trim(), autenticacion });
  };

  return (
    <form className={estilos.formulario} ref={traerALaVista} onSubmit={enviar}>
      <p className={estilos.nota}>Apunta a un endpoint MCP remoto: después se comporta como cualquier otro conector.</p>

      <label className={estilos.etiqueta} htmlFor="conector-nombre">
        Nombre
      </label>
      <Input
        id="conector-nombre"
        className={estilos.campo}
        value={nombre}
        placeholder="Mi servidor MCP"
        onChange={(e) => setNombre(e.target.value)}
      />

      <label className={estilos.etiqueta} htmlFor="conector-descripcion">
        Descripción
      </label>
      <Input
        id="conector-descripcion"
        className={estilos.campo}
        value={descripcion}
        placeholder="Qué ofrece: es lo que se lee en la lista"
        onChange={(e) => setDescripcion(e.target.value)}
      />

      <label className={estilos.etiqueta} htmlFor="conector-url">
        URL
      </label>
      <Input
        id="conector-url"
        className={estilos.campo}
        value={url}
        placeholder="https://mcp.ejemplo.com/mcp"
        onChange={(e) => {
          setUrl(e.target.value);
          // El aviso se retira AL CORREGIR el campo del que habla, y solo ese campo: es la
          // única frase que puede haber aquí, y dejarla puesta mientras se teclea una URL que
          // ya es buena deja en pantalla un aviso de algo que ya no pasa — que es como se
          // enseña a no mirarlos. No se convierte en una comprobación en vivo: quien juzga
          // sigue siendo el `submit`, y esto solo retira lo que él dijo.
          setProblema(undefined);
        }}
      />

      <label className={estilos.etiqueta} htmlFor="conector-autenticacion">
        Autenticación
      </label>
      <select
        id="conector-autenticacion"
        className={estilos.selector}
        value={autenticacion}
        onChange={(e) => {
          // El `select` no puede mentir sobre el literal: si el valor no es uno de los tres, se
          // queda el que había. Mismo molde que la guarda del store, y por lo mismo — el
          // desplegable se pinta de lo que devuelve el catálogo, no de lo que llegue por el cable.
          const elegido = e.target.value;
          if (esAutenticacionDeConector(elegido)) setAutenticacion(elegido);
        }}
      >
        {AUTENTICACIONES.map((a) => (
          <option key={a} value={a}>
            {ETIQUETA_DE_AUTENTICACION[a]}
          </option>
        ))}
      </select>

      <p className={estilos.nota}>
        {autenticacion === "api-key"
          ? "La clave se pide después, al añadirlo: así viaja por el único mensaje que lleva credenciales."
          : "OAuth aquí es solo iniciar sesión: el cliente se registra solo. Todavía no se admite OAuth manual con client id y secret."}
      </p>

      {problema !== undefined ? (
        <p className={estilos.aviso} role="alert">
          {problema}
        </p>
      ) : null}

      <div className={estilos.botones}>
        <Button variant="outline" className={estilos.accion} onClick={alCerrar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" className={estilos.principal} disabled={incompleto}>
          Añadir
        </Button>
      </div>
    </form>
  );
}
