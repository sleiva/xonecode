/**
 * El estado de presentación del cliente, SIN React — mismo pacto que `cli/tui/store.ts`:
 * los componentes solo pintan y la semántica se prueba sin montar nada.
 *
 * Una `reemision` SUSTITUYE el transcript entero en vez de fusionarlo. Es lo que hace que
 * reconectar sea idempotente: el servidor es la única fuente de verdad del transcript, y
 * fusionar obligaría a deduplicar por identidad de acto —que no tenemos— y duplicaría
 * líneas en cuanto una reconexión pillara al servidor a mitad de turno.
 *
 * Una `sustitucion` reemplaza el ÚLTIMO acto en vez de anexarlo. Existe porque `pielWeb`
 * avisa también de ACTUALIZACIONES: el cierre de una racha de tools reemplaza a su
 * apertura dentro del mismo acto `herramientas` (`core/actos.ts#conLineaDeTool`,
 * `web/servidor/transporte.ts#MensajeAlCliente`). El colapsador del motor escribe apertura
 * Y cierre porque stdio solo puede añadir; un store que anexara a ciegas pintaría las dos
 * líneas —«→ lee src/app.xne» y luego «→ lee ×3 — …»— para una sola racha, que es
 * exactamente lo que la TUI ya evita en `cli/tui/store.ts` con la misma sustitución.
 */
import type {
  Acto,
  MensajeAlCliente,
  PasoDelWizard,
  FicheroTocado,
  FicheroDelProyecto,
  AgenteDelCable,
  ProveedorDeModelos,
  SelectorDeConsola,
  Dispositivo,
  Herramienta,
  InformeDeDispositivos,
  AjustesDeDispositivos,
  DispositivoElegido,
} from "./tipos.js";
import { PLATAFORMAS_DE_DISPOSITIVO } from "./tipos.js";

