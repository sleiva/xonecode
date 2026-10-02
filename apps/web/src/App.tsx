import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Planes } from "./componentes/Planes.js";
import { Colecciones } from "./componentes/Colecciones.js";
import type { crearStoreDelCliente } from "./store.js";
import type { ActoDeSincronizacion, FotoDelResumen, ListadoDeSoporte, MensajeDelCliente } from "./tipos.js";
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
import { Aprobacion } from "./componentes/Aprobacion.js";
import { Selector } from "./componentes/Selector.js";
import { Wizard } from "./componentes/Wizard.js";
import { PantallaDeArranque } from "./componentes/PantallaDeArranque.js";
import { TarjetaDeAlta } from "./componentes/TarjetaDeAlta.js";
import { FaseDeArranque } from "./componentes/FaseDeArranque.js";
import type { PasoDeAlta } from "./componentes/PasosDelAlta.js";
import { Escritorio } from "./componentes/Escritorio.js";
import type { ProyectoDelResumen } from "./componentes/ResumenDeProyecto.js";
import { NuevaSesion } from "./componentes/NuevaSesion.js";
import { NuevaTarea } from "./componentes/NuevaTarea.js";
import { AccionDeSesion, type AccionPendiente } from "./componentes/AccionDeSesion.js";
import { Ajustes, type SeccionDeAjustes } from "./componentes/Ajustes.js";
import { Revision } from "./componentes/Revision.js";
import { Ficheros } from "./componentes/Ficheros.js";
import { CloudStudio, Registro } from "./componentes/CloudStudio.js";
import type { EstadoDeSubida } from "./componentes/BotonSubir.js";
import type { ProgresoDeOperacion } from "./componentes/Pregunta.js";
import { Artefactos, type ArtefactoEnLista } from "./componentes/Artefactos.js";
import { TareasDelProyecto } from "./componentes/TareasDelProyecto.js";
import {
  PanelDelProyecto,
  nombreDelConector,
  type ContextoDeGestor,
  type CopiaDelPanel,
  type PeticionAlGestor,
} from "./componentes/PanelDelProyecto.js";
import { etiquetaDeClave } from "./etiquetaDeClave.js";
import { TarjetaDeCerrar, AvisoDelGestor, BotonDeCerrarEnJira } from "./componentes/TarjetaDeJira.js";
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

/** Cada cuánto se relee el plan mientras el agente trabaja con la pestaña Planes delante. */
export const MS_ENTRE_LECTURAS_DE_PLANES = 3000;

/**
 * El motivo de una negativa del servidor (409 con `{ motivo }`), o nada si no se negó. Lo usan
 * las acciones del resumen del proyecto: la regla vive en el servidor, y así su respuesta
 * llega a la pantalla en vez de quedarse en el terminal.
 */
async function negativaDe(respuesta: unknown): Promise<string | undefined> {
  const r = respuesta as Response | undefined;
  if (r?.status !== 409) return undefined;
  try {
    const cuerpo = (await r.json()) as { motivo?: unknown };
    return typeof cuerpo.motivo === "string" ? cuerpo.motivo : "el servidor se negó";
  } catch {
    return "el servidor se negó";
  }
}

