import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { crearStoreDelCliente } from "./store.js";
import type { ActoDeSincronizacion } from "./tipos.js";
import type { Conexion } from "./conexion.js";
import { ANCHO_BARRA_POR_OMISION, Maqueta } from "./componentes/Maqueta.js";
import { Barra } from "./componentes/Barra.js";
import { Cabecera } from "./componentes/Cabecera.js";
import { Panel } from "./componentes/Panel.js";
import type { Pestana } from "./componentes/Pestanas.js";
import { Compositor } from "./componentes/Compositor.js";
import { Transcript } from "./componentes/Transcript.js";
import { BarraDeEstado } from "./componentes/BarraDeEstado.js";
import { AvisoDeConexion } from "./componentes/AvisoDeConexion.js";
import { useCronometro } from "./cronometro.js";
import { Pregunta } from "./componentes/Pregunta.js";
import { ConsultaDelAgente } from "./componentes/ConsultaDelAgente.js";
import { consultaPendiente } from "./consultaPendiente.js";
import { Aprobacion } from "./componentes/Aprobacion.js";
import { Selector } from "./componentes/Selector.js";
import { Wizard } from "./componentes/Wizard.js";
import { PantallaDeArranque } from "./componentes/PantallaDeArranque.js";
import { TarjetaDeAlta } from "./componentes/TarjetaDeAlta.js";
import { FaseDeArranque } from "./componentes/FaseDeArranque.js";
import type { PasoDeAlta } from "./componentes/PasosDelAlta.js";
import { Escritorio } from "./componentes/Escritorio.js";
import { NuevaSesion } from "./componentes/NuevaSesion.js";
import { NuevaTarea } from "./componentes/NuevaTarea.js";
import { AccionDeSesion, type AccionPendiente } from "./componentes/AccionDeSesion.js";
import { Ajustes, type SeccionDeAjustes } from "./componentes/Ajustes.js";
import { Revision } from "./componentes/Revision.js";
import { Ficheros } from "./componentes/Ficheros.js";
import { CloudStudio } from "./componentes/CloudStudio.js";
import { Artefactos, type ArtefactoEnLista } from "./componentes/Artefactos.js";
import { TareasDelProyecto } from "./componentes/TareasDelProyecto.js";
import { Ejecutar } from "./componentes/Ejecutar.js";
import { aplicarApariencia, guardarApariencia, leerApariencia, type Apariencia } from "./apariencia.js";
import {
  guardarAnchoBarra,
  guardarAnchoPanel,
  guardarBarraContraida,
  leerAnchoBarra,
  leerAnchoPanel,
  leerBarraContraida,
} from "./preferencias.js";
import { usarAnchoDeVentana } from "./anchoDeVentana.js";
import { ANCHO_PANEL_POR_OMISION, acotarAnchoDePanel, repartoDeColumnas } from "./repartoDeColumnas.js";

type Store = ReturnType<typeof crearStoreDelCliente>;

/**
 * La maqueta con datos: `App` es el ÚNICO componente que lee el store —por la costura
 * `suscribir`/`leer`, nunca importándolo dentro de un hijo—, y reparte props hacia abajo.
 * `store` y `enviar` entran INYECTADOS desde `main.tsx` (no se construye aquí un
 * `EventSource`) por lo mismo que documenta `conexion.ts`: jsdom no lo implementa, así
 * que un `new EventSource` a nivel de módulo de este fichero mataría cualquier test que
 * algún día monte `App`.
 */
