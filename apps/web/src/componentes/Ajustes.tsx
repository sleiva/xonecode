import { useState, type FormEvent } from "react";
import {
  Modal,
  Button,
  Input,
  IconSettingsOutline16,
  IconSparkle16,
  IconDarkOutline16,
  IconLightOutline16,
  IconFollowsystemOutline16,
  IconDataOutline16,
  IconUserOutline16,
  IconLinkOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  AgenteDelCable,
  AjustesDeDispositivos,
  Dispositivo,
  Herramienta,
  InformeDeDispositivos,
  NombreDeHerramienta,
  PlataformaDeDispositivo,
  ProveedorDeModelos,
} from "../tipos.js";
import { seMira } from "../tipos.js";
import { ETIQUETA_DE_ESTADO, inventario } from "../inventarioDeDispositivos.js";
import { Agentes } from "./Agentes.js";
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
export type SeccionDeAjustes = "apariencia" | "modelos" | "entornos" | "agentes" | "dispositivos";

/**
 * Las tres secciones, en el orden del rediseño —Modelos primero, que además es la que se
 * abre por omisión— y cada una con su icono.
 *
 * Los iconos son de la librería de primitivas y están comprobados uno a uno contra los
 * exports de `lib/index.js`: `Cabecera.tsx` documenta el día que se montó uno que el
 * paquete NO exporta y React reventó con «Element type is invalid». Y son los que
 * SIGNIFICAN lo que hay detrás, no los que se parecen al dibujo del mockup: `IconSparkle16`
 * para los modelos, la luna para el claro/oscuro, y el de datos para los servidores MCP.
 */
const SECCIONES: readonly {
  id: SeccionDeAjustes;
  etiqueta: string;
  Icono: typeof IconSparkle16;
}[] = [
  // «Proveedores» y no «Modelos»: la sección gestiona CREDENCIALES, y su propio texto lo
  // confesaba («el modelo en uso se elige en la pastilla del compositor»).
  { id: "modelos", etiqueta: "Proveedores", Icono: IconSparkle16 },
  { id: "apariencia", etiqueta: "Apariencia", Icono: IconDarkOutline16 },
  { id: "entornos", etiqueta: "Entornos", Icono: IconDataOutline16 },
  { id: "agentes", etiqueta: "Subagentes", Icono: IconUserOutline16 },
  // `IconLinkOutline16` y no un icono de móvil: en el paquete instalado no hay ninguno
  // —comprobado sobre sus exports, que es la lección de `IconAgentPresetOutline16`, el que
  // no existía y hacía reventar a React—. Y el enlace dice lo que esta sección es: con qué
  // se conecta esta consola para probar la app.
  { id: "dispositivos", etiqueta: "Dispositivos", Icono: IconLinkOutline16 },
];

/**
 * Los cuatro destinos, con la herramienta que los descubre y qué se puede decir de cada
 * uno. El texto de la herramienta no es decoración: es lo que explica por qué un destino
 * encendido puede seguir sin enseñar nada («adb no está instalado»).
 */
const DESTINOS: readonly {
  id: PlataformaDeDispositivo;
  etiqueta: string;
  detalle: string;
  /** Las herramientas que hay que mirar para saber si este destino puede funcionar. */
  herramientas: readonly Herramienta["nombre"][];
  plataforma: Dispositivo["plataforma"];
  clases: readonly Dispositivo["clase"][];
}[] = [
  { id: "android", etiqueta: "Android", detalle: "teléfonos y tablets por USB o por red, con adb", herramientas: ["adb"], plataforma: "android", clases: ["fisico"] },
  { id: "androidEmulador", etiqueta: "Android Sim", detalle: "los AVD del emulador del SDK", herramientas: ["emulator", "adb"], plataforma: "android", clases: ["emulador"] },
  { id: "ios", etiqueta: "iOS", detalle: "iPhone y iPad conectados, con devicectl (Xcode 15+)", herramientas: ["devicectl"], plataforma: "ios", clases: ["fisico"] },
  { id: "iosSimulador", etiqueta: "iOS Sim", detalle: "los simuladores de Xcode, con simctl", herramientas: ["xcrun"], plataforma: "ios", clases: ["simulador"] },
];