export interface EstadoDelCliente {
  actos: Acto[];
  conectado: boolean;
  pregunta?: { texto: string };
  /**
   * Los modelos, tal y como los cuenta el servidor: cuál está en vigor y qué hay.
   * Ausente = todavía no ha llegado el mensaje. NUNCA se deriva de un acto del transcript
   * ni se recuerda entre conexiones: al caerse el SSE se tira (`marcarDesconectado`) y la
   * reconexión lo vuelve a traer entero.
   */
  modelos?: { actual?: string; proveedores: ProveedorDeModelos[] };
  /**
   * Cómo fue el último alta o baja de proveedor personalizado. El motivo llega por el cable
   * y no como acto de sistema porque la ventana de ajustes no pinta el transcript — mismo
   * motivo que el `aviso` del selector durante el alta. Se tira al caerse el cable: es un
   * acuse de una operación, no un estado.
   */
  proveedor?: { hecho: boolean; motivo?: string };
  /** Los subagentes y los `.md` que no se pudieron leer. Ausente = todavía no ha llegado el
   *  mensaje, que NO es lo mismo que «no hay ninguno»: la ventana lo distingue. */
  agentes?: { lista: AgenteDelCable[]; problemas: string[] };
  /**
   * Qué hay en la máquina para probar la app (`core/dispositivos.ts`), tal como lo midió el
   * servidor. Ausente = todavía no llegó: el escritorio dice «consultando…». NO se tira al
   * caerse el cable como `modelos`: es una foto con hora de la máquina, no un estado que el
   * servidor pueda haber cambiado sin decirlo, y la reconexión la vuelve a mandar igual.
   */
  dispositivos?: InformeDeDispositivos;
  /**
   * Qué destinos se miran (`settings.json`), como los cuenta el servidor. Ausente = todavía
   * no llegó ninguna foto; `{}` = nadie ha elegido y se miran todos. No se tira al caerse
   * el cable, por lo mismo que el informe: es configuración del equipo, no un estado en
   * vuelo.
   */
  ajustesDeDispositivos?: AjustesDeDispositivos;
  /** Hay un turno corriendo AHORA. Lo dice el servidor; el cliente no lo deduce. */
  turnoEnVuelo?: boolean;
  /**
   * Lo que la sesión ha tocado (pestaña Revisión). Ausente = todavía no se ha pedido. Los
   * TRES `via` se guardan: «sin-empezar» se tiraba y la pestaña se quedaba consultando.
   * Los parches se guardan por ruta según se piden: uno grande no se vuelve a traer por
   * plegar y desplegar la fila.
   */
  revision?: { via: "git" | "sin-marca" | "sin-empezar"; lista: FicheroTocado[] };
  parches?: Record<string, { texto: string; recortado: boolean }>;
  /**
   * El árbol del proyecto abierto y los contenidos ya traídos, por ruta (pestaña Ficheros).
   * Son una FOTO del disco: se tiran con la sesión y sin cable, como los parches.
   */
  arbol?: { rutas: string[]; recortado: boolean; error?: string };
  contenidos?: Record<string, FicheroDelProyecto>;
  /**
   * Los ARTEFACTOS ya traídos, por su ruta virtual (`/artefactos/<nombre>`).
   *
   * Aparte de `contenidos` porque son otra cosa: no son del proyecto, viven con la sesión y
   * su LISTA no sale de aquí —sale de los actos del transcript, que ya la traen y sobreviven
   * a reabrir—. Esto es solo el contenido que se ha pedido para verlo, y se tira con la
   * sesión y sin cable por lo mismo que los contenidos: son de la conversación de antes.
   */
  artefactos?: Record<string, FicheroDelProyecto>;
  selector?: {
    titulo: string;
    opciones: { id: string; etiqueta: string; detalle?: string }[];
    /** El motivo que manda el servidor (`SelectorDeConsola.aviso`). Ausente = no hay. */
    aviso?: string;
  };
  secreto?: { pregunta: string };
  aprobacion?: { pendientes: unknown[]; ficheros: Record<string, string>; diffs: Record<string, unknown[]> };
  /**
   * El registro de comandos de barra que manda el servidor al conectar (`COMANDOS` de
   * `cli/consola.ts`, recorrido — nunca una copia escrita a mano). Vacío hasta que llega
   * el mensaje: el compositor no tiene nada que sugerir antes de conectar, ni lo finge.
   */
  comandos: { nombre: string; descripcion: string }[];
  /**
   * El saludo, de la clase «bienvenida» — llega ANTES que `alta`, porque el nombre no
   * depende de ninguna cuenta (ver `tipos.ts`). `Bienvenida.tsx` prefiere este campo y
   * cae a `alta?.nombre` si por lo que sea no ha llegado (`App.tsx`): los dos mensajes
   * llevan el mismo dato, y esto es solo el que llega primero.
   */
  nombre?: string;
  /**
   * El alta que falta, tal cual la manda el servidor al conectar y tras cada paso. Ausente
   * hasta que llega el mensaje: mientras no se sabe qué falta, el wizard no se pinta —
   * enseñar un formulario vacío «por si acaso» sería inventarse el estado del alta.
   */
  alta?: {
    pasos: PasoDelWizard[];
    proveedores: { id: string; nombre: string }[];
    entornos: { id: string; nombre: string; url: string }[];
    /** Los REGISTRADOS (`settings.json`), no los ofrecidos: es lo que lista la ventana de
     *  ajustes y lo que la barra debe enseñar. Vacío mientras no haya ninguno. */
    registrados: { id: string; nombre: string; url: string; proyectos?: string[] }[];
    proyectos: {
      id: string;
      nombre: string;
      sesiones?: { id: string; titulo: string }[];
      local?: boolean;
      /** Compartido CONTIGO. Ausente = el servidor no lo dijo, que no es «es tuyo». */
      compartido?: boolean;
    }[];
    ramas: string[];
    /** Lo que falló en el paso anterior, para que lo diga el paso y no solo las Trazas. */
    aviso?: string;
    /** De qué entorno son los `proyectos`. Ausente = de ninguno todavía; el cliente NO
     *  supone «el primero», que es lo que hacía y se rompía con dos entornos. */
    entornoActivo?: string;
    /** Cuál está abierto y cuál es su sesión, para marcarlos en la barra. Ausentes = no se
     *  sabe, y entonces no se marca nada en vez de marcar el primero. */
    proyectoActivo?: string;
    sesionActiva?: string;
    /** Con qué dispositivo trabaja la sesión. Ausente = ninguno elegido. */
    dispositivoActivo?: DispositivoElegido;
    /** La sesión abierta es una relectura que el agente no recuerda. Ausente = no. */
    historica?: boolean;
    /** Este proyecto aplica las escrituras sin pedir aprobación. Ausente = las pide. */
    sinAprobacion?: boolean;
    /** El saludo de la bienvenida. Ausente = sin nombre que saludar (`Bienvenida.tsx`). */
    nombre?: string;
    /** Si hay un proyecto abierto en esta conexión — `App.tsx` lo usa para decidir entre
     *  la maqueta completa y `SinProyectoAbierto`. */
    proyectoAbierto: boolean;
    /** El modo del proyecto abierto, para la pastilla de la cabecera. Ausente = el
     *  servidor no lo sabe, y entonces no se pinta pastilla (`Cabecera.tsx`). */
    modo?: "offline" | "cloud";
  };
}

/**
 * Los cuatro interruptores del cable, campo a campo y SOLO booleanos.
 *
 * Un `"false"` de cadena es verdadero en JavaScript, y esa trampa ya se pagó dos veces en
 * este repo (el `soloLectura` de un subagente y el `compartido` de CloudStudio). Lo que no
 * venga como booleano se queda ausente, que significa «se mira»: el lado que no esconde
 * nada.
 */
function ajustesDelCable(candidato: unknown): AjustesDeDispositivos {
  if (typeof candidato !== "object" || candidato === null) return {};
  const c = candidato as Record<string, unknown>;
  const salida: AjustesDeDispositivos = {};
  for (const plataforma of PLATAFORMAS_DE_DISPOSITIVO) {
    if (typeof c[plataforma] === "boolean") salida[plataforma] = c[plataforma] as boolean;
  }
  return salida;
}

/** La foto del dispositivo elegido: entera o nada. */
function esDispositivoElegido(v: unknown): v is DispositivoElegido {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.id === "string" &&
    typeof d.nombre === "string" &&
    (d.plataforma === "android" || d.plataforma === "ios") &&
    (d.clase === "emulador" || d.clase === "simulador" || d.clase === "fisico")
  );
}