export function App({
  store,
  enviar,
  subirAdjunto,
  subirAdjuntoDeSesion,
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
  /**
   * Lo mismo, para un adjunto del CHAT de la sesión abierta (Task 6, IXCODE-7): el «+» del
   * compositor, un soltado o un pegado. **Opcional y no obligatorio como `subirAdjunto`**:
   * así los montajes de test que no lo pasan siguen viendo un compositor sin «+» —«un
   * control sin dato detrás no se pinta»— en vez de tener que actualizar cada uno de ellos
   * para un adjunto que ese test no ejercita.
   */
  subirAdjuntoDeSesion?: Conexion["subirAdjuntoDeSesion"];
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
      // Y de un `.xne`, lo que cambió en su MODELO, que sale del mismo «antes» que el parche.
      // Va con él y no aparte porque se piden en los mismos dos momentos: al desplegar y en el
      // flanco de fin de turno, cuando el fichero puede haber vuelto a cambiar.
      if (ruta.toLowerCase().endsWith(".xne")) void enviar({ clase: "modeloDelCambio", ruta });
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

  /**
   * TODO lo pendiente de subir (la pestaña Sincronización del panel). Va JUNTO con la cifra de
   * la banda (`sync`): las dos miden lo mismo, y pedirlas por separado es la carrera de dos
   * respuestas que llegan en momentos distintos.
   */
  //
  // Y UNA vez por instante: al abrir la pestaña la banda y la lista se montan a la vez y las dos
  // piden al montarse; sin esto salían dos peticiones de cada (git y recuento de líneas dos
  // veces). La marca se suelta en la microtarea siguiente, así que un «Refrescar» después sí pide.
  const pidiendoPendientes = useRef(false);
  const pedirPendientesDeSubida = useCallback(() => {
    if (pidiendoPendientes.current) return;
    pidiendoPendientes.current = true;
    queueMicrotask(() => {
      pidiendoPendientes.current = false;
    });
    void enviar({ clase: "pendientesDeSubida" });
    void enviar({ clase: "sync", accion: "estado" });
  }, [enviar]);
  const [desplegadosDeSubida, setDesplegadosDeSubida] = useState<ReadonlySet<string> | undefined>(undefined);
  const desplegarDeSubida = useCallback(
    (ruta: string) => {
      setDesplegadosDeSubida((previas) => new Set([...(previas ?? []), ruta]));
      void enviar({ clase: "pendientesDeSubida", ruta });
    },
    [enviar]
  );
  const plegarDeSubida = useCallback((ruta: string) => {
    setDesplegadosDeSubida((previas) => {
      const siguientes = new Set(previas ?? []);
      siguientes.delete(ruta);
      return siguientes;
    });
  }, []);

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
   * ¿Se está mirando el PANEL del proyecto abierto (IXCODE-11) en vez de su chat?
   *
   * Estado de VISTA como `enEscritorio`, y por lo mismo: el proyecto sigue abierto en el
   * servidor. Lo enciende pulsar el proyecto en la barra —«pulsar un proyecto abre su panel»,
   * no una sesión vacía— y lo apaga todo lo que lleva a una conversación: abrir una sesión
   * (`abrirSesion`, que es por donde pasan la barra, el «+» y el propio panel) y el borrador
   * de «Nueva sesión con esta tarea», que abre el servidor y no pasa por `abrirSesion`.
   */
  const [enPanel, setEnPanel] = useState(false);

  /**
   * El proyecto SIN copia local cuyo panel se mira (decisión 5 de la fusión con el resumen de
   * Alejandro): pulsar el nombre de uno que no está en el equipo abre también su panel, solo
   * con la pestaña Resumen —pastillas y «Descargar»—, sin abrir nada en el servidor: abrirlo
   * sería DESCARGAR, y eso es la ventana de sesión nueva. Estado de VISTA como `enPanel`, y se
   * busca en el alta en cada render: si el proyecto sale del listado o ya está bajado, deja de
   * pintarse solo. Se apaga al abrir una sesión, al ir al escritorio y al cambiar de entorno.
   */
  const [panelSinCopia, setPanelSinCopia] = useState<string | undefined>(undefined);

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
      setEnPanel(false);
      // Lo que quedara para el compositor era de OTRA conversación: el compositor se desmonta
      // fuera del chat y, al volver a montarse, reaplicaría ese texto sobre una sesión que no
      // es la suya (el ticket de un «Empezar» ya enviado, reaparecido en una sesión nueva).
      setBorradorDelCompositor(undefined);
      setPanelSinCopia(undefined);
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

  /** Pedir los planes del proyecto (pestaña Planes). */
  const pedirPlanes = useCallback(() => {
    void enviar({ clase: "planes" });
  }, [enviar]);

  /** Pedir la foto del modelo XOne (pestaña Colecciones). Mismo motivo que `pedirArbol`. */
  const pedirColecciones = useCallback(() => {
    void enviar({ clase: "colecciones" });
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
      if (accion === "subir") setSubidaEsperando(true);
      void enviar({ clase: "sync", accion });
    },
    [enviar]
  );

  /**
   * «Subir» se pulsó y aún no ha salido el diálogo: el servidor mide git ANTES de preguntar, y
   * sin esto el clic no hacía nada visible durante segundos. Lo comparten la banda de Revisión
   * y la tarjeta del Resumen, que mandan la misma intención.
   *
   * **Deja de esperar por lo que PASA, no por un temporizador**: llega la pregunta con el plan;
   * llega el acto de una operación de subida (`/sync` lo anota siempre que no se rechace —árbol
   * sucio, nada que subir, el final de la subida—); llega un `sync` con error (sin proyecto
   * abierto); o se cae el cable, y con él la petición.
   */
  const [subidaEsperando, setSubidaEsperando] = useState(false);
  const ultimaSubida = registroDeSync.find((operacion) => operacion.accion === "subir")?.cuando;
  const ultimaSubidaVista = useRef(ultimaSubida);
  useEffect(() => {
    const operacionNueva = ultimaSubidaVista.current !== ultimaSubida;
    ultimaSubidaVista.current = ultimaSubida;
    if (
      operacionNueva ||
      estado.pregunta?.decision !== undefined ||
      estado.sync?.error !== undefined ||
      estado.conectado === false
    ) {
      setSubidaEsperando(false);
    }
  }, [ultimaSubida, estado.pregunta, estado.sync?.error, estado.conectado]);
  // Al terminar una subida, lo subido deja de estar pendiente: se vuelven a pedir la LISTA de
  // Revisión (cuyas marcas de pendiente pone el servidor) y la cifra de la banda. Las dos: con
  // solo la cifra, la lista seguiría enseñando lo que ya está arriba.
  const subidaRefrescada = useRef(ultimaSubida);
  useEffect(() => {
    if (subidaRefrescada.current === ultimaSubida) return;
    subidaRefrescada.current = ultimaSubida;
    if (estado.conectado !== true) return;
    pedirRevision();
    pedirSync();
    if (pendientesPedidos) void enviar({ clase: "pendientesDeSubida" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimaSubida, estado.conectado, pedirRevision, pedirSync]);
  /**
   * El diálogo de una operación de sincronización —subir o «Actualizar repo local»— SIGUE
   * abierto después de aceptar: gira mientras trabaja y al final dice cómo fue (o por qué
   * falló), y solo su «Aceptar» lo cierra. El servidor ya no tiene pregunta pendiente —se
   * contestó—, así que el diálogo se retiene AQUÍ con la pregunta, su operación y la última
   * operación de ESA acción que se conocía: la nueva que llegue después es la suya, y su acto
   * trae el resultado como dato (`resultado`, `bajados`, `error`).
   *
   * Se retiene en el MISMO `<Pregunta>` y en el mismo sitio del árbol de React, no en otro
   * componente: así no se desmonta y lo marcado sigue a la vista mientras sube.
   */
  const [operacionEnDialogo, setOperacionEnDialogo] = useState<
    | {
        pregunta: NonNullable<typeof estado.pregunta>;
        operacion: "subir" | "bajar";
        desde: string | undefined;
        cableCaido?: boolean;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    if (operacionEnDialogo !== undefined && estado.conectado === false && operacionEnDialogo.cableCaido !== true) {
      setOperacionEnDialogo({ ...operacionEnDialogo, cableCaido: true });
    }
  }, [estado.conectado, operacionEnDialogo]);
  /** La última operación conocida de una acción: su acto, el más reciente de ella. */
  const ultimaDe = (accion: "subir" | "bajar") => registroDeSync.find((operacion) => operacion.accion === accion);
  const operacionTerminada =
    operacionEnDialogo === undefined || ultimaDe(operacionEnDialogo.operacion)?.cuando === operacionEnDialogo.desde
      ? undefined
      : ultimaDe(operacionEnDialogo.operacion);
  const progresoDeOperacion: ProgresoDeOperacion | undefined =
    operacionEnDialogo === undefined
      ? undefined
      : operacionTerminada !== undefined
        ? {
            fase: "terminada",
            operacion: operacionEnDialogo.operacion,
            lineas: operacionTerminada.lineas,
            ...(operacionTerminada.resultado === undefined ? {} : { resultado: operacionTerminada.resultado }),
            ...(operacionTerminada.bajados === undefined ? {} : { bajados: operacionTerminada.bajados }),
            ...(operacionTerminada.error === undefined ? {} : { error: operacionTerminada.error }),
          }
        : operacionEnDialogo.cableCaido === true
          ? {
              fase: "terminada",
              operacion: operacionEnDialogo.operacion,
              lineas: [],
              motivo:
                operacionEnDialogo.operacion === "subir"
                  ? "Se ha perdido la conexión con xonecode mientras subía. Mira las últimas subidas al reconectar para saber qué llegó a subir."
                  : "Se ha perdido la conexión con xonecode mientras se actualizaba el repo local. Mira el estado de la copia al reconectar.",
            }
          : { fase: "trabajando", operacion: operacionEnDialogo.operacion };
  /**
   * La pregunta de DECISIÓN en pantalla: la pendiente del servidor si es de sí o no, o, tras
   * aceptar una subida, la retenida. La de texto libre NO es de aquí: vive en el hilo.
   */
  const preguntaDeDecision =
    estado.pregunta?.decision !== undefined ? estado.pregunta : operacionEnDialogo?.pregunta;
  /** La pregunta de TEXTO libre pendiente: esa sí es una mitad de conversación, y va en el hilo. */
  const preguntaDeTexto = estado.pregunta?.decision === undefined ? estado.pregunta : undefined;

  /**
   * El diálogo de una DECISIÓN —la subida, «Actualizar repo local»—, montado en UN solo sitio
   * y fuera de cualquier vista.
   *
   * Vivía en la columna del chat, y para verlo `hayEsperaDeHumano` sacaba del panel al chat:
   * pulsar «Subir» en el Resumen del proyecto te llevaba a otra pantalla para enseñarte un
   * diálogo que de todos modos sale por PORTAL, encima de todo. Ahora se monta aquí, en las
   * dos ramas del `return` (alta y maqueta), y sale donde se esté; las otras esperas de
   * humano —que sí son del hilo— siguen sacando al chat. Un solo sitio, además, es lo que
   * hace imposible pintar dos diálogos con dos estados de casillas distintos.
   */
  const dialogoDeDecision =
    preguntaDeDecision?.decision === undefined ? null : (
      <Pregunta
        texto={preguntaDeDecision.texto}
        decision={preguntaDeDecision.decision}
        {...(progresoDeOperacion === undefined ? {} : { progreso: progresoDeOperacion })}
        alCerrar={() => setOperacionEnDialogo(undefined)}
        alResponder={async (respuesta, seleccion) => {
          // Aceptar una operación de sincronización no cierra el diálogo: se retiene con la
          // última operación conocida de ESA acción, y la nueva dirá cómo terminó. La operación
          // la dice la decisión (`operacion`); una seleccionable sin ella es la subida.
          const pregunta = estado.pregunta;
          const operacion =
            pregunta?.decision?.operacion ?? (pregunta?.decision?.seleccionable === true ? "subir" : undefined);
          const retener = pregunta !== undefined && operacion !== undefined && respuesta === "s";
          if (retener) setOperacionEnDialogo({ pregunta, operacion, desde: ultimaDe(operacion)?.cuando });
          try {
            // Las rutas marcadas, cuando el diálogo dejó elegir (la subida).
            await enviar({ clase: "respuesta", texto: respuesta, ...(seleccion === undefined ? {} : { seleccion }) });
          } catch (error) {
            // El envío no llegó: el diálogo vuelve a ser la pregunta, para reintentar.
            if (retener) setOperacionEnDialogo(undefined);
            throw error;
          }
          store.contestarPregunta();
        }}
      />
    );

  const estadoDeSubida: EstadoDeSubida = {
    esperando: subidaEsperando,
    // Con un turno en marcha la orden se encola DETRÁS de él y el diálogo tardaría lo que
    // tarde el turno: se dice en vez de dejar el botón girando minutos.
    ...(estado.turnoEnVuelo === true && !subidaEsperando
      ? { motivoParaNo: "Hay un turno en marcha: se podrá subir cuando termine" }
      : {}),
    alSubir: () => sincronizar("subir"),
  };

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

  /** La línea del fichero elegido a la que se llegó desde un hallazgo. Va y viene CON él. */
  const [lineaElegida, setLineaElegida] = useState<number | undefined>(undefined);
  const elegirFichero = useCallback(
    (ruta: string | undefined) => {
      setFicheroElegido(ruta);
      // Elegirlo en el árbol es mirarlo entero: la línea de un hallazgo de antes ya no aplica.
      setLineaElegida(undefined);
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
    (ruta: string, linea?: number) => {
      elegirFichero(ruta);
      // DESPUÉS de elegir, que la borra: la línea es lo que distingue llegar desde un hallazgo.
      setLineaElegida(linea);
      abrirPanel("ficheros");
    },
    [elegirFichero, abrirPanel]
  );

  /** Lo que «Pedir corrección» deja en el compositor; el `id` hace que dos iguales cuenten dos. */
  const [borradorDelCompositor, setBorradorDelCompositor] = useState<{ texto: string; id: number } | undefined>(
    undefined
  );

  /**
   * «Nueva sesión con esta tarea» (IXCODE-11): el servidor abre la sesión nueva, la anuncia, y
   * DESPUÉS manda el borrador con la tarea. Al llegar se sale del panel al chat y el texto va al
   * compositor por el MISMO mecanismo que «Pedir corrección». **No se envía**: lo manda la
   * persona («que lo envíe yo»). Se mira el `id` del borrador, que solo crece, y no el texto: la
   * misma tarea dos veces son dos borradores.
   */
  const borradorDelGestor = estado.gestor?.borrador;
  /**
   * `destinoDeEmpezarRef`: el `destino` (nombre de la transición) que `alGestor` captura al
   * mandar `empezar` CON `transicion` — lo que el cable NUNCA lleva y R8 necesita para
   * componer «No se pudo pasar IXCODE-12 a EN CURSO…» (más abajo, `alGestor`). Se declara
   * aquí, ANTES de su primer lector, para no depender de que los efectos de este componente
   * corran DESPUÉS de que el resto del cuerpo de la función haya terminado de ejecutarse.
   */
  const destinoDeEmpezarRef = useRef<{ clave: string; destino: string } | undefined>(undefined);
  /**
   * R8 (IXCODE-11): si la transición de «empezar» falla, el servidor manda `gestor.error`
   * ANTES del `alta`/`borrador` de la sesión que se abre IGUAL (`arranque.ts#atenderGestor`,
   * caso `empezar`). Para cuando el borrador llega, ese error ya se retiró de
   * `estado.gestor.errores.empezar` —la MISMA respuesta que trae el borrador lo borra
   * (`store.ts`)—, así que se captura en un ref al VUELO, en cuanto aparece, para poder
   * leerlo todavía un instante después.
   */
  const errorDeEmpezarRef = useRef<{ motivo: string } | undefined>(undefined);
  const errorDeEmpezar = estado.gestor?.errores?.empezar;
  useEffect(() => {
    if (errorDeEmpezar !== undefined) errorDeEmpezarRef.current = errorDeEmpezar;
  }, [errorDeEmpezar]);
  const [avisoDeEmpezar, setAvisoDeEmpezar] = useState<string | undefined>(undefined);
  /**
   * `empezarEnVuelo`: HAY un `empezar` esperando respuesta, ahora mismo — VIVE en `App` y no
   * en `PanelDelProyecto` a propósito. Ese panel se DESMONTA con «Volver al chat» o con una
   * espera de humano (`hayEsperaDeHumano`, más abajo), y un candado en su estado local se
   * habría soltado SOLO con el desmontaje, dejando la fila re-habilitada mientras el
   * `empezar` de antes seguía resolviendo en el servidor. Aquí sobrevive al panel.
   *
   * **Cuándo se suelta, y por qué NO basta con «llegó un error»** (bug medido: `g.ficha()` —
   * la lectura de la tarea antes de intentar transicionar nada— es una llamada a Jira tan
   * capaz de fallar como la propia transición, y ese fallo NUNCA llega a `abrirProyecto`; con
   * transición, en cambio, el `catch` de `transicionar` no corta —`arranque.ts#atenderGestor`,
   * caso `empezar`— y el servidor SIGUE hacia `abrirProyecto` pase lo que pase. Un error, por
   * sí solo, no dice en cuál de los dos casos se está.
   *
   * La señal que SÍ lo dice es el `alta`: el `finally` de `atenderGestor` reanuncia SIEMPRE
   * que no se llegó a mandar el borrador (`!anunciada`), y esa reanuncia trae la
   * `sesionActiva` de ANTES —sin cambiar— porque no se abrió nada; el camino que SÍ abrió
   * algo manda un `alta` con la sesión NUEVA (y el borrador, después). Por eso se suelta el
   * candado cuando llega un `alta` fresco (cambia de identidad: es su PROPIO mensaje, no un
   * re-render por otra cosa) cuya `sesionActiva` sigue siendo la de antes de pedir `empezar`
   * —guardada en `sesionAlPedirEmpezarRef`—, o cuando llega el `borrador` (éxito).
   *
   * **Y hace falta una TERCERA condición, no solo las dos de arriba**: `estado.alta` también
   * cambia por cosas que no tienen nada que ver con este `empezar` —una tarea de fondo que
   * marca `trabajando`, otra pestaña, el `historica`/git diferido—, y cualquiera de ellas
   * podría llegar mientras `g.ficha()`/`g.transicionar()` siguen en el aire, con la MISMA
   * sesión todavía puesta. Por eso además hace falta que YA haya llegado un `error` de
   * ESTE intento (`errorDeEmpezarRef.current !== undefined`, puesto por el efecto de
   * arriba): todo camino de fallo total pasa por `fallo()` ANTES de que el `finally` mande
   * el `alta`, así que exigirlo no cuesta nada en el caso real y cierra el hueco del falso
   * positivo.
   */
  const [empezarEnVuelo, setEmpezarEnVuelo] = useState(false);
  const sesionAlPedirEmpezarRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!empezarEnVuelo) return;
    if (errorDeEmpezarRef.current === undefined) return;
    if (estado.alta?.sesionActiva !== sesionAlPedirEmpezarRef.current) return;
    setEmpezarEnVuelo(false);
    // Se mira el OBJETO `alta` entero: es el único dato que dice «llegó un mensaje `alta`
    // nuevo» — mirar `sesionActiva` a secas no distinguiría esto de cualquier otro re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.alta]);
  useEffect(() => {
    if (borradorDelGestor === undefined) return;
    setEnPanel(false);
    setEnEscritorio(false);
    setEmpezarEnVuelo(false);
    setBorradorDelCompositor((b) => ({ texto: borradorDelGestor.texto, id: (b?.id ?? 0) + 1 }));
    const error = errorDeEmpezarRef.current;
    errorDeEmpezarRef.current = undefined;
    const pendiente = destinoDeEmpezarRef.current;
    destinoDeEmpezarRef.current = undefined;
    // R8: NO es «empezar falló» — la sesión se abrió igual, y eso es lo que dice el aviso.
    // Dos frases y no una interpolación de la misma: «a <destino>» pide una preposición que
    // «al estado pedido» ya se trae puesta, y una sola plantilla las concatenaba en «a al…».
    const destino = pendiente?.clave === borradorDelGestor.clave ? pendiente.destino : undefined;
    setAvisoDeEmpezar(
      error === undefined
        ? undefined
        : destino === undefined
          ? `No se pudo cambiar el estado de ${etiquetaDeClave(borradorDelGestor.clave) ?? borradorDelGestor.clave}: ${error.motivo}. La sesión se abrió igual.`
          : `No se pudo pasar ${etiquetaDeClave(borradorDelGestor.clave) ?? borradorDelGestor.clave} a ${destino}: ${error.motivo}. La sesión se abrió igual.`
    );
    // Solo el id: el objeto cambia de identidad con cualquier otro mensaje del gestor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borradorDelGestor?.id]);

  /**
   * `alGestor`: el ÚNICO punto por el que sale una petición al gestor de tareas (Task 11,
   * IXCODE-11), tanto para `PanelDelProyecto` como para «Cerrar en Jira» aquí abajo. Lo que
   * el cable NUNCA lleva —el `destino` de la transición elegida al pulsar «Pasar y
   * empezar»— se captura en `destinoDeEmpezarRef` (arriba), que el efecto de R8 consulta:
   * `gestor.transiciones` puede ser ya el de OTRA clave para cuando la respuesta llegue,
   * porque la sesión ya se mudó (`PanelDelProyecto.js#ContextoDeGestor`).
   */
  const alGestor = useCallback(
    (peticion: PeticionAlGestor, contexto?: ContextoDeGestor): void => {
      if (peticion.accion === "empezar") {
        // Una tentativa NUEVA empieza LIMPIA: el motivo de un intento anterior con esta
        // misma tarjeta —cancelado antes de que llegara su borrador— no se puede colar en
        // el aviso de ESTA (mismo espíritu que R6, aplicado al ref en vez de al store).
        errorDeEmpezarRef.current = undefined;
        destinoDeEmpezarRef.current =
          peticion.transicion === undefined || contexto?.destino === undefined
            ? undefined
            : { clave: peticion.clave, destino: contexto.destino };
        setEmpezarEnVuelo(true);
        sesionAlPedirEmpezarRef.current = estado.alta?.sesionActiva;
      }
      void enviar({ clase: "gestor", ...peticion } as MensajeDelCliente);
    },
    // `estado.alta?.sesionActiva` entra a propósito: sin ella, esta función se quedaría
    // cerrada sobre la sesión de cuando `enviar` cambió de identidad (casi al montar), y
    // `sesionAlPedirEmpezarRef` grabaría siempre la MISMA sesión vieja.
    [enviar, estado.alta?.sesionActiva]
  );

  /**
   * «Cerrar en Jira» (IXCODE-11): un botón en una sesión ligada a un ticket, visible sin turno
   * en vuelo. Pide `borradorDeCierre` (el comentario propuesto) Y `transiciones` a la vez; la
   * tarjeta se abre TRAS `cierre` —no al pulsar el botón—, así que nunca enseña un campo de
   * texto vacío mientras espera: el comentario ya está cuando aparece.
   */
  const ticketDeLaSesion = estado.alta?.proyectos
    .find((p) => p.id === proyectoActivoId)
    ?.sesiones?.find((s) => s.id === estado.alta?.sesionActiva)?.ticket;
  /**
   * El NOMBRE del gestor del TICKET de la sesión («Jira», «Notion»), del catálogo (IXCODE-15): lo
   * que dicen el botón y la tarjeta de cerrar. Es el del ticket y no el del gestor vinculado
   * AHORA: el servidor cierra con `ticket.conector`, así que una tarea de Jira se cierra en Jira
   * aunque el proyecto ya esté vinculado a Notion. Sin conector o sin catálogo, la frase es neutra
   * («Cerrar la tarea»), nunca «Jira» por omisión.
   */
  const conectorDelTicket = estado.alta?.proyectos
    .find((p) => p.id === proyectoActivoId)
    ?.sesiones?.find((s) => s.id === estado.alta?.sesionActiva)?.ticketConector;
  const nombreDelGestor = nombreDelConector(estado.conectores, conectorDelTicket);
  const [tarjetaCerrarAbierta, setTarjetaCerrarAbierta] = useState(false);
  const [pidiendoCierre, setPidiendoCierre] = useState(false);
  const [enviandoCerrar, setEnviandoCerrar] = useState(false);
  const [avisoDeCierre, setAvisoDeCierre] = useState<string | undefined>(undefined);
  const destinoDeCerrarRef = useRef<string | undefined>(undefined);
  /** Lo que ya había en `errores.cerrar`/`errores.transiciones` cuando la tarjeta ABRIÓ (R6):
   *  ver `erroresAlAbrirRef` de `PanelDelProyecto.tsx`, misma disciplina. */
  const erroresAlAbrirCerrarRef = useRef<{ cerrar?: { motivo: string }; transiciones?: { motivo: string } }>({});

  const cierreDelGestor = estado.gestor?.cierre;
  const errorCerrar = estado.gestor?.errores?.cerrar;
  const errorTransicionesDelGestor = estado.gestor?.errores?.transiciones;
  useEffect(() => {
    if (cierreDelGestor === undefined) return;
    setPidiendoCierre(false);
    setTarjetaCerrarAbierta(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cierreDelGestor]);
  const errorBorradorDeCierre = estado.gestor?.errores?.borradorDeCierre;
  useEffect(() => {
    // Un fallo de `borradorDeCierre` no llega a abrir la tarjeta: se dice como el mismo aviso
    // corto que un cierre logrado, en vez de dejar el botón «Preparando…» para siempre.
    if (errorBorradorDeCierre === undefined) return;
    setPidiendoCierre(false);
    setAvisoDeCierre(`No se pudo preparar el cierre: ${errorBorradorDeCierre.motivo}`);
  }, [errorBorradorDeCierre]);
  useEffect(() => {
    // `cerrar` NO tiene un «sigue igual» tras el fallo (a diferencia de `empezar`): si
    // `comentar` lanza, el servidor sale al `catch` de fuera sin transicionar (Task 10) — así
    // que cualquier error aquí SÍ es el final, y soltar el candado siempre es correcto. La
    // tarjeta se queda abierta, con su motivo y el texto intacto. Un fallo de la TRANSICIÓN,
    // con el comentario ya escrito, no llega por aquí: viaja en `cerrado.falloDeTransicion`.
    if (errorCerrar !== undefined) setEnviandoCerrar(false);
  }, [errorCerrar]);
  const cerradoDelGestor = estado.gestor?.cerrado;
  useEffect(() => {
    if (cerradoDelGestor === undefined) return;
    setTarjetaCerrarAbierta(false);
    setEnviandoCerrar(false);
    const destino = destinoDeCerrarRef.current;
    destinoDeCerrarRef.current = undefined;
    // Comentado y la transición FALLÓ: la tarjeta se cierra igual —reabrirla ofrecería
    // «Comentar y pasar a X» otra vez, y un segundo intento comentaría DOS veces— y el aviso
    // dice las dos mitades.
    const fallo = cerradoDelGestor.falloDeTransicion;
    const clave = etiquetaDeClave(cerradoDelGestor.clave) ?? cerradoDelGestor.clave;
    setAvisoDeCierre(
      fallo !== undefined
        ? `${clave}: comentado; no se pudo ${destino === undefined ? "aplicar la transición" : `pasar a ${destino}`}: ${fallo}`
        : `${clave}: comentado${destino === undefined ? "" : ` y pasado a ${destino}`}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cerradoDelGestor?.id]);
  /**
   * Cambiar de SESIÓN suelta todo lo pendiente de la anterior: `cerrar` actúa sobre la
   * sesión ABIERTA (`arranque.ts#atenderGestor`), así que un `pidiendoCierre`/tarjeta/aviso
   * que sobreviviera al cambio apuntaría al ticket de OTRA conversación. Cubre también el
   * guardián de `cierreDelGestor.clave === ticketDeLaSesion` de más abajo: los dos juntos
   * son lo que impide que la tarjeta se quede pintada sobre una sesión que ya no es la suya.
   */
  const sesionActivaActual = estado.alta?.sesionActiva;
  useEffect(() => {
    setPidiendoCierre(false);
    setTarjetaCerrarAbierta(false);
    setAvisoDeCierre(undefined);
    // `avisoDeEmpezar` SÍ se resetea aquí, y es SEGURO pese a que «empezar» con éxito TAMBIÉN
    // cambia `sesionActivaActual` (abre la sesión nueva): ese cambio llega con el `alta`, que
    // es SIEMPRE anterior al `borrador` que compone el aviso (`arranque.ts#atenderGestor`,
    // «el alta ANTES que el borrador»). El reset de aquí, pues, corre y no hace nada (el
    // aviso todavía no existe); el `borrador` lo pone DESPUÉS, en un render posterior, sin que
    // este efecto vuelva a dispararse (`sesionActivaActual` ya no cambia otra vez).
    setAvisoDeEmpezar(undefined);
    // `errorDeEmpezarRef`/`destinoDeEmpezarRef` NO se tocan aquí a propósito: los limpia
    // `alGestor` al EMPEZAR cada tentativa nueva, no un cambio de sesión — limpiarlos aquí
    // borraría el ref que R8 necesita leer DESPUÉS del `alta` que este mismo efecto observa.
    destinoDeCerrarRef.current = undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionActivaActual]);
  /**
   * Al CAERSE el cable no va a volver ninguna respuesta a lo que estuviera en vuelo
   * (`marcarDesconectado` tira `estado.gestor` entero, `store.ts`): un candado que sobreviva
   * a la caída se queda cerrado para siempre, porque la bienvenida de la reconexión trae un
   * `alta` con la MISMA sesión —la condición de «sigue igual» de arriba también se cumpliría,
   * pero solo si además llegó un error, y aquí no llega ninguno—. Mismo motivo por el que el
   * panel viejo lo hacía en su propio efecto de `conectado` antes de que este candado se
   * mudara a `App` (Task 11).
   */
  useEffect(() => {
    if (estado.conectado) return;
    setEmpezarEnVuelo(false);
    setPidiendoCierre(false);
    setEnviandoCerrar(false);
    setTarjetaCerrarAbierta(false);
  }, [estado.conectado]);

  const transicionesDelGestor = estado.gestor?.transiciones;
  const transicionesDeCerrar =
    transicionesDelGestor !== undefined &&
    cierreDelGestor !== undefined &&
    transicionesDelGestor.clave === cierreDelGestor.clave &&
    transicionesDelGestor.para === "cerrar"
      ? transicionesDelGestor
      : undefined;
  const errorCerrarAMostrar = errorCerrar !== erroresAlAbrirCerrarRef.current.cerrar ? errorCerrar : undefined;
  const errorTransicionesCerrarAMostrar =
    errorTransicionesDelGestor !== erroresAlAbrirCerrarRef.current.transiciones ? errorTransicionesDelGestor : undefined;

  const alPedirCerrar = (): void => {
    if (ticketDeLaSesion === undefined) return;
    setPidiendoCierre(true);
    // El snapshot de R6 se toma AQUÍ, al pedir —no cuando llega `cierre`—: el servidor
    // atiende `borradorDeCierre` y `transiciones` a la vez (`arranque.ts`, dos `atenderGestor`
    // sin esperarse), así que un `error{transiciones}` puede llegar ANTES que `cierre`. Si el
    // snapshot se tomara al abrir la tarjeta, ese error —de ESTE mismo intento— quedaría
    // marcado como «viejo» y se callaría, justo el fallo mudo que R6 existe para evitar.
    erroresAlAbrirCerrarRef.current = { cerrar: errorCerrar, transiciones: errorTransicionesDelGestor };
    alGestor({ accion: "borradorDeCierre" });
    alGestor({ accion: "transiciones", clave: ticketDeLaSesion, para: "cerrar" });
  };
  const confirmarCerrar = (comentario: string, transicion?: string): void => {
    destinoDeCerrarRef.current = transicion === undefined ? undefined : transicionesDeCerrar?.lista.find((t) => t.id === transicion)?.destino;
    setEnviandoCerrar(true);
    alGestor({ accion: "cerrar", comentario, ...(transicion === undefined ? {} : { transicion }) });
  };

  /**
   * Una espera de HUMANO —aprobación, pregunta, secreto, selector— saca del panel al chat.
   *
   * Sus diálogos viven en la rama del chat, que es donde se han pintado siempre; con el panel
   * delante no se veían, y una aprobación sin ver vence sola como RECHAZO al cabo del plazo del
   * servidor. Se sale en vez de copiar los diálogos al panel: una sola casa para cada uno, y al
   * contestar ya se está donde el turno sigue. El efecto apaga `enPanel` para que, contestada,
   * no se vuelva al panel de rebote; `hayEsperaDeHumano` lo cubre ya en el mismo render.
   */
  // Las DECISIONES no cuentan: su diálogo se monta fuera de las vistas (`dialogoDeDecision`)
  // y sale donde se esté, así que no hace falta llevar a nadie al chat para verlo.
  const hayEsperaDeHumano =
    estado.aprobacion !== undefined ||
    preguntaDeTexto !== undefined ||
    estado.secreto !== undefined ||
    estado.selector !== undefined;
  useEffect(() => {
    if (hayEsperaDeHumano) {
      setEnPanel(false);
      setPanelSinCopia(undefined);
    }
  }, [hayEsperaDeHumano]);

  // Revisión arranca PLEGADA: al llegar la lista no se despliega ningún bloque ni se pide
  // ningún parche. Lo único que hace este efecto es OLVIDAR lo desplegado cuando el store
  // tira la foto (otra sesión, cable caído), para que las filas abiertas de la sesión
  // anterior no sigan abiertas sobre los ficheros de otra.
  const listaDeRevision = estado.revision?.lista;
  useEffect(() => {
    if (listaDeRevision === undefined) setDesplegados(undefined);
  }, [listaDeRevision]);
  const pendientesPedidos = estado.pendientesDeSubida !== undefined;
  useEffect(() => {
    if (!pendientesPedidos) setDesplegadosDeSubida(undefined);
  }, [pendientesPedidos]);

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
    // Lo pendiente de subir (la pestaña Sincronización del panel), si ya se pidió alguna vez: el
    // turno acaba de escribir, así que hay más. Y sus diffs abiertos, que pueden haber cambiado.
    if (pendientesPedidos) {
      pedirPendientesDeSubida();
      for (const ruta of desplegadosDeSubida ?? []) void enviar({ clase: "pendientesDeSubida", ruta });
    }
    // El agente pudo escribir un `.xne`, y un modelo viejo contesta con autoridad y equivocado.
    if (vistaDelPanel === "colecciones") pedirColecciones();
    // Y un plan se pide SIEMPRE, esté delante o no: su pestaña solo existe si hay alguno, así
    // que el turno en el que el analista escribe el primero es el que la hace aparecer.
    pedirPlanes();
    // `desplegados` y `ficheroElegido` NO van en las dependencias a propósito: desplegar y
    // elegir ya piden lo suyo por su cuenta, y tenerlos aquí lo pediría dos veces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnoEnVuelo, vistaDelPanel, pedirRevision, pedirParche, pedirArbol, pedirColecciones, pedirPlanes, pedirSync, enviar]);

  /**
   * **Con la pestaña Planes delante y el agente trabajando, el plan se relee solo**, cada
   * `MS_ENTRE_LECTURAS_DE_PLANES`: quien desarrolla marca el estado y quien comprueba en el
   * aparato marca las casillas A MITAD de turno, y esperar al fin del turno dejaba la pestaña
   * diciendo «0 de 7» mientras el `TASKS.md` ya decía otra cosa. Se relee el DISCO y no se
   * escucha a las tools: por el cable llega «se llamó a una tool», no «ya escribió», y así
   * también se ve un plan que alguien edita a mano. Solo con la pestaña delante: detrás no lo
   * mira nadie, y el fin del turno lo relee igual.
   */
  const planesALaVista = vistaDelPanel === "planes";
  useEffect(() => {
    if (!turnoEnVuelo || !planesALaVista || !estado.conectado) return;
    const reloj = setInterval(pedirPlanes, MS_ENTRE_LECTURAS_DE_PLANES);
    return () => clearInterval(reloj);
  }, [turnoEnVuelo, planesALaVista, estado.conectado, pedirPlanes]);

  /**
   * Los planes se piden en cuanto hay proyecto abierto y cable, sin esperar a la pestaña: la
   * pestaña solo EXISTE si hay alguno, así que esperarla sería no enterarse nunca. El store los
   * tira al cambiar de sesión y al caerse el cable, y eso vuelve a disparar esto.
   */
  const hayProyectoAbierto = estado.alta?.proyectoAbierto === true;
  const tienePlanes = estado.planes !== undefined;
  useEffect(() => {
    if (!estado.conectado || !hayProyectoAbierto || tienePlanes) return;
    pedirPlanes();
  }, [estado.conectado, hayProyectoAbierto, tienePlanes, pedirPlanes]);
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
   * El alta que había al ABRIR la ventana de sesión nueva. Un `aviso` de ese alta es de un
   * paso anterior —de otro proyecto, quizá—, y la ventana solo enseña los que llegan después.
   */
  const altaAlAbrirVentana = useRef<unknown>(undefined);
  /**
   * La descarga pedida desde esa ventana, con el alta que había al pedirla. Mientras está, la
   * ventana dice «Descargando proyecto…» y no deja volver a empezar. La salda el servidor:
   * con el proyecto ya abierto, la ventana se cierra; sin él y con un `aviso`, el motivo sale
   * en la ventana y se puede reintentar.
   */
  const [descargaPedida, setDescargaPedida] = useState<{ proyecto: string; alta: unknown } | undefined>(undefined);
  useEffect(() => {
    if (descargaPedida === undefined) return;
    if (estado.conectado === false) {
      setDescargaPedida(undefined);
      return;
    }
    if (estado.alta === descargaPedida.alta) return;
    if (estado.alta?.proyectoAbierto === true && estado.alta.proyectoActivo === descargaPedida.proyecto) {
      // Bajado y abierto: la ventana ya no tiene nada que decir, y el centro es la sesión.
      setDescargaPedida(undefined);
      setSesionNueva(undefined);
      setPanelSinCopia(undefined);
      setEnEscritorio(false);
      return;
    }
    // El servidor ya no está abriendo nada y dice por qué: falló, y la ventana lo enseña.
    if (estado.abriendo === undefined && estado.alta?.aviso !== undefined) setDescargaPedida(undefined);
  }, [descargaPedida, estado.alta, estado.abriendo, estado.conectado]);
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
      <>
      {dialogoDeDecision}
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
          {preguntaDeTexto !== undefined ? (
            <Pregunta
              texto={preguntaDeTexto.texto}
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
      </>
    );
  }

  // Sin proyecto abierto: la maqueta completa (barra con datos reales) pero el centro
  // espera. Antes de este cambio `enAlta` en `false` implicaba SIEMPRE un proyecto
  // abierto —era el único paso que podía quedar—; ahora hace falta mirarlo aparte.
  const proyectoAbierto = estado.alta?.proyectoAbierto ?? false;

  /** El proyecto SIN copia cuyo panel se pidió, buscado en el alta de AHORA (ver `panelSinCopia`). */
  const proyectoSinCopia =
    panelSinCopia === undefined
      ? undefined
      : estado.alta?.proyectos?.find((p) => p.id === panelSinCopia && p.local !== true);
  /** Se pidió ver un panel de proyecto —el del abierto o el de uno sin copia— en vez del chat. */
  const panelPedido = enPanel || proyectoSinCopia !== undefined;
  const enSesion = proyectoAbierto && !enEscritorio && !(panelPedido && !hayEsperaDeHumano);
  /** El panel del proyecto ocupa el centro: hay proyecto, no se mira el escritorio, se pidió, y
   *  no hay nadie esperando una respuesta en el chat (ver `hayEsperaDeHumano`). */
  const enProyecto =
    proyectoAbierto && !enEscritorio && enPanel && proyectoSinCopia === undefined && !hayEsperaDeHumano;
  /** El panel de un proyecto SIN copia: solo su Resumen. Cede al chat igual que el otro si la
   *  sesión abierta espera a alguien. */
  const enProyectoSinCopia =
    proyectoSinCopia !== undefined && !enEscritorio && !(proyectoAbierto && hayEsperaDeHumano);

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
  /** Los fijados del entorno activo (`Entorno.fijados`). Ausente = ninguno. */
  const fijadosDelEntorno = estado.alta?.registrados.find((e) => e.id === entornoActivo)?.fijados;

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
    // Sin copia, la ventana; el resumen (si se vino desde su «Descargar») se queda debajo
    // hasta que la descarga abra el proyecto.
    altaAlAbrirVentana.current = estado.alta;
    setDescargaPedida(undefined);
    setSesionNueva(proyecto);
    setEnEscritorio(false);
    // El borrador que quedara era de OTRA conversación, igual que en `abrirSesion`: esta ventana
    // abre una sesión nueva sin pasar por ahí, y sin esto el ticket de un «Empezar» anterior
    // reaparecía en su compositor.
    setBorradorDelCompositor(undefined);
    // Ni el panel: lo que se abra desde esta ventana es una CONVERSACIÓN, y su «Empezar» no pasa
    // por `abrirSesion` —manda el alta directa—, así que aquí es donde se apaga.
    setEnPanel(false);
    void enviar({ clase: "alta", paso: "proyecto", proyecto });
  };

  /**
   * Pulsar un proyecto en la barra (IXCODE-11): su PANEL, no una sesión vacía.
   *
   * Con copia local se abre el proyecto como siempre (`abrirSesion`) y se pinta el panel; si
   * ya es el ABIERTO no se manda nada —abrirlo otra vez soltaría la sesión en curso por una
   * nueva y vacía, justo lo que «no crear una nueva sesión» pide evitar—. Sin copia local sigue
   * el camino de siempre, la ventana que descarga: no hay panel de algo que no está en el equipo.
   */
  const abrirProyecto = (proyecto: string): void => {
    const identidad = estado.alta?.proyectos.find((p) => p.id === proyecto);
    setEnEscritorio(false);
    if (identidad?.local !== true) {
      // Sin copia, su panel con solo el Resumen: no se abre NADA en el servidor —abrir sería
      // descargar, y eso lo decide «Descargar» (o el «+») en la ventana de la rama—.
      setEnPanel(false);
      setPanelSinCopia(proyecto);
      return;
    }
    setPanelSinCopia(undefined);
    if (!(proyectoAbierto && estado.alta?.proyectoActivo === proyecto)) abrirSesion(proyecto);
    setEnPanel(true);
  };

  /**
   * Lo de la COPIA para la pestaña Resumen del panel (`ResumenDeProyecto.tsx`): la fila del
   * proyecto en el alta y los cuatro manejadores que hablan con el servidor. Las negativas
   * (409 con `{ motivo }`) llegan hasta la pantalla por `negativaDe`.
   */
  const copiaDelPanel = (proyecto: ProyectoDelResumen): CopiaDelPanel => ({
    proyecto,
    alDescargar: () => abrirVentanaDeSesion(proyecto.id),
    alAbrirCarpeta: async (id) => negativaDe(await enviar({ clase: "copiaLocal", accion: "abrirCarpeta", proyecto: id })),
    // Como `alQuitarEntorno`: el servidor contesta 409 con `{ motivo }` si se niega, y la
    // negativa llega hasta la ventana. El alta siguiente trae el proyecto ya «sin descargar».
    //
    // Borrada, la vista se QUEDA en ese proyecto, ya como uno sin copia: el servidor cierra su
    // consola y el foco puede pasar a otra, y sin esto el centro enseñaría el panel de OTRO
    // proyecto (o el escritorio). Hasta que el alta diga que ya no es `local`, `proyectoSinCopia`
    // no lo encuentra y sigue el panel de antes: sin parpadeo del chat.
    alBorrarCopia: async (id) => {
      const motivo = await negativaDe(await enviar({ clase: "copiaLocal", accion: "borrar", proyecto: id }));
      if (motivo === undefined) setPanelSinCopia(id);
      return motivo;
    },
    // La foto del servidor: lo que queda por subir, la MISMA medida que la banda de Revisión.
    // Lo que no se entiende es «no consta», nunca un cero.
    alPedirResumen: async (id) => {
      const r = (await enviar({ clase: "copiaLocal", accion: "resumen", proyecto: id })) as Response | undefined;
      if (r === undefined || !r.ok) return undefined;
      try {
        const cuerpo = (await r.json()) as { tareas?: unknown; sync?: unknown };
        if (!Array.isArray(cuerpo.tareas) || !cuerpo.tareas.every((t) => typeof t === "string")) return undefined;
        return {
          tareas: cuerpo.tareas as string[],
          ...(typeof cuerpo.sync === "object" && cuerpo.sync !== null
            ? { sync: cuerpo.sync as NonNullable<FotoDelResumen["sync"]> }
            : {}),
        };
      } catch {
        return undefined;
      }
    },
  });
  /**
   * El listado de la pestaña Soporte: chats y tareas con su análisis previo, en la PROPIA
   * respuesta del POST, como la foto del resumen. Lo que no se entiende es «no se pudo».
   */
  const alPedirSoporte = async (id: string): Promise<ListadoDeSoporte | undefined> => {
    const r = (await enviar({ clase: "soporte", accion: "listar", proyecto: id })) as Response | undefined;
    if (r === undefined || !r.ok) return undefined;
    try {
      const cuerpo = (await r.json()) as { chats?: unknown; tareas?: unknown };
      if (!Array.isArray(cuerpo.chats) || !Array.isArray(cuerpo.tareas)) return undefined;
      return { chats: cuerpo.chats as ListadoDeSoporte["chats"], tareas: cuerpo.tareas as ListadoDeSoporte["tareas"] };
    } catch {
      return undefined;
    }
  };
  /** La fila del proyecto ABIERTO en el alta, para lo de su copia en el panel. */
  const identidadDelActivo = estado.alta?.proyectos.find((p) => p.id === estado.alta?.proyectoActivo);

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
        // Solo las ramas DE ESTE proyecto (`ramasDe`): las del último proyecto preguntado
        // seguían en el alta mientras llegaban las nuevas, y se podía empezar con una rama de
        // otro. Hasta que lleguen, la ventana espera con el combo bloqueado.
        ramas={estado.alta?.ramasDe === sesionNueva ? (estado.alta?.ramas ?? []) : []}
        // El motivo del último paso fallido, y solo si llegó DESPUÉS de abrir la ventana: uno
        // de antes es de otro paso. Sin él la ventana se quedaba en «consultando» para siempre.
        {...(estado.alta?.aviso === undefined || estado.alta === altaAlAbrirVentana.current || descargaPedida !== undefined
          ? {}
          : { aviso: estado.alta.aviso })}
        descargando={descargaPedida !== undefined}
        alEmpezar={(rama) => {
          const proyecto = sesionNueva;
          // Con copia local es una sesión nueva y ya; sin ella hay que darlo de alta y
          // bajarlo, que es lo que sabe hacer el camino del alta con su rama — y la ventana
          // se QUEDA, diciendo que descarga, hasta que el servidor diga cómo acabó.
          if (rama === undefined) {
            setSesionNueva(undefined);
            setEnEscritorio(false);
            abrirSesion(proyecto);
            return;
          }
          setDescargaPedida({ proyecto, alta: estado.alta });
          void enviar({ clase: "alta", paso: "proyecto", proyecto, rama });
        }}
        // Cierra la ventana, no la descarga: esa sigue y se ve en la fila del proyecto.
        alCerrar={() => {
          setSesionNueva(undefined);
          setDescargaPedida(undefined);
        }}
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
      // Ausente = la sección de Conectores no se pinta en absoluto, ni la navegación ni el
      // panel — «un control sin dato detrás no se pinta».
      {...(estado.conectores === undefined ? {} : { conectores: estado.conectores })}
      // El resultado NO viaja en la respuesta: `probar` y `autorizar` corren en segundo
      // plano (red, o esperar al navegador) y lo que cambien llega por un `conectores`
      // NUEVO — el host lo reemite por `alCambiar` del servicio, el mismo molde que
      // `dispositivo`/`conexion`.
      alAccionDeConector={(accion, id) => void enviar({ clase: "conector", accion, id })}
      // El alta viaja por su propia rama de la unión: no lleva `id` —lo deriva el servidor del
      // nombre—, así que no es un séptimo valor de `accion` con un segundo parámetro de otro
      // tipo. Ver `PropsDeConectores`.
      alCrearDeConector={(definicion) => void enviar({ clase: "conector", accion: "crear", definicion })}
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
      alAjustarAvd={(avd, cambio) => void enviar({ clase: "ajusteDeAvd", avd, ...cambio })}
      alPararEmulador={(id) => void enviar({ clase: "pararEmulador", id })}
      alCrearEmulador={(nombre, desde) => void enviar({ clase: "crearEmulador", nombre, ...(desde ?? {}) })}
      alEliminarEmulador={(avd) => void enviar({ clase: "eliminarEmulador", avd })}
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
      // Guardar MUDA lo bajado: primero se pregunta qué se movería —la respuesta viene en el
      // propio POST—, y aplicar devuelve la negativa del servidor (409) si la hay.
      alCambiarWorkspace={async (ruta) => negativaDe(await enviar({ clase: "workspace", ruta, accion: "aplicar" }))}
      alPlanearWorkspace={async (ruta) => {
        const r = (await enviar({ clase: "workspace", ruta, accion: "planear" })) as Response | undefined;
        const negativa = await negativaDe(r);
        if (negativa !== undefined) return { proyectos: [], motivo: negativa };
        if (r === undefined || !r.ok) return undefined;
        try {
          const cuerpo = (await r.json()) as { proyectos?: unknown; megas?: unknown; motivo?: unknown };
          if (!Array.isArray(cuerpo.proyectos)) return undefined;
          const proyectos = cuerpo.proyectos.filter(
            (p): p is { entorno: string; proyecto: string } =>
              typeof p === "object" && p !== null && typeof (p as { entorno?: unknown }).entorno === "string" && typeof (p as { proyecto?: unknown }).proyecto === "string"
          );
          return {
            proyectos,
            ...(typeof cuerpo.megas === "number" ? { megas: cuerpo.megas } : {}),
            ...(typeof cuerpo.motivo === "string" ? { motivo: cuerpo.motivo } : {}),
          };
        } catch {
          return undefined;
        }
      }}
      {...(estado.mudanzaDeWorkspace === undefined ? {} : { mudanzaDeWorkspace: estado.mudanzaDeWorkspace })}
      // La casilla «Depurar». Ausente = el servidor no lo dice, y entonces no se pinta.
      {...(estado.depuracionActiva === undefined ? {} : { depuracionActiva: estado.depuracionActiva })}
      alCambiarDepuracion={(activa) => void enviar({ clase: "depuracion", activa })}
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
      alRenombrarEntorno={async (entorno, nombre) => {
        // La MISMA costura que `alQuitarEntorno`, y por el mismo motivo: la regla de qué nombre
        // vale es del servidor, y su negativa viaja en el CUERPO de un 409 —`informar` no llega
        // al navegador desde el vestíbulo—, así que aquí un `undefined` significa «lo escribió».
        const r = (await enviar({
          clase: "entorno",
          accion: "renombrar",
          entorno,
          nombre,
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
  /**
   * La lista de tareas en background del proyecto, montada aquí y entregada al panel DEL
   * PROYECTO (`PanelDelProyecto.tsx`, pestaña Tareas, PRIMERO y encima de las pendientes del
   * gestor). Ya no vive en el panel lateral —la marca «xonecode», son del proyecto y no de la
   * sesión, a petición suya—, así que solo tiene esta única casa.
   */
  const tareasEnFondo = (
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
  );

  const elPanel =
    !panelAbierto || vistaDelPanel === undefined ? undefined : (
      <Panel
        pestana={vistaDelPanel}
        alElegirPestana={abrirPanel}
        alCerrar={() => setVistaDelPanel(undefined)}
        hayArtefactos={artefactos.length > 0}
        // La pestaña Planes solo existe con algún plan: una lista MEDIDA y no vacía.
        hayPlanes={(estado.planes?.lista?.length ?? 0) > 0}
        actos={estado.actos}
      revision={
        <Revision
          historica={estado.alta?.historica === true}
          {...(estado.revision === undefined ? {} : { via: estado.revision.via })}
          {...(estado.revision?.mezclados === undefined ? {} : { mezclados: estado.revision.mezclados })}
          ficheros={estado.revision?.lista ?? []}
          parches={estado.parches ?? {}}
          modelosDelCambio={estado.modelosDelCambio ?? {}}
          desplegados={desplegados ?? new Set()}
          alDesplegar={desplegar}
          alPlegar={plegar}
          alRecargar={pedirRevision}
          conectado={estado.conectado}
          // Sin sincronización ni registro: Subir es del PROYECTO y vive en la pestaña
          // Sincronización de su panel. Aquí queda lo de esta conversación pendiente de subir.
        />
      }
      planes={
        <Planes
          {...(estado.planes?.lista === undefined ? {} : { planes: estado.planes.lista })}
          {...(estado.planes?.error === undefined ? {} : { error: estado.planes.error })}
        />
      }
      colecciones={
        <Colecciones
          {...(estado.colecciones?.foto === undefined ? {} : { foto: estado.colecciones.foto })}
          {...(estado.colecciones?.error === undefined ? {} : { error: estado.colecciones.error })}
          conectado={estado.conectado}
          alPedir={pedirColecciones}
          // «Abrir» un `.xne` es el MISMO camino que el de un hallazgo: elegirlo en Ficheros y
          // abrir esa pestaña, que aquí es irse de esta.
          alAbrirFichero={abrirFicheroDeHallazgo}
        />
      }
      ficheros={
        <Ficheros
          {...(estado.arbol === undefined ? {} : { arbol: estado.arbol })}
          contenidos={estado.contenidos ?? {}}
          {...(ficheroElegido === undefined ? {} : { elegido: ficheroElegido })}
          {...(lineaElegida === undefined ? {} : { linea: lineaElegida })}
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
  const cabecera = enProyecto || enProyectoSinCopia ? (
    // El panel del proyecto: su nombre arriba y la marca que lleva al escritorio. Sin el botón
    // del panel lateral —ese panel es de una SESIÓN, y aquí no hay ninguna delante—.
    <Cabecera
      titulo={(enProyectoSinCopia ? proyectoSinCopia?.nombre : nombreDelProyectoActivo) ?? "Proyecto"}
      {...(estado.alta?.modo === undefined ? {} : { modo: estado.alta.modo })}
      conectado={estado.conectado}
      barraContraida={reparto.barra === "plegada"}
      alAlternarBarra={alternarBarra}
      alAbrirAjustes={() => abrirAjustes()}
      apariencia={apariencia}
      alCambiarApariencia={alCambiarApariencia}
      alIrAlEscritorio={() => {
        setEnEscritorio(true);
        setPanelSinCopia(undefined);
      }}
    />
  ) : enSesion ? (
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

  /**
   * La pestaña Sincronización del panel del proyecto: la MISMA vista que Revisión, en su modo
   * `pendientes` —todo lo que falta por subir, con el diff contra CloudStudio—, con la banda de
   * Subir / Actualizar repo local y las últimas subidas arriba. `via` solo cuando la lista ha
   * llegado: `Revision` pide al montar mientras falta.
   */
  const pendientesDeSubida = estado.pendientesDeSubida;
  const pestanaDeSincronizacion = (
    <Revision
      modo="pendientes"
      {...(pendientesDeSubida?.lista === undefined ? {} : { via: "git" as const })}
      {...(pendientesDeSubida?.error === undefined ? {} : { error: pendientesDeSubida.error })}
      ficheros={pendientesDeSubida?.lista ?? []}
      parches={estado.parchesDeSubida ?? {}}
      desplegados={desplegadosDeSubida ?? new Set()}
      alDesplegar={desplegarDeSubida}
      alPlegar={plegarDeSubida}
      alRecargar={pedirPendientesDeSubida}
      conectado={estado.conectado}
      {...(registroDeSync.length === 0 ? {} : { registro: <Registro operaciones={registroDeSync} /> })}
      cloudstudio={
        <CloudStudio
          {...(estado.sync === undefined ? {} : { sync: estado.sync })}
          alPedir={sincronizar}
          subida={estadoDeSubida}
          // La cifra y la lista, juntas: miden lo mismo.
          alRecargar={pedirPendientesDeSubida}
          conectado={estado.conectado}
        />
      }
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
        enProyectoSinCopia ? (
          // El panel de un proyecto que NO está en el equipo: solo su Resumen, con «Descargar».
          // Va PRIMERO: se pide desde una sesión abierta igual que desde el escritorio, y en los
          // dos casos es lo que el usuario acaba de pedir mirar. Sin gestor ni planes: los dos
          // son de la consola ABIERTA, que es la de otro proyecto.
          <>
            <AvisoDeConexion conectado={estado.conectado} />
            <PanelDelProyecto
              key={proyectoSinCopia.id}
              nombre={proyectoSinCopia.nombre}
              {...(entornoDelEscritorio === undefined ? {} : { entorno: entornoDelEscritorio.nombre })}
              copia={copiaDelPanel(proyectoSinCopia)}
              conectado={estado.conectado}
              empezarEnVuelo={false}
              alGestor={alGestor}
              alAutorizarConector={(id) => void enviar({ clase: "conector", accion: "autorizar", id })}
              alProbarConector={(id) => void enviar({ clase: "conector", accion: "probar", id })}
              alAbrirAjustesDeConectores={() => abrirAjustes("conectores")}
              alPedirSoporte={alPedirSoporte}
            />
          </>
        ) : enSesion ? (
          <>
            <AvisoDeConexion conectado={estado.conectado} />
            {/*
              IXCODE-11: los avisos cortos de las dos tarjetas que escriben en Jira —el de
              R8 («la sesión se abrió igual») y el de «Cerrar en Jira» al terminar—, y el
              botón que abre esta última. Van ANTES del transcript, en la misma fila que la
              conexión: no son conversación, son lo que el harness acaba de hacer sobre el
              ticket de esta sesión.
            */}
            {avisoDeEmpezar === undefined ? null : (
              <AvisoDelGestor texto={avisoDeEmpezar} alCerrar={() => setAvisoDeEmpezar(undefined)} />
            )}
            {avisoDeCierre === undefined ? null : (
              <AvisoDelGestor texto={avisoDeCierre} alCerrar={() => setAvisoDeCierre(undefined)} />
            )}
            {/*
              Visible SOLO con un ticket y SIN turno en vuelo: escribir sobre una sesión que
              el agente sigue tocando compite con lo que está a punto de dejar (misma regla
              que las dos puertas a una sesión nueva del panel).
            */}
            {ticketDeLaSesion === undefined || turnoEnVuelo ? null : (
              <BotonDeCerrarEnJira
                ticket={ticketDeLaSesion}
                {...(nombreDelGestor === undefined ? {} : { nombreDelGestor })}
                ocupado={pidiendoCierre}
                conectado={estado.conectado}
                alPedir={alPedirCerrar}
              />
            )}
            {/*
              R de «Cerrar»: `cierre.clave` es el ticket que `borradorDeCierre` leyó de la
              sesión ABIERTA en el momento de pedirlo — si la sesión cambió desde entonces
              (`ticketDeLaSesion` ya es otro, o ninguno), la tarjeta no se pinta: escribiría
              sobre un ticket que ya no es el de esta conversación. El efecto de
              `sesionActivaActual` de arriba ya la cierra en ese mismo instante; esto es la
              segunda llave, contra la tarjeta que la persona todavía tuviera delante.
            */}
            {!tarjetaCerrarAbierta || cierreDelGestor === undefined || cierreDelGestor.clave !== ticketDeLaSesion ? null : (
              <TarjetaDeCerrar
                // Por el id del `cierre`: uno NUEVO con la tarjeta abierta trae su texto, y el
                // `useState` de la tarjeta solo lee `comentario` al montar.
                key={cierreDelGestor.id}
                clave={cierreDelGestor.clave}
                {...(nombreDelGestor === undefined ? {} : { nombreDelGestor })}
                comentario={cierreDelGestor.comentario}
                // El objeto se pasa TAL CUAL —mismo porqué que en `PanelDelProyecto.tsx`—: un
                // literal `{lista, propuesta}` fresco en cada render de `App` resetearía la
                // transición que la persona acaba de elegir en el desplegable.
                {...(transicionesDeCerrar === undefined ? {} : { transiciones: transicionesDeCerrar })}
                {...(errorTransicionesCerrarAMostrar === undefined ? {} : { errorTransiciones: errorTransicionesCerrarAMostrar.motivo })}
                enviando={enviandoCerrar}
                {...(errorCerrarAMostrar === undefined ? {} : { error: errorCerrarAMostrar.motivo })}
                alConfirmar={confirmarCerrar}
                alCancelar={() => setTarjetaCerrarAbierta(false)}
              />
            )}
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
              // La pregunta del agente se contesta en su tarjeta, DENTRO del hilo. La opción
              // viaja como PROSA, lo mismo que si la persona la hubiera tecleado: es el mensaje
              // siguiente, y el motor ya sabe leerlo como la respuesta.
              alResponderConsulta={async (texto) => {
                await enviar({ clase: "prosa", texto });
              }}
            />
            )}
            {/*
              Las tres esperas de humano van DELANTE del compositor y cada una con su propio
              cauce: el compositor manda `prosa`, que entra por la cola de líneas del lazo y no
              resuelve ninguna. Retirarlas es cosa del cliente —el servidor resuelve su promesa
              y no emite ningún «ya está»—, y siempre DESPUÉS de que el envío haya llegado: con
              el `POST` fallido, lo que se queda en pantalla es la pregunta sin contestar, que
              es la verdad.

              La de una DECISIÓN ya no se monta aquí: es un diálogo por portal y vive en
              `dialogoDeDecision`, fuera de las vistas, para salir donde se esté.
            */}
            {preguntaDeTexto !== undefined ? (
              <Pregunta
                texto={preguntaDeTexto.texto}
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

            {/*
              Nada de alta aquí abajo: mientras `estado.alta.pasos` tiene algo pendiente,
              `enAlta` ya ha hecho el `return` de la pantalla de arranque de más arriba, así
              que este punto del árbol solo se alcanza con el alta resuelta. Un `<Wizard>`
              aquí no pintaría nunca — dos sitios para la misma condición es cómo uno de los
              dos se queda mintiendo el día que el otro cambie.
            */}
            <Compositor
              conectado={estado.conectado}
              // Apaga la caja: una aprobación, pregunta, selector o secreto EN PANTALLA
              // compite por la misma respuesta. El turno en vuelo a secas ya NO la apaga
              // desde IXCODE-4 — se puede escribir una nota mientras el agente trabaja en
              // silencio.
              hayPendiente={
                estado.aprobacion !== undefined ||
                estado.pregunta !== undefined ||
                estado.selector !== undefined ||
                estado.secreto !== undefined
              }
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
              {...(estado.enUsoDeDispositivos === undefined ? {} : { dispositivosEnUso: estado.enUsoDeDispositivos })}
              {...(nombreDelProyectoActivo === undefined ? {} : { proyectoActual: nombreDelProyectoActivo })}
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
              // siempre deja `fin`, y el botón de Parar y el borde de «trabajando» se
              // quedarían encendidos para siempre.
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
              // El «+», soltar y pegar (Task 6, IXCODE-7): solo con sesión abierta —este
              // `<Compositor>` ya vive entero dentro de `enSesion` (ver más arriba)— y con
              // la capacidad inyectada. Sin ella no se pinta: un control sin dato detrás no
              // se pinta, la misma regla que `alElegirDispositivo`.
              {...(subirAdjuntoDeSesion === undefined
                ? {}
                : { alSubirAdjunto: (fichero: File, nombre: string) => subirAdjuntoDeSesion(nombre, fichero) })}
              // Una línea que empieza por «/» no tiene camino propio: viaja como prosa
              // igual que cualquier otra, y es `correrConsola` quien la despacha contra
              // `COMANDOS` (`cli/consola.ts:819`) del lado del servidor — así `/ayuda`,
              // `/modelo`, `/config` y `/sync` funcionan aquí sin ningún código nuevo.
              //
              // Los `adjuntos` viajan solo si hay alguno: ausente ≠ vacío, la misma regla
              // que el resto del cable — un mensaje sin ese campo es «ninguno», no «se
              // mandó una lista vacía a propósito».
              // Enter con el turno en marcha ES «detener y replanificar» (IXCODE-4) cuando el
              // servidor dice que ESTE turno lo admite: los especialistas cierran con su resumen y
              // el orquestador replanifica con lo escrito. Sin eso (deepagents) viaja como prosa y
              // el servidor la encola o la apunta como nota.
              alEnviar={(texto, adjuntos) =>
                void enviar({
                  clase: "prosa",
                  texto,
                  ...(adjuntos.length === 0 ? {} : { adjuntos }),
                  ...(turnoEnVuelo && estado.turnoDetenible === true ? { detener: true } : {}),
                })
              }
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
        ) : enProyecto ? (
          <>
            <AvisoDeConexion conectado={estado.conectado} />
            <PanelDelProyecto
              // Uno por proyecto: al cambiar de proyecto se vuelve a montar y vuelve a preguntar
              // el estado de SU gestor, en vez de quedarse con la pestaña y la búsqueda del otro.
              key={proyectoActivoId ?? ""}
              nombre={nombreDelProyectoActivo ?? "Proyecto"}
              {...(entornoDelEscritorio === undefined ? {} : { entorno: entornoDelEscritorio.nombre })}
              // La rama solo si ya se midió (`sync`): no se pide aquí una medida para pintarla.
              {...(estado.sync?.rama === undefined ? {} : { rama: estado.sync.rama })}
              {...(estado.planes?.lista === undefined ? {} : { planes: estado.planes.lista })}
              // Lo de la copia, arriba del Resumen: la fila del proyecto ABIERTO en el alta.
              {...(identidadDelActivo === undefined
                ? {}
                : {
                    // El proyecto ABIERTO es el que sincroniza el servidor: solo su tarjeta
                    // ofrece «Subir», y vuelve a medir cuando una subida termina.
                    copia: {
                      ...copiaDelPanel(identidadDelActivo),
                      subida: estadoDeSubida,
                      ...(ultimaSubida === undefined ? {} : { marcaDeSubida: ultimaSubida }),
                    },
                  })}
              tareasEnFondo={tareasEnFondo}
              // La pestaña Sincronización: solo con copia, que es el proyecto que sincroniza.
              {...(identidadDelActivo === undefined ? {} : { sincronizacion: pestanaDeSincronizacion })}
              {...(estado.gestor === undefined ? {} : { gestor: estado.gestor })}
              {...(estado.conectores === undefined ? {} : { conectores: estado.conectores })}
              conectado={estado.conectado}
              // Con un turno en marcha el servidor no abre una sesión NUEVA —devuelve la que
              // trabaja—, y el panel lo dice con la vuelta al chat a mano.
              turnoEnVuelo={turnoEnVuelo}
              empezarEnVuelo={empezarEnVuelo}
              alVolverAlChat={() => setEnPanel(false)}
              alGestor={alGestor}
              // El MISMO mensaje que «Conectar» en Ajustes: el servidor elige el carril
              // (navegador para OAuth, `leerSecreto` para una clave) y el resultado llega
              // por un `conectores` nuevo.
              alAutorizarConector={(id) => void enviar({ clase: "conector", accion: "autorizar", id })}
              alProbarConector={(id) => void enviar({ clase: "conector", accion: "probar", id })}
              alAbrirAjustesDeConectores={() => abrirAjustes("conectores")}
              alPedirSoporte={alPedirSoporte}
            />
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
            // Y los fijados, para que las dos cuentas de «sin enseñar» coincidan.
            {...(fijadosDelEntorno === undefined ? {} : { fijados: fijadosDelEntorno })}
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
          // El panel de un proyecto sin copia es del entorno que se deja: se cierra con él.
          alElegirEntorno={(entorno) => {
            setPanelSinCopia(undefined);
            void enviar({ clase: "entorno", accion: "activo", entorno });
          }}
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
          //
          // IXCODE-11: ya no. Pulsar el proyecto abre su PANEL (`abrirProyecto`); el «+» sigue
          // siendo la sesión nueva directa. Sin copia local los dos caen en la misma ventana.
          alAbrirProyecto={(proyecto) => abrirProyecto(proyecto)}
          // La fila marcada es la del panel que se mira, no la sesión de detrás: con el panel
          // delante no se está leyendo ningún chat.
          {...(enProyecto && proyectoActivoId !== undefined
            ? { proyectoEnResumen: proyectoActivoId }
            : enProyectoSinCopia
              ? { proyectoEnResumen: proyectoSinCopia.id }
              : {})}
          // Los fijados del entorno activo, con el mismo trato que `visibles`.
          {...(fijadosDelEntorno === undefined ? {} : { fijados: fijadosDelEntorno })}
          // La lista ENTERA viaja: se compone aquí y el servidor la guarda tal cual.
          alFijar={(proyecto, fijar) => {
            const actuales = fijadosDelEntorno ?? [];
            const proyectos = fijar
              ? [...actuales.filter((id) => id !== proyecto), proyecto]
              : actuales.filter((id) => id !== proyecto);
            void enviar({ clase: "entorno", accion: "fijados", entorno: entornoActivo, proyectos });
          }}
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
    {dialogoDeDecision}
    </>
  );
}