export function App({
  store,
  enviar,
  subirAdjunto,
  instalarSkill,
  mirar,
}: {
  store: Store;
  enviar: Conexion["enviar"];
  /**
   * Los BYTES de un adjunto de tarea, por HTTP (`POST /adjunto`). Entra inyectado igual que
   * `enviar` y por el mismo motivo: el `fetch` vive en `conexion.ts`, así que aquí no hay
   * ninguno y los tests no tienen que parchear el global.
   */
  subirAdjunto: Conexion["subirAdjunto"];
  instalarSkill: Conexion["instalarSkill"];
  /**
   * Empezar o dejar de mirar en vivo lo que hace una tarea. Tiene canal propio y no va por
   * `enviar` porque lleva el id de ESTA conexión del SSE, que es un dato del transporte y no
   * de esta pantalla (ver `Conexion.mirar`). Ausente = esta ventana no lo ofrece, que es lo
   * que necesitan los tests que montan `App` sin cable.
   */
  mirar?: Conexion["mirar"];
}) {
  const estado = useSyncExternalStore(store.suscribir, store.leer);

  /**
   * Layer C: abrir un proyecto desde la barra. El servidor reutiliza EL MISMO mensaje que
   * usaba el paso de proyecto del wizard (`{clase:"alta", paso:"proyecto", proyecto,
   * rama}`, `vestibulo.ts#completarProyecto`): sin `rama` no abre nada y contesta con las
   * ramas de ESE proyecto (`estado.alta.ramas`), así que hace falta guardar EN EL
   * CLIENTE de cuál de los dos clics se trata —el cable no lo dice, solo manda la lista—.
   * Con una sola rama no se pregunta (mismo criterio que ya usa `cli/consola.ts` cuando
   * cancelar la elección de rama cae a la primera disponible): se manda sola, sin
   * `Selector` de por medio. Con más de una, sí.
   */
  /**
   * Qué pestaña se está viendo. Vivía dentro de `Transcript`; subió aquí cuando la tira
   * de pestañas se fue a `Cabecera` —que es donde vive en el CSS de deepseek, dentro del
   * mismo `<header>` que pinta la línea de separación—. La vida útil no cambia: muere con
   * la página, como antes, porque recargar el navegador ya es una sesión nueva
   * (`store.ts#marcarDesconectado` borra lo pendiente en ese momento).
   */
  /**
   * La vista abierta en el PANEL, o `undefined` si el panel está cerrado. Antes era una
   * `pestana` que empezaba en `"chat"`: el chat era una vista más y elegir cualquier otra lo
   * escondía. Hoy el chat es la columna del centro y esto es lo que se abre al lado
   * (`repartoDeColumnas.ts`), así que «volver al chat» es cerrar el panel — y eso es
   * exactamente lo que significa el `undefined`.
   */
  const [vistaDelPanel, setVistaDelPanel] = useState<Pestana | undefined>(undefined);
  /**
   * Con cuál se reabre el panel desde el botón de la cabecera. **Ficheros la primera vez**,
   * y no Trazas, que son de otro destinatario —quien depura el harness, no quien desarrolla
   * la app—: un panel que abriera ahí enseñaría el interior del harness a quien solo quería
   * mirar su proyecto.
   *
   * Es un `ref` y no un estado porque nadie repinta por esto: solo se lee en el instante en
   * que alguien pulsa el botón.
   */
  const ultimaVistaDelPanel = useRef<Pestana>("ficheros");

  /** Abrir el panel por una vista concreta, recordándola para la próxima vez. */
  const abrirPanel = useCallback((vista: Pestana) => {
    ultimaVistaDelPanel.current = vista;
    setVistaDelPanel(vista);
  }, []);
   /**
   * Las rutas con el diff desplegado en Revisión. **Arranca sin ninguna**: la pestaña se
   * abre enseñando la LISTA de lo que tocó el agente, y cada diff se despliega al pulsarlo
   * —que es cuando se pide su parche—. `undefined` = la foto no ha llegado, o la sesión
   * cambió y se olvida lo que hubiera abierto. Vive aquí y no en el store por lo mismo que
   * `pestana`: es de esta ventana, no del servidor.
   */
  const [desplegados, setDesplegados] = useState<ReadonlySet<string> | undefined>(undefined);
  /** El fichero abierto en la pestaña Ficheros. De esta ventana, como `pestana`. */
  const [ficheroElegido, setFicheroElegido] = useState<string | undefined>(undefined);
  /** El artefacto abierto en su pestaña. De esta ventana, igual que el fichero. */
  const [artefactoElegido, setArtefactoElegido] = useState<string | undefined>(undefined);
  /**
   * Lo elegido en el «…» de una sesión, esperando confirmación. Vive aquí y no en la barra
   * porque la ventana se pinta sobre la pantalla entera, no dentro de una columna de 280px
   * — y porque la barra no ejecuta acciones: reporta la intención.
   */
  const [accionDeSesion, setAccionDeSesion] = useState<AccionPendiente | undefined>(undefined);

  /**
   * La ventana de ajustes y la apariencia del cliente. Las dos viven aquí y no en el store:
   * el store es lo que dice el SERVIDOR, y esto es de esta ventana — qué panel está abierto
   * y de qué color se ve. `leerApariencia` se llama una vez, al montar (`useState`
   * perezoso), no en cada render.
   */
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  /**
   * En qué sección abrir Ajustes la PRÓXIMA vez — no la que está abierta ahora, que vive
   * dentro de `Ajustes` mismo. `undefined` es la omisión de siempre («general»). Sin
   * resetear esto en cada apertura genérica, la última sección pedida por un enlace
   * concreto (el aviso de proyectos sin enseñar) se quedaría pegada a las aperturas
   * siguientes desde el botón de la barra.
   */
  const [seccionDeAjustes, setSeccionDeAjustes] = useState<SeccionDeAjustes | undefined>(undefined);
  const abrirAjustes = (seccion?: SeccionDeAjustes): void => {
    setSeccionDeAjustes(seccion);
    setAjustesAbiertos(true);
  };
  /**
   * La barra lateral, plegada. Es de esta ventana —como la apariencia— y se recuerda en el
   * navegador: quien la pliega para ganar sitio no quiere volver a plegarla en cada
   * recarga. `leerBarraContraida` se llama una vez, al montar.
   */
  const [barraContraida, setBarraContraida] = useState(() => leerBarraContraida());
  /**
   * Y su ANCHO, por lo mismo: es de esta ventana. `undefined` = nadie lo ha movido, y
   * entonces manda la omisión de `Maqueta` — la cifra vive allí, que es donde está el
   * resto de la geometría, y no repetida aquí.
   */
  const [anchoBarra, setAnchoBarra] = useState(() => leerAnchoBarra());
  /** Y el del PANEL, con el mismo trato. Lo que NO se recuerda es si estaba abierto: ver
   *  `preferencias.ts`, que dice por qué. */
  const [anchoPanel, setAnchoPanel] = useState(() => leerAnchoPanel());
  /**
   * El ancho de la ventana. Lo necesita `repartoDeColumnas`, que es quien decide si el panel
   * cabe al lado del chat o tiene que ocupar su sitio — y esa decisión DESMONTA una columna,
   * así que no la puede tomar una hoja de estilos.
   */
  const anchoDeVentana = usarAnchoDeVentana();

  /**
   * Pedir la lista de ficheros de la sesión. Va en `useCallback` porque `Revision` la
   * llama desde un `useEffect` al montar: una función nueva en cada render volvería a
   * disparar ese efecto en cada render y la pestaña pediría la lista en bucle.
   */
  const pedirRevision = useCallback(() => {
    void enviar({ clase: "revision" });
  }, [enviar]);

  const pedirParche = useCallback(
    (ruta: string) => {
      void enviar({ clase: "revision", ruta });
    },
    [enviar]
  );

  const desplegar = useCallback(
    (ruta: string) => {
      setDesplegados((previas) => new Set([...(previas ?? []), ruta]));
      pedirParche(ruta);
    },
    [pedirParche]
  );

  const plegar = useCallback((ruta: string) => {
    setDesplegados((previas) => {
      const siguientes = new Set(previas ?? []);
      siguientes.delete(ruta);
      return siguientes;
    });
  }, []);

  /**
   * ¿Se está mirando el ESCRITORIO teniendo un proyecto abierto?
   *
   * Es estado de VISTA y no del servidor, y esa es la parte que importa: volver al
   * escritorio no cierra la sesión ni suelta el proyecto —la barra lo sigue marcando como
   * activo y el turno que estuviera corriendo sigue corriendo—, solo cambia lo que se
   * pinta en el centro. Hasta ahora el escritorio se veía SOLO si no había proyecto
   * abierto, así que en cuanto abrías uno no había forma de volver a él: ni a los otros
   * proyectos, ni a «Tu equipo», ni al entorno.
   *
   * Se apaga al abrir un proyecto o una sesión (`abrirSesion`) y no reaccionando a que el
   * servidor cambie de sesión: el id de una sesión nueva nace al volcar su primer acto, y
   * con un efecto sobre `sesionActiva` ese cambio te sacaría del escritorio a media
   * mirada, sin que hubieras pedido nada.
   */
  const [enEscritorio, setEnEscritorio] = useState(false);

  /**
   * Abrir una sesión —nueva o guardada— es lo mismo desde los tres sitios que lo ofrecen
   * (la barra, el escritorio y la ventana de sesión nueva), así que va por una función: y
   * además de mandar el mensaje, saca del escritorio. Sin eso, pulsar un proyecto desde el
   * escritorio no cambiaba nada de lo que se veía.
   */
  /**
   * Lo que ESTA ventana acaba de pedir abrir, para que el clic cambie algo en el acto.
   *
   * No contradice la regla de «lo dice el servidor»: el servidor sigue siendo el único que
   * afirma que se está abriendo algo y cuándo acaba (`clase: "abriendo"`), y en cuanto lo
   * dice manda él. Esto es otra cosa —«he pulsado y estoy esperando respuesta»—, y hace
   * falta porque MEDIDO en el navegador ese ida y vuelta son 40 ms: con solo la señal del
   * servidor, el primer cuadro después del clic sigue igual que antes, que es exactamente
   * lo que se lee como «no ha hecho nada».
   *
   * Se suelta en cuanto el servidor contesta CUALQUIER cosa —el alta nueva llega siempre,
   * también si abrir falla— o si se cae el cable. Nunca se queda pegado esperando un
   * mensaje concreto.
   */
  const [pedidoDeApertura, setPedidoDeApertura] = useState<{ proyecto: string; sesion?: string } | undefined>(
    undefined
  );
  const altaAlPedir = useRef<unknown>(undefined);

  const abrirSesion = useCallback(
    (proyecto: string, sesion?: string, pestanaAlAbrir?: Pestana) => {
      setEnEscritorio(false);
      altaAlPedir.current = estado.alta;
      setPedidoDeApertura({ proyecto, ...(sesion === undefined ? {} : { sesion }) });
      // Solo si el llamador la nombra: por omisión no toca `pestana`, que es el
      // comportamiento de siempre para la barra y el escritorio. Quien abre desde una
      // tarjeta de tarea «esperando feedback» sí la nombra —«revision»—, porque ahí la
      // verdad sobre lo que cambió está en esa pestaña y no en el chat.
      if (pestanaAlAbrir !== undefined) abrirPanel(pestanaAlAbrir);
      void enviar(sesion === undefined ? { clase: "sesion", proyecto } : { clase: "sesion", proyecto, sesion });
    },
    [enviar, estado.alta, abrirPanel]
  );

  useEffect(() => {
    if (pedidoDeApertura === undefined) return;
    // Cualquier respuesta del servidor lo releva: el alta se anuncia SIEMPRE al terminar de
    // abrir (y también al fallar), así que basta con que cambie.
    if (estado.alta !== altaAlPedir.current || estado.conectado === false) setPedidoDeApertura(undefined);
  }, [pedidoDeApertura, estado.alta, estado.conectado]);

  /**
   * Qué se está abriendo, con el servidor por delante: lo que él diga manda —él sabe si
   * además hay que DESCARGAR, que es la espera de minutos— y el pedido de esta ventana solo
   * cubre los milisegundos de antes de su primera palabra.
   */
  const abriendo = estado.abriendo ?? pedidoDeApertura;

  /**
   * Las cuatro acciones de una tarea, hoisted una sola vez: el kanban del escritorio
   * (`Escritorio`→`Kanban`) y la lista del proyecto (`TareasDelProyecto`) montan la MISMA
   * `AccionesDeTarea` (Task 13), así que necesitan los mismos cuatro manejadores en los dos
   * sitios. Definirlos aquí y no inline en cada JSX es lo que impide que las dos copias
   * del `enviar({clase:"tarea", …})` diverjan otra vez.
   */
  const alReintentarTarea = useCallback((id: string) => void enviar({ clase: "tarea", accion: "reintentar", id }), [enviar]);
  /**
   * «Vuelve a medir qué hay.» En `useCallback` y no una lambda del JSX porque `Ejecutar` la
   * llama desde un efecto: con una identidad nueva por render, ese efecto pediría una medida
   * por tecla, y cada medida lanza `adb` y `xcrun` en la máquina de quien mira. Es la misma
   * razón por la que `alRevisar` ya está envuelta.
   */
  const actualizarDispositivos = useCallback(() => void enviar({ clase: "dispositivos" }), [enviar]);
  const alDescartarTarea = useCallback((id: string) => void enviar({ clase: "tarea", accion: "descartar", id }), [enviar]);
  const alTerminarTarea = useCallback((id: string) => void enviar({ clase: "tarea", accion: "terminar", id }), [enviar]);
  const alEnviarFeedbackTarea = useCallback(
    (id: string, texto: string) => void enviar({ clase: "tarea", accion: "feedback", id, texto }),
    [enviar]
  );

  /**
   * Qué tarea se está mirando en vivo. Vive AQUÍ y no en el store por lo mismo que
   * `pestana`: es la elección de esta ventana. El transcript sí es del servidor y vive en
   * `estado.mirada`.
   */
  const [mirandoTarea, setMirandoTarea] = useState<string | undefined>(undefined);
  const alMirarTarea = useCallback(
    (id: string) => {
      setMirandoTarea(id);
      void mirar?.(id, true);
    },
    [mirar]
  );
  const alDejarDeMirarTarea = useCallback(
    (id: string) => {
      setMirandoTarea(undefined);
      // El panel se cierra al pulsar y no cuando el servidor conteste: el servidor no manda
      // ningún «ya no miras» al desengancharse, así que nadie lo retiraría.
      store.dejarDeMirar();
      void mirar?.(id, false);
    },
    [mirar, store]
  );
  /**
   * Al caerse el cable el enganche se va con el SSE (`arranque.ts`, el `close`) y el store
   * tira el transcript: la reconexión lo vuelve a pedir. Es la misma forma que Ficheros y
   * Revisión —«se pide cuando NO se tiene, no al montar»—, y por eso depende de si hay dato
   * y de `conectado`: sin las dos, o no se recupera al reconectar, o se pide a un servidor
   * que no está.
   */
  useEffect(() => {
    if (mirandoTarea === undefined || !estado.conectado) return;
    if (estado.mirada?.tarea === mirandoTarea) return;
    void mirar?.(mirandoTarea, true);
  }, [mirandoTarea, estado.conectado, estado.mirada?.tarea, mirar]);

  /**
   * Los ARTEFACTOS de la sesión, sacados de los actos.
   *
   * La lista no se le pide al servidor: los actos ya la traen —ruta, nombre, peso y mime— y
   * sobreviven a reabrir la sesión, porque van en el `.jsonl` del transcript. Preguntarle al
   * disco cuáles hay sería una segunda fuente para lo mismo, y podría contradecir a la
   * conversación que se está leyendo justo al lado.
   *
   * Un artefacto reescrito en un turno posterior aparece DOS veces en los actos y aquí una:
   * se indexa por ruta, y el repetido se mueve al final —`delete` antes del `set`— porque el
   * orden es lo que decide cuál se abre solo, y el que se acaba de dibujar es el último.
   */
  const artefactos: ArtefactoEnLista[] = useMemo(() => {
    const porRuta = new Map<string, ArtefactoEnLista>();
    for (const acto of estado.actos) {
      if (acto.tipo !== "artefacto") continue;
      porRuta.delete(acto.ruta);
      porRuta.set(acto.ruta, {
        ruta: acto.ruta,
        nombre: acto.nombre,
        bytes: acto.bytes,
        ...(acto.mime === undefined ? {} : { mime: acto.mime }),
      });
    }
    return [...porRuta.values()];
  }, [estado.actos]);

  /**
   * Las operaciones de sincronización de esta sesión, **la más reciente primero**.
   *
   * Es el registro que pide la banda de Revisión: lo que ha pasado con CloudStudio desde que
   * se abrió la sesión. Se deriva de los actos, que es por donde ya viaja y se persiste —así
   * sobrevive a recargar la página y a reabrir la sesión, sin fichero ni mensaje nuevos.
   *
   * El recorrido con `continue` y no un `.filter` es el mismo molde que `artefactos` y por el
   * mismo motivo: estrecha la unión sin depender de la versión de TypeScript. Y se INVIERTE
   * porque los actos llegan en orden y lo que se acaba de hacer es lo que se quiere ver
   * abierto; el `reverse` es sobre el array nuevo que sale del filtro, no sobre `estado.actos`.
   */
  const registroDeSync: ActoDeSincronizacion[] = useMemo(() => {
    const recientesPrimero: ActoDeSincronizacion[] = [];
    for (const acto of estado.actos) {
      if (acto.tipo !== "sincronizacion") continue;
      recientesPrimero.push(acto);
    }
    return recientesPrimero.reverse();
  }, [estado.actos]);

  /**
   * La pestaña de artefactos desaparece si la sesión nueva no tiene ninguno, así que la
   * elección tiene que caerse con ella: si no, `Pestanas` la quitaba de la tira —y hace
   * bien— pero la vista seguía valiendo «artefactos» y el panel la enseñaba sin ninguna
   * pestaña marcada. **Se CIERRA el panel**, que es donde estaría quien no ha elegido nada:
   * dejarlo abierto por otra vista sería elegir en su nombre.
   */
  useEffect(() => {
    if (artefactos.length === 0) setVistaDelPanel((actual) => (actual === "artefactos" ? undefined : actual));
  }, [artefactos.length]);

  /**
   * Las tareas en background del proyecto ABIERTO, y solo de él: la cola entera viaja en
   * `{clase:"tareas"}` y ya está en el store —el kanban del escritorio la enseña sin
   * filtrar—, así que aquí no se pide nada nuevo al servidor. El filtro es por el ID del
   * proyecto (`estado.alta.proyectoActivo`), que es lo que cada tarea trae en `proyecto`.
   *
   * **Ausente y vacío no son lo mismo, y Task 15 lo lleva hasta la pestaña.** Antes esto
   * colapsaba los dos en un `?? []`: valía mientras la pestaña solo aparecía CON tareas
   * (nunca se veía el caso vacío), pero desde que es una pestaña de ACCIÓN que existe
   * siempre, su estado vacío AFIRMA que no hay ninguna — y afirmarlo sin que la cola haya
   * llegado del servidor sería la misma mentira que `Revision` evita con `via`. `undefined`
   * se propaga tal cual hasta `TareasDelProyecto`, que es quien decide qué decir.
   */
  const tareasDelProyecto = useMemo(
    () =>
      estado.tareas === undefined
        ? undefined
        : estado.tareas.lista.filter((t) => t.proyecto === estado.alta?.proyectoActivo),
    [estado.tareas, estado.alta?.proyectoActivo]
  );

  /**
   * El id del proyecto ABIERTO, para la única puerta de creación que hace falta desde
   * DENTRO de él: a diferencia del escritorio (`alNuevaTarea(proyecto)`, una tarjeta por
   * proyecto), aquí no hay nada que elegir.
   *
   * Ausente = no se ofrece el botón: `proyectoActivo` se DEDUCE comparando raíces
   * (`web/servidor/arranque.ts`, ver CLAUDE.md) y puede no cuadrar. Abrir la ventana sin
   * este id resuelto es justo la mutación que Task 15 prohíbe: `proyectoDeLaTarea` no
   * encontraría con qué pintarla y la ventana se quedaría sin montar.
   */
  const proyectoActivoId = estado.alta?.proyectoActivo;

  const pedirArtefacto = useCallback(
    (nombre: string) => {
      void enviar({ clase: "artefacto", nombre });
    },
    [enviar]
  );

  /**
   * Abrir un artefacto desde su tarjeta del chat: abre el PANEL por Artefactos y lo elige.
   *
   * Es el mismo gesto que pulsar su fila en la lista, así que va por una función: la tarjeta
   * es lo primero que se ve cuando el agente acaba de dibujar, y sin esto había que buscar
   * la pestaña y volver a elegirlo.
   *
   * Y desde que el panel puede vivir al lado, este gesto vale el doble de lo que valía: en
   * una ventana ancha la captura se abre SIN perder de vista la conversación que la
   * produjo, que es justo lo que se pedía.
   */
  const abrirArtefacto = useCallback(
    (ruta: string) => {
      setArtefactoElegido(ruta);
      abrirPanel("artefactos");
    },
    [abrirPanel]
  );

  /** Pedir el árbol del proyecto (pestaña Ficheros). Mismo motivo que `pedirRevision`. */
  const pedirArbol = useCallback(() => {
    void enviar({ clase: "arbol" });
  }, [enviar]);

  /**
   * Pedir la medida de lo que queda por subir (la banda de CloudStudio, dentro de Revisión),
   * y las dos acciones.
   *
   * En `useCallback` por lo de siempre: la pestaña la llama desde un `useEffect`, y una
   * función nueva por render volvería a disparar el efecto en bucle.
   *
   * **Medir y actuar van por el MISMO mensaje con distinta `accion`**, y el servidor decide
   * qué hacer con cada una: `estado` lo mide él contra la ref de git —sin abrir sesión MCP—,
   * y `subir`/`bajar` los ENCOLA para que salgan con el plan, la guarda y la aprobación del
   * terminal. Aquí no se compone nada de eso: el cliente manda la intención y nada más.
   */
  const pedirSync = useCallback(() => {
    void enviar({ clase: "sync", accion: "estado" });
  }, [enviar]);

  const sincronizar = useCallback(
    (accion: "subir" | "bajar") => {
      void enviar({ clase: "sync", accion });
    },
    [enviar]
  );

  /**
   * Las acciones de la pestaña «Ejecutar» (Task 10): volver a medir, lanzar, cancelar y
   * elegir el aparato.
   *
   * **Las cuatro en `useCallback`, y no es cosmética**: la pestaña las llama desde un
   * `useEffect` —montarse ES lo que la hace medir, porque la medida vive en el servidor y
   * habla con `adb`— así que una identidad nueva por render volvería a disparar ese efecto en
   * cada render: una petición por tecla, y cada una es un `adb` allí. Es el mismo motivo que
   * ya llevan escrito `pedirRevision` y `pedirSync`.
   *
   * Se manda la INTENCIÓN y nada más, como el resto del cable: contra qué se mide y en qué
   * aparato se lanza lo resuelve el servidor contra su última medida — el navegador no es
   * fuente sobre la máquina.
   */
  const revisarLanzamiento = useCallback(() => {
    void enviar({ clase: "revisarLanzamiento" });
  }, [enviar]);

  const lanzarApp = useCallback(() => {
    void enviar({ clase: "lanzarApp" });
  }, [enviar]);

  const cancelarLanzamiento = useCallback(() => {
    void enviar({ clase: "cancelarLanzamiento" });
  }, [enviar]);

  const elegirDispositivoDeEjecutar = useCallback(
    (id: string) => {
      void enviar({ clase: "dispositivo", id });
    },
    [enviar]
  );

  const elegirFichero = useCallback(
    (ruta: string | undefined) => {
      setFicheroElegido(ruta);
      if (ruta !== undefined) void enviar({ clase: "fichero", ruta });
    },
    [enviar]
  );

  /**
   * «Abrir» en un hallazgo del verificador: el MISMO camino que pinchar el fichero en el árbol
   * —elegirlo y pedir su contenido— más abrir la pestaña. La barrera de qué se puede leer sigue
   * en el servidor, así que un hallazgo sobre algo que el lector no enseña contesta lo que
   * contestaría el árbol.
   */
  const abrirFicheroDeHallazgo = useCallback(
    (ruta: string) => {
      elegirFichero(ruta);
      abrirPanel("ficheros");
    },
    [elegirFichero, abrirPanel]
  );

  /** Lo que «Pedir corrección» deja en el compositor; el `id` hace que dos iguales cuenten dos. */
  const [borradorDelCompositor, setBorradorDelCompositor] = useState<{ texto: string; id: number } | undefined>(
    undefined
  );

  // Revisión arranca PLEGADA: al llegar la lista no se despliega ningún bloque ni se pide
  // ningún parche. Lo único que hace este efecto es OLVIDAR lo desplegado cuando el store
  // tira la foto (otra sesión, cable caído), para que las filas abiertas de la sesión
  // anterior no sigan abiertas sobre los ficheros de otra.
  const listaDeRevision = estado.revision?.lista;
  useEffect(() => {
    if (listaDeRevision === undefined) setDesplegados(undefined);
  }, [listaDeRevision]);

  /**
   * Al TERMINAR un turno, si la pestaña de Revisión está delante, se refresca sola.
   *
   * Es la pregunta que la vista contesta —«¿qué acaba de tocar el agente?»— y dejarla
   * esperando a que alguien pulse «Actualizar» significa enseñar la foto de ANTES del turno
   * justo en el momento en que deja de ser verdad. Se refresca al terminar y no durante:
   * a mitad de turno el agente todavía está escribiendo, y una lista que parpadea con cada
   * fichero no se puede leer. Y si había filas desplegadas, se vuelven a pedir sus parches:
   * si no, seguirían enseñando el diff viejo del fichero que el turno acaba de cambiar.
   */
  const turnoEnVuelo = estado.turnoEnVuelo === true;
  /**
   * La pregunta del agente sin contestar (`consultaPendiente.ts`), y la que la persona APARTÓ
   * para contestar escribiendo. Apartar es de esta pantalla y no del hilo: la pregunta sigue
   * pendiente, y al reabrir la sesión la ventana vuelve. La clave lleva el enunciado además de
   * la posición porque dos sesiones pueden tener una consulta en el mismo sitio.
   */
  const consulta = consultaPendiente(estado.actos, turnoEnVuelo);
  const claveDeConsulta = consulta === undefined ? undefined : `${consulta.indice}:${consulta.pregunta}`;
  const [consultaApartada, setConsultaApartada] = useState<string | undefined>(undefined);
  // Desde cuándo: lo pintan el pie y el pulso mientras dura, en vez del tiempo del turno
  // anterior, que es lo que se veía.
  const segundosEnVuelo = useCronometro(turnoEnVuelo);
  const turnoAnterior = useRef(turnoEnVuelo);
  useEffect(() => {
    const acabaDeTerminar = turnoAnterior.current && !turnoEnVuelo;
    turnoAnterior.current = turnoEnVuelo;
    // Solo el FLANCO de fin. Sin esto, abrir la pestaña dispararía este efecto además del
    // que `Revision` lleva dentro para pedir al montar, y saldrían dos peticiones iguales.
    if (!acabaDeTerminar) return;
    if (vistaDelPanel === "revision") {
      pedirRevision();
      // Los desplegados se vuelven a pedir: si no, seguirían enseñando el diff viejo del
      // fichero que el turno acaba de cambiar.
      for (const ruta of desplegados ?? []) pedirParche(ruta);
      // Y la banda de CloudStudio, que vive aquí dentro desde que dejó de ser pestaña: el
      // turno acaba de escribir, así que hay MÁS por subir que hace un momento. Es el único
      // de los dos caminos por los que esa cifra envejece que el servidor sí conoce (el otro
      // es `/sync`, que mueve la ref sin avisar de cuándo acaba); por eso se mide aquí, en el
      // flanco de fin, y no se adelanta a ojo.
      pedirSync();
    }
    if (vistaDelPanel === "ficheros") {
      // El agente puede haber creado o cambiado ficheros: el árbol y el abierto se releen.
      pedirArbol();
      if (ficheroElegido !== undefined) void enviar({ clase: "fichero", ruta: ficheroElegido });
    }
    // `desplegados` y `ficheroElegido` NO van en las dependencias a propósito: desplegar y
    // elegir ya piden lo suyo por su cuenta, y tenerlos aquí lo pediría dos veces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnoEnVuelo, vistaDelPanel, pedirRevision, pedirParche, pedirArbol, pedirSync, enviar]);
  const [apariencia, setApariencia] = useState<Apariencia>(() => leerApariencia());

  useEffect(() => {
    aplicarApariencia(apariencia);
    // Con «sistema» hay que seguir escuchando: el usuario puede cambiar el modo del sistema
    // con la pestaña abierta, y quedarse en claro sobre un escritorio que se ha puesto
    // oscuro es justo lo que «como el sistema» promete que no pasa.
    if (apariencia !== "sistema" || typeof window.matchMedia !== "function") return;
    const medio = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = (): void => aplicarApariencia("sistema");
    medio.addEventListener("change", alCambiar);
    return () => medio.removeEventListener("change", alCambiar);
  }, [apariencia]);
  const alCambiarApariencia = (nueva: Apariencia): void => {
    setApariencia(nueva);
    guardarApariencia(nueva);
  };

  /**
   * El proyecto para el que se está abriendo la ventana de sesión nueva.
   *
   * Sustituye al `proyectoEligiendoRama` de antes, que existía solo para saber a qué
   * proyecto pertenecía el selector de rama que flotaba en el centro. Ahora la ventana lo
   * dice, así que la rama se elige DENTRO de ella y no hace falta ningún efecto que mande
   * la elección por su cuenta cuando solo hay una: eso era decidir por el usuario sin
   * enseñárselo.
   */
  const [sesionNueva, setSesionNueva] = useState<string | undefined>(undefined);
  /**
   * La ventana de tarea nueva: para qué proyecto, y bajo qué BORRADOR se suben sus adjuntos.
   *
   * El borrador se decide al ABRIR y no al primer adjunto, porque tiene que ser el mismo
   * para las tres cosas que lo usan: cada subida (`POST /adjunto?tarea=…`), la augmentación
   * —que lista esa carpeta para saber qué hay— y el `crear`, que lo ADOPTA como id de la
   * tarea. Es un `uuid` del navegador y el servidor no se lo cree a ciegas: comprueba su
   * forma y rechaza el que ya sea una tarea (409 en la subida, y nada creado en el `crear`).
   */
  const [tareaNueva, setTareaNueva] = useState<{ proyecto: string; borrador: string } | undefined>(undefined);
  /** ¿Se subió algún adjunto bajo este borrador? Sin ninguno, el `crear` no lo menciona: no
   *  se nombra una carpeta que no existe. */
  const [conAdjuntos, setConAdjuntos] = useState(false);

  // El alta es lo ÚNICO que se enseña mientras falte cuenta o entorno — nada de armazón
  // vacío alrededor esperando datos que todavía no llegan (la barra sin entornos, las
  // pestañas sin transcript, el compositor deshabilitado): eso era el problema medido, y
  // la corrección es no enseñarlo, no vestirlo.
  //
  // Cambio de rumbo del usuario: el paso de PROYECTO salió del alta. `pasos: []` ya no
  // implica que haya un proyecto abierto —antes sí, porque era el único paso que podía
  // quedar—; ahora pasa en cuanto cuenta y entorno están resueltos, CON o SIN proyecto.
  // Quien ya tiene las dos cosas puestas entra DIRECTO, sin ver nada de esto: `enAlta`
  // se hace falso y el resto de este componente pinta la maqueta completa, con o sin
  // proyecto (`proyectoAbierto`, ver más abajo decide cuál de las dos).
  //
  // Antes de que `estado.alta` llegue pasa una de dos: el paso de cuenta todavía se está
  // resolviendo (viaja por `selector`/`secreto`, no por `alta`, así que `alta` sigue
  // `undefined`) o ya llegó con el paso de entorno pendiente. Las dos cuentan como
  // «todavía no hay nada que enseñar salvo el alta».
  /**
   * **Qué está preparando el arranque. Ausente = listo, y solo entonces se entra.**
   *
   * El usuario lo pidió así: no salir del lienzo hasta que la sesión MCP esté abierta y los
   * proyectos listados, porque entrar antes deja un Escritorio vacío que se rellena delante.
   * No se puede deducir de `proyectos: []` —eso no distingue «no preguntado» de «ninguno»—,
   * así que el servidor lo DICE (`web/servidor/arranque.ts`), con la fase dentro para que el
   * lienzo pueda contar qué hace en vez de estar en silencio. La espera la acota el servidor
   * con su plazo: aquí no hay ningún reloj, y un `preparando` que no se quitara sería un
   * lienzo para siempre.
   */
  const preparandoArranque = estado.alta?.preparando;

  const enAlta =
    estado.alta === undefined || estado.alta.pasos.length > 0 || preparandoArranque !== undefined;

  /**
   * ¿Hay algo esperando respuesta AQUÍ, en el arranque?
   *
   * El paso de cuenta no viaja por `alta` sino por `selector`/`secreto`, y una `pregunta`
   * puede caer también antes de entrar. Dentro de `enAlta` los tres son del arranque: a
   * mitad de conversación `enAlta` es falso y los pinta la maqueta completa, así que aquí no
   * hace falta mirar si `alta` llegó — y mirarlo escondería el paso de cuenta de quien tiene
   * un entorno ya registrado, donde la cuenta y la preparación pasan a la vez.
   */
  const algoPreguntado =
    estado.selector !== undefined || estado.secreto !== undefined || estado.pregunta !== undefined;

  /** Lo que el arranque tiene que resolver: pasos del alta pendientes. */
  const faltanPasos = (estado.alta?.pasos.length ?? 0) > 0;

  /**
   * **No consta ≠ falta.** `alta === undefined` significa que el servidor todavía no lo ha
   * dicho, y leerlo como «hay que dar algo de alta» enseñaba el diálogo de configuración a
   * quien ya lo tiene todo configurado. La ventana no era teórica: el anuncio del alta iba
   * DETRÁS de abrir la sesión MCP contra CloudStudio —medido en la máquina del usuario a
   * 1436 ms con el MCP caliente, y sin tope si la red va mal—. El servidor ya adelanta ese
   * anuncio (`web/servidor/arranque.ts`), y esto es la otra mitad: aunque tarde, mientras no
   * se sabe se pinta el LIENZO y nada más.
   *
   * `enAlta` no cambia —la maqueta completa no puede montarse antes de saberlo—; lo que se
   * calla es la TARJETA. Y se calla solo cuando no hay nada dentro que contestar, que es lo
   * que evita esconder una pregunta: `AvisoDeConexion` va fuera de ella, así que un servidor
   * caído sigue diciéndolo.
   */
  const soloElLienzo = !faltanPasos && !algoPreguntado;

  /**
   * ¿Está el paso de cuenta en marcha AHORA MISMO?
   *
   * Dos señales, y las dos hacen falta. La primera es que `estado.alta` todavía no haya
   * llegado: `arranque.ts` solo manda ese mensaje DESPUÉS de que `conducirCuenta()`
   * resuelve, así que antes de él la cuenta sigue en curso. La segunda es que haya un
   * selector o un secreto esperando respuesta, y es la que hizo falta al poder VOLVER al
   * paso de modelo: en esa vuelta `alta` ya llegó hace rato, y sin mirar la pregunta en
   * vuelo la progresión seguiría diciendo «Modelo ✓ / Entorno actual» con el selector de
   * proveedor en pantalla, y el formulario de entorno pintado debajo del selector.
   */
  const enCuenta = estado.alta === undefined || estado.selector !== undefined || estado.secreto !== undefined;

  /** La progresión de los dos pasos, para `PasosDelAlta`. */
  const pasosDeAlta: PasoDeAlta[] = [
    { id: "modelo", etiqueta: "Modelo", estado: enCuenta ? "actual" : "hecho" },
    { id: "entorno", etiqueta: "Entorno de CloudStudio", estado: enCuenta ? "pendiente" : "actual" },
  ];

  if (enAlta) {
    // `centrada` cuando no hay tarjeta: la marca se queda el centro óptico y crece. Con
    // tarjeta vuelve a ser la cabecera compacta, que es de quien es el centro entonces.
    return (
      <PantallaDeArranque centrada={soloElLienzo}>
        {/*
          Antes de que llegue el primer `selector`/`secreto`/`alta` (la conexión SSE
          todavía no ha resuelto nada, o se cayó a mitad del alta) esto era la única
          señal — sin ella, un token inválido o el servidor caído pintaban el splash y
          la bienvenida y NADA más: un fallo mudo, justo lo que este repo persigue en
          todas partes. `AvisoDeConexion` ya devuelve `null` en conectado, así que en el
          camino feliz esto sigue sin enseñar nada de más. Va FUERA de `TarjetaDeAlta`
          —es un aviso de sistema, a lo ancho, no un paso del alta— y por eso conserva su
          propio aspecto de franja en vez de encogerse a los 480px de la tarjeta.
        */}
        <AvisoDeConexion conectado={estado.conectado} />
        {/*
          `estado.nombre` (clase «bienvenida») llega ANTES que `estado.alta`, porque el
          nombre no depende de ninguna cuenta — sin esta preferencia el saludo se quedaba
          en «Hola» a secas durante TODO el paso de cuenta con el nombre ya resuelto y sin
          sitio por el que viajar. `alta?.nombre` de red no cubre ninguna conexión real
          —el SSE siempre manda «bienvenida» antes que `alta`—, pero se deja como
          preferencia y no se retira: quitar ese campo de `alta` es tocar un contrato que
          no es parte de este arreglo.
        */}
        {/*
          La FASE, cuando el arranque todavía está preparando algo. Va suelta en el lienzo y
          no dentro de la tarjeta: no es un paso que nadie tenga que contestar, es lo que el
          servidor está haciendo — y enseñarla dentro de una tarjeta la leería como un
          formulario. Cuando además hay algo que contestar, se pinta con la tarjeta debajo:
          el paso de cuenta y la sesión MCP pueden ir a la vez.
        */}
        {preparandoArranque === undefined ? null : <FaseDeArranque texto={preparandoArranque} />}
        {/*
          La tarjeta solo cuando hay algo que dar de alta o algo que contestar. Mientras no,
          el lienzo y el aviso de conexión — ver `soloElLienzo`.
        */}
        {soloElLienzo ? null : (
        <TarjetaDeAlta
          nombre={estado.nombre ?? estado.alta?.nombre}
          pasos={pasosDeAlta}
          // Volver al paso de MODELO: el servidor reconduce el asistente de cuenta entero
          // (`arranque.ts`, `paso: "cuenta"`), que es quien lo pinta —por `selector` y
          // `secreto`, no por el wizard—. Solo hay a dónde volver desde el alta: fuera de
          // ella el modelo se cambia con `/modelo` en el compositor, que aquí no existe.
          alVolverAPaso={(id) => {
            if (id === "modelo") void enviar({ clase: "alta", paso: "cuenta" });
          }}
        >
          {estado.pregunta !== undefined ? (
            <Pregunta
              texto={estado.pregunta.texto}
              {...(estado.pregunta.decision === undefined
                ? {}
                : { decision: estado.pregunta.decision })}
              anidado
              alResponder={async (respuesta) => {
                await enviar({ clase: "respuesta", texto: respuesta });
                store.contestarPregunta();
              }}
            />
          ) : null}
          {estado.secreto !== undefined ? (
            <Pregunta
              texto={estado.secreto.pregunta}
              oculta
              anidado
              alResponder={async (valor) => {
                await enviar({ clase: "secreto", valor });
                store.contestarSecreto();
              }}
            />
          ) : null}
          {estado.selector !== undefined ? (
            <Selector
              titulo={estado.selector.titulo}
              opciones={estado.selector.opciones}
              {...(estado.selector.aviso === undefined ? {} : { aviso: estado.selector.aviso })}
              anidado
              alElegir={async (id) => {
                // Se captura ANTES del `await`: el paso de cuenta encadena selectores sin
                // viaje de red entre ellos (volver atrás, cancelar con la puerta puesta), y
                // el nuevo puede llegar por el SSE antes de que el `POST` resuelva. Sin
                // decir CUÁL se contestó, esto borraría el selector siguiente.
                const contestado = estado.selector;
                await enviar({ clase: "eleccion", id });
                store.contestarSelector(contestado);
              }}
            />
          ) : null}
          {/*
            El wizard SOLO cuando no hay una pregunta de cuenta en vuelo. Al volver al paso
            de modelo, `alta` ya está en el cliente con «entorno» pendiente, así que sin
            este `!enCuenta` se pintarían las dos cosas a la vez: el selector de proveedor
            arriba y el formulario del entorno debajo, dos pasos abiertos en una progresión
            que dice que solo hay uno.
          */}
          {!enCuenta && estado.alta !== undefined && estado.alta.pasos.length > 0 ? (
            <Wizard
              pasos={estado.alta.pasos}
              proveedores={estado.alta.proveedores}
              entornos={estado.alta.entornos}
              {...(estado.alta.aviso === undefined ? {} : { aviso: estado.alta.aviso })}
              alGuardarCredencial={(_proveedor, clave) => void enviar({ clase: "secreto", valor: clave })}
              alRegistrarEntorno={(entorno) => void enviar({ clase: "alta", paso: "entorno", entorno })}
            />
          ) : null}
        </TarjetaDeAlta>
        )}
      </PantallaDeArranque>
    );
  }

  // Sin proyecto abierto: la maqueta completa (barra con datos reales) pero el centro
  // espera. Antes de este cambio `enAlta` en `false` implicaba SIEMPRE un proyecto
  // abierto —era el único paso que podía quedar—; ahora hace falta mirarlo aparte.
  const proyectoAbierto = estado.alta?.proyectoAbierto ?? false;

  const enSesion = proyectoAbierto && !enEscritorio;

  /**
   * **El panel es de la SESIÓN, así que en el escritorio no hay panel** aunque la vista
   * elegida siga puesta. No es cosmético: el escritorio no ofrece el botón que lo cierra
   * —ahí no hay ficheros ni revisión de nadie—, así que una columna con el Ficheros de la
   * sesión anterior al lado del saludo sería una columna de la que no se sale. Se conserva
   * `vistaDelPanel` a propósito: al volver a la sesión, el panel vuelve por donde estaba.
   */
  const panelAbierto = enSesion && vistaDelPanel !== undefined;

  /**
   * Quién cabe y quién no. Es la ÚNICA pieza que decide el encuadre, y vive fuera de este
   * fichero a propósito: pura y con su test, porque una regla que solo existe dentro de un
   * componente es de las que este repo llama «escritas y no probadas».
   *
   * De aquí salen las tres cosas que cambian la pantalla: si la barra se pinta plegada
   * —que **no** es lo mismo que la preferencia del usuario, y por eso `guardarBarraContraida`
   * no se llama nunca con esto—, si el panel va en su columna o en el centro, y si el
   * compositor se esconde (solo se esconde cuando el panel ocupa el sitio del chat).
   */
  const reparto = repartoDeColumnas({
    anchoVentana: anchoDeVentana,
    anchoBarra: anchoBarra ?? ANCHO_BARRA_POR_OMISION,
    anchoPanel: acotarAnchoDePanel(anchoPanel ?? ANCHO_PANEL_POR_OMISION),
    barraPlegadaPorElUsuario: barraContraida,
    panelAbierto,
  });

  // El PRIMER acto de usuario, no el último: es la misma regla que titula una sesión en
  // disco (`web/servidor/sesiones.ts` — «titulo» se fija una vez y no se vuelve a tocar).
  // Dos reglas para el mismo título es cómo divergen — esta lo mira, no inventa una propia.
  const primerActoDeUsuario = estado.actos.find((a) => a.tipo === "usuario");

  /**
   * Cómo se llama la sesión abierta.
   *
   * Manda el título del ÍNDICE, que es el que el «…» de la barra puede cambiar; el primer
   * acto de usuario es el respaldo, para la sesión que todavía no tiene entrada (nace al
   * volcar el primer acto) y para la que se abrió antes de que existiera el índice. Sin
   * esto, renombrar dejaba dos nombres para una sola sesión: el nuevo en la barra y la
   * primera frase de siempre aquí arriba.
   */
  const tituloDeLaSesion =
    (estado.alta?.sesionActiva === undefined
      ? undefined
      : estado.alta.proyectos
          ?.flatMap((p) => p.sesiones ?? [])
          .find((x) => x.id === estado.alta!.sesionActiva)?.titulo) ||
    primerActoDeUsuario?.texto;

  /*
   * El respaldo de la miga cuando la sesión todavía no tiene título — que es TODA sesión
   * recién abierta: el título nace del primer acto de usuario. Antes ponía «xonecode», y
   * desde que la marca se mudó a la barra superior eso dejaba la fila diciendo «xonecode /
   * xonecode». El nombre del proyecto es lo que de verdad contesta «dónde estoy», y es el
   * mismo par que enseñan los mockups («AppDemo / Prueba del menú»).
   *
   * Y si tampoco hay proyecto que nombrar, «Sesión nueva» y no la marca otra vez: la miga
   * dice dónde estás dentro del producto, no cómo se llama el producto.
   */
  const nombreDelProyectoActivo = estado.alta?.proyectos?.find(
    (p) => p.id === estado.alta?.proyectoActivo
  )?.nombre;

  // Las piezas de `BarraDeEstado`. «Turnos» cuenta actos `usuario`; «pasos» suma las líneas
  // de los actos `herramientas` —una racha COLAPSADA cuenta como una línea (`core/notify.ts`),
  // así que esto cuenta rachas visibles, no llamadas reales a tool—; el tiempo es el del
  // ÚLTIMO turno cerrado, no un acumulado de sesión.
  //
  // Y `contexto`/`tope` SÍ tienen mensaje detrás desde que `ctx` se mudó aquí: el mensaje
  // `consumo` trae `ventana {usado, tope?}`, y es la única cifra de la pantalla que dice
  // cuánto margen queda antes de que toque resumir. Antes vivía en el compositor, junto a
  // los acumulados, y ahí se leía como si fuera otra cuenta de lo gastado. Sin tope no se
  // inventa denominador ni porcentaje: `formatearContexto` no los pinta.
  const turnos = estado.actos.filter((a) => a.tipo === "usuario").length;
  const pasos = estado.actos
    .filter((a) => a.tipo === "herramientas")
    .reduce((n, a) => n + a.lineas.length, 0);
  const ultimoFin = estado.actos
    .slice()
    .reverse()
    .find((a) => a.tipo === "fin");
  const ventana = estado.consumo?.ventana;

  /**
   * Cuál es el entorno activo lo DICE el servidor, y solo si no lo dice se cae al primero
   * registrado — que es lo que se hacía siempre y era una suposición que se rompía en
   * cuanto había dos. Se calcula una vez aquí para que la barra y la ventana de ajustes no
   * puedan discrepar.
   */
  const entornoActivo = estado.alta?.entornoActivo ?? estado.alta?.registrados[0]?.id ?? "";

  /**
   * Abrir la ventana de sesión nueva. Si el proyecto no está bajado hacen falta sus ramas,
   * y se piden AQUÍ: pedirlas al abrir la ventana es lo que hace que estén cuando el
   * usuario llega al desplegable, y pedirlas siempre sería una conexión con CloudStudio por
   * cada clic en un proyecto que ya está en el equipo.
   */
  const abrirVentanaDeSesion = (proyecto: string): void => {
    const identidad = estado.alta?.proyectos.find((p) => p.id === proyecto);
    // Con copia local NO hay ventana: se abre y ya. La ventana existía para no descargar
    // un proyecto entero por un «+» pulsado sin querer; con la copia en el equipo no se
    // descarga nada, y medido en pantalla la ventana decía literalmente «se abre y ya» y
    // aun así pedía confirmar — un paso sin ninguna decisión dentro.
    if (identidad?.local === true) {
      abrirSesion(proyecto);
      return;
    }
    setSesionNueva(proyecto);
    setEnEscritorio(false);
    void enviar({ clase: "alta", paso: "proyecto", proyecto });
  };

  /**
   * Plegar y desplegar, recordándolo en este navegador.
   *
   * **Con una excepción: si la barra está plegada porque el PANEL le quitó el sitio, este
   * botón cierra el panel en vez de tocar la preferencia.** Sin eso sería un botón muerto —
   * el usuario no la ha plegado, así que su preferencia ya dice «abierta» y ponerla otra vez
   * a «abierta» no cambia nada: se pulsa «Mostrar la barra lateral» y no pasa nada, sin
   * ninguna pista de por qué. Gana quien pulsa: pide la barra, se le da la barra.
   */
  const alternarBarra = (): void => {
    if (!barraContraida && reparto.barra === "plegada") {
      setVistaDelPanel(undefined);
      return;
    }
    setBarraContraida((plegada) => {
      guardarBarraContraida(!plegada);
      return !plegada;
    });
  };

  /** Abrir el panel por donde se dejó, o cerrarlo. La otra mitad del par es la «×» de su
   *  propia tira; este vive fuera porque cerrado el panel no está. */
  const alternarPanel = (): void => {
    setVistaDelPanel((actual) => (actual === undefined ? ultimaVistaDelPanel.current : undefined));
  };

  /**
   * Redimensionar la barra. Se guarda solo al TERMINAR el gesto: el arrastre pide un ancho
   * en cada `pointermove` y `localStorage` no es sitio para escribir sesenta veces por
   * segundo. Cada pulsación de tecla llega ya terminada.
   */
  const alRedimensionarBarra = (ancho: number, terminado: boolean): void => {
    setAnchoBarra(ancho);
    if (terminado) guardarAnchoBarra(ancho);
  };

  /** Lo mismo para el panel. */
  const alRedimensionarPanel = (ancho: number, terminado: boolean): void => {
    setAnchoPanel(ancho);
    if (terminado) guardarAnchoPanel(ancho);
  };

  /** El entorno activo con su nombre y su URL, para la portada del escritorio. `undefined`
   *  si no hay ninguno registrado — que es distinto de haberlo y no tener proyectos. */
  const entornoDelEscritorio = estado.alta?.registrados.find((e) => e.id === entornoActivo);

  /** El proyecto de la ventana de sesión nueva, con lo que el servidor sabe de él. */
  const proyectoDeLaSesion = estado.alta?.proyectos.find((p) => p.id === sesionNueva);

  /**
   * Las dos ventanas van al lado de la maqueta y no dentro: son modales —`Modal` las saca
   * por un portal sobre el `body`— y tienen que poder abrirse haya o no proyecto abierto,
   * que son dos centros distintos.
   */
  const ventanaDeSesion =
    sesionNueva !== undefined && proyectoDeLaSesion !== undefined ? (
      <NuevaSesion
        proyecto={{ id: proyectoDeLaSesion.id, nombre: proyectoDeLaSesion.nombre }}
        local={proyectoDeLaSesion.local === true}
        ramas={estado.alta?.ramas ?? []}
        // El motivo del último paso fallido: si la consulta de ramas revienta, la ventana
        // tiene que decirlo en vez de quedarse en «consultando» para siempre.
        {...(estado.alta?.aviso === undefined ? {} : { aviso: estado.alta.aviso })}
        alEmpezar={(rama) => {
          const proyecto = sesionNueva;
          setSesionNueva(undefined);
          // Con copia local es una sesión nueva y ya; sin ella hay que darlo de alta y
          // bajarlo, que es lo que sabe hacer el camino del alta con su rama.
          setEnEscritorio(false);
          if (rama === undefined) abrirSesion(proyecto);
          else void enviar({ clase: "alta", paso: "proyecto", proyecto, rama });
        }}
        alCerrar={() => setSesionNueva(undefined)}
      />
    ) : null;

  /** El proyecto de la ventana de tarea nueva, con lo que el servidor sabe de él. */
  const proyectoDeLaTarea = estado.alta?.proyectos.find((p) => p.id === tareaNueva?.proyecto);

  /**
   * La ventana de TAREA nueva.
   *
   * Al abrirla se TIRA el encargo propuesto que hubiera: `{clase:"tarea",
   * accion:"augmentado"}` va a todos los clientes —el cable habla con todos, no con el
   * último—, así que uno pedido desde otra pestaña habría prerrellenado este campo.
   */
  const abrirVentanaDeTarea = (proyecto: string): void => {
    store.limpiarEncargoPropuesto();
    setConAdjuntos(false);
    setTareaNueva({ proyecto, borrador: crypto.randomUUID() });
  };

  /**
   * Cerrar la ventana de tarea, por las DOS salidas que tiene (Cancelar y «Abrir el
   * proyecto»).
   *
   * **Cancelar con adjuntos ya subidos BORRA su carpeta.** Los bytes se suben antes de que
   * la tarea exista (crear la encola, y el corredor puede arrancarla en el acto), así que
   * cerrar sin encolar dejaría en `~/.xonecode/tareas/<borrador>/` documentos de una persona
   * que ninguna tarea nombra y que nadie va a volver a ver. `descartar` sobre un id que no
   * está en el índice hace exactamente eso: borra la carpeta y deja el índice intacto.
   *
   * Es una función y no dos manejadores iguales porque la segunda salida llegó después: dos
   * copias de esta limpieza es como una de las dos se queda sin ella.
   */
  const cerrarVentanaDeTarea = (): void => {
    if (tareaNueva !== undefined && conAdjuntos) {
      void enviar({ clase: "tarea", accion: "descartar", id: tareaNueva.borrador });
    }
    setTareaNueva(undefined);
  };

  const ventanaDeTarea =
    tareaNueva !== undefined && proyectoDeLaTarea !== undefined ? (
      <NuevaTarea
        proyecto={{ id: proyectoDeLaTarea.id, nombre: proyectoDeLaTarea.nombre }}
        local={proyectoDeLaTarea.local === true}
        {...(estado.encargoPropuesto === undefined ? {} : { encargoPropuesto: estado.encargoPropuesto })}
        // El borrador viaja con la augmentación para que el servidor pueda LISTAR los
        // adjuntos ya subidos y decirle al modelo para qué sirve cada uno.
        alAugmentar={(peticion) =>
          void enviar({
            clase: "tarea",
            accion: "augmentar",
            proyecto: tareaNueva.proyecto,
            peticion,
            borrador: tareaNueva.borrador,
          })
        }
        alSubirAdjunto={async (fichero, nombre) => {
          const r = await subirAdjunto(tareaNueva.borrador, nombre, fichero);
          // Solo si alguno LLEGÓ: el `crear` menciona el borrador para que el servidor
          // adopte esa carpeta, y mencionarla vacía sería adoptar una carpeta que no existe.
          if (r.ok) setConAdjuntos(true);
          return r;
        }}
        alEncolar={({ peticion, encargo }) => {
          const { proyecto, borrador } = tareaNueva;
          setTareaNueva(undefined);
          void enviar({
            clase: "tarea",
            accion: "crear",
            proyecto,
            peticion,
            encargo,
            ...(conAdjuntos ? { borrador } : {}),
          });
        }}
        // Sin copia local la ventana RECHAZA crear la tarea —se aparcaría y ahí se
        // quedaría— y ofrece el camino que sí funciona: abrir el proyecto, que es donde se
        // descarga. Se cede a `NuevaSesion` en vez de encolar y bajar de rebote, porque esa
        // ventana existe justamente para que una descarga entera no sea un efecto
        // secundario de otra cosa. Se cierra por el camino normal para que el borrador se
        // limpie igual.
        alAbrirProyecto={() => {
          const { proyecto } = tareaNueva;
          cerrarVentanaDeTarea();
          abrirVentanaDeSesion(proyecto);
        }}
        alCerrar={cerrarVentanaDeTarea}
      />
    ) : null;

  /**
   * La ventana que confirma lo elegido en el «…» de una sesión.
   *
   * `esLaAbierta` sale de comparar con `sesionActiva`, que es lo que dice el SERVIDOR: solo
   * cambia lo que se avisa —borrar la que estás mirando cierra la consola y te devuelve al
   * escritorio—, nunca lo que se hace. Deducirlo del transcript diría lo de antes.
   */
  const ventanaDeAccionDeSesion =
    accionDeSesion === undefined ? null : (
      <AccionDeSesion
        pendiente={accionDeSesion}
        esLaAbierta={estado.alta?.sesionActiva === accionDeSesion.sesion}
        alCerrar={() => setAccionDeSesion(undefined)}
        alConfirmar={(titulo) => {
          const { proyecto, sesion, accion } = accionDeSesion;
          setAccionDeSesion(undefined);
          void enviar(
            accion === "borrar"
              ? { clase: "sesionAccion", accion: "borrar", proyecto, sesion }
              : { clase: "sesionAccion", accion: "renombrar", proyecto, sesion, titulo: titulo ?? "" }
          );
        }}
      />
    );

  const ventanaDeAjustes = ajustesAbiertos ? (
    <Ajustes
      {...(seccionDeAjustes === undefined ? {} : { seccionInicial: seccionDeAjustes })}
      {...(estado.modelos === undefined ? {} : { proveedores: estado.modelos.proveedores })}
      entornos={estado.alta?.registrados ?? []}
      // El listado del entorno ACTIVO, que es del único del que el cable trae proyectos.
      proyectos={estado.alta?.proyectos ?? []}
      {...(entornoActivo === "" ? {} : { entornoActivo })}
      {...(estado.agentes === undefined ? {} : { agentes: estado.agentes })}
      {...(estado.skills === undefined ? {} : { skills: estado.skills })}
      {...(estado.cuerposDeSkill === undefined ? {} : { cuerposDeSkill: estado.cuerposDeSkill })}
      // Si hay proyecto abierto: decide si la ventana puede ofrecer guardar el subagente
      // «en este proyecto». Sin uno, ese ámbito no existe y no se pregunta.
      hayProyecto={proyectoAbierto}
      alGuardarAgente={(agente, ambito, renombrandoDe) =>
        void enviar({
          clase: "agente",
          accion: "guardar",
          ambito,
          agente,
          // Ausente cuando el nombre no ha cambiado: eso es lo que distingue un guardado de
          // un renombrado, y el servidor no tiene otra forma de saberlo.
          ...(renombrandoDe === undefined ? {} : { renombrandoDe }),
        })
      }
      alRestaurarAgente={(nombre) =>
        void enviar({
          clase: "agente",
          accion: "restaurar",
          // `global` fijo y no el ámbito de la fila: la siembra solo escribe ahí, así que la
          // versión de serie solo puede volver a la carpeta global. El servidor tampoco lo
          // mira en esta acción — va porque el mensaje tiene una forma sola.
          ambito: "global",
          agente: { nombre, descripcion: "", motor: "modelo", soloLectura: true, skills: [], instrucciones: "" },
        })
      }
      alBorrarAgente={(nombre, ambito) =>
        void enviar({
          clase: "agente",
          accion: "borrar",
          ambito,
          // Borrar solo necesita el nombre, pero el mensaje lleva un agente entero para no
          // tener dos formas del mismo mensaje: los demás campos los ignora el servidor.
          agente: { nombre, descripcion: "", motor: "modelo", soloLectura: true, skills: [], instrucciones: "" },
        })
      }
      // El cuerpo de una skill, bajo demanda: las de serie no lo mandan en la ráfaga —son
      // ficheros de decenas de miles de caracteres que nadie puede editar— así que se pide
      // al abrir su ficha o al copiarla.
      alPedirCuerpoDeSkill={(nombre) => void enviar({ clase: "cuerpoDeSkill", nombre })}
      alGuardarSkill={(skill, ambito, renombrandoDe) =>
        void enviar({
          clase: "skill",
          accion: "guardar",
          ambito,
          skill,
          // Ausente cuando el nombre no ha cambiado: es lo que distingue un guardado de un
          // renombrado, y el servidor no tiene otra forma de saberlo. La misma regla que en
          // `agente`, y por el mismo motivo.
          ...(renombrandoDe === undefined ? {} : { renombrandoDe }),
        })
      }
      alBorrarSkill={(skill, ambito) =>
        void enviar({
          clase: "skill",
          accion: "borrar",
          ambito,
          // Borrar solo necesita el nombre, pero el mensaje lleva una skill entera para no
          // tener dos formas del mismo mensaje: los demás campos los ignora el servidor.
          skill,
        })
      }
      // Los BYTES del `.zip` van por HTTP y no por el cable, que lleva JSON: el mismo molde
      // que la subida de un adjunto de tarea.
      alInstalarSkill={(nombre, ambito, zip) => instalarSkill(nombre, ambito, zip)}
      // La pregunta oculta en vuelo se pinta DENTRO de la fila que se está editando; por
      // eso el centro deja de pintarla mientras la ventana está abierta (más abajo).
      {...(estado.secreto === undefined ? {} : { secreto: estado.secreto.pregunta })}
      // La misma foto y los mismos ajustes que el escritorio: es la máquina, una sola para
      // todos los clientes. Ausentes mientras no lleguen — no se afirma un equipo vacío.
      {...(estado.dispositivos === undefined ? {} : { dispositivos: estado.dispositivos })}
      {...(estado.ajustesDeDispositivos === undefined ? {} : { ajustesDeDispositivos: estado.ajustesDeDispositivos })}
      conectado={estado.conectado}
      // Guardar y volver a medir van en el MISMO mensaje: configurar sin remedir dejaría la
      // pantalla enseñando la foto de la configuración anterior.
      alCambiarDispositivos={(ajustes) => void enviar({ clase: "dispositivos", ajustes })}
      alActualizarDispositivos={actualizarDispositivos}
      // Viaja el NOMBRE de la herramienta, nunca un comando: qué se lanza lo decide el
      // servidor con su tabla cerrada. Y detrás vuelve a medir, así que la foto nueva es
      // la que dice si la herramienta apareció.
      alInstalarHerramienta={(herramienta) => void enviar({ clase: "dispositivos", instalar: herramienta })}
      // Abre una carpeta en el sistema donde corre la consola. No remide ni cambia ningún
      // estado, así que no hay nada que esperar por el cable.
      alAbrirCarpetaDeHerramienta={(herramienta) => void enviar({ clase: "dispositivos", abrirRuta: herramienta })}
      // Verificar es su propio mensaje y NO vuelve a medir: la verificación vive dentro de
      // la foto, así que una medida nueva se llevaría la que se acaba de hacer.
      alVerificarDispositivo={(id) => void enviar({ clase: "conexion", id })}
      // Arrancar un AVD. La respuesta NO es el POST: viaja por el cable con la foto nueva,
      // porque lo que dice si arrancó es la medida y no el código de salida de `emulator`.
      alArrancarEmulador={(avd) => void enviar({ clase: "arrancarEmulador", avd })}
      {...(estado.arranqueDeEmulador === undefined
        ? {}
        : { arranqueDeEmulador: estado.arranqueDeEmulador })}
      // El tope de concurrencia de la cola de tareas: mismo mensaje que manda el kanban al
      // pedirlo la primera vez, con el número que puso quien lo cambia.
      {...(estado.tareas === undefined ? {} : { tareas: { concurrencia: estado.tareas.concurrencia } })}
      alCambiarConcurrencia={(concurrencia) => void enviar({ clase: "tareas", concurrencia })}
      // Dónde se bajan las copias. Ausente = el servidor no lo dice, y entonces el campo
      // no se pinta: un control sin dato detrás no se pinta, y aquí un campo en blanco se
      // leería como «no hay ninguna carpeta puesta».
      {...(estado.workspace === undefined ? {} : { workspace: estado.workspace })}
      alCambiarWorkspace={(ruta) => void enviar({ clase: "workspace", ruta })}
      // El selector de carpeta, solo si el servidor dice que esta máquina tiene uno.
      {...(estado.puedeElegirCarpeta === true ? { alElegirCarpeta: () => void enviar({ clase: "elegirCarpeta" }) } : {})}
      {...(estado.carpetaElegida === undefined ? {} : { carpetaElegida: estado.carpetaElegida })}
      // Los modelos de un motor externo, para el desplegable de un subagente.
      {...(estado.modelosDeMotor === undefined ? {} : { modelosDeMotor: estado.modelosDeMotor })}
      alPedirModelosDeMotor={(motor) => void enviar({ clase: "modelosDeMotor", motor })}
      alPedirCatalogo={(proveedor) => void enviar({ clase: "catalogo", proveedor })}
      // El modelo por DEFECTO, que es una pregunta distinta de la del compositor: allí se
      // pinta el de la sesión abierta y aquí el que usarán las nuevas. Los dos campos del
      // mismo mensaje, cada uno donde significa algo.
      {...(estado.modelos?.porDefecto === undefined ? {} : { modeloPorDefecto: estado.modelos.porDefecto })}
      // La MISMA intención que manda la pastilla del compositor, y no una segunda forma de
      // decir lo mismo: el servidor la guarda como defecto y, si hay sesión, la aplica
      // también en caliente.
      alElegirModelo={(id) => void enviar({ clase: "modelo", id })}
      // Ejecutar un paso de receta: viajan el nombre y el número, nunca un comando.
      {...(estado.instalacion === undefined ? {} : { instalacion: estado.instalacion })}
      alEjecutarPaso={(receta, numero) => void enviar({ clase: "receta", id: receta, paso: numero, accion: "ejecutar" })}
      alCancelarPaso={(receta) => void enviar({ clase: "receta", id: receta, paso: 0, accion: "cancelar" })}
      // Ni «pedir» ni «borrar» pasan por el lazo de la consola: tienen su propio mensaje
      // porque esta ventana se abre también sin proyecto abierto, y ahí no hay lazo.
      alPedirClave={(proveedor) => void enviar({ clase: "credencial", accion: "pedir", proveedor })}
      alBorrarClave={(proveedor) => void enviar({ clase: "credencial", accion: "borrar", proveedor })}
      // Registrar un entorno es el MISMO mensaje del alta: id y nombre vacíos, que los
      // deduce el servidor de la URL.
      alRegistrarEntorno={(url) =>
        void enviar({ clase: "alta", paso: "entorno", entorno: { id: "", nombre: "", url } })
      }
      // El identificador no viaja: lo deriva el servidor del nombre, para que esa regla
      // viva en un solo sitio. Y la clave tampoco: se pone después, con «Añadir clave», por
      // el único mensaje del cable que lleva credenciales.
      alAltaDeProveedor={(nombre, baseUrl) =>
        void enviar({ clase: "proveedor", accion: "alta", nombre, baseUrl })
      }
      alBajaDeProveedor={(slug) => void enviar({ clase: "proveedor", accion: "baja", slug })}
      {...(estado.proveedor === undefined ? {} : { resultadoDeProveedor: estado.proveedor })}
      alElegirProyectos={(entorno, proyectos) =>
        void enviar({ clase: "entorno", accion: "visibles", entorno, proyectos })
      }
      // Las listas de los entornos NO activos, que la pestaña de cada uno pide al abrirse.
      // Ausente = no se ha consultado; el componente distingue eso de un error y de una
      // lista vacía.

      // Pedir los proyectos de un entorno NO lo hace activo: es una conexión con
      // CloudStudio para pintar unas casillas, y mudar el entorno activo desde Ajustes le
      // cambiaría la barra lateral a quien esté trabajando en otro servidor.
      {...(estado.proyectosPorEntorno === undefined
        ? {}
        : { proyectosPorEntorno: estado.proyectosPorEntorno })}
      alPedirProyectosDeEntorno={(entorno) =>
        void enviar({ clase: "entorno", accion: "proyectos", entorno })
      }
      {...(estado.alta?.aviso === undefined ? {} : { avisoDelAlta: estado.alta.aviso })}
      alQuitarEntorno={async (entorno, { borrarCopias }) => {
        // El servidor contesta 409 con `{ motivo }` si se niega: la regla es suya, y así la
        // negativa llega hasta aquí en vez de quedarse en el terminal.
        const r = (await enviar({
          clase: "entorno",
          accion: "olvidar",
          entorno,
          ...(borrarCopias ? { borrarCopias: true } : {}),
        })) as Response | undefined;
        if (r?.status !== 409) return undefined;
        try {
          const cuerpo = (await r.json()) as { motivo?: unknown };
          return typeof cuerpo.motivo === "string" ? cuerpo.motivo : "el servidor se negó";
        } catch {
          return "el servidor se negó";
        }
      }}
      alResponderSecreto={async (valor) => {
        await enviar({ clase: "secreto", valor });
        store.contestarSecreto();
      }}
      /*
        Cerrar la ventana CANCELA la clave que estuviera pidiendo.
        
        Sin esto, la pregunta no desaparecía: se mudaba al centro. El servidor sigue
        esperando por `leerSecreto`, y el centro solo deja de pintarla MIENTRAS la ventana
        está abierta (`!ajustesAbiertos`, más abajo) — así que al cerrarla reaparecía
        flotando sobre el compositor, pidiendo la clave de un proveedor fuera de todo
        contexto. Visto en pantalla.

        Se cancela con una respuesta VACÍA, que es exactamente lo que el servidor recibe
        cuando se cae el SSE (`consolaWeb.ts#alDesconectar`): un camino ya existente y ya
        probado, en vez de una clase de mensaje nueva para decir «me arrepentí». Y una clave
        vacía no se escribe — `motivoDeClaveInaceptable` la rechaza antes de gastar nada.
      */
      alCerrar={() => {
        if (estado.secreto !== undefined) {
          void enviar({ clase: "secreto", valor: "" });
          store.contestarSecreto();
        }
        setAjustesAbiertos(false);
      }}
    />
  ) : null;

  /**
   * El PANEL de vistas, montado UNA vez y colocado en un sitio o en otro.
   *
   * `reparto` decide su casa: la columna de la derecha cuando la ventana da para las tres,
   * y el sitio del chat cuando no — que es exactamente cómo se comportaba esta consola
   * antes de que existiera la tercera columna. **Se monta una sola vez**, y eso importa:
   * cada una de sus vistas MIDE al montarse (Ficheros pide el árbol, Revisión la lista,
   * Ejecutar pregunta por el aparato, CloudStudio mide lo que queda por subir), así que
   * dos copias —una por sitio— duplicarían todas esas peticiones.
   *
   * Cerrado es `undefined`, no un elemento escondido: lo que se pliega se DESMONTA, porque
   * un elemento invisible sigue siendo tabulable.
   */
  const elPanel =
    !panelAbierto || vistaDelPanel === undefined ? undefined : (
      <Panel
        pestana={vistaDelPanel}
        alElegirPestana={abrirPanel}
        alCerrar={() => setVistaDelPanel(undefined)}
        hayArtefactos={artefactos.length > 0}
        actos={estado.actos}
      revision={
        <Revision
          historica={estado.alta?.historica === true}
          {...(estado.revision === undefined ? {} : { via: estado.revision.via })}
          {...(estado.revision?.mezclados === undefined ? {} : { mezclados: estado.revision.mezclados })}
          ficheros={estado.revision?.lista ?? []}
          parches={estado.parches ?? {}}
          desplegados={desplegados ?? new Set()}
          alDesplegar={desplegar}
          alPlegar={plegar}
          alRecargar={pedirRevision}
          conectado={estado.conectado}
          // La banda de la sincronización, que ya no es pestaña propia: «cuánto queda
          // por subir» es la misma pregunta que contesta Revisión medida contra otra
          // referencia. Se monta CON la pestaña, y montarse es lo que la hace medir
          // (`CloudStudio` pide al entrar): abrir Revisión ES entrar a mirarlo.
          cloudstudio={
            <CloudStudio
              {...(estado.sync === undefined ? {} : { sync: estado.sync })}
              // El registro va con el mismo trato que `sync`: AUSENTE cuando esta
              // sesión no ha sincronizado nada todavía. Un array vacío diría «hay un
              // registro y está vacío», y la banda no tiene nada que enseñar en
              // ninguno de los dos casos — pero la distinción se conserva en la capa
              // que la sabe, que es donde el repo la exige.
              {...(registroDeSync.length === 0 ? {} : { registro: registroDeSync })}
              alPedir={sincronizar}
              alRecargar={pedirSync}
              conectado={estado.conectado}
            />
          }
        />
      }
      ficheros={
        <Ficheros
          {...(estado.arbol === undefined ? {} : { arbol: estado.arbol })}
          contenidos={estado.contenidos ?? {}}
          {...(ficheroElegido === undefined ? {} : { elegido: ficheroElegido })}
          alElegir={elegirFichero}
          alRecargar={pedirArbol}
          conectado={estado.conectado}
        />
      }
      artefactos={
        <Artefactos
          lista={artefactos}
          contenidos={estado.artefactos ?? {}}
          {...(artefactoElegido === undefined ? {} : { elegido: artefactoElegido })}
          alElegir={setArtefactoElegido}
          alPedir={pedirArtefacto}
          conectado={estado.conectado}
        />
      }
      tareas={
        <TareasDelProyecto
          tareas={tareasDelProyecto}
          alReintentar={alReintentarTarea}
          alDescartar={alDescartarTarea}
          alTerminar={alTerminarTarea}
          // Antes esta lista no tenía forma de mandar feedback — eso era solo del
          // kanban del escritorio, así que una tarea aparcada solo se podía atender
          // desde ahí (Task 13). `AccionesDeTarea` ya la ofrece en las dos vistas.
          alEnviarFeedback={alEnviarFeedbackTarea}
          conectado={estado.conectado}
          // Si las ejecuta OTRO proceso, esta pestaña lo dice — y aquí importa más
          // que en el kanban, porque aquí vive «Nueva tarea»: la que se cree se
          // queda quieta hasta que ese proceso mire la cola por su cuenta (F4 de la
          // revisión final). Ausente mientras la cola no ha llegado: no se afirma.
          {...(estado.tareas === undefined ? {} : { corriendoAqui: estado.tareas.corriendoAqui })}
          // Y si las ejecuta OTRO, que no es lo mismo que que no las ejecute nadie:
          // el primero manda a esperar y el segundo dice que no va a pasar nada.
          // Ausente se propaga como ausente, que es «no se sabe».
          {...(estado.tareas?.ejecutaOtroProceso === undefined
            ? {}
            : { ejecutaOtroProceso: estado.tareas.ejecutaOtroProceso })}
          // Task 15: crear una tarea PARA este proyecto sin salir de la pestaña ni
          // volver al escritorio, con el proyecto ya resuelto — es el mismo id que
          // abre esta ventana desde una tarjeta del escritorio, solo que aquí no hay
          // nada que elegir.
          {...(proyectoActivoId === undefined
            ? {}
            : { alNuevaTarea: () => abrirVentanaDeTarea(proyectoActivoId) })}
          // Ver lo que hace, en vivo (Task 17): la MISMA pieza (`MirarTarea.tsx`,
          // vía `Kanban.tsx`/`TareasDelProyecto.tsx`) que monta el escritorio — antes
          // esta pestaña no la ofrecía en absoluto.
          {...(mirar === undefined ? {} : { alMirar: alMirarTarea, alDejarDeMirar: alDejarDeMirarTarea })}
          {...(mirandoTarea === undefined ? {} : { mirando: mirandoTarea })}
          {...(estado.mirada === undefined ? {} : { mirada: estado.mirada })}
        />
      }
      /*
        Ejecutar la app de este proyecto en un aparato (Task 10): el último tramo del
        viaje —el agente escribe, el verificador mira, y aquí se ARRANCA—, que hasta
        ahora era el terminal, la skill y `adb` a mano.

        Va como ranura, igual que las de al lado, y por el mismo motivo: el elemento
        solo se monta al elegir su pestaña, y MONTARSE es lo que la hace medir — la
        medida vive en el servidor y habla con `adb`, así que no se hereda de ninguna
        foto, se PIDE. Abrir la pestaña ES entrar a mirarlo.
      */
      ejecutar={
        <Ejecutar
          // El veredicto y el recorrido salen del STORE, no del cable: `estado.lanzable`
          // no lleva el discriminante del sobre (`clase: "lanzable"`, que es del mensaje
          // y no un dato), así que van directos y sin adaptador — el tipo de la pestaña
          // se declara sobre el estado justo para esto.
          veredicto={estado.lanzable}
          lanzamiento={estado.lanzamiento}
          // El inventario TAL CUAL lo manda el servidor, apagados incluidos: distinguir
          // «no hay ninguno enchufado» de «hay tres y ninguno arrancado» necesita la
          // lista entera, y la pestaña decide qué hacer con ella.
          dispositivos={estado.dispositivos?.dispositivos}
          // Y que vuelva a medir al entrar: la foto puede ser de hace rato, y esta
          // pestaña decide con ella en qué aparato se lanza la app.
          alActualizarDispositivos={actualizarDispositivos}
          // El dispositivo de la sesión: la MISMA fuente que la pastilla del compositor,
          // que es donde se elige y donde este botón va a caer.
          elegido={estado.alta?.dispositivoActivo}
          conectado={estado.conectado}
          alRevisar={revisarLanzamiento}
          alLanzar={lanzarApp}
          alCancelar={cancelarLanzamiento}
          alElegirDispositivo={elegirDispositivoDeEjecutar}
        />
      }
      // La tarjeta del chat abre el artefacto: cambia de pestaña y lo elige.
      />
    );

  /*
    La MISMA barra superior con sesión abierta y sin ella, y a propósito: es la barra de
    herramientas de la APLICACIÓN, no de la sesión — ahí viven la marca, el estado del cable
    y el botón de plegar la lateral. Por eso se monta una sola vez y se le pasa a `Maqueta`,
    que la cruza de lado a lado por encima de las dos columnas: estaba dentro de `centro`, o
    sea arrancando en el borde de la barra lateral, y ahí se leía como si fuera de la
    conversación.

    Lo único que cambia entre los dos casos son las PESTAÑAS: sin sesión no hay transcript ni
    trazas a los que llevar, y unas pestañas que no llevan a ningún sitio son el mismo
    botón muerto que este repo no consiente. `Cabecera` las omite cuando no se las pasan.
  */
  const cabecera = enSesion ? (
    <Cabecera
      titulo={tituloDeLaSesion ?? nombreDelProyectoActivo ?? "Sesión nueva"}
      // El proyecto delante de la sesión: «AppDemo / Hola». `Cabecera` no lo repite si el
      // título todavía ES el nombre del proyecto.
      {...(nombreDelProyectoActivo === undefined ? {} : { proyecto: nombreDelProyectoActivo })}
      // Ausente mientras el servidor no lo sepa: `Cabecera` no pinta pastilla entonces, en
      // vez de afirmar un modo que nadie ha leído.
      {...(estado.alta?.modo === undefined ? {} : { modo: estado.alta.modo })}
      conectado={estado.conectado}
      // El estado EFECTIVO, no la preferencia: si el reparto la ha plegado para hacerle
      // sitio al panel, el botón tiene que decir «Mostrar» — que es lo que se ve.
      barraContraida={reparto.barra === "plegada"}
      alAlternarBarra={alternarBarra}
      // El botón del panel solo con sesión: sin ella no hay ni ficheros ni revisión que
      // enseñar, y abriría una columna vacía.
      panelAbierto={vistaDelPanel !== undefined}
      alAlternarPanel={alternarPanel}
      alAbrirAjustes={() => abrirAjustes()}
      apariencia={apariencia}
      alCambiarApariencia={alCambiarApariencia}
      // La marca lleva al escritorio, y solo desde la sesión: en el escritorio ya estás.
      alIrAlEscritorio={() => setEnEscritorio(true)}
    />
  ) : (
    <Cabecera
      titulo="Escritorio"
      conectado={estado.conectado}
      barraContraida={reparto.barra === "plegada"}
      alAlternarBarra={alternarBarra}
      alAbrirAjustes={() => abrirAjustes()}
      apariencia={apariencia}
      alCambiarApariencia={alCambiarApariencia}
    />
  );

  return (
    <>
    <Maqueta
      // El EFECTIVO, no la preferencia: `repartoDeColumnas` la puede plegar para hacerle
      // sitio al panel, y eso no se guarda en ningún sitio.
      barraContraida={reparto.barra === "plegada"}
      {...(anchoBarra === undefined ? {} : { anchoBarra })}
      alRedimensionarBarra={alRedimensionarBarra}
      // La tercera columna. Solo cuando cabe: si no cabe, el mismo elemento se monta en el
      // centro (ver `elPanel`), nunca en los dos sitios a la vez.
      {...(reparto.panel === "columna" && elPanel !== undefined ? { panel: elPanel } : {})}
      {...(anchoPanel === undefined ? {} : { anchoPanel })}
      alRedimensionarPanel={alRedimensionarPanel}
      cabecera={cabecera}
      centro={
        // La rama ya NO se elige aquí: la pregunta de «qué proyecto abro y desde qué rama»
        // vive entera en `NuevaSesion`, que además dice que va a descargar. Un selector
        // suelto en mitad del centro no decía ni de qué proyecto era.
        enSesion ? (
          <>
            <AvisoDeConexion conectado={estado.conectado} />
            {/*
              La conversación, o el panel en su sitio si la ventana no da para los dos. La
              tira de pestañas ya no está aquí: se fue DENTRO del panel, que es de quien es
              (`Pestanas.tsx` cuenta las cuatro casas que ha tenido). Puesta aquí seguiría
              cambiando una columna que en la ventana ancha ya no es esta.
            */}
            {reparto.panel === "centro" && elPanel !== undefined ? elPanel : (
            <Transcript
              actos={estado.actos}
              turnoEnVuelo={estado.turnoEnVuelo === true}
              // Lo dice el servidor (`alta.historica`): una sesión reabierta que el agente
              // no recuerda. El chat lo enseña arriba y Revisión cambia su explicación.
              historica={estado.alta?.historica === true}
              // Lo dice el servidor con el modo de la sesión abierta
              // (`core/modoDeEscritura.ts`); el cliente no lo deduce. El aviso del chat es
              // un booleano porque solo habla de un caso —el autónomo—, y la pastilla que
              // lo cambia lleva el modo entero.
              sinAprobacion={estado.alta?.modoDeEscritura === "autonomo"}
              {...(estado.alta?.trabajoAlAbrir === undefined
                ? {}
                : { trabajoAlAbrir: estado.alta.trabajoAlAbrir })}
              {...(segundosEnVuelo === undefined ? {} : { segundosEnVuelo })}
              // Para el estado vacío de una sesión nueva: en qué proyecto estás y con qué
              // modelo va a trabajar. Los dos ya estaban en el estado.
              {...(nombreDelProyectoActivo === undefined ? {} : { proyecto: nombreDelProyectoActivo })}
              {...(estado.modelos?.actual === undefined ? {} : { modelo: estado.modelos.actual })}
              // Solo para decir DÓNDE está un artefacto, en ruta del proyecto. Puede faltar:
              // el id de sesión no existe hasta que se vuelca el primer acto, y entonces la
              // tarjeta enseña la ruta virtual en vez de componer una falsa.
              {...(estado.alta?.sesionActiva === undefined ? {} : { sesion: estado.alta.sesionActiva })}
              alAbrirArtefacto={abrirArtefacto}
              alAbrirFichero={abrirFicheroDeHallazgo}
              alPedirCorreccion={(texto) => setBorradorDelCompositor((b) => ({ texto, id: (b?.id ?? 0) + 1 }))}
            />
            )}
            {/*
              Las tres esperas de humano van DELANTE del compositor y cada una con su propio
              cauce: el compositor manda `prosa`, que entra por la cola de líneas del lazo y no
              resuelve ninguna. Retirarlas es cosa del cliente —el servidor resuelve su promesa
              y no emite ningún «ya está»—, y siempre DESPUÉS de que el envío haya llegado: con
              el `POST` fallido, lo que se queda en pantalla es la pregunta sin contestar, que
              es la verdad.

              El sitio en el árbol solo coloca a DOS de ellas. La de una DECISIÓN se monta
              aquí igual, pero se pinta en un diálogo por PORTAL (`Pregunta.tsx`), así que no
              es esta posición lo que la pone delante del compositor: nació aquí y aquí se
              quedaba pegada al fondo de la columna, que es el defecto que el portal arregla.
              Se deja en el mismo sitio porque lo que decide quién la monta es el ESTADO
              —`estado.pregunta`—, no el orden dentro de esta columna.
            */}
            {estado.pregunta !== undefined ? (
              <Pregunta
                texto={estado.pregunta.texto}
                // La FORMA, cuando el servidor la manda: la pregunta de sí o no enseña el
                // plan y contesta con dos botones en vez de con un campo. Ausente, campo
                // de texto — y se copia AUSENTE, no con una lista vacía.
                {...(estado.pregunta.decision === undefined
                  ? {}
                  : { decision: estado.pregunta.decision })}
                alResponder={async (respuesta) => {
                  await enviar({ clase: "respuesta", texto: respuesta });
                  store.contestarPregunta();
                }}
              />
            ) : null}
            {estado.secreto !== undefined && !ajustesAbiertos ? (
              // La MISMA pregunta, oculta: el valor no entra en el store ni en un acto, y
              // viaja por el único mensaje del cable que lo lleva. Con la ventana de
              // ajustes abierta la pinta ELLA, dentro de la fila del proveedor que se está
              // editando: dos sitios a la vez serían dos campos para una sola respuesta,
              // y el de detrás ni se vería.
              <Pregunta
                texto={estado.secreto.pregunta}
                oculta
                alResponder={async (valor) => {
                  await enviar({ clase: "secreto", valor });
                  store.contestarSecreto();
                }}
              />
            ) : null}
            {estado.selector !== undefined ? (
              <Selector
                titulo={estado.selector.titulo}
                opciones={estado.selector.opciones}
                {...(estado.selector.aviso === undefined ? {} : { aviso: estado.selector.aviso })}
                alElegir={async (id) => {
                  // `id: undefined` es cancelar, y viaja como la AUSENCIA del campo:
                  // `JSON.stringify` descarta las claves con ese valor, así que por el cable
                  // sale `{"clase":"eleccion"}` — que es lo que `consolaWeb` traduce a
                  // `undefined`. No hay clase nueva para cancelar.
                  await enviar({ clase: "eleccion", id });
                  store.contestarSelector();
                }}
              />
            ) : null}
            {consulta !== undefined && claveDeConsulta !== consultaApartada ? (
              <ConsultaDelAgente
                pregunta={consulta.pregunta}
                opciones={consulta.opciones}
                // La opción viaja como PROSA, lo mismo que si la persona la hubiera tecleado:
                // es el mensaje siguiente, y el motor ya sabe leerlo como la respuesta.
                alElegir={async (opcion) => {
                  await enviar({ clase: "prosa", texto: opcion });
                  setConsultaApartada(claveDeConsulta);
                }}
                alCerrar={() => setConsultaApartada(claveDeConsulta)}
              />
            ) : null}
            {/*
              Nada de alta aquí abajo: mientras `estado.alta.pasos` tiene algo pendiente,
              `enAlta` ya ha hecho el `return` de la pantalla de arranque de más arriba, así
              que este punto del árbol solo se alcanza con el alta resuelta. Un `<Wizard>`
              aquí no pintaría nunca — dos sitios para la misma condición es cómo uno de los
              dos se queda mintiendo el día que el otro cambie.
            */}
            <Compositor
              conectado={estado.conectado}
              {...(borradorDelCompositor === undefined ? {} : { borrador: borradorDelCompositor })}
              // El estado de modelos, tal cual lo manda el servidor: la pastilla lo pinta
              // y no lo deduce. Ausente mientras no ha llegado el mensaje.
              {...(estado.modelos === undefined ? {} : { modelos: estado.modelos })}
              // Lo consumido por la sesión. Ausente = no consta (sin sesión, o el ejecutor
              // de pega), y entonces el contador no se pinta en vez de enseñar un cero.
              {...(estado.consumo === undefined ? {} : { consumo: estado.consumo })}
              // El catálogo es una llamada de red por proveedor: se pide al desplegarlo,
              // no al conectar.
              alPedirCatalogo={(proveedor) => void enviar({ clase: "catalogo", proveedor })}
              alElegirModelo={(id) => void enviar({ clase: "modelo", id })}
              // El esfuerzo es de la SESIÓN y solo de la sesión: a diferencia del modelo, no
              // se guarda ningún defecto. `nivel` ausente significa quitarlo.
              alElegirEsfuerzo={(nivel) =>
                void enviar(nivel === undefined ? { clase: "esfuerzo" } : { clase: "esfuerzo", nivel })
              }
              // Los proveedores que la pastilla no lista —sin comprobar— se configuran aquí.
              alAbrirAjustes={() => abrirAjustes()}
              // El dispositivo de la sesión: viaja el ID y el servidor resuelve la foto
              // contra su última medida — el navegador no es fuente sobre la máquina.
              {...(estado.alta?.dispositivoActivo === undefined ? {} : { dispositivo: estado.alta.dispositivoActivo })}
              {...(estado.dispositivos === undefined ? {} : { dispositivos: estado.dispositivos })}
              alElegirDispositivo={(id) => void enviar(id === undefined ? { clase: "dispositivo" } : { clase: "dispositivo", id })}
              // El MISMO mensaje que el «Refrescar» de «Tu equipo»: medir es una sola acción.
              alMedirDispositivos={actualizarDispositivos}
              // El modo de escritura de la sesión. Ausente = no hay sesión abierta, y
              // entonces la pastilla no se pinta: un control sin dato detrás no se pinta.
              // Se manda la INTENCIÓN y el servidor la aplica encolando `/aprobacion`.
              {...(estado.alta?.modoDeEscritura === undefined
                ? {}
                : { modoDeEscritura: estado.alta.modoDeEscritura })}
              alElegirModoDeEscritura={(modo) => void enviar({ clase: "modoDeEscritura", modo })}
              // Lo dice el servidor, no se deduce de los actos: un turno que revienta no
              // siempre deja `fin`, y el compositor se quedaría apagado para siempre.
              turnoEnVuelo={estado.turnoEnVuelo === true}
              // Solo se esconde cuando el panel ocupa el SITIO del chat: ahí no hay a quién
              // escribirle. Con el panel en su columna la conversación sigue delante, así que
              // el compositor se queda — que es la mitad de lo que se ganó partiendo la
              // pantalla: mirar un fichero y seguir escribiendo.
              //
              // Se oculta y no se desmonta, para no perder el borrador al ir a mirar un
              // fichero y volver.
              oculto={reparto.panel === "centro"}
              alParar={() => void enviar({ clase: "cancelar" })}
              // Una línea que empieza por «/» no tiene camino propio: viaja como prosa
              // igual que cualquier otra, y es `correrConsola` quien la despacha contra
              // `COMANDOS` (`cli/consola.ts:819`) del lado del servidor — así `/ayuda`,
              // `/modelo`, `/config` y `/sync` funcionan aquí sin ningún código nuevo.
              alEnviar={(texto) => void enviar({ clase: "prosa", texto })}
            />
            <BarraDeEstado
              turnos={turnos}
              pasos={pasos}
              ms={ultimoFin?.ms}
              {...(ventana === undefined || ventana.usado === 0 ? {} : { contexto: ventana.usado })}
              {...(ventana?.tope === undefined ? {} : { tope: ventana.tope })}
              {...(segundosEnVuelo === undefined ? {} : { segundosEnVuelo })}
            />
            {estado.aprobacion !== undefined ? (
              <Aprobacion
                pendientes={estado.aprobacion.pendientes}
                ficheros={estado.aprobacion.ficheros}
                diffs={estado.aprobacion.diffs}
                alDecidir={async (decisiones) => {
                  // Se ESPERA al envío antes de retirar el modal. Medido antes de este
                  // arreglo: `void enviar(...)` no esperaba nada y `cerrarAprobacion` corría
                  // síncrono, así que un `POST` fallido cerraba el modal igual, la aprobación
                  // no llegaba al servidor y diez minutos después vencía como rechazo sin que
                  // nadie lo dijera — el usuario convencido de haber autorizado algo que no se
                  // autorizó. Si esto lanza, el modal se queda, suelta su candado y lo dice.
                  await enviar({ clase: "decision", decisiones });
                  store.cerrarAprobacion();
                }}
              />
            ) : null}
          </>
        ) : (
          // Sin sesión abierta el centro es el ESCRITORIO, no un hueco: los proyectos con
          // lo que se sabe de cada uno y un clic para empezar. Todo lo que pinta ya viajaba
          // por el cable; no hay tarjeta de relleno.
          <>
            {/* También aquí: sin servidor, el escritorio se veía entero y vivo. */}
            <AvisoDeConexion conectado={estado.conectado} />
            <Escritorio
            conectado={estado.conectado}
            // La misma elección que la barra: los destacados primero, el resto debajo.
            {...(estado.alta?.registrados.find((e) => e.id === entornoActivo)?.proyectos === undefined
              ? {}
              : { visibles: estado.alta.registrados.find((e) => e.id === entornoActivo)!.proyectos })}
            {...(estado.nombre === undefined ? {} : { nombre: estado.nombre })}
            {...(entornoDelEscritorio === undefined ? {} : { entorno: entornoDelEscritorio })}
            proyectos={estado.alta?.proyectos ?? []}
            {...(estado.modelos?.actual === undefined ? {} : { modelo: estado.modelos.actual })}
            alNuevaSesion={(proyecto) => abrirVentanaDeSesion(proyecto)}
            alNuevaTarea={(proyecto) => abrirVentanaDeTarea(proyecto)}
              alAbrirAjustes={() => abrirAjustes()}
              {...(estado.dispositivos === undefined ? {} : { dispositivos: estado.dispositivos })}
              alActualizarDispositivos={actualizarDispositivos}
              alVerificarDispositivo={(id) => void enviar({ clase: "conexion", id })}
              {...(estado.tareas === undefined ? {} : { tareas: estado.tareas })}
              alAbrirSesionDeTarea={(proyecto, sesion) => abrirSesion(proyecto, sesion)}
              // La verdad sobre lo que la tarea escribió vive en Revisión, no en el chat:
              // sin aprobación previa, esa pestaña es la única forma de mirar.
              alAbrirRevisionDeTarea={(proyecto, sesion) => abrirSesion(proyecto, sesion, "revision")}
              // Antes el escritorio solo reenviaba feedback — reintentar, descartar y
              // terminar eran solo de `TareasDelProyecto.tsx`, así que una tarea bloqueada
              // solo se desbloqueaba desde la pestaña del proyecto (Task 13).
              alReintentarTarea={alReintentarTarea}
              alDescartarTarea={alDescartarTarea}
              alTerminarTarea={alTerminarTarea}
              // Ver en vivo lo que hace una tarea. Solo se ofrece si esta ventana tiene el
              // canal: sin `mirar` inyectado el botón no llevaría a ninguna parte.
              {...(mirar === undefined ? {} : { alMirarTarea, alDejarDeMirarTarea })}
              {...(mirandoTarea === undefined ? {} : { mirandoTarea })}
              {...(estado.mirada === undefined ? {} : { mirada: estado.mirada })}
              // «Se edita la tarea y se agrega el feedback del usuario»: el servidor decide
              // cómo se aplica (`{clase:"tarea", accion:"feedback"}`, el mismo patrón que
              // `/modelo` desde la pastilla) — el cliente no manda comandos, manda intención.
              alEnviarFeedback={alEnviarFeedbackTarea}
              {...(estado.alta?.proyectoActivo === undefined ? {} : { proyectoActivo: estado.alta.proyectoActivo })}
            />
          </>
        )
      }
      barra={
        <Barra
          conectado={estado.conectado}
          // Los REGISTRADOS, no los ofrecidos. `entornos` es la lista fija de los dos
          // oficiales más «otro», que sirve para prerrellenar la URL en el alta; enseñarla
          // aquí hacía que un on-premise recién registrado se leyera como «XOne WebStudio»
          // — el nombre de otro servidor.
          entornos={estado.alta?.registrados ?? []}
          // Sigue sin haber señal del cable para «cuál es el ACTIVO», así que se asume el
          // primero. Con más de uno registrado esto podría mentir; hoy nada del servidor
          // dice cuál está en uso.
          entornoActivo={entornoActivo}
          // Cuál está abierto lo dice el servidor; sin ese dato no se marca nada, en vez de
          // resaltar el primero — una fila resaltada AFIRMA que ahí es donde estás.
          {...(estado.alta?.proyectoActivo === undefined ? {} : { proyectoActivo: estado.alta.proyectoActivo })}
          {...(estado.alta?.sesionActiva === undefined ? {} : { sesionActiva: estado.alta.sesionActiva })}
          // Las sesiones vienen en el mismo mensaje, por proyecto: una lista vacía a fuego
          // hacía que la barra dijera «Sin sesiones todavía» siempre, incluso con la copia
          // local llena de conversaciones guardadas.
          // Lo elegido para ESTE entorno; ausente = nadie lo ha dicho y manda la omisión de
          // la barra (los primeros cuatro).
          {...(estado.alta?.registrados.find((e) => e.id === entornoActivo)?.proyectos === undefined
            ? {}
            : { visibles: estado.alta.registrados.find((e) => e.id === entornoActivo)!.proyectos })}
          proyectos={(estado.alta?.proyectos ?? []).map((p) => ({
            ...p,
            sesiones: (p.sesiones ?? []).map((s) => ({ ...s, historica: true })),
          }))}
          // Cambiar de entorno trae SUS proyectos: es una conexión con CloudStudio, así
          // que la hace el servidor y contesta con la lista nueva.
          alElegirEntorno={(entorno) => void enviar({ clase: "entorno", accion: "activo", entorno })}
          // Reabrir una sesión guardada: el servidor abre esa copia local con ese hilo.
          alAbrirSesion={(proyecto, sesion) => abrirSesion(proyecto, sesion)}
          // Pide la rama del proyecto elegido (`vestibulo.ts#completarProyecto` la
          // necesita) sin abrir nada todavía: el `useEffect` de arriba decide, en cuanto
          // `estado.alta.ramas` responda, si la manda sola (una) o pinta el `Selector`
          // de más arriba (varias). Un segundo clic mientras se espera la respuesta
          // simplemente reemplaza cuál proyecto se está preguntando — no hay candado
          // porque no hay nada que envíe dos veces la MISMA cosa.
          // Pulsar el proyecto y pulsar «+» abren la MISMA ventana: es la misma decisión
          // —empezar a trabajar en ese proyecto—, y tener dos caminos para ella era lo que
          // hacía que uno de los dos (el «+») no hiciera nada.
          alAbrirProyecto={(proyecto) => abrirVentanaDeSesion(proyecto)}
          // Sesión NUEVA en ese proyecto: el mismo mensaje sin nombrar sesión. Si la copia
          // local todavía no existe, el servidor contesta con las ramas y se cae al camino
          // del alta, que es el que sabe bajarla — por eso hace falta recordar de qué
          // proyecto se está hablando, igual que al pulsar la fila.
          alNuevaSesion={(proyecto) => abrirVentanaDeSesion(proyecto)}
          // Lo elegido en el «…» de una sesión NO se ejecuta aquí: se guarda y lo confirma
          // una ventana. Las dos escriben en el índice del proyecto y una es irreversible.
          alAccionDeSesion={(proyecto, sesion, titulo, accion) =>
            setAccionDeSesion({ proyecto, sesion, titulo, accion })
          }
          // «Ajustes» abre la ventana de ajustes. Antes mandaba `/config` y volcaba la
          // configuración al transcript: era lo único que había, pero leer un volcado no es
          // configurar. El volcado sigue estando, dentro de la ventana, para quien quiera
          // verlo entero.
          alAbrirAjustes={() => abrirAjustes()}
          // El «Ajustes» del aviso de proyectos sin enseñar va DIRECTO a esa pestaña.
          alAbrirAjustesEnEntornos={() => abrirAjustes("entornos")}
          // Qué se está abriendo, para que la fila donde se pulsó lo diga. Lo manda el
          // servidor: es el único que sabe cuándo acaba (`clase: "abriendo"`).
          {...(abriendo === undefined ? {} : { abriendo })}
          // La versión ya formateada por el servidor, para el pie de la barra. Ausente = no
          // se pudo calcular al arrancar, y entonces la barra no pinta nada.
          {...(estado.alta?.version === undefined ? {} : { version: estado.alta.version })}
        />
      }
    />
    {ventanaDeAjustes}
    {ventanaDeSesion}
    {ventanaDeTarea}
    {ventanaDeAccionDeSesion}
    </>
  );
}