const ESTADO_INICIAL: EstadoDelCliente = { actos: [], conectado: false, comandos: [] };

const PASOS: ReadonlySet<string> = new Set<PasoDelWizard>(["cuenta", "entorno", "proyecto"]);

// `satisfies Record<Acto["tipo"], true>` es lo que hace que añadir un tipo a `Acto` en
// `tipos.ts` sin añadirlo aquí falle en `tsc`, no en tiempo de ejecución con un mensaje
// bien formado silenciosamente descartado.
const TIPOS_DE_ACTO = {
  usuario: true,
  asistente: true,
  razonamiento: true,
  herramientas: true,
  sistema: true,
  artefacto: true,
  fase: true,
  fin: true,
  error: true,
} satisfies Record<Acto["tipo"], true>;

/**
 * Nada de lo que llega por el cable puede darse por bien formado: un `JSON.parse` de un
 * `EventSource` es responsabilidad de quien lo emite, y el emisor es OTRO proceso que
 * puede tener un bug, una versión distinta, o un proxy de por medio corrompiendo el
 * cuerpo. `aplicar` no puede lanzar nunca, así que cada rama valida su forma mínima antes
 * de mutar y descarta en silencio lo que no encaja — sin eso, un mensaje malformado
 * tumbaría el `onmessage` del `EventSource` y con él la conexión entera.
 */
function esActo(valor: unknown): valor is Acto {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "tipo" in valor &&
    typeof (valor as { tipo: unknown }).tipo === "string" &&
    (valor as { tipo: string }).tipo in TIPOS_DE_ACTO
  );
}

function esSelector(valor: unknown): valor is SelectorDeConsola {
  if (typeof valor !== "object" || valor === null) return false;
  const s = valor as { titulo?: unknown; opciones?: unknown };
  return (
    typeof s.titulo === "string" &&
    Array.isArray(s.opciones) &&
    s.opciones.every(
      (o) => typeof o === "object" && o !== null && typeof (o as { id?: unknown }).id === "string" &&
        typeof (o as { etiqueta?: unknown }).etiqueta === "string"
    )
  );
}

/** Un proveedor del mensaje «modelos», comprobado campo a campo como todo lo que entra. */
/** Un agente del cable, comprobado campo a campo: lo que llega por HTTP no se cree. */
function esAgenteDelCable(valor: unknown): valor is AgenteDelCable {
  const a = valor as Partial<AgenteDelCable> | null;
  return (
    typeof a === "object" &&
    a !== null &&
    typeof a.nombre === "string" &&
    typeof a.descripcion === "string" &&
    typeof a.motor === "string" &&
    typeof a.soloLectura === "boolean" &&
    Array.isArray(a.skills) &&
    typeof a.instrucciones === "string"
  );
}

function esProveedorDeModelos(valor: unknown): valor is ProveedorDeModelos {
  if (typeof valor !== "object" || valor === null) return false;
  const p = valor as {
    id?: unknown; nombre?: unknown; credencial?: unknown; modelos?: unknown; error?: unknown;
    personalizado?: unknown; baseUrl?: unknown;
  };
  if (typeof p.id !== "string") return false;
  if (typeof p.nombre !== "string") return false;
  if (p.credencial !== "puesta" && p.credencial !== "falta" && p.credencial !== "nativa") return false;
  if (p.error !== undefined && typeof p.error !== "string") return false;
  if (p.personalizado !== undefined && typeof p.personalizado !== "boolean") return false;
  if (p.baseUrl !== undefined && typeof p.baseUrl !== "string") return false;
  if ((p as { enFichero?: unknown }).enFichero !== undefined && typeof (p as { enFichero?: unknown }).enFichero !== "boolean") {
    return false;
  }
  if (p.modelos !== undefined) {
    if (!Array.isArray(p.modelos)) return false;
    if (!p.modelos.every((m) => typeof m === "object" && m !== null && typeof (m as { id?: unknown }).id === "string")) {
      return false;
    }
  }
  return true;
}

/** Un fichero tocado, comprobado campo a campo como todo lo que entra por el cable. */
function esFicheroTocado(valor: unknown): valor is FicheroTocado {
  if (typeof valor !== "object" || valor === null) return false;
  const f = valor as { ruta?: unknown; clase?: unknown; mas?: unknown; menos?: unknown };
  if (typeof f.ruta !== "string") return false;
  if (f.clase !== "nuevo" && f.clase !== "modificado" && f.clase !== "borrado") return false;
  if (f.mas !== undefined && typeof f.mas !== "number") return false;
  if (f.menos !== undefined && typeof f.menos !== "number") return false;
  return true;
}

/** `{id, titulo}`: una sesión guardada. NO vale `sonIdentidades` —una sesión no tiene
 *  `nombre`, tiene título— y usarla dejaba la lista siempre vacía sin decir por qué. */
function sonSesiones(valor: unknown): valor is { id: string; titulo: string }[] {
  return (
    Array.isArray(valor) &&
    valor.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as { id?: unknown }).id === "string" &&
        typeof (s as { titulo?: unknown }).titulo === "string"
    )
  );
}