/**
 * Los REQUISITOS: las herramientas del equipo, que son otra cosa que los destinos. Un
 * destino se elige; un requisito está o no está, y si no está se instala. Mezclarlos en una
 * sola lista era lo que hacía que «Android Sim · emulator no está instalada» pareciera un
 * ajuste que se puede cambiar con el interruptor de al lado.
 */
const REQUISITOS: readonly { nombre: Herramienta["nombre"]; etiqueta: string; para: string }[] = [
  { nombre: "adb", etiqueta: "adb", para: "hablar con teléfonos, tablets y emuladores de Android" },
  { nombre: "emulator", etiqueta: "emulator", para: "listar y arrancar los AVD del SDK de Android" },
  { nombre: "xcrun", etiqueta: "Xcode command line tools", para: "los simuladores de iOS (simctl)" },
  { nombre: "devicectl", etiqueta: "devicectl", para: "los iPhone y iPad conectados (Xcode 15+)" },
];

/** La hora de la foto. Si el ISO no parsea se enseña tal cual: inventar una hora es peor. */
function horaDe(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Qué se dice de una herramienta en la fila de su destino. */
const ETIQUETA_DE_HERRAMIENTA: Record<Herramienta["estado"], string> = {
  ok: "disponible",
  "no-encontrada": "no está instalada",
  fallo: "falló",
  "no-aplica": "no aplica en este sistema",
  desactivada: "no se ha mirado",
};

export type Apariencia = "sistema" | "claro" | "oscuro";

/* Los tres iconos existen en la librería y dicen exactamente esto —seguir al sistema, claro
   y oscuro—, así que no hay que aproximar ninguno con un dibujo parecido. */
const APARIENCIAS: readonly {
  id: Apariencia;
  etiqueta: string;
  detalle: string;
  Icono: typeof IconSparkle16;
}[] = [
  {
    id: "sistema",
    etiqueta: "Como el sistema",
    detalle: "sigue la preferencia del navegador",
    Icono: IconFollowsystemOutline16,
  },
  { id: "claro", etiqueta: "Claro", detalle: "fondo claro, siempre", Icono: IconLightOutline16 },
  { id: "oscuro", etiqueta: "Oscuro", detalle: "fondo oscuro, siempre", Icono: IconDarkOutline16 },
];

export function Ajustes({
  proveedores = [],
  entornos = [],
  proyectos = [],
  entornoActivo,
  apariencia,
  secreto,
  alCambiarApariencia,
  dispositivos,
  ajustesDeDispositivos,
  alCambiarDispositivos,
  alActualizarDispositivos,
  alInstalarHerramienta,
  conectado = true,
  agentes,
  hayProyecto,
  alGuardarAgente,
  alBorrarAgente,
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
  /** Los subagentes y los `.md` ilegibles. Ausente = todavía no llegó el mensaje, que NO es
   *  lo mismo que «no hay ninguno»: la sección lo distingue y lo dice. */
  agentes?: { lista: readonly AgenteDelCable[]; problemas: readonly string[] };
  /** Si hay proyecto abierto, para poder ofrecer el ámbito «de este proyecto». */
  hayProyecto: boolean;
  alGuardarAgente: (agente: AgenteDelCable, ambito: "global" | "proyecto") => void;
  alBorrarAgente: (nombre: string, ambito: "global" | "proyecto") => void;
  /** La pregunta oculta en vuelo, si la hay: se pinta DENTRO de la fila que se edita. */
  secreto?: string;
  alCambiarApariencia: (apariencia: Apariencia) => void;
  /**
   * La foto de la máquina, la misma que pinta el escritorio. Ausente = todavía no ha
   * llegado, y se dice: una lista vacía afirmaría un equipo sin nada.
   */
  dispositivos?: InformeDeDispositivos;
  /**
   * Qué destinos se miran. Ausente = no ha llegado el mensaje; `{}` = nadie ha elegido y se
   * miran todos.
   */
  ajustesDeDispositivos?: AjustesDeDispositivos;
  /**
   * Cambia los cuatro interruptores. Se manda el objeto ENTERO y no el que cambió: el
   * servidor los guarda juntos, y así no hay dos ideas de cuál es el estado actual.
   * Ausente = esta ejecución no puede cambiarlos y no se pintan interruptores.
   */
  alCambiarDispositivos?: (ajustes: AjustesDeDispositivos) => void;
  /** Volver a medir. Ausente = no se ofrece. */
  alActualizarDispositivos?: () => void;
  /**
   * Instalar una herramienta que falta. Viaja el NOMBRE, nunca el comando: qué se lanza lo
   * decide el servidor. Ausente = no se ofrece el botón.
   */
  alInstalarHerramienta?: (herramienta: NombreDeHerramienta) => void;
  /** Sin cable no se manda nada: lo que escribe en el servidor se apaga. */
  conectado?: boolean;
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
  /** Registrar un entorno es un MODO: mientras dura, la lista no está (ver más abajo). */
  const [registrando, setRegistrando] = useState(false);

  /**
   * Trae a la vista lo que se acaba de abrir.
   *
   * Medido en pantalla: la ventana mide 560 px de alto y el panel scrollea, así que al
   * pulsar «Añadir clave» en el último proveedor la pregunta aparecía POR DEBAJO del
   * pliegue — el botón hacía algo y no se veía nada, que es indistinguible de que no
   * hiciera nada. Va como `ref` de callback y no en un `useEffect` porque el nodo solo
   * existe mientras se edita: el callback corre justo al montarlo, que es el momento exacto.
   *
   * `block: "nearest"` para no dar un salto cuando ya se estaba viendo; `smooth` porque un
   * salto seco en una lista larga hace perder de vista dónde estabas.
   *
   * La guarda del `typeof` es obligatoria: **jsdom no implementa `scrollIntoView`**, así que
   * sin ella cualquier test que abra una fila de proveedor revienta con «is not a function».
   * Es la misma trampa —y la misma guarda— que `Maqueta.tsx` documenta con `ResizeObserver`,
   * y lo que se pierde en un test es exactamente lo que un test sin layout no puede ver.
   */
  const traerALaVista = (nodo: HTMLElement | null): void => {
    if (nodo !== null && typeof nodo.scrollIntoView === "function") {
      nodo.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };
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
          {/* La cabecera del rediseño. El subtítulo no es adorno: dice el ALCANCE, que es la
              pregunta que esta ventana provoca —¿esto es de este proyecto o de todo?—, y la
              respuesta es que estos tres van a la configuración global y a `auth.json`. */}
          <div className={estilos.marcaDeAjustes}>
            <span className={estilos.placa} aria-hidden="true">
              <IconSettingsOutline16 size={16} />
            </span>
            <span>
              <span className={estilos.titulo}>Ajustes</span>
              <span className={estilos.alcance}>Configuración global</span>
            </span>
          </div>
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={estilos.seccion}
              data-actual={s.id === seccion ? "" : undefined}
              aria-current={s.id === seccion ? "page" : undefined}
              onClick={() => setSeccion(s.id)}
            >
              <s.Icono size={16} className={estilos.iconoDeSeccion} />
              {s.etiqueta}
            </button>
          ))}
        </nav>
        <div className={estilos.panel}>
          {seccion === "apariencia" ? (
            <>
              <h2 className={estilos.encabezado}>Apariencia</h2>
              <p className={estilos.nota}>
                Solo afecta a esta ventana del navegador; se recuerda en este equipo.
              </p>
              <ul className={estilos.filas}>
                {APARIENCIAS.map((a) => (
                  <li key={a.id} className={estilos.fila}>
                    <span className={estilos.placa} aria-hidden="true">
                      <a.Icono size={16} />
                    </span>
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

          {seccion === "dispositivos" ? (
            <>
              <h2 className={estilos.encabezado}>Dispositivos</h2>
              <p className={estilos.nota}>
                Dónde se prueba la app. Se guarda con el equipo y no con el proyecto: el mismo Mac tiene los
                mismos simuladores para todos.
              </p>

              {/*
                DOS bloques y no una lista, porque son dos cosas distintas: un requisito está
                o no está —y si no está, se instala—, y un destino se elige. Juntos, «Android
                Sim · emulator no está instalada» se leía como un ajuste que el interruptor de
                al lado podía arreglar.
              */}
              <h3 className={estilos.subencabezado}>Requisitos</h3>
              {dispositivos === undefined ? (
                <p className={estilos.vacio}>Todavía no ha llegado ninguna medida de este equipo.</p>
              ) : (
                <ul className={estilos.filas}>
                  {REQUISITOS.map((r) => {
                    const h = dispositivos.herramientas.find((x) => x.nombre === r.nombre);
                    // Verde SOLO con «ok»: es lo único que significa disponible y
                    // configurado. «Desactivada» no se pinta en verde ni en rojo —no se ha
                    // mirado, y afirmar cualquiera de las dos sería inventarlo.
                    const estado = h?.estado;
                    return (
                      <li key={r.nombre} className={estilos.fila}>
                        <span
                          className={estilos.punto}
                          data-herramienta={estado ?? "sin-medir"}
                          aria-label={estado === undefined ? "sin medir" : ETIQUETA_DE_HERRAMIENTA[estado]}
                        />
                        <span className={estilos.nombre}>{r.etiqueta}</span>
                        <span className={estilos.detalle}>
                          {estado === undefined ? r.para : `${ETIQUETA_DE_HERRAMIENTA[estado]} · ${r.para}`}
                          {h?.detalle === undefined || estado === "ok" ? null : ` · ${h.detalle}`}
                        </span>
                        {/*
                          Instalar solo se ofrece cuando FALTA y se sabe cómo. Y el comando se
                          enseña siempre: quien pulsa un botón que instala software tiene
                          derecho a saber qué se va a lanzar en su máquina.
                        */}
                        {h?.instalar === undefined ? null : h.instalar.automatico ? (
                          <Button
                            variant="outline"
                            className={estilos.accion}
                            disabled={!conectado || alInstalarHerramienta === undefined}
                            title={h.instalar.comando}
                            onClick={() => alInstalarHerramienta?.(r.nombre)}
                          >
                            Instalar
                          </Button>
                        ) : (
                          <code className={estilos.comando} title="cópialo en un terminal">
                            {h.instalar.comando}
                          </code>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <h3 className={estilos.subencabezado}>Dispositivos</h3>
              {/*
                El INVENTARIO, no cuatro interruptores. El botón de antes decía «Se mira» al
                lado de un punto verde y se leía como si concediera la capacidad: el verde ya
                dice que se puede usar, así que el botón sobraba justo donde estaba. Lo que
                una persona quiere ver aquí es qué teléfonos y qué simuladores hay — y luego,
                cuál usa el agente, que es una elección de la SESIÓN y por eso todavía no
                vive en esta ventana (dice «Configuración global» en la cabecera).
              */}
              {dispositivos === undefined ? (
                <p className={estilos.vacio}>Todavía no ha llegado ninguna medida de este equipo.</p>
              ) : (
                (() => {
                  const { fisicos, virtuales } = inventario(dispositivos);
                  return (
                    <>
                      <h4 className={estilos.subsubencabezado}>Teléfonos y tablets</h4>
                      {fisicos.length === 0 ? (
                        <p className={estilos.vacio}>Ninguno conectado.</p>
                      ) : (
                        <ul className={estilos.filas}>
                          {fisicos.map((d) => (
                            <li key={d.id} className={estilos.fila}>
                              <span
                                className={estilos.punto}
                                data-herramienta={d.estado === "conectado" ? "ok" : "otro"}
                                aria-label={ETIQUETA_DE_ESTADO[d.estado]}
                              />
                              <span className={estilos.nombre}>{d.nombre}</span>
                              <span className={estilos.detalle}>
                                {d.plataforma === "ios" ? "iOS" : "Android"} · {ETIQUETA_DE_ESTADO[d.estado]}
                                {d.detalle === undefined ? "" : ` · ${d.detalle}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <h4 className={estilos.subsubencabezado}>Simuladores y emuladores</h4>
                      {virtuales.length === 0 ? (
                        <p className={estilos.vacio}>Ninguno disponible.</p>
                      ) : (
                        // Con scroll: esta máquina tiene 35 simuladores, y el panel «Tu
                        // equipo» los CUENTA justamente por eso. Aquí sí se listan —es donde
                        // se elegirá uno— pero acotados en alto, para que la sección de
                        // requisitos de arriba no se vaya de la pantalla.
                        <ul className={`${estilos.filas} ${estilos.listaLarga}`}>
                          {virtuales.map((d) => (
                            <li key={d.id} className={estilos.fila}>
                              <span
                                className={estilos.punto}
                                data-herramienta={d.estado === "arrancado" ? "ok" : "otro"}
                                aria-label={ETIQUETA_DE_ESTADO[d.estado]}
                              />
                              <span className={estilos.nombre}>{d.nombre}</span>
                              <span className={estilos.detalle}>
                                {d.plataforma === "ios" ? "iOS" : "Android"} · {ETIQUETA_DE_ESTADO[d.estado]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  );
                })()
              )}

              {/*
                El filtro de MEDIDA, degradado a lo que es: cuatro casillas, no cuatro
                botones al lado de un punto verde. Sigue existiendo porque apagar uno ahorra
                procesos de verdad en este equipo —adb arranca un demonio que se queda vivo—,
                pero ya no compite con el estado de nada.
              */}
              {alCambiarDispositivos === undefined ? null : (
                <p className={estilos.nota}>
                  Buscar en:{" "}
                  {DESTINOS.map((d, i) => (
                    <span key={d.id}>
                      {i === 0 ? null : " · "}
                      <label className={estilos.casillaEnLinea}>
                        <input
                          type="checkbox"
                          checked={seMira(ajustesDeDispositivos, d.id)}
                          disabled={!conectado}
                          // Se manda el objeto ENTERO con el cambio dentro: el servidor los
                          // guarda juntos, y mandar solo el que cambió obligaría a fusionar
                          // al otro lado con dos ideas de cuál es el estado.
                          onChange={() =>
                            alCambiarDispositivos({ ...ajustesDeDispositivos, [d.id]: !seMira(ajustesDeDispositivos, d.id) })
                          }
                        />
                        {d.etiqueta}
                      </label>
                    </span>
                  ))}
                </p>
              )}
              <p className={estilos.nota}>
                {dispositivos === undefined
                  ? "Todavía no ha llegado ninguna medida de este equipo."
                  : `Medido a las ${horaDe(dispositivos.medido)}. Lo que no se busca no se mide: adb arranca un demonio que se queda vivo, y xcrun tarda segundos.`}{" "}
                {alActualizarDispositivos === undefined ? null : (
                  <button type="button" className={estilos.enlace} disabled={!conectado} onClick={alActualizarDispositivos}>
                    Volver a mirar
                  </button>
                )}
              </p>
              <p className={estilos.nota}>
                Por ahora xonecode solo los DESCUBRE. Elegir con cuál trabaja el agente es una decisión de la
                sesión, no de esta ventana; conectar por red, arrancar un emulador o instalar la app tampoco
                está cableado todavía.
              </p>
            </>
          ) : null}

          {seccion === "modelos" ? (
            <>
              <h2 className={estilos.encabezado}>Proveedores</h2>
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
                        <div ref={traerALaVista}>
                        <Pregunta
                          texto={secreto}
                          oculta
                          anidado
                          alResponder={async (valor) => {
                            await alResponderSecreto(valor);
                            setEditando(undefined);
                          }}
                        />
                        </div>
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
              {/*
                Registrar reutiliza el MISMO camino que el paso de entorno del alta
                (`{clase:"alta", paso:"entorno"}`): id y nombre vacíos, que los deduce el
                servidor. Un segundo camino para registrar lo mismo es cómo divergen.

                Y va ENCIMA de las listas, no debajo: medido en pantalla quedaba detrás de
                dieciocho casillas de 54 px, fuera de la vista al abrir la sección.
              */}
              {registrando ? null : (
                <Button
                  variant="outline"
                  className={estilos.accion}
                  onClick={() => setRegistrando(true)}
                >
                  Registrar un entorno
                </Button>
              )}
              {registrando ? null : entornos.length === 0 ? (
                <p className={estilos.vacio}>No hay ninguno registrado todavía.</p>
              ) : (
                <ul className={estilos.filas}>
                  {entornos.map((e) => (
                    <li key={e.id} className={estilos.fila}>
                      <span className={estilos.nombre}>{e.nombre}</span>
                      <span className={estilos.url}>{e.url}</span>
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

              {!registrando ? null : (
              <form className={estilos.formulario} ref={traerALaVista} onSubmit={registrar}>
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
                <div className={estilos.botones}>
                  <Button
                    variant="outline"
                    className={estilos.accion}
                    onClick={() => {
                      setRegistrando(false);
                      setUrl("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" className={estilos.accion}>
                    Registrar
                  </Button>
                </div>
              </form>
              )}
            </>
          ) : null}

          {seccion === "agentes" ? (
            <>
              <h2 className={estilos.encabezado}>Subagentes</h2>
              <Agentes
                {...(agentes === undefined ? {} : { agentes: agentes.lista, problemas: agentes.problemas })}
                hayProyecto={hayProyecto}
                alGuardar={alGuardarAgente}
                alBorrar={alBorrarAgente}
              />
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