/** `{id, nombre}` y nada más: lo que el mensaje promete. Lo demás se descarta entero. */
function sonIdentidades(valor: unknown): valor is { id: string; nombre: string }[] {
  return (
    Array.isArray(valor) &&
    valor.every(
      (o) =>
        typeof o === "object" &&
        o !== null &&
        typeof (o as { id?: unknown }).id === "string" &&
        typeof (o as { nombre?: unknown }).nombre === "string"
    )
  );
}

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esComandos(valor: unknown): valor is { nombre: string; descripcion: string }[] {
  return (
    Array.isArray(valor) &&
    valor.every(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as { nombre?: unknown }).nombre === "string" &&
        typeof (c as { descripcion?: unknown }).descripcion === "string"
    )
  );
}

export function crearStoreDelCliente(): {
  leer: () => EstadoDelCliente;
  aplicar: (mensaje: unknown) => void;
  marcarConectado: () => void;
  marcarDesconectado: () => void;
  contestarPregunta: () => void;
  contestarSecreto: () => void;
  /** Con el selector que se contestó, retira SOLO ese (ver la implementación: el paso de
   *  cuenta encadena selectores sin viaje de red entre ellos). Sin él, retira lo que haya. */
  contestarSelector: (contestado?: EstadoDelCliente["selector"]) => void;
  cerrarAprobacion: () => void;
  suscribir: (escucha: () => void) => () => void;
} {
  let estado: EstadoDelCliente = ESTADO_INICIAL;
  const suscriptores: (() => void)[] = [];

  // Objeto NUEVO en cada mutación (nunca `estado.x = y`): es lo que permite a
  // `useSyncExternalStore` (futuro consumidor de `suscribir`) detectar el cambio por
  // identidad de referencia sin que este fichero sepa que React existe.
  const mutar = (cambio: Partial<EstadoDelCliente>): void => {
    estado = { ...estado, ...cambio };
    for (const escucha of suscriptores) escucha();
  };

  return {
    leer: () => estado,

    aplicar(mensaje: unknown): void {
      if (typeof mensaje !== "object" || mensaje === null || !("clase" in mensaje)) return;
      const clase = (mensaje as { clase: unknown }).clase;

      switch (clase) {
        case "acto": {
          const acto = (mensaje as Partial<Extract<MensajeAlCliente, { clase: "acto" }>>).acto;
          if (!esActo(acto)) return;
          mutar({ actos: [...estado.actos, acto] });
          return;
        }
        case "sustitucion": {
          const acto = (mensaje as Partial<Extract<MensajeAlCliente, { clase: "sustitucion" }>>).acto;
          if (!esActo(acto)) return;
          // Transcript vacío: el servidor no manda `sustitucion` sin un último acto que
          // sustituir (`transporte.ts`), así que esto es solo la red bajo un cable que ya
          // no se fía de nada — cae a anexar en vez de perder el mensaje.
          mutar({ actos: estado.actos.length === 0 ? [acto] : [...estado.actos.slice(0, -1), acto] });
          return;
        }
        case "reemision": {
          const actos = (mensaje as Partial<Extract<MensajeAlCliente, { clase: "reemision" }>>).actos;
          if (!Array.isArray(actos) || !actos.every(esActo)) return;
          mutar({ actos: [...actos] });
          return;
        }
        case "bienvenida": {
          const nombre = (mensaje as { nombre?: unknown }).nombre;
          // Ausente o de otro tipo = sin nombre, nunca uno inventado — el mismo trato
          // que ya usa la clase «alta» para este mismo dato. Se fija a `undefined` y no
          // se ignora: una reconexión sin nombre tiene que PODER borrar el de la
          // conexión anterior, no dejarlo colgado.
          mutar({ nombre: typeof nombre === "string" ? nombre : undefined });
          return;
        }
        case "pregunta": {
          const texto = (mensaje as { texto?: unknown }).texto;
          if (typeof texto !== "string") return;
          mutar({ pregunta: { texto } });
          return;
        }
        case "selector": {
          const selector = (mensaje as { selector?: unknown }).selector;
          if (!esSelector(selector)) return;
          // Copia a un array MUTABLE: `SelectorDeConsola.opciones` es `readonly` (así
          // llega del transporte, que no quiere que nadie lo reordene por su cuenta) y
          // `EstadoDelCliente.selector.opciones` no lo es — la interfaz del store es la
          // del brief tal cual, y asignar el `readonly` ahí no tipa.
          mutar({
            selector: {
              titulo: selector.titulo,
              opciones: [...selector.opciones],
              // Solo si es texto: lo demás se descarta entero, como el resto del store.
              ...(typeof selector.aviso === "string" ? { aviso: selector.aviso } : {}),
            },
          });
          return;
        }
        case "modelos": {
          const m = mensaje as { actual?: unknown; proveedores?: unknown };
          if (!Array.isArray(m.proveedores)) return;
          const proveedores = m.proveedores.filter(esProveedorDeModelos).map((p) => ({
            id: p.id,
            // Campo a campo, que es una lista BLANCA: lo que no se nombra aquí no llega al
            // componente aunque venga por el cable. Es la trampa que dejó a las imágenes
            // de Ficheros sin `mime` ni `base64` con los tests en verde.
            nombre: p.nombre,
            credencial: p.credencial,
            ...(p.personalizado === undefined ? {} : { personalizado: p.personalizado }),
            ...(p.baseUrl === undefined ? {} : { baseUrl: p.baseUrl }),
            ...(p.enFichero === undefined ? {} : { enFichero: p.enFichero }),
            ...(p.modelos === undefined ? {} : { modelos: [...p.modelos] }),
            ...(p.error === undefined ? {} : { error: p.error }),
          }));
          mutar({
            modelos: {
              // Un `actual` que no sea texto se DESCARTA en vez de pintarse: sin él, el
              // disparador dice «Elige modelo», que es la verdad («no se sabe»), y no una
              // fila inventada.
              ...(typeof m.actual === "string" ? { actual: m.actual } : {}),
              proveedores,
            },
          });
          return;
        }
        case "proveedor": {
          const m = mensaje as { hecho?: unknown; motivo?: unknown };
          if (typeof m.hecho !== "boolean") return;
          mutar({
            proveedor: {
              hecho: m.hecho,
              ...(typeof m.motivo === "string" ? { motivo: m.motivo } : {}),
            },
          });
          return;
        }
        case "dispositivos": {
          const m = mensaje as { informe?: unknown; ajustes?: unknown };
          const informe = m.informe as Partial<InformeDeDispositivos> | undefined;
          if (informe === undefined || informe === null || typeof informe !== "object") return;
          if (!Array.isArray(informe.herramientas) || !Array.isArray(informe.dispositivos) || !Array.isArray(informe.avds)) return;
          if (typeof informe.sistema !== "string" || typeof informe.medido !== "string") return;
          // Campo a campo, como `agentes`: nada que el servidor añada mañana entra sin decidirlo.
          mutar({
            dispositivos: {
              sistema: informe.sistema,
              medido: informe.medido,
              avds: informe.avds.filter((x): x is string => typeof x === "string"),
              herramientas: informe.herramientas
                .filter((h): h is Herramienta => typeof h === "object" && h !== null && typeof h.nombre === "string" && typeof h.estado === "string")
                .map((h) => ({
                  nombre: h.nombre,
                  estado: h.estado,
                  ...(h.detalle === undefined ? {} : { detalle: h.detalle }),
                })),
              dispositivos: informe.dispositivos
                .filter(
                  (d): d is Dispositivo =>
                    typeof d === "object" && d !== null && typeof d.id === "string" && typeof d.nombre === "string" && typeof d.estado === "string"
                )
                .map((d) => ({
                  id: d.id,
                  nombre: d.nombre,
                  plataforma: d.plataforma,
                  clase: d.clase,
                  estado: d.estado,
                  ...(d.detalle === undefined ? {} : { detalle: d.detalle }),
                })),
            },
            // Los cuatro interruptores, campo a campo y solo booleanos: un `"false"` de
            // cadena es verdadero en JavaScript, y esa trampa ya se pagó dos veces en este
            // repo. Lo que no venga como booleano se queda ausente, que significa «se
            // mira» — el lado que no esconde nada.
            ajustesDeDispositivos: ajustesDelCable(m.ajustes),
          });
          return;
        }
        case "agentes": {
          const m = mensaje as { agentes?: unknown; problemas?: unknown };
          if (!Array.isArray(m.agentes)) return;
          // Se copia campo a campo y no con un `spread` del mensaje: es lo que impide que
          // un campo de más que alguien añada mañana al servidor entre en el estado del
          // cliente sin que nadie lo haya decidido. Misma postura que `proveedores`.
          mutar({
            agentes: {
              lista: m.agentes.filter(esAgenteDelCable).map((a) => ({
                nombre: a.nombre,
                descripcion: a.descripcion,
                motor: a.motor,
                ...(a.modelo === undefined ? {} : { modelo: a.modelo }),
                soloLectura: a.soloLectura,
                skills: [...a.skills],
                instrucciones: a.instrucciones,
                ...(a.origen === undefined ? {} : { origen: a.origen }),
              })),
              problemas: Array.isArray(m.problemas)
                ? m.problemas.filter((x): x is string => typeof x === "string")
                : [],
            },
          });
          return;
        }
        case "revision": {
          const m = mensaje as { via?: unknown; ficheros?: unknown };
          if (m.via !== "git" && m.via !== "sin-marca" && m.via !== "sin-empezar") return;
          if (!Array.isArray(m.ficheros)) return;
          const lista = m.ficheros.filter(esFicheroTocado).map((f) => ({ ...f }));
          mutar({ revision: { via: m.via, lista } });
          return;
        }
        case "parche": {
          const m = mensaje as { ruta?: unknown; texto?: unknown; recortado?: unknown };
          if (typeof m.ruta !== "string" || typeof m.texto !== "string") return;
          mutar({
            parches: {
              ...estado.parches,
              [m.ruta]: { texto: m.texto, recortado: m.recortado === true },
            },
          });
          return;
        }
        case "arbol": {
          const m = mensaje as { rutas?: unknown; recortado?: unknown; error?: unknown };
          if (!Array.isArray(m.rutas) || !m.rutas.every((r) => typeof r === "string")) return;
          mutar({
            arbol: {
              rutas: m.rutas as string[],
              recortado: m.recortado === true,
              ...(typeof m.error === "string" ? { error: m.error } : {}),
            },
          });
          return;
        }
        case "fichero": {
          const m = mensaje as Partial<FicheroDelProyecto>;
          if (typeof m.ruta !== "string" || typeof m.bytes !== "number") return;
          mutar({
            contenidos: {
              ...estado.contenidos,
              [m.ruta]: {
                ruta: m.ruta,
                bytes: m.bytes,
                recortado: m.recortado === true,
                binario: m.binario === true,
                ...(typeof m.texto === "string" ? { texto: m.texto } : {}),
                ...(m.codificacion === "utf-8" || m.codificacion === "latin1" ? { codificacion: m.codificacion } : {}),
                // El fichero se copia campo a campo —lista blanca, no reenvío del mensaje
                // entero— y eso tiene una trampa que ya mordió: un campo NUEVO no llega
                // hasta que se nombra aquí. Las imágenes se pintaban en jsdom y no en el
                // navegador porque `mime` y `base64` se quedaban en este case.
                ...(typeof m.mime === "string" ? { mime: m.mime } : {}),
                ...(typeof m.base64 === "string" ? { base64: m.base64 } : {}),
                ...(typeof m.error === "string" ? { error: m.error } : {}),
              },
            },
          });
          return;
        }
        case "artefacto": {
          // Campo a campo, como el fichero, y con la misma trampa detrás: un campo que no se
          // nombre aquí se cae en silencio y el visor se queda sin la mitad del dato.
          const m = mensaje as Partial<FicheroDelProyecto>;
          if (typeof m.ruta !== "string" || typeof m.bytes !== "number") return;
          mutar({
            artefactos: {
              ...estado.artefactos,
              [m.ruta]: {
                ruta: m.ruta,
                bytes: m.bytes,
                recortado: m.recortado === true,
                binario: m.binario === true,
                ...(typeof m.texto === "string" ? { texto: m.texto } : {}),
                ...(m.codificacion === "utf-8" || m.codificacion === "latin1" ? { codificacion: m.codificacion } : {}),
                ...(typeof m.mime === "string" ? { mime: m.mime } : {}),
                ...(typeof m.base64 === "string" ? { base64: m.base64 } : {}),
                ...(typeof m.error === "string" ? { error: m.error } : {}),
              },
            },
          });
          return;
        }
        case "turno": {
          const activo = (mensaje as { activo?: unknown }).activo;
          if (typeof activo !== "boolean") return;
          mutar({ turnoEnVuelo: activo });
          return;
        }
        case "secreto": {
          const pregunta = (mensaje as { pregunta?: unknown }).pregunta;
          if (typeof pregunta !== "string") return;
          mutar({ secreto: { pregunta } });
          return;
        }
        case "comandos": {
          const comandos = (mensaje as { comandos?: unknown }).comandos;
          if (!esComandos(comandos)) return;
          mutar({ comandos });
          return;
        }
        case "alta": {
          const m = mensaje as {
            pasos?: unknown;
            proveedores?: unknown;
            entornos?: unknown;
            registrados?: unknown;
            entornoActivo?: unknown;
            proyectoActivo?: unknown;
            sesionActiva?: unknown;
            dispositivoActivo?: unknown;
            historica?: unknown;
            sinAprobacion?: unknown;
            proyectos?: unknown;
            ramas?: unknown;
            aviso?: unknown;
            nombre?: unknown;
            proyectoAbierto?: unknown;
            modo?: unknown;
          };
          if (!Array.isArray(m.pasos) || !m.pasos.every((p) => typeof p === "string" && PASOS.has(p))) return;
          if (!sonIdentidades(m.proveedores) || !sonIdentidades(m.proyectos)) return;
          // Las sesiones viajan DENTRO de cada proyecto; `sonIdentidades` solo mira `id` y
          // `nombre`, así que aquí se recogen aparte y se descarta lo que no tenga forma —
          // una sesión inventada sería una fila que al pulsarla no abre nada.
          const proyectos = m.proyectos.map((p) => {
            const sesiones = (p as { sesiones?: unknown }).sesiones;
            return {
              id: p.id,
              nombre: p.nombre,
              ...(sonSesiones(sesiones) ? { sesiones: sesiones.map((s) => ({ id: s.id, titulo: s.titulo })) } : {}),
              ...((p as { local?: unknown }).local === true ? { local: true } : {}),
              // La MISMA regla que el servidor: solo un booleano de verdad. Ausente se
              // queda ausente, y la interfaz no pinta etiqueta — «no lo dijo» no es
              // «es tuyo». Una cadena colada aquí («shared: "false"») marcaría el
              // proyecto como compartido, porque una cadena no vacía es verdadera.
              ...(typeof (p as { compartido?: unknown }).compartido === "boolean"
                ? { compartido: (p as unknown as { compartido: boolean }).compartido }
                : {}),
            };
          });
          if (
            !Array.isArray(m.entornos) ||
            !m.entornos.every((e) => typeof (e as { url?: unknown })?.url === "string") ||
            !sonIdentidades(m.entornos)
          ) {
            return;
          }
          // `registrados` sí puede faltar sin invalidar el mensaje: lo que no se entiende
          // se descarta a lista vacía —«todavía no lo sé»— en vez de tirar el alta entera,
          // que es lo que decide si se pinta el wizard o la maqueta.
          const registrados =
            Array.isArray(m.registrados) &&
            m.registrados.every((e) => typeof (e as { url?: unknown })?.url === "string") &&
            sonIdentidades(m.registrados)
              ? (m.registrados as { id: string; nombre: string; url: string; proyectos?: unknown }[]).map((e) => ({
                  id: e.id,
                  nombre: e.nombre,
                  url: e.url,
                  // Se conserva la DIFERENCIA entre ausente y vacío: ausente es «no lo he
                  // elegido» y manda la omisión; `[]` es «ninguno». Colapsarlas aquí haría
                  // que elegir ninguno se leyera como no haber elegido.
                  ...(Array.isArray(e.proyectos) && e.proyectos.every((p) => typeof p === "string")
                    ? { proyectos: e.proyectos as string[] }
                    : {}),
                }))
              : [];
          if (!Array.isArray(m.ramas) || !m.ramas.every((r) => typeof r === "string")) return;
          // Un `proyectoAbierto` que no sea booleano no cuenta como el mensaje válido: es
          // el campo que distingue la maqueta completa del hueco de «elige un proyecto»
          // (`App.tsx`), y un valor inventado ahí mentiría sobre cuál de las dos toca.
          if (typeof m.proyectoAbierto !== "boolean") return;
          // La foto de ficheros es de UNA sesión. Si la que manda el servidor ya no es la
          // misma, se tira: enseñar la lista de la sesión anterior bajo el título de la
          // nueva es peor que no enseñar nada, porque parecería que esta sesión escribió
          // esos ficheros. Misma sesión = se conserva, para no perder los parches ya
          // traídos en cada mensaje de estado (que llega con cada cambio de consola).
          const sesionDeAhora = typeof m.sesionActiva === "string" ? m.sesionActiva : undefined;
          const cambioDeSesion = sesionDeAhora !== estado.alta?.sesionActiva;
          mutar({
            ...(cambioDeSesion ? { revision: undefined, parches: undefined, arbol: undefined, contenidos: undefined, artefactos: undefined } : {}),
            alta: {
              pasos: m.pasos as PasoDelWizard[],
              proveedores: m.proveedores,
              entornos: m.entornos as { id: string; nombre: string; url: string }[],
              registrados,
              proyectos,
              ramas: m.ramas as string[],
              proyectoAbierto: m.proyectoAbierto,
              // Ausente o de otro tipo = no hay aviso/nombre, nunca uno inventado.
              ...(typeof m.aviso === "string" ? { aviso: m.aviso } : {}),
              ...(typeof m.nombre === "string" ? { nombre: m.nombre } : {}),
              ...(typeof m.entornoActivo === "string" ? { entornoActivo: m.entornoActivo } : {}),
              ...(typeof m.proyectoActivo === "string" ? { proyectoActivo: m.proyectoActivo } : {}),
              ...(typeof m.sesionActiva === "string" ? { sesionActiva: m.sesionActiva } : {}),
              // La foto del dispositivo elegido, campo a campo y solo si está entera: media
              // foto —un id sin nombre— pintaría un serial crudo en la pastilla, que es
              // justo lo que guardar la foto viene a evitar.
              ...(esDispositivoElegido(m.dispositivoActivo) ? { dispositivoActivo: m.dispositivoActivo } : {}),
              // Solo si es exactamente `true`: es una afirmación sobre lo que el agente NO
              // recuerda, y cualquier otra cosa se lee como «no».
              ...(m.historica === true ? { historica: true } : {}),
              // Y aquí el `=== true` no es rutina: es la diferencia entre avisar de que
              // este proyecto escribe sin preguntar y callarlo. Cualquier otra cosa —una
              // cadena «true» incluida— se lee como «sí pide aprobación», que es el lado
              // en el que un fallo no cuesta nada.
              ...(m.sinAprobacion === true ? { sinAprobacion: true } : {}),
              // Solo los dos valores que el tipo admite: cualquier otra cosa (un modo
              // nuevo del servidor, o basura) se descarta y la cabecera no pinta
              // pastilla, que es lo mismo que hace cuando el campo no viene. Aceptar la
              // cadena a ciegas dejaría un modo desconocido escrito en pantalla.
              ...(m.modo === "offline" || m.modo === "cloud" ? { modo: m.modo } : {}),
            },
          });
          return;
        }
        case "aprobacion": {
          const m = mensaje as { pendientes?: unknown; ficheros?: unknown; diffs?: unknown };
          if (!Array.isArray(m.pendientes) || !esRegistro(m.ficheros) || !esRegistro(m.diffs)) return;
          mutar({
            aprobacion: {
              pendientes: m.pendientes,
              ficheros: m.ficheros as Record<string, string>,
              diffs: m.diffs as Record<string, unknown[]>,
            },
          });
          return;
        }
        default:
          // Clase desconocida: un servidor más nuevo que este cliente, o ruido. Ignorar
          // es la misma postura que el resto de esta función frente a lo malformado.
          return;
      }
    },

    marcarConectado(): void {
      mutar({ conectado: true });
    },

    marcarDesconectado(): void {
      // El servidor resuelve TODO lo pendiente con cadena vacía (o `undefined`) en cuanto
      // se cae el SSE (`web/servidor/consolaWeb.ts#alDesconectar`): una pregunta, selector,
      // secreto o aprobación que el cliente tuviera en pantalla ya está zanjada al otro
      // lado —como rechazo, en el caso de la aprobación—. Dejarla pintada tras reconectar
      // mentiría sobre qué sigue esperando respuesta.
      // `modelos` también se tira: mientras no hay cable, el modelo en vigor no se puede
      // AFIRMAR —pudo cambiarlo otra pestaña, o el proceso pudo morir—, y la reconexión lo
      // vuelve a traer entero (`arranque.ts#adjuntar`). Es la misma regla del harness de
      // DeepSeek: un `connection/reset` tira todas las proyecciones y repide la selección
      // antes de pintarla.
      mutar({
        conectado: false,
        pregunta: undefined,
        selector: undefined,
        secreto: undefined,
        aprobacion: undefined,
        modelos: undefined,
        // El acuse de un alta o una baja de proveedor es de esa operación, no un estado:
        // guardado entre conexiones, al reconectar reaparecería un error ya resuelto.
        proveedor: undefined,
        // Sin cable no se sabe si el turno sigue: dejarlo en `true` apagaría el compositor
        // para siempre en una pestaña que ya no recibe el «terminó».
        turnoEnVuelo: false,
        // Los ficheros y sus parches son una FOTO: mientras no hay cable pueden haber
        // cambiado, y enseñarlos como si siguieran siendo verdad es peor que pedirlos otra
        // vez al volver.
        revision: undefined,
        parches: undefined,
        arbol: undefined,
        contenidos: undefined,
        artefactos: undefined,
        // Los subagentes salen de ficheros en disco: mientras no hay cable pueden haberse
        // editado a mano, y la ventana de ajustes enseñaría una lista que ya no es. La
        // reconexión los trae enteros en la misma ráfaga que los modelos.
        agentes: undefined,
      });
    },

    /**
     * Lo que el CLIENTE ya ha contestado. No son mensajes del cable: son la otra mitad de
     * `marcarDesconectado`, que retira lo que el servidor ya dio por zanjado. Aquí el
     * zanjado lo produce el usuario, y sin esto la pregunta y el modal se quedarían
     * pintados para siempre después de responder — el servidor no manda ningún «ya está»
     * (`consolaWeb.ts` resuelve la promesa y no emite nada), así que nadie los retiraría.
     *
     * Que el modal se DESMONTE al cerrarlo es además lo que hace de su rechazo-al-desmontar
     * una red y no una segunda decisión: cuando llega aquí, el componente ya ha marcado que
     * decidió.
     *
     * Las cuatro se llaman DESPUÉS de que el envío haya llegado, nunca antes: retirar la
     * interfaz con el `POST` fallido deja al usuario creyendo que contestó mientras el
     * servidor sigue esperando hasta su plazo.
     */
    contestarPregunta(): void {
      mutar({ pregunta: undefined });
    },

    contestarSecreto(): void {
      mutar({ secreto: undefined });
    },

    /**
     * Retira el selector CONTESTADO, no «el que haya».
     *
     * Sin el parámetro esto era una carrera de verdad desde que el asistente de cuenta es
     * un lazo (`cli/wizardInicial.ts`): volver atrás o cancelar con la puerta puesta hace
     * que el servidor emita el selector SIGUIENTE sin ningún viaje de red por medio —antes
     * siempre había un `listar` o un OAuth entre dos selectores—, así que el mensaje del
     * SSE y la resolución del `POST` compiten, en sockets distintos y sin orden
     * garantizado. Si ganaba el SSE, este `contestarSelector()` borraba el selector NUEVO:
     * tarjeta vacía en pantalla y el servidor esperando una respuesta que ya nadie podía
     * dar, hasta que venciera el plazo.
     *
     * La comparación es por REFERENCIA y basta: `aplicar` construye un objeto nuevo por
     * cada mensaje «selector», así que dos selectores distintos nunca comparten identidad.
     * Sin argumento se conserva el comportamiento de siempre (borra lo que haya), que es lo
     * que quiere quien no tiene a mano lo que contestó.
     */
    contestarSelector(contestado?: EstadoDelCliente["selector"]): void {
      if (contestado !== undefined && estado.selector !== contestado) return;
      mutar({ selector: undefined });
    },

    cerrarAprobacion(): void {
      mutar({ aprobacion: undefined });
    },

    suscribir(escucha: () => void): () => void {
      suscriptores.push(escucha);
      return () => {
        const indice = suscriptores.indexOf(escucha);
        // Tolerante a doble baja: el `useEffect` de React StrictMode monta y desmonta dos
        // veces en desarrollo, y una segunda baja no debe reventar sobre un índice -1.
        if (indice >= 0) suscriptores.splice(indice, 1);
      };
    },
  };
}
