import { Fragment, useEffect, useState, type FormEvent } from "react";
import {
  Modal,
  Button,
  Input,
  IconSettingsOutline16,
  IconSparkle16,
  IconDataOutline16,
  IconUserOutline16,
  IconSkillOutline16,
  IconLinkOutline16,
  IconShareOutline16,
  IconSearchOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { EstadoDelCliente } from "../store.js";
import type {
  AgenteDelCable,
  SkillDelCable,
  ConectorDelCable,
  DefinicionDeConector,
  FilaDeCatalogo,
  AjustesDeDispositivos,
  Dispositivo,
  Herramienta,
  InformeDeDispositivos,
  NombreDeHerramienta,
  PlataformaDeDispositivo,
  ProveedorDeModelos,
  SistemaOperativo,
} from "../tipos.js";
import { PLATAFORMAS_DE_DISPOSITIVO, seMira } from "../tipos.js";
import { etiquetaDeEstado, inventario, seLlegaAlDispositivo, type FilaDeInventario } from "../inventarioDeDispositivos.js";
import { ArrancarEmulador } from "./ArrancarEmulador.js";
import { useMedirAlVolver } from "../medirAlVolver.js";
import { Agentes } from "./Agentes.js";
import { Skills } from "./Skills.js";
import { Conectores } from "./Conectores.js";
import { TITULO_DE_REFRESCAR_EQUIPO } from "./Equipo.js";
import { Receta } from "./Receta.js";
import { VerificarDispositivo } from "./VerificarDispositivo.js";
import { Pregunta } from "./Pregunta.js";
import { urlDeEntornoAceptable, AVISO_DE_URL } from "./Wizard.js";

/**
 * La copia DECLARADA de `core/settings.ts#motivoDeWorkspaceInaceptable`, igual que
 * `urlDeEntornoAceptable` lo es de la regla de la URL de un entorno: la frontera prohíbe
 * que el cliente importe del host, y sin una copia aquí el rechazo del servidor sería mudo
 * —`informar` no llega al navegador desde el vestíbulo—. De balde evita un viaje; la que
 * MANDA es la del servidor, que la vuelve a aplicar.
 *
 * Las frases son las mismas a propósito: leer un motivo distinto según dónde se teclee la
 * carpeta haría dudar de cuál es la regla.
 */
export function motivoDeWorkspaceInaceptable(ruta: string): string | undefined {
  const limpio = ruta.trim();
  if (limpio === "") return "escribe una carpeta: en blanco no es una elección";
  if (!limpio.startsWith("/") && !limpio.startsWith("~/") && limpio !== "~") {
    return "tiene que ser una ruta absoluta, que empiece por «/» o por «~/»";
  }
  // La raíz del disco, que el host también rechaza. Sin esta línea un «/» pasaba aquí, lo
  // rechazaba el servidor y el campo volvía al valor de antes SIN decir por qué — el no
  // mudo que esta copia existe para evitar.
  if (limpio.replace(/\/+$/, "") === "") {
    return "la raíz del disco no: ahí cada entorno sería una carpeta de primer nivel del sistema";
  }
  return undefined;
}

/**
 * La copia DECLARADA de `core/settings.ts#motivoDeNombreDeEntornoInaceptable`, con el mismo
 * papel que la de arriba: la frontera prohíbe que el cliente importe del host, y sin esto el
 * no sería mudo —`informar` no llega al navegador desde el vestíbulo—. De balde evita un
 * viaje; la que MANDA es la del servidor, que la vuelve a aplicar.
 *
 * El nombre es un RÓTULO, no una clave: el `id` del entorno es lo que ata su carpeta del
 * workspace, sus credenciales y sus proyectos, así que aquí no hay reglas de slug. Lo que sí
 * se rechaza es el vacío, y por una razón que no se ve venir: un entorno sin nombre se
 * DESCARTA al leerlo, o sea que guardarlo sería hacerlo desaparecer de la lista.
 *
 * Y los dos iguales NO se rechazan: se advierten en la pantalla, que es una decisión y no un
 * descuido — dos servidores distintos pueden llamarse igual, y quien los distingue es la URL.
 */
export function motivoDeNombreDeEntornoInaceptable(nombre: string): string | undefined {
  const limpio = nombre.trim();
  if (limpio === "") return "escribe un nombre: uno sin nombre desaparece de la lista al volver a arrancar";
  if (limpio.length > LARGO_NOMBRE_DE_ENTORNO) {
    return `no puede pasar de ${LARGO_NOMBRE_DE_ENTORNO} caracteres, que es lo que cabe en su pestaña`;
  }
  return undefined;
}

/** El tope del nombre, con el número del host: lo que cabe en la pestaña de un entorno. */
export const LARGO_NOMBRE_DE_ENTORNO = 60;
import { PROYECTOS_POR_OMISION } from "./Barra.js";
import { selloDeFecha } from "../selloDeFecha.js";
import { IconoDeEntorno } from "./IconoDeEntorno.js";
import { IconoDeProveedor } from "./IconoDeProveedor.js";
import { PastillaDeModelo } from "./PastillaDeModelo.js";
import estilos from "./Ajustes.module.css";
// La coraza del aviso de «cambios sin guardar»: mismo velo que `ConfirmarDescarte`
// (`AccionesDeTarea.tsx`) y `AccionDeSesion.tsx` — dos copias del mismo velo es cómo se
// acaba con dos velos distintos.
import modalDeAviso from "./NuevaSesion.module.css";

/**
 * La ventana de ajustes: modelos y entornos, con la navegación a la izquierda
 * y una sola sección a la vista — la disposición del panel de ajustes del harness de
 * DeepSeek, que es de donde salió el encargo.
 *
 * **Lo que se enseña aquí tiene detrás un dato o una acción real, o no se enseña.** Es la
 * misma regla por la que el compositor no copió la pastilla de permisos: un control sin
 * nada detrás es la misma mentira que una lista vacía rellenada con un placeholder. De ahí
 * tres ausencias deliberadas:
 *
 * - **Los temas de terminal no están, y tampoco el claro/oscuro del cliente.** `TEMAS`
 *   (`cli/tema.ts`) son paletas ANSI para la consola de terminal; en un navegador no pintan
 *   nada. El claro/oscuro de esta ventana del navegador SÍ es real, pero vive en la barra
 *   superior (`Cabecera.tsx`, junto al botón de Ajustes) y no aquí: es un ajuste de un solo
 *   gesto, no una sección propia.
 * - **No hay «proveedor personalizado».** El harness lo tiene porque su adaptador `pi-ai`
 *   sabe hablar con cualquier endpoint compatible con OpenAI. Aquí eso ya no es la razón:
 *   desde que NVIDIA, Groq y xAI entran por `COMPATIBLES_OPENAI` (`core/modelos.ts`), el
 *   nuestro también sabe. La lista sigue siendo CERRADA por POLÍTICA y no por incapacidad:
 *   un proveedor nuevo es una fila de esa tabla, con su URL base y su variable de entorno
 *   revisadas en el repo — un endpoint tecleado en esta ventana mandaría la clave del
 *   usuario a donde diga el campo, y eso no es una preferencia de la aplicación.
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
export type SeccionDeAjustes =
  | "modelos"
  | "entornos"
  | "agentes"
  | "skills"
  | "conectores"
  | "dispositivos"
  | "general";

/**
 * Las secciones, en el orden en que se leen de arriba abajo, cada una con su icono: **General
 * primero** —y es también la que se ABRE por omisión, así que el orden y el arranque dicen lo
 * mismo—, y detrás lo concreto, empezando por Modelos.
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
  // **General va la primera: es el cajón de lo que es de la MÁQUINA y no es de ninguna de las
  // otras cinco.** El orden va de lo general a lo particular —por eso lo concreto empieza en
  // Modelos—, y este es el único que no es de una materia: lo que no se sabe dónde vive se
  // busca aquí. Nació con el tope de la cola de tareas, que vivía dentro de Dispositivos con
  // un motivo cierto —describe el equipo— dentro de una sección que habla de otra cosa: de
  // dónde se prueba la app. El engranaje es el mismo de la placa de la cabecera, que es
  // `aria-hidden` y no significa nada para nadie: aquí sí es la sección de los ajustes
  // generales.
  { id: "general", etiqueta: "General", Icono: IconSettingsOutline16 },
  // «Modelos» y no «Proveedores»: la sección dejó de ser solo credenciales. Su texto lo
  // confesaba —«el modelo en uso se elige en la pastilla del compositor»— porque no había
  // dónde fijar el defecto; ahora sí, y es lo primero que se ve al abrirla.
  { id: "modelos", etiqueta: "Modelos", Icono: IconSparkle16 },
  { id: "entornos", etiqueta: "Entornos", Icono: IconDataOutline16 },
  { id: "agentes", etiqueta: "Subagentes", Icono: IconUserOutline16 },
  // Skills va JUNTO a Subagentes y debajo, porque contesta la otra mitad de la misma
  // pregunta: el subagente es QUIÉN hace el trabajo y la skill es QUÉ sabe hacer — y es el
  // editor de un subagente el que las marca una a una. Separarlas las habría dejado como dos
  // materias, cuando lo que hay es una que se lee de arriba abajo. `IconSkillOutline16` SÍ
  // lo exporta el paquete instalado —comprobado sobre `lib/index.js`, que es la lección de
  // `IconAgentPresetOutline16`, el que no existía y hacía reventar a React con «Element type
  // is invalid»—, así que el icono es el que SIGNIFICA lo que hay detrás y no uno parecido.
  { id: "skills", etiqueta: "Skills", Icono: IconSkillOutline16 },
  // «Conectores» va justo debajo de Skills, y ESTÁ en esta misma lista —a diferencia de
  // Modelos/Entornos/Agentes/Skills/Dispositivos, no se queda siempre en la navegación: el
  // `.filter(…)` de donde se recorre este array la retira cuando el prop `conectores` no ha
  // llegado, «un control sin dato detrás no se pinta». `IconShareOutline16` SÍ lo exporta el
  // paquete instalado —comprobado sobre `lib/index.js`, la misma comprobación que ya se hizo
  // para `IconSkillOutline16` y por la misma lección de `IconAgentPresetOutline16`—, y no
  // `IconLinkOutline16`: ese ya es el de Dispositivos, y dos secciones con el mismo dibujo se
  // confunden en la navegación.
  { id: "conectores", etiqueta: "Conectores", Icono: IconShareOutline16 },
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
 * Cómo se llama cada herramienta y para qué sirve — **una FICHA que se busca por nombre, no
 * la lista de lo que hay**.
 *
 * Los requisitos son otra cosa que los destinos: un destino se elige; un requisito está o no
 * está, y si no está se instala. Mezclarlos en una sola lista era lo que hacía que «Android
 * Sim · emulator no está instalada» pareciera un ajuste que se puede cambiar con el
 * interruptor de al lado.
 *
 * **Y desde que la sección tiene una pestaña por plataforma, esta tabla ya no decide nada.**
 * Ni qué filas se pintan —son las que la MEDIDA nombra, ver `herramientasDe`— ni de qué
 * plataforma es cada una: eso lo dice `plataforma`, que viene por el cable desde el mismo
 * `plataformaDe` que lo decidió en el host. Ponerlo aquí sería una segunda copia de esa
 * regla, y el día que una herramienta sirviera a las dos plataformas la copia callaría.
 * Aquí solo queda lo que no es una regla sino un rótulo: cómo se llama y qué hace.
 */
const REQUISITOS: readonly { nombre: Herramienta["nombre"]; etiqueta: string; para: string }[] = [
  { nombre: "adb", etiqueta: "adb", para: "hablar con teléfonos, tablets y emuladores de Android" },
  { nombre: "emulator", etiqueta: "emulator", para: "listar y arrancar los AVD del SDK de Android" },
  { nombre: "xcrun", etiqueta: "Xcode command line tools", para: "los simuladores de iOS (simctl)" },
  { nombre: "devicectl", etiqueta: "devicectl", para: "los iPhone y iPad conectados (Xcode 15+)" },
];

/**
 * El ejemplo que se enseña en el campo de ruta personalizada, cuando está vacío. Por
 * `sistema` medido, porque una ruta de Windows en un placeholder de Mac no ayuda a nadie.
 * `"otro"` y AUSENTE (sin medida todavía) caen en la forma de Windows, la más frecuente
 * entre quien no tiene todavía ninguna foto del equipo.
 */
const PLACEHOLDER_RUTA_WINDOWS = {
  adb: "C:\\Users\\tú\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe",
  emulator: "C:\\Users\\tú\\AppData\\Local\\Android\\Sdk\\emulator\\emulator.exe",
};
const PLACEHOLDER_RUTA: Record<SistemaOperativo, { adb: string; emulator: string }> = {
  mac: { adb: "~/Library/Android/sdk/platform-tools/adb", emulator: "~/Library/Android/sdk/emulator/emulator" },
  windows: PLACEHOLDER_RUTA_WINDOWS,
  linux: { adb: "~/Android/Sdk/platform-tools/adb", emulator: "~/Android/Sdk/emulator/emulator" },
  otro: PLACEHOLDER_RUTA_WINDOWS,
};
const placeholderDeRuta = (sistema: SistemaOperativo | undefined): { adb: string; emulator: string } =>
  PLACEHOLDER_RUTA[sistema ?? "windows"];

/**
 * Las dos pestañas de la sección, en el orden en que se leen: Android primero porque es lo
 * único que funciona fuera de un Mac, y eso hace que en Windows y Linux la primera pestaña
 * sea útil y la segunda se lea sabiendo lo que es.
 *
 * **Las dos existen siempre, también donde no aplican.** Esconder la de iOS en Linux dejaría
 * su receta sin puerta y, peor, haría creer que iOS se puede probar allí y no se está
 * enseñando: dentro se dice que sus herramientas «no aplican en este sistema», que es lo que
 * contestó la medida. Una pestaña de ACCIÓN existe siempre (ver `Pestanas.tsx`).
 *
 * **La de iOS se DESHABILITA fuera de macOS**, cuando ya se sabe (`sistema` medido y
 * distinto de `"mac"`): un clic no puede llevar a ningún sitio útil, así que en vez de
 * dejar entrar para leer «no aplica en este sistema» en cada fila, la razón se dice de una
 * vez en el `title` de la propia pestaña (`TITULO_IOS_REQUIERE_MAC`). `sistema` AUSENTE
 * —todavía no ha llegado ninguna medida— no deshabilita nada: ausente no es «no», es «no lo
 * sé todavía», la misma regla que en todo lo demás de esta ventana.
 */
const PLATAFORMAS: readonly Dispositivo["plataforma"][] = ["android", "ios"];

/** Cómo se llama cada plataforma, aquí y en el `aria-label` de su panel. */
const ETIQUETA_DE_PLATAFORMA: Record<Dispositivo["plataforma"], string> = {
  android: "Android",
  ios: "iOS",
};

/** La MISMA frase que pone el servidor en `detalle` cuando `sistema !== "mac"`
 *  (`dispositivosEnMaquina.ts`): dos copias del motivo es donde divergirían. */
const TITULO_IOS_REQUIERE_MAC = "los simuladores y dispositivos iOS solo se detectan en macOS";

/**
 * ¿Son el mismo `AjustesDeDispositivos`? Compara los cuatro interruptores por `seMira` —así
 * `undefined` y `true` cuentan igual, que es lo que ya significan— y las dos rutas
 * recortadas y con la cadena vacía tratada como ausente, la misma regla que aplica el
 * servidor al guardar. Es lo que decide si hay «cambios sin guardar» que avisar.
 */
function igualesAjustesDeDispositivos(a: AjustesDeDispositivos, b: AjustesDeDispositivos): boolean {
  const mismaRuta = (x?: string, y?: string): boolean => (x?.trim() ?? "") === (y?.trim() ?? "");
  return (
    PLATAFORMAS_DE_DISPOSITIVO.every((p) => seMira(a, p) === seMira(b, p)) &&
    mismaRuta(a.rutaAdb, b.rutaAdb) &&
    mismaRuta(a.rutaEmulator, b.rutaEmulator)
  );
}

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

export function Ajustes({
  proveedores = [],
  entornos = [],
  proyectos = [],
  proyectosPorEntorno = {},
  alPedirProyectosDeEntorno,
  alQuitarEntorno,
  alRenombrarEntorno,
  avisoDelAlta,
  entornoActivo,
  seccionInicial,
  secreto,
  dispositivos,
  ajustesDeDispositivos,
  alCambiarDispositivos,
  alActualizarDispositivos,
  alAbrirCarpetaDeHerramienta,
  alInstalarHerramienta,
  alVerificarDispositivo,
  alArrancarEmulador,
  arranqueDeEmulador,
  modelosDeMotor,
  alPedirModelosDeMotor,
  alPedirCatalogo,
  modeloPorDefecto,
  alElegirModelo,
  instalacion,
  alEjecutarPaso,
  alCancelarPaso,
  conectado = true,
  agentes,
  hayProyecto,
  alGuardarAgente,
  alBorrarAgente,
  alRestaurarAgente,
  skills,
  cuerposDeSkill,
  alPedirCuerpoDeSkill,
  alGuardarSkill,
  alBorrarSkill,
  alInstalarSkill,
  conectores,
  alAccionDeConector,
  alCrearDeConector,
  alPedirClave,
  alBorrarClave,
  alRegistrarEntorno,
  alAltaDeProveedor,
  alBajaDeProveedor,
  resultadoDeProveedor,
  alElegirProyectos,
  alResponderSecreto,
  tareas,
  alCambiarConcurrencia,
  workspace,
  alCambiarWorkspace,
  alElegirCarpeta,
  carpetaElegida,
  alCerrar,
}: {
  /** Los del mensaje «modelos». Vacío = todavía no ha llegado, y se dice. */
  proveedores?: readonly ProveedorDeModelos[];
  /** Los entornos REGISTRADOS (`settings.json`), no los ofrecidos por el alta. `proyectos`
   *  es la elección de cuáles se enseñan; ausente = no se ha dicho. */
  entornos?: readonly { id: string; nombre: string; url: string; proyectos?: readonly string[]; copias?: number }[];
  /**
   * Los proyectos del entorno ACTIVO, tal cual los devolvió CloudStudio y tal como vienen
   * en el `alta`. Los de los DEMÁS entornos llegan por `proyectosPorEntorno`, que se pide
   * pestaña a pestaña: cada uno es una conexión con CloudStudio.
   */
  /**
   * `compartido` viaja desde el `alta` y desde `proyectosDeEntorno`; el cable y el store ya
   * lo traían y era este prop el que lo perdía. Se necesita para partir la lista en propios
   * y compartidos. Ausente NO es «es tuyo»: es que CloudStudio no lo dijo.
   */
  proyectos?: readonly { id: string; nombre: string; compartido?: boolean; ultimoAcceso?: string }[];
  /**
   * Los proyectos de cada entorno NO activo, indexados por su id, tal como los contesta
   * `{clase:"proyectosDeEntorno"}`.
   *
   * Las tres respuestas se distinguen y ninguna se puede confundir con otra: la entrada
   * **ausente** es «no se ha preguntado» (y la pestaña pregunta al abrirse), `proyectos`
   * puesto es la lista, y `error` puesto es «no se pudo preguntar» — que NO es un entorno
   * sin proyectos, así que ahí no se pinta ninguna casilla.
   */
  proyectosPorEntorno?: Readonly<
    Record<
      string,
      {
        proyectos?: readonly { id: string; nombre: string; compartido?: boolean; ultimoAcceso?: string }[];
        error?: string;
      }
    >
  >;
  /**
   * «Dime los proyectos de este entorno.» Lo llama la pestaña al abrirse y solo si no
   * tiene ya su lista —la misma regla que Ficheros y Revisión: se pide cuando falta el
   * dato, no al montar—, y NUNCA muda el entorno activo.
   */
  alPedirProyectosDeEntorno?: (entorno: string) => void;
  /**
   * Quitar un entorno registrado. Devuelve el MOTIVO si el servidor se negó (un proyecto suyo
   * abierto, una tarea sin terminar) y `undefined` si lo quitó. La regla vive en el servidor;
   * aquí solo se enseña. Ausente = no se ofrece el botón.
   */
  alQuitarEntorno?: (entorno: string, modo: { borrarCopias: boolean }) => Promise<string | undefined>;
  /**
   * Ponerle nombre a un entorno registrado. Devuelve el MOTIVO si el servidor se negó y
   * `undefined` si lo escribió. La regla vive en el servidor —aquí está su copia declarada,
   * que evita el viaje— y el `id` NO viaja al revés: es la clave, y renombrar no la toca.
   * Ausente = no se ofrece el campo.
   */
  alRenombrarEntorno?: (entorno: string, nombre: string) => Promise<string | undefined>;
  /**
   * El motivo del último paso del alta que falló (`alta.aviso`). Aquí se usa para el REGISTRO
   * de un entorno: un entorno nuevo que no conecta ya no se guarda, así que sin esto el
   * formulario no diría nada y el entorno simplemente no aparecería.
   */
  avisoDelAlta?: string;
  entornoActivo?: string;
  /**
   * En qué sección abrir, para quien llega desde un enlace concreto (el aviso de proyectos
   * sin enseñar de la barra manda a «entornos»). Ausente = «general», la que ya se abría por
   * omisión — este prop no cambia ese comportamiento por defecto, solo lo puede sobreescribir
   * quien tenga un motivo.
   */
  seccionInicial?: SeccionDeAjustes;
  /** Los subagentes y los `.md` ilegibles. Ausente = todavía no llegó el mensaje, que NO es
   *  lo mismo que «no hay ninguno»: la sección lo distingue y lo dice. */
  agentes?: { lista: readonly AgenteDelCable[]; problemas: readonly string[] };
  /** Si hay proyecto abierto, para poder ofrecer el ámbito «de este proyecto». */
  hayProyecto: boolean;
  alGuardarAgente: (agente: AgenteDelCable, ambito: "global" | "proyecto", renombrandoDe?: string) => void;
  alBorrarAgente: (nombre: string, ambito: "global" | "proyecto") => void;
  /** Devuelve un subagente de serie a como lo entrega xonecode. Sin ámbito: solo el global. */
  alRestaurarAgente: (nombre: string) => void;
  /** Las skills y las carpetas ilegibles. Ausente = todavía no llegó el mensaje. */
  skills?: { lista: readonly SkillDelCable[]; problemas: readonly string[] };
  /** Los cuerpos ya pedidos. Una clave con `undefined` es «se pidió y no se pudo leer». */
  cuerposDeSkill?: Readonly<Record<string, string | undefined>>;
  alPedirCuerpoDeSkill: (nombre: string) => void;
  alGuardarSkill: (skill: SkillDelCable, ambito: "global" | "proyecto", renombrandoDe?: string) => void;
  alBorrarSkill: (skill: SkillDelCable, ambito: "global" | "proyecto") => void;
  /** Instala una skill desde un `.zip`. Ausente = esta consola no sabe, y el botón no sale. */
  alInstalarSkill?: (
    nombre: string,
    ambito: "global" | "proyecto",
    zip: File
  ) => Promise<{ ok: boolean; motivo?: string }>;
  /**
   * El catálogo de conectores MCP y los que esta consola tiene añadidos. **Ausente = la
   * sección NO se pinta**, ni siquiera con un «Consultando…»: a diferencia de Skills o
   * Subagentes, que siempre existen, un conector es una opción que puede no estar puesta —
   * «un control sin dato detrás no se pinta».
   */
  conectores?: {
    catalogo: FilaDeCatalogo[];
    conectores: ConectorDelCable[];
    desconocidos: string[];
    ilegible?: true;
    error?: string;
  };
  alAccionDeConector: (accion: "anadir" | "quitar" | "probar" | "autorizar" | "desconectar", id: string) => void;
  /**
   * El alta de un servidor escrito a mano, con la definición que se teclea. Separado de
   * `alAccionDeConector` porque es la única acción que no lleva `id` —lo deriva el servidor
   * del nombre—: ver la cabecera de `PropsDeConectores`.
   */
  alCrearDeConector: (definicion: DefinicionDeConector) => void;
  /** La pregunta oculta en vuelo, si la hay: se pinta DENTRO de la fila que se edita. */
  secreto?: string;
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
   * Guarda los cuatro interruptores y las dos rutas personalizadas. Se manda el objeto
   * ENTERO y no lo que cambió: el servidor lo guarda junto, y así no hay dos ideas de cuál
   * es el estado actual. Ausente = esta ejecución no puede guardar y no se pinta «Guardar».
   */
  alCambiarDispositivos?: (ajustes: AjustesDeDispositivos) => void;
  /** Volver a medir. Ausente = no se ofrece. */
  alActualizarDispositivos?: () => void;
  /**
   * Abre, en el explorador del sistema donde corre la consola, la carpeta que contiene el
   * binario de `adb`/`emulator`. Viaja el NOMBRE, nunca la ruta: el servidor la resuelve
   * contra su última medida. Ausente = no se pinta el botón.
   */
  alAbrirCarpetaDeHerramienta?: (herramienta: NombreDeHerramienta) => void;
  /**
   * Instalar una herramienta que falta. Viaja el NOMBRE, nunca el comando: qué se lanza lo
   * decide el servidor. Ausente = no se ofrece el botón.
   */
  alInstalarHerramienta?: (herramienta: NombreDeHerramienta) => void;
  /**
   * Verificar la conexión con un dispositivo: hablarle y esperar respuesta. Viaja el ID; el
   * servidor lo resuelve contra su medida y decide qué lanzar. Ausente = no se pinta botón.
   */
  alVerificarDispositivo?: (id: string) => void;
  /** «Arranca este AVD.» Ausente = esta ejecución no puede, y el botón no se pinta. */
  alArrancarEmulador?: (avd: string) => void;
  /** Cómo acabó el último arranque. Ausente = no se ha pedido ninguno. */
  arranqueDeEmulador?: { avd: string; ok: boolean; detalle: string };
  /** Lo que ofrece cada motor externo, por motor, para el desplegable de un subagente. */
  modelosDeMotor?: Record<string, { modelos: { id: string; nombre: string }[]; error?: string }>;
  /** Pide los de un motor. Bajo demanda: el de Codex arranca un proceso. */
  alPedirModelosDeMotor?: (motor: string) => void;
  /** Pide el catálogo de un proveedor nuestro, para el desplegable de un subagente. */
  alPedirCatalogo?: (proveedor: string) => void;
  /**
   * El modelo que usarán las sesiones NUEVAS, tal cual lo resuelve el servidor contra el
   * config global. Ausente = no consta, y entonces no se afirma ninguno — que NO es lo
   * mismo que decir que no hay defecto.
   *
   * Es el dato que esta ventana necesitaba para poder configurarlo: el `actual` del
   * compositor es el de la SESIÓN abierta, y sin sesión no existe.
   */
  modeloPorDefecto?: string;
  /**
   * Fija el modelo por defecto. Viaja la INTENCIÓN —el id «proveedor/modelo»—, nunca una
   * línea de comando: la sintaxis no se exporta. Es el MISMO mensaje que manda la pastilla
   * del compositor, así que las dos entradas comparten un solo camino.
   *
   * Ausente = esta ejecución no puede guardarlo, y no se pinta el control en vez de pintar
   * uno que no guarda nada.
   */
  alElegirModelo?: (id: string) => void;
  /** El paso de receta que corre ahora, tal como lo dice el servidor. */
  instalacion?: EstadoDelCliente["instalacion"];
  /** Lanzar el paso `numero` de una receta, y cancelar el que corra. Ausentes = no se pinta
   *  el botón: sin cable no hay a quién pedírselo. */
  alEjecutarPaso?: (receta: string, numero: number) => void;
  alCancelarPaso?: (receta: string) => void;
  /** Sin cable no se manda nada: lo que escribe en el servidor se apaga. */
  conectado?: boolean;
  /** Abre la petición de clave de ese proveedor (`/provider <id>` del otro lado). */
  alPedirClave: (proveedor: string) => void;
  alBorrarClave: (proveedor: string) => void;
  alRegistrarEntorno: (url: string) => void;
  /**
   * Dar de alta un endpoint compatible con OpenAI. El identificador NO se manda: lo deriva
   * el servidor del nombre, para que la regla viva en un solo sitio. Ausente = esta
   * ejecución no puede, y no se pinta el botón en vez de pintar uno que no guarda nada.
   */
  alAltaDeProveedor?: (nombre: string, baseUrl: string) => void;
  /** Darlo de baja, por su identificador. Se lleva su clave: la confirmación lo dice. */
  alBajaDeProveedor?: (slug: string) => void;
  /** El acuse del último alta o baja. `hecho` cierra el formulario; `motivo` se pinta en él. */
  resultadoDeProveedor?: { hecho: boolean; motivo?: string };
  /** Qué proyectos de ese entorno se enseñan en la barra. Vacío = ninguno, y es elección. */
  alElegirProyectos: (entorno: string, proyectos: string[]) => void;
  alResponderSecreto: (valor: string) => void | Promise<unknown>;
  /** El tope de concurrencia vigente. Ausente = todavía no ha llegado; el selector enseña
   *  la misma omisión que el store del cliente (2) mientras tanto. */
  tareas?: { concurrencia: number };
  /** Cambia el tope. Ausente = esta ejecución no puede, y el selector se apaga. */
  alCambiarConcurrencia?: (concurrencia: number) => void;
  /**
   * Dónde se bajan las copias locales, como lo dice el servidor (`~/…` o absoluta).
   * **Ausente = esta ejecución no lo dice**, y entonces el campo no se pinta: una caja de
   * texto vacía se leería como «no hay ninguna carpeta puesta», y sí la hay.
   */
  workspace?: string;
  /** Elige la carpeta. Ausente = esta ejecución no puede, y el campo se enseña de solo
   *  lectura — que es la verdad: la carpeta existe, cambiarla desde aquí no. */
  alCambiarWorkspace?: (ruta: string) => void;
  /**
   * Abre el selector de carpeta del sistema. **Ausente = esta máquina no tiene ninguno** —o
   * la consola se mira por un túnel, que es el límite declarado— y entonces el botón no se
   * pinta: queda el campo de texto, que siempre vale.
   */
  alElegirCarpeta?: () => void;
  /** El acuse del diálogo: `ruta` ausente = canceló. El `n` sube en cada acuse, porque
   *  elegir dos veces la misma carpeta no cambia la cadena y el campo no se enteraría. */
  carpetaElegida?: { n: number; ruta?: string };
  alCerrar: () => void;
}) {
  /**
   * Se abre en **General**, que es la primera de la lista.
   *
   * Abría en Modelos —la segunda—, y eso hacía que la ventana empezara a media lista: quien
   * entra a Ajustes sin una tarea concreta en la cabeza lee de arriba abajo, y el primer
   * renglón de la navegación no era lo que tenía delante. Lo pidió el usuario y además
   * arregla la incoherencia: el orden va de lo general a lo particular, así que arrancar en
   * lo particular contradecía el propio orden que la lista declara.
   */
  const [seccion, setSeccion] = useState<SeccionDeAjustes>(() => seccionInicial ?? "general");

  /**
   * El borrador de TODA la sección Dispositivos: los cuatro interruptores y las dos rutas
   * personalizadas, mismo patrón que `workspaceTecleado` de más abajo. Un solo borrador y no
   * uno por campo porque el guardado es UNO —«Guardar» manda el objeto entero— y por eso el
   * aviso de cambios sin guardar también es uno solo para la sección.
   *
   * Ausente = «no lo he tocado», y entonces se pinta lo que dice el servidor. Se suelta al
   * guardar Y al descartar (el botón «Descartar y continuar» del aviso), que son los dos
   * momentos en que el valor del servidor vuelve a ser la verdad.
   */
  const [dispositivosTecleados, setDispositivosTecleados] = useState<AjustesDeDispositivos | undefined>(undefined);
  const dispositivosEnElCampo = dispositivosTecleados ?? ajustesDeDispositivos ?? {};
  const dispositivosCambiados =
    dispositivosTecleados !== undefined && !igualesAjustesDeDispositivos(dispositivosTecleados, ajustesDeDispositivos ?? {});

  /**
   * Lo que queda pendiente si se confirma descartar el borrador de Dispositivos: cambiar de
   * sección o cerrar Ajustes. Puesto = el aviso está en pantalla.
   */
  const [pendienteDeConfirmar, setPendienteDeConfirmar] = useState<(() => void) | undefined>(undefined);
  const hayCambiosSinGuardar = seccion === "dispositivos" && dispositivosCambiados;
  const alIntentarCambiarSeccion = (nueva: SeccionDeAjustes): void => {
    if (hayCambiosSinGuardar && nueva !== seccion) setPendienteDeConfirmar(() => () => setSeccion(nueva));
    else setSeccion(nueva);
  };
  const alIntentarCerrar = (): void => {
    if (hayCambiosSinGuardar) setPendienteDeConfirmar(() => alCerrar);
    else alCerrar();
  };

  /**
   * Lo que hay TECLEADO en el campo del workspace, que no es lo que hay guardado.
   *
   * Ausente = «no lo he tocado», y entonces se pinta lo que dice el servidor. No se
   * sincroniza con un efecto: hacerlo pisaría lo que la persona está escribiendo cada vez
   * que llegue una reemisión, y el servidor reemite en cuanto alguien guarda. Se suelta al
   * guardar, que es cuando el valor del servidor vuelve a ser la verdad.
   */
  const [workspaceTecleado, setWorkspaceTecleado] = useState<string | undefined>(undefined);
  const workspaceEnElCampo = workspaceTecleado ?? workspace ?? "";
  const motivoDelWorkspace = motivoDeWorkspaceInaceptable(workspaceEnElCampo);
  const workspaceCambiado = workspaceTecleado !== undefined && workspaceTecleado.trim() !== (workspace ?? "");

  /**
   * Lo que el diálogo del sistema devuelve entra en el campo como si se hubiera tecleado: se
   * LEE, y guardarlo sigue siendo pulsar el botón. Elegir y guardar son dos actos.
   *
   * Se sigue el CONTADOR del acuse y no la ruta: elegir dos veces la misma carpeta no cambia
   * la cadena, y entonces ni se recogería el acuse ni se apagaría el «abriendo…».
   */
  const [acusePintado, setAcusePintado] = useState(0);
  const [abriendoSelector, setAbriendoSelector] = useState(false);
  if (carpetaElegida !== undefined && carpetaElegida.n !== acusePintado) {
    setAcusePintado(carpetaElegida.n);
    setAbriendoSelector(false);
    // Cancelar no toca el campo, que es lo que significa: no elegí ninguna.
    if (carpetaElegida.ruta !== undefined) setWorkspaceTecleado(carpetaElegida.ruta);
  }
  /** Qué fila está pidiendo clave: es donde se pinta la pregunta del servidor. */
  const [editando, setEditando] = useState<string | undefined>(undefined);
  /** Registrar un entorno es un MODO: mientras dura, la lista no está (ver más abajo). */
  const [registrando, setRegistrando] = useState(false);
  /** Dar de alta un proveedor es el MISMO modo, en la otra sección y por el mismo motivo. */
  const [anadiendo, setAnadiendo] = useState(false);
  const [nombreDeProveedor, setNombreDeProveedor] = useState("");
  const [urlDeProveedor, setUrlDeProveedor] = useState("");

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
  /**
   * Qué pestaña de entorno está abierta. Arranca en el ACTIVO —es donde estás trabajando,
   * y tenerlo que buscar sería el trabajo que esta pantalla viene a quitar—; si no consta
   * cuál es, en el primero registrado, que es lo único que se puede afirmar.
   */
  const [entornoAbierto, setEntornoAbierto] = useState<string | undefined>(
    () => entornoActivo ?? entornos[0]?.id
  );
  const entornoEnPestana =
    entornos.find((e) => e.id === entornoAbierto)?.id ?? entornoActivo ?? entornos[0]?.id;

  /**
   * La lista de UN entorno, con la misma forma para todos aunque vengan por dos caminos:
   * el activo la trae el `alta` y los demás se piden. Una sola función para que el render
   * no tenga dos ramas —que es donde se cuelan las divergencias— y para poder decir los
   * tres estados: lista, error, o todavía no se sabe.
   */
  const listaDe = (
    entorno: string | undefined
  ): {
    proyectos?: readonly { id: string; nombre: string; compartido?: boolean; ultimoAcceso?: string }[];
    error?: string;
  } => {
    if (entorno === undefined) return {};
    // Lo PEDIDO explícitamente (el `alta` inicial o un «Refrescar») es siempre lo más
    // fresco. Sin este orden, refrescar el entorno ACTIVO no se vería nunca: su lista
    // llegaría a `proyectosPorEntorno` pero esta función seguiría devolviendo el `alta`.
    const pedida = proyectosPorEntorno[entorno];
    if (pedida !== undefined) return pedida;
    if (entorno === entornoActivo && proyectos.length > 0) return { proyectos };
    return {};
  };

  /**
   * Lo marcado ahora mismo, **por entorno**. Arranca en la elección guardada de ESE entorno
   * y, si no hay ninguna, en lo que la barra enseña por omisión de SU lista — así la ventana
   * refleja la pantalla en vez de contradecirla. Es estado LOCAL porque cada clic viaja al
   * servidor: esperar a que vuelva el mensaje para pintar la casilla la dejaría dando saltos.
   *
   * Indexado por entorno y no una variable suelta, que es el fallo que las pestañas
   * destapan: con una sola, abrir la pestaña de otro entorno enseñaría marcados los ids del
   * primero y el primer clic guardaría la elección de aquél BAJO éste.
   */
  const [elegidosPorEntorno, setElegidosPorEntorno] = useState<Record<string, string[]>>({});
  /**
   * «Refrescando…» de un botón que pulsa a `alPedirProyectosDeEntorno` directamente, sin
   * pasar por el efecto de abajo (que solo pide si FALTA la lista). Indexado por entorno,
   * como `elegidosPorEntorno`: si se cambia de pestaña a mitad de la respuesta, no se apaga
   * el spinner de un entorno que no lo pidió.
   */
  const [refrescandoProyectos, setRefrescandoProyectos] = useState<Record<string, boolean>>({});
  /**
   * El texto de los buscadores de «Propios» y «Compartidos contigo», por entorno — el mismo
   * patrón que `elegidosPorEntorno`: sin indexar por entorno, cambiar de pestaña dejaría el
   * filtro de un entorno aplicado sobre la lista de otro.
   */
  const [filtroDeProyectos, setFiltroDeProyectos] = useState<
    Record<string, { propios?: string; compartidos?: string }>
  >({});
  const elegidosDe = (entorno: string | undefined): readonly string[] => {
    if (entorno === undefined) return [];
    const tocado = elegidosPorEntorno[entorno];
    if (tocado !== undefined) return tocado;
    const guardados = entornos.find((e) => e.id === entorno)?.proyectos;
    if (guardados !== undefined) return guardados;
    return (listaDe(entorno).proyectos ?? []).slice(0, PROYECTOS_POR_OMISION).map((p) => p.id);
  };
  /**
   * Al abrir una pestaña, pedir sus proyectos SI no se tienen ya — la misma regla que
   * Ficheros y Revisión: se pide cuando falta el dato, no al montar. Así el entorno activo
   * no gasta una conexión (su lista viene en el `alta`) y el que ya se consultó tampoco.
   *
   * Depende de `seccion` porque la pestaña solo está a la vista en Entornos: preguntarle a
   * CloudStudio por un entorno mientras alguien mira Modelos sería gastar una conexión
   * que nadie pidió.
   */
  const { proyectos: suyosEnPestana, error: errorEnPestana } = listaDe(entornoEnPestana);
  useEffect(() => {
    if (seccion !== "entornos" || registrando) return;
    if (entornoEnPestana === undefined || alPedirProyectosDeEntorno === undefined) return;
    // Con `error` NO se reintenta solo: sería un lazo contra un servidor que no contesta.
    if (suyosEnPestana !== undefined || errorEnPestana !== undefined) return;
    alPedirProyectosDeEntorno(entornoEnPestana);
    // Se depende de los DOS CAMPOS de esta pestaña y no del record de listas, y no es
    // cosmético: MEDIDO, con el record salían 5 peticiones donde tenía que haber 1. El
    // valor por omisión `proyectosPorEntorno = {}` es un objeto nuevo en cada render —y
    // justo mientras se espera la respuesta, que es cuando el prop no viaja—, así que el
    // efecto se volvía a disparar con cada mutación del store; con un turno en vuelo, eso
    // es una conexión con CloudStudio (OAuth + `initialize` + `studio_list_projects`) varias
    // veces por segundo. Estos dos campos valen establemente `undefined` mientras se espera.
    //
    // `alPedirProyectosDeEntorno` se queda FUERA a propósito: `App` pasa una lambda escrita
    // en el JSX, así que su identidad cambia en cada render y volvería a montar la misma
    // tormenta por otro camino.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion, registrando, entornoEnPestana, suyosEnPestana, errorEnPestana]);

  /**
   * Apaga «Refrescando…» cuando llega una respuesta NUEVA para la pestaña en vuelo — el
   * mismo patrón que `Equipo.tsx` (`useEffect(() => setMirando(false), [medido])`), aquí
   * sobre el par lista/error de la pestaña abierta en vez de una hora de medida.
   */
  useEffect(() => {
    if (entornoEnPestana === undefined) return;
    setRefrescandoProyectos((previo) =>
      previo[entornoEnPestana] === true ? { ...previo, [entornoEnPestana]: false } : previo
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suyosEnPestana, errorEnPestana]);

  /**
   * **Se mide al entrar en Dispositivos y al VOLVER a la ventana con la sección abierta.**
   *
   * El segundo es el que faltaba y el que el usuario encontró: dejas esto abierto, te vas al
   * terminal a matar el emulador, y vuelves — la sección nunca cambia, así que la foto se
   * quedaba en la de hace un minuto y la fila en verde. Reproducido en el navegador.
   *
   * El porqué de que esto no sea un sondeo está en `medirAlVolver.ts`, que lo comparte con la
   * pestaña Ejecutar: dos copias del mismo efecto con su suscripción es como divergen.
   */
  useMedirAlVolver(seccion === "dispositivos", alActualizarDispositivos);

  const [avisoDeUrl, setAvisoDeUrl] = useState<string | undefined>(undefined);

  /**
   * Lo que había al ENVIAR un registro: cuántos entornos y qué aviso. Con eso se sabe cuándo
   * contestó el servidor sin que Ajustes vea el alta entera — un entorno más es que se
   * registró (y el formulario se cierra), un aviso distinto es que no (y se enseña dentro).
   * Límite declarado: el MISMO motivo dos veces seguidas no se vuelve a enseñar.
   */
  const [enviado, setEnviado] = useState<{ entornos: number; aviso?: string } | undefined>(undefined);
  const registrar = (evento: FormEvent): void => {
    evento.preventDefault();
    if (!urlDeEntornoAceptable(url)) {
      setAvisoDeUrl(AVISO_DE_URL);
      return;
    }
    setAvisoDeUrl(undefined);
    setEnviado({ entornos: entornos.length, ...(avisoDelAlta === undefined ? {} : { aviso: avisoDelAlta }) });
    alRegistrarEntorno(url);
    setUrl("");
  };
  useEffect(() => {
    if (enviado === undefined || entornos.length <= enviado.entornos) return;
    setEnviado(undefined);
    setRegistrando(false);
  }, [enviado, entornos.length]);
  const avisoDeRegistro =
    enviado !== undefined && avisoDelAlta !== undefined && avisoDelAlta !== enviado.aviso ? avisoDelAlta : undefined;

  /**
   * El motivo del último intento, para pintarlo DENTRO del formulario. Solo mientras el
   * formulario esté abierto: un error de hace dos minutos, reaparecido al volver a abrirlo,
   * hablaría de algo que ya nadie recuerda.
   */
  const avisoDeProveedor = anadiendo ? resultadoDeProveedor?.motivo : undefined;

  /**
   * El formulario se cierra cuando el SERVIDOR dice que el alta se hizo, no al pulsar:
   * pulsar es pedirlo, y cerrar antes de saberlo enseñaría un alta que pudo fallar. El
   * mismo criterio que el resto de esta consola — la interfaz no afirma lo que no le han
   * contado.
   */
  useEffect(() => {
    if (!anadiendo || resultadoDeProveedor?.hecho !== true) return;
    setAnadiendo(false);
    setNombreDeProveedor("");
    setUrlDeProveedor("");
  }, [anadiendo, resultadoDeProveedor]);

  const anadirProveedor = (evento: { preventDefault: () => void }): void => {
    evento.preventDefault();
    // La comprobación de la URL es la MISMA que la de un entorno (`Wizard.tsx`), que es la
    // copia declarada de la regla del host: https fuera de la máquina, http solo en
    // loopback. Aquí es de balde y evita un viaje; el servidor la vuelve a aplicar, que es
    // quien manda.
    if (!urlDeEntornoAceptable(urlDeProveedor)) return;
    alAltaDeProveedor?.(nombreDeProveedor, urlDeProveedor);
  };

  /**
   * De serie y personalizados van en dos grupos y en este orden, no mezclados y no
   * ordenados por si tienen clave: una lista que se reordena al añadir una credencial hace
   * saltar las filas bajo el cursor. Dentro de cada grupo manda el orden del servidor.
   */
  const deSerie = proveedores.filter((p) => p.personalizado !== true);
  const propios = proveedores.filter((p) => p.personalizado === true);

  const filaDeProveedor = (p: ProveedorDeModelos) => (
                    <li key={p.id} className={estilos.fila} data-columna="">
                      <div className={estilos.cabeceraDeFila}>
                        <IconoDeProveedor proveedor={p.id} size={22} className={estilos.logo} />
                        {/* El nombre arriba y el id debajo en mono: el id es lo que se teclea
                            en `/modelo <proveedor>/<modelo>`, o sea dato de máquina, y la
                            fila lo enseña para que se pueda copiar sin salir de aquí. */}
                        <span className={estilos.identidad}>
                          <span className={estilos.nombre}>{p.nombre}</span>
                          {/* En uno personalizado el id no basta: a dónde va la clave es la
                              URL, y es lo que hay que poder leer al lado del punto verde. */}
                          {/* El `title` lleva el texto ENTERO porque la línea recorta: una
                              URL larga se lee pasando el ratón, sin abrir nada. */}
                          <span
                            className={estilos.idDeProveedor}
                            title={p.baseUrl === undefined ? p.id : `${p.id} · ${p.baseUrl}`}
                          >
                            {p.baseUrl === undefined ? p.id : `${p.id} · ${p.baseUrl}`}
                          </span>
                        </span>
                        <span className={estilos.estadoDeClave}>
                          {/* Sin punto para quien no necesita credencial: no hay nada que afirmar. */}
                          {p.credencial === "nativa" ? null : (
                            <span
                              className={estilos.punto}
                              data-credencial={p.credencial}
                              aria-label={p.credencial === "puesta" ? "con credencial" : "sin credencial"}
                            />
                          )}
                          <span className={estilos.detalle}>
                            {p.credencial === "nativa"
                              ? "local, no necesita clave"
                              : p.credencial === "puesta"
                                ? p.enFichero === true
                                  ? "clave guardada"
                                  : "clave de una variable de entorno"
                                : "sin clave"}
                          </span>
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
                        {p.personalizado === true && alBajaDeProveedor !== undefined ? (
                          <Button
                            variant="outline"
                            className={estilos.accion}
                            disabled={!conectado}
                            onClick={() => {
                              setEditando(undefined);
                              setBorrando(`baja:${p.id}`);
                            }}
                          >
                            Dar de baja
                          </Button>
                        ) : null}
                      </div>
                      {borrando === `baja:${p.id}` ? (
                        // Se dice que la clave se va con él: dejarla en `auth.json` bajo un
                        // proveedor que ya no existe sería un secreto en disco que nadie
                        // vuelve a ver para borrarlo.
                        <p className={estilos.confirmacion} role="alert">
                          <span>
                            ¿Dar de baja «{p.nombre}»? Se borra también su clave del fichero de
                            credenciales.
                          </span>
                          <Button
                            variant="outline"
                            className={estilos.accion}
                            onClick={() => {
                              setBorrando(undefined);
                              alBajaDeProveedor?.(p.id.replace(/^custom:/, ""));
                            }}
                          >
                            Dar de baja «{p.nombre}»
                          </Button>
                          <Button variant="outline" className={estilos.accion} onClick={() => setBorrando(undefined)}>
                            Cancelar
                          </Button>
                        </p>
                      ) : null}
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
  );

  /**
   * Qué pestaña de dispositivo está abierta.
   *
   * Arranca en Android y **no sigue a lo que esté medido**: cuál de las dos se mira es una
   * elección de quien está aquí, y una pestaña que se mudara sola —porque la otra no aplica,
   * porque le falta todo— se llevaría por delante lo que estabas leyendo. Lo que sí hace
   * falta para no tener que abrirlas es que cada una DIGA si le falta algo (`faltanDe`).
   */
  const [plataformaAbierta, setPlataformaAbierta] = useState<Dispositivo["plataforma"]>("android");

  /**
   * Qué filas de Requisitos tienen el panel de «ruta actual / ruta personalizada»
   * desplegado. Solo `adb`/`emulator` lo ofrecen —son las dos únicas con `ruta` y con campo
   * de override—, y cada una se abre por su cuenta: un Set y no un booleano, porque las dos
   * pueden estar abiertas a la vez.
   */
  const [expandidas, setExpandidas] = useState<ReadonlySet<NombreDeHerramienta>>(new Set());
  const alternarExpandida = (nombre: NombreDeHerramienta): void =>
    setExpandidas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(nombre)) siguiente.delete(nombre);
      else siguiente.add(nombre);
      return siguiente;
    });
  /** El campo del borrador que le corresponde a cada herramienta con ruta personalizable. */
  const campoDeRutaDe = (nombre: "adb" | "emulator"): "rutaAdb" | "rutaEmulator" =>
    nombre === "adb" ? "rutaAdb" : "rutaEmulator";

  /**
   * Las herramientas de una plataforma, **según la medida y no según una tabla de aquí**.
   * Vienen todas en el informe —el host las mide siempre, apagadas o no—, y cada una dice de
   * qué plataforma es. Un informe que no nombre alguna de las que esta ventana conoce se
   * cuenta al pie, en vez de dejar su fila desaparecida sin decirlo.
   */
  const herramientasDe = (p: Dispositivo["plataforma"]): readonly Herramienta[] =>
    (dispositivos?.herramientas ?? []).filter((h) => h.plataforma === p);

  /**
   * Cuántas de esas herramientas constan como FALTANTES — es lo que enseña la pestaña sin
   * abrirla.
   *
   * Solo «no está instalada» y «falló»: una **desactivada** es una elección de quien está
   * aquí (apagó ese destino para no arrancar procesos) y una **no aplica** es un hecho del
   * sistema —contar cualquiera de las dos como pendiente sería inventar una tarea—. Y sin
   * medir tampoco: ahí no se sabe si falta, que es distinto de saber que falta.
   */
  const faltanDe = (p: Dispositivo["plataforma"]): number =>
    herramientasDe(p).filter((h) => h.estado === "no-encontrada" || h.estado === "fallo").length;

  /** Lo que el informe NO nombra, de las que esta ventana sabe que existen. Se dice al pie. */
  const sinMedir =
    dispositivos === undefined
      ? []
      : REQUISITOS.filter((r) => !dispositivos.herramientas.some((h) => h.nombre === r.nombre));

  return (
    // El Fragment es lo que permite que el aviso de «cambios sin guardar» —otro `Modal`,
    // propio portal— sea HERMANO de la ventana de Ajustes y no un hijo suyo: dos portales
    // anidados no es lo mismo que dos portales al lado.
    <>
    {/* `headless` como el modal de aprobación: la cabecera y el pie que trae `Modal` no se
        usan —la ventana tiene su propia navegación y su propio cierre—, pero `title` sigue
        siendo obligatorio y es lo que anuncia el diálogo a un lector de pantalla.

        La CAPA y el VELO son nuestros, y no un adorno: los CSS Modules del primitivo son
        stubs vacíos, así que su `dialog` y su máscara no traen ni posición ni tamaño. Sin
        esto la ventana se pintaba al final del `body`, debajo de la aplicación entera —
        montada y fuera de la vista, que desde fuera se lee como «el botón no hace nada». */}
    <Modal open onClose={alIntentarCerrar} title="Ajustes" headless className={estilos.capa}>
      <div
        className={estilos.velo}
        // Pinchar FUERA cierra; la comprobación de `target` es lo que distingue «fuera» de
        // «dentro», porque un clic en cualquier botón de la ventana burbujea hasta aquí.
        // Pasa por `alIntentarCerrar` y no por `alCerrar` a pelo: con un borrador sucio en
        // Dispositivos, cerrar SÍ decide algo — si se pierde lo tecleado.
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) alIntentarCerrar();
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
          {/* «Conectores» se retira de la lista mientras `conectores` no ha llegado: no es
              lo mismo que las demás secciones, que siempre existen y solo cambian de
              «consultando» a su contenido — aquí ausente puede significar que esta consola
              no tiene la opción puesta. Un control sin dato detrás no se pinta. */}
          {SECCIONES.filter((s) => s.id !== "conectores" || conectores !== undefined).map((s) => (
            <button
              key={s.id}
              type="button"
              className={estilos.seccion}
              data-actual={s.id === seccion ? "" : undefined}
              aria-current={s.id === seccion ? "page" : undefined}
              onClick={() => alIntentarCambiarSeccion(s.id)}
            >
              <s.Icono size={16} className={estilos.iconoDeSeccion} />
              {s.etiqueta}
            </button>
          ))}
        </nav>
        <div className={estilos.panel}>

          {seccion === "dispositivos" ? (
            <>
              <h2 className={estilos.encabezado}>Dispositivos</h2>
              <p className={estilos.nota}>
                Dónde se prueba la app. Se guarda con el equipo y no con el proyecto: el mismo Mac tiene los
                mismos simuladores para todos.
              </p>

              {/*
                UNA PESTAÑA POR PLATAFORMA, y dentro de cada una lo suyo. Antes esto era una
                sola columna —requisitos, recetas, y luego los teléfonos y los simuladores de
                LAS DOS plataformas mezclados—, y con iOS dentro la lista se hacía larga y sin
                costuras: treinta y cinco simuladores de Xcode entre los teléfonos de Android,
                sin nada que dijera dónde acaba una cosa y dónde empieza la otra.

                Lo que agrupa es `plataforma`, que llega MEDIDO por el cable —de la misma
                función que lo decidió en el host—, y no una deducción de aquí: «`adb` suena a
                Android» sería una segunda copia de esa regla, y el día que una herramienta
                sirviera a las dos plataformas la copia callaría.
              */}
              <div className={estilos.pestanas} role="tablist" aria-label="Plataformas">
                {PLATAFORMAS.map((p) => {
                  const faltan = faltanDe(p);
                  const deshabilitada = p === "ios" && dispositivos?.sistema !== undefined && dispositivos.sistema !== "mac";
                  return (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      className={estilos.pestana}
                      aria-selected={p === plataformaAbierta}
                      aria-disabled={deshabilitada ? true : undefined}
                      disabled={deshabilitada}
                      title={deshabilitada ? TITULO_IOS_REQUIERE_MAC : undefined}
                      // Lo que le falta, en la etiqueta que lee un lector de pantalla: el
                      // número de al lado, solo, no se anuncia como nada. Deshabilitada, el
                      // motivo en vez del recuento — con la pestaña inerte ya no hay panel
                      // donde leerlo.
                      aria-label={
                        deshabilitada
                          ? `${ETIQUETA_DE_PLATAFORMA[p]}, ${TITULO_IOS_REQUIERE_MAC}`
                          : faltan === 0
                            ? ETIQUETA_DE_PLATAFORMA[p]
                            : `${ETIQUETA_DE_PLATAFORMA[p]}, ${faltan} por instalar`
                      }
                      data-actual={p === plataformaAbierta ? "" : undefined}
                      onClick={deshabilitada ? undefined : () => setPlataformaAbierta(p)}
                    >
                      {ETIQUETA_DE_PLATAFORMA[p]}
                      {/* Y solo cuando falta algo: un cero es el control sin dato detrás que
                          esta consola no pinta, y aquí además no diría nada que las filas de
                          abajo no digan una a una. */}
                      {faltan === 0 ? null : (
                        <span className={estilos.cuenta} aria-hidden>
                          {faltan}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div role="tabpanel" className={estilos.panelDePestana} aria-label={ETIQUETA_DE_PLATAFORMA[plataformaAbierta]}>
              {/*
                DOS bloques y no una lista, porque son dos cosas distintas: un requisito está
                o no está —y si no está, se instala—, y un destino se elige. Juntos, «Android
                Sim · emulator no está instalada» se leía como un ajuste que el interruptor de
                al lado podía arreglar.
              */}
              <h3 className={estilos.subencabezado}>Requisitos</h3>
              {dispositivos === undefined ? (
                <p className={estilos.vacio}>Todavía no ha llegado ninguna medida de este equipo.</p>
              ) : herramientasDe(plataformaAbierta).length === 0 ? (
                // Con una medida que no nombra ninguna herramienta de esta plataforma no hay
                // fila que pintar, y una lista vacía afirmaría «no hace falta ninguna». Lo
                // que hay es una medida que no las nombra, y eso se dice al pie.
                <p className={estilos.vacio}>La medida de este equipo no nombra ninguna herramienta de esta plataforma.</p>
              ) : (
                <ul className={estilos.filas}>
                  {herramientasDe(plataformaAbierta).map((h) => {
                    // La ficha es solo el rótulo; de qué plataforma es lo dice la medida. Una
                    // herramienta que esta ventana no conozca se enseña con su nombre.
                    const r = REQUISITOS.find((x) => x.nombre === h.nombre);
                    // Solo estas dos tienen `ruta` y ruta PERSONALIZABLE — la excepción
                    // declarada a `sinRutas`, ver `core/dispositivos.ts#Herramienta.ruta`.
                    const conRuta = h.nombre === "adb" || h.nombre === "emulator" ? h.nombre : undefined;
                    const desplegada = conRuta !== undefined && expandidas.has(conRuta);
                    return (
                      <Fragment key={h.nombre}>
                        <li className={estilos.fila}>
                          {/* Verde SOLO con «ok»: es lo único que significa disponible y
                              configurado. «Desactivada» no se pinta en verde ni en rojo —no
                              se ha mirado, y afirmar cualquiera de las dos sería inventarlo. */}
                          <span
                            className={estilos.punto}
                            data-herramienta={h.estado}
                            aria-label={ETIQUETA_DE_HERRAMIENTA[h.estado]}
                          />
                          <span className={estilos.nombre}>{r?.etiqueta ?? h.nombre}</span>
                          <span className={estilos.detalle}>
                            {ETIQUETA_DE_HERRAMIENTA[h.estado]}
                            {r === undefined ? "" : ` · ${r.para}`}
                            {h.detalle === undefined || h.estado === "ok" ? null : ` · ${h.detalle}`}
                          </span>
                          {/*
                            Instalar solo se ofrece cuando FALTA y se sabe cómo. Y el comando
                            se enseña siempre: quien pulsa un botón que instala software tiene
                            derecho a saber qué se va a lanzar en su máquina. Va JUNTO al
                            engranaje y no en su lugar: una herramienta que falta también se
                            puede apuntar a mano, así que las dos acciones conviven.
                          */}
                          {h.instalar === undefined ? null : h.instalar.automatico ? (
                            <Button
                              variant="outline"
                              className={estilos.accion}
                              disabled={!conectado || alInstalarHerramienta === undefined}
                              title={h.instalar.comando}
                              onClick={() => alInstalarHerramienta?.(h.nombre)}
                            >
                              Instalar
                            </Button>
                          ) : (
                            <code className={estilos.comando} title="cópialo en un terminal">
                              {h.instalar.comando}
                            </code>
                          )}
                          {/* El engranaje: abre el panel con la ruta actual y la
                              personalizada. Solo adb/emulator lo llevan. */}
                          {conRuta === undefined ? null : (
                            <button
                              type="button"
                              className={estilos.iconoDeAjuste}
                              aria-label={`Ajustes de ruta de ${r?.etiqueta ?? h.nombre}`}
                              aria-expanded={desplegada}
                              onClick={() => alternarExpandida(conRuta)}
                            >
                              <IconSettingsOutline16 size={16} />
                            </button>
                          )}
                        </li>
                        {conRuta === undefined || !desplegada ? null : (
                          <li key={`${h.nombre}-ajustes`} className={estilos.fila} data-columna>
                            <label className={estilos.filaDeWorkspace}>
                              <span className={estilos.etiquetaDeWorkspace}>Ruta actual</span>
                              <div className={estilos.campoConBoton}>
                                <input
                                  type="text"
                                  value={h.ruta ?? ""}
                                  disabled
                                  placeholder="no encontrada"
                                  aria-label={`Ruta actual de ${r?.etiqueta ?? h.nombre}`}
                                />
                                {h.ruta === undefined || alAbrirCarpetaDeHerramienta === undefined ? null : (
                                  <button
                                    type="button"
                                    className={estilos.accion}
                                    title="Abre esa carpeta en el explorador del sistema donde corre la consola"
                                    disabled={!conectado}
                                    onClick={() => alAbrirCarpetaDeHerramienta(conRuta)}
                                  >
                                    Abrir carpeta
                                  </button>
                                )}
                              </div>
                            </label>
                            {alCambiarDispositivos === undefined ? null : (
                              <>
                                <label className={estilos.filaDeWorkspace}>
                                  <span className={estilos.etiquetaDeWorkspace}>Ruta personalizada</span>
                                  <input
                                    type="text"
                                    value={dispositivosEnElCampo[campoDeRutaDe(conRuta)] ?? ""}
                                    spellCheck={false}
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    aria-label={`Ruta personalizada de ${r?.etiqueta ?? h.nombre}`}
                                    placeholder={placeholderDeRuta(dispositivos?.sistema)[conRuta]}
                                    disabled={!conectado}
                                    onChange={(e) =>
                                      setDispositivosTecleados({ ...dispositivosEnElCampo, [campoDeRutaDe(conRuta)]: e.target.value })
                                    }
                                  />
                                </label>
                                <p className={estilos.nota}>Vacío = se busca en el PATH y en el SDK, como hasta ahora.</p>
                                {/*
                                  «Guardar» vive EN la card, no al pie de la sección: es
                                  aquí donde se edita (esta ruta, y las casillas de
                                  «Buscar en» de arriba, que viajan en el MISMO borrador).
                                  Mismo patrón que el del workspace: `<button>` con
                                  `.accion`, no el primitivo `Button`, a la derecha.
                                */}
                                <div className={estilos.accionesDeWorkspace}>
                                  <button
                                    type="button"
                                    className={estilos.accion}
                                    disabled={!conectado || !dispositivosCambiados}
                                    onClick={() => {
                                      alCambiarDispositivos(dispositivosEnElCampo);
                                      setDispositivosTecleados(undefined);
                                    }}
                                  >
                                    Guardar
                                  </button>
                                </div>
                              </>
                            )}
                          </li>
                        )}
                      </Fragment>
                    );
                  })}
                </ul>
              )}

              {/*
                La RECETA de lo que falta, debajo de los requisitos y no mezclada con ellos:
                un requisito es un punto que está o no está, y esto es un procedimiento con
                orden. La suya es la de ESTA plataforma —lo dice la receta, no el nombre de
                su id— y solo aparece si el servidor manda alguna: en Windows y en Linux no
                hay todavía, y ahí el panel calla en vez de enseñar los pasos de macOS.
              */}
              {(dispositivos?.recetas ?? [])
                .filter((receta) => receta.plataforma === plataformaAbierta)
                .map((receta) => (
                  <Receta
                    key={receta.id}
                    receta={receta}
                    {...(instalacion === undefined ? {} : { instalacion })}
                    // Sin cable no se ofrece lanzar nada: la petición se perdería sin decirlo.
                    {...(conectado && alEjecutarPaso !== undefined
                      ? { alEjecutar: (numero: number) => alEjecutarPaso(receta.id, numero) }
                      : {})}
                    {...(conectado && alCancelarPaso !== undefined
                      ? { alCancelar: () => alCancelarPaso(receta.id) }
                      : {})}
                  />
                ))}

              {/*
                El filtro de MEDIDA, DENTRO de la sección de Requisitos —es una pregunta
                sobre las mismas herramientas de arriba, no del inventario de abajo—.
                «Guardar» ya NO vive aquí: se guarda desde CADA card de adb/emulator (su
                engranaje desplegado), porque es donde se edita la ruta personalizada; las
                casillas viajan en el MISMO objeto cuando se pulsa cualquiera de los dos.
              */}
              {alCambiarDispositivos === undefined ? null : (
                <div className={estilos.filaBuscarEn}>
                  <span>Buscar en:</span>
                  {DESTINOS.filter((d) => d.plataforma === plataformaAbierta).map((d) => (
                    <label key={d.id} className={estilos.casillaEnLinea}>
                      <input
                        type="checkbox"
                        checked={seMira(dispositivosEnElCampo, d.id)}
                        disabled={!conectado}
                        // Escribe en el BORRADOR: nada se guarda hasta pulsar «Guardar»,
                        // que ahora vive en cada card de adb/emulator.
                        onChange={() =>
                          setDispositivosTecleados({
                            ...dispositivosEnElCampo,
                            [d.id]: !seMira(dispositivosEnElCampo, d.id),
                          })
                        }
                      />
                      {d.etiqueta}
                    </label>
                  ))}
                </div>
              )}

              {/* La línea que separa los REQUISITOS (lo que se configura) del INVENTARIO
                  (lo que se lista). Pegada al título de abajo a propósito: la separación
                  vale entre las dos SECCIONES, no dentro de la de abajo. */}
              <hr className={estilos.separador} />
              <h3 className={`${estilos.subencabezado} ${estilos.subencabezadoPegado}`}>Dispositivos y emuladores</h3>
              {/*
                El INVENTARIO, no cuatro interruptores. El botón de antes decía «Se mira» al
                lado de un punto verde y se leía como si concediera la capacidad: el verde ya
                dice que se puede usar, así que el botón sobraba justo donde estaba. Lo que
                una persona quiere ver aquí es qué teléfonos y qué simuladores hay — y luego,
                cuál usa el agente, que es una elección de la SESIÓN y por eso todavía no
                vive en esta ventana (dice «Configuración global» en la cabecera).

                Y el reparto en dos listas se cruza con el de la pestaña en vez de rehacerse:
                `inventario` separa lo que se ENCHUFA de lo que se ARRANCA —que es como lo
                distingue una persona— y la pestaña separa por plataforma. Son dos ejes
                distintos y los dos son verdad, así que aquí solo se filtra lo que ya venía
                agrupado.
              */}
              {dispositivos === undefined ? (
                <p className={estilos.vacio}>Todavía no ha llegado ninguna medida de este equipo.</p>
              ) : (
                (() => {
                  const { fisicos, virtuales } = inventario(dispositivos);
                  // `FilaDeInventario` y no `Dispositivo`: la fila de un AVD que solo existe
                  // como definición lleva su marca, y estrecharla aquí la perdía.
                  const deAqui = (ds: readonly FilaDeInventario[]): FilaDeInventario[] =>
                    ds.filter((d) => d.plataforma === plataformaAbierta);
                  const telefonos = deAqui(fisicos);
                  const simuladores = deAqui(virtuales);
                  return (
                    <>
                      <h4 className={estilos.subsubencabezado}>Teléfonos y tablets</h4>
                      {telefonos.length === 0 ? (
                        <p className={estilos.vacio}>Ninguno conectado.</p>
                      ) : (
                        <ul className={estilos.filas}>
                          {telefonos.map((d) => (
                            <li key={d.id} className={estilos.fila}>
                              <span
                                className={estilos.punto}
                                data-herramienta={seLlegaAlDispositivo(d) ? "ok" : "otro"}
                                aria-label={etiquetaDeEstado(d)}
                              />
                              <span className={estilos.nombre}>{d.nombre}</span>
                              {/* Sin decir la plataforma: la pestaña abierta ya la dice, y
                                  repetirla en cada fila era lo que hacía larga la lista. */}
                              <span className={estilos.detalle}>
                                {etiquetaDeEstado(d)}
                                {d.detalle === undefined ? "" : ` · ${d.detalle}`}
                              </span>
                              <VerificarDispositivo
                                dispositivo={d}
                                conectado={conectado}
                                medidoDeLaFoto={dispositivos.medido}
                                {...(alVerificarDispositivo === undefined ? {} : { alVerificar: alVerificarDispositivo })}
                              />
                            </li>
                          ))}
                        </ul>
                      )}

                      <h4 className={estilos.subsubencabezado}>Simuladores y emuladores</h4>
                      {simuladores.length === 0 ? (
                        <p className={estilos.vacio}>Ninguno disponible.</p>
                      ) : (
                        // Con scroll: esta máquina tiene 35 simuladores, y el panel «Tu
                        // equipo» los CUENTA justamente por eso. Aquí sí se listan —es donde
                        // se elegirá uno— pero acotados en alto, para que la sección de
                        // requisitos de arriba no se vaya de la pantalla.
                        <ul className={`${estilos.filas} ${estilos.listaLarga}`}>
                          {simuladores.map((d) => (
                            <li key={d.id} className={estilos.fila}>
                              <span
                                className={estilos.punto}
                                data-herramienta={seLlegaAlDispositivo(d) ? "ok" : "otro"}
                                aria-label={etiquetaDeEstado(d)}
                              />
                              <span className={estilos.nombre}>{d.nombre}</span>
                              <span className={estilos.detalle}>{etiquetaDeEstado(d)}</span>
                              {/*
                                **Arrancar, solo donde hay algo que arrancar.** Un AVD que
                                existe y no está en marcha (`soloDefinicion`) es el único caso:
                                un simulador de iOS apagado no lo arranca xonecode, y uno ya
                                arrancado no se arranca dos veces. Sin el manejador no se pinta
                                —esta ejecución no puede—, que es la regla de esta ventana.
                              */}
                              {d.soloDefinicion === true && alArrancarEmulador !== undefined ? (
                                <ArrancarEmulador
                                  avd={d.nombre}
                                  conectado={conectado}
                                  alArrancar={alArrancarEmulador}
                                  {...(arranqueDeEmulador?.avd === d.nombre
                                    ? { resultado: arranqueDeEmulador }
                                    : {})}
                                />
                              ) : null}
                              <VerificarDispositivo
                                dispositivo={d}
                                conectado={conectado}
                                medidoDeLaFoto={dispositivos.medido}
                                {...(alVerificarDispositivo === undefined ? {} : { alVerificar: alVerificarDispositivo })}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  );
                })()
              )}
              </div>

              {/*
                Lo de TODA la máquina, fuera de las pestañas: la foto y su hora, qué no se
                midió, y la puerta para volver a mirar. Dentro de una pestaña, «Medido a las
                12:04» se leería como la hora de esa plataforma, y es la de las dos.
              */}
              <p className={`${estilos.nota} ${estilos.medidoAlPie}`}>
                {dispositivos === undefined
                  ? "Todavía no ha llegado ninguna medida de este equipo."
                  : `Medido a las ${horaDe(dispositivos.medido)}. Lo que no se busca no se mide: adb arranca un demonio que se queda vivo, y xcrun tarda segundos.`}{" "}
                {alActualizarDispositivos === undefined ? null : (
                  <button
                    type="button"
                    className={estilos.enlace}
                    // La MISMA frase que el botón del escritorio, importada y no copiada: es
                    // la misma medida, y dos copias es donde divergirían.
                    title={TITULO_DE_REFRESCAR_EQUIPO}
                    disabled={!conectado}
                    onClick={alActualizarDispositivos}
                  >
                    Refrescar
                  </button>
                )}
              </p>
              {sinMedir.length === 0 ? null : (
                // Las filas salen de lo que la MEDIDA nombra, así que una herramienta que el
                // informe no nombre no desaparece en silencio: se cuenta, con la misma regla
                // del resto de esta casa. Sin esto, un informe incompleto se leería como una
                // máquina a la que no le falta nada de eso.
                <p className={estilos.nota}>
                  La medida no nombra {sinMedir.map((r) => r.etiqueta).join(", ")}: no se puede decir si{" "}
                  {sinMedir.length === 1 ? "está" : "están"}.
                </p>
              )}
              {/*
                Esta nota dice lo que la ventana HACE y lo que NO, y por eso hay que tocarla
                cada vez que una de las dos listas cambia: «arrancar un emulador» estuvo aquí
                como pendiente hasta que se cableó el botón de la fila, y una nota que niega
                un botón que está ahí al lado es peor que no tenerla. Instalar la app y
                conectar por red siguen sin estar, así que siguen dichos.
              */}
              <p className={estilos.nota}>
                XOneCode los DESCUBRE, instala lo que falta, arranca un emulador de Android y verifica la
                conexión con uno. Elegir con cuál trabaja el agente es una decisión de la sesión, no de esta
                ventana; conectar por red, arrancar un simulador de iOS o instalar la app no están cableados
                todavía.
              </p>
            </>
          ) : null}

          {seccion === "general" ? (
            <>
              <h2 className={estilos.encabezado}>General</h2>
              <p className={estilos.nota}>
                Lo que vale para toda la máquina y no para un proyecto. Se guarda con el equipo, como los
                dispositivos.
              </p>

              {/*
                El tope de concurrencia de la cola de tareas en background, que hasta ahora vivía
                al final de Dispositivos. El motivo que lo puso ahí era cierto —es un ajuste de la
                MÁQUINA, y sigue siéndolo— y la sección no: describe el EQUIPO, pero no tiene nada
                que ver con dónde se prueba la app, y quien venía a mirar sus simuladores se
                encontraba un número que habla de otra cosa.

                **Y se mueve a una sección con nombre general a propósito**: es un ajuste de la
                máquina suelto, y el próximo que aparezca —lo que valga para todo el equipo y no
                para un proyecto— tiene su sitio sin volver a decidir dónde ponerlo.
              */}
              {/*
                DÓNDE se bajan las copias. Va en General y arriba de Tareas porque es lo
                más estructural que hay aquí: decide en qué carpeta de este Mac vive el
                trabajo. El campo solo se pinta si el servidor dice cuál es — ausente ≠
                vacío, y una caja en blanco se leería como «no hay ninguna puesta».
              */}
              {workspace === undefined ? null : (
                <>
                  <h3 className={estilos.subencabezado}>Dónde se bajan los proyectos</h3>
                  <p className={estilos.nota}>
                    Cada proyecto que bajas de CloudStudio se copia dentro, en{" "}
                    <code>&lt;entorno&gt;/&lt;proyecto&gt;</code>. El nivel del entorno no es decoración: el
                    mismo proyecto puede existir en dos servidores a la vez.
                  </p>
                  <label className={estilos.filaDeWorkspace}>
                    <span className={estilos.etiquetaDeWorkspace}>Carpeta</span>
                    <input
                      type="text"
                      value={workspaceEnElCampo}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      aria-label="Carpeta donde se bajan los proyectos"
                      // La ruta entera al pasar por encima: el campo se hace todo lo ancho
                      // que da la ventana, y aun así una ruta puede no caber.
                      title={workspaceEnElCampo}
                      aria-invalid={motivoDelWorkspace === undefined ? undefined : true}
                      disabled={!conectado || alCambiarWorkspace === undefined}
                      onChange={(e) => setWorkspaceTecleado(e.target.value)}
                    />
                  </label>
                  <div className={estilos.accionesDeWorkspace}>
                    {alElegirCarpeta === undefined ? null : (
                      <button
                        type="button"
                        className={estilos.accion}
                        title="Abre el explorador de este Mac, donde corre la consola"
                        disabled={!conectado || abriendoSelector}
                        onClick={() => {
                          setAbriendoSelector(true);
                          alElegirCarpeta();
                        }}
                      >
                        {abriendoSelector ? "Abriendo…" : "Examinar…"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={estilos.accion}
                      disabled={
                        !conectado ||
                        alCambiarWorkspace === undefined ||
                        !workspaceCambiado ||
                        motivoDelWorkspace !== undefined
                      }
                      onClick={() => {
                        // Se suelta lo tecleado: a partir de aquí manda lo que conteste el
                        // servidor, que reemite el valor que acabó en disco — el que valió
                        // o el de antes.
                        alCambiarWorkspace?.(workspaceEnElCampo.trim());
                        setWorkspaceTecleado(undefined);
                      }}
                    >
                      Guardar
                    </button>
                  </div>
                  {/*
                    La regla es la copia DECLARADA de la del host
                    (`core/settings.ts#motivoDeWorkspaceInaceptable`), como la de la URL de
                    un entorno: la frontera prohíbe compartir módulo. De balde evita un
                    viaje, y el servidor la vuelve a aplicar, que es quien manda.
                  */}
                  {motivoDelWorkspace === undefined ? null : (
                    <p className={estilos.nota} role="alert">
                      {motivoDelWorkspace}
                    </p>
                  )}
                  {/*
                    Y lo que NO hace, dicho antes de que lo descubra nadie: cambiarla no
                    mueve lo que ya está bajado. Callarlo dejaría a alguien buscando sus
                    proyectos en una carpeta vacía.
                  */}
                  <p className={estilos.nota}>
                    Cambiarla NO mueve lo que ya está bajado: las copias que tengas se quedan donde están y
                    siguen abriéndose desde ahí. Lo que cambia es dónde caerá lo siguiente que bajes.
                  </p>
                </>
              )}

              <h3 className={estilos.subencabezado}>Tareas</h3>
              <p className={estilos.nota}>
                Las tareas son los encargos que corren solos, sin nadie delante: la pestaña «Tareas» del
                proyecto abierto y el tablero del escritorio. El número de abajo decide cuántas corren a la
                vez en este Mac, no en un proyecto.
              </p>
              <label className={estilos.filaDeConcurrencia}>
                Tareas a la vez
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={tareas?.concurrencia ?? 2}
                  disabled={!conectado || alCambiarConcurrencia === undefined}
                  onChange={(e) => alCambiarConcurrencia?.(Math.max(0, Math.min(8, Math.trunc(Number(e.target.value)))))}
                />
                <span className={estilos.pistaEnLinea}>— las del mismo proyecto van siempre en serie</span>
              </label>
              {(tareas?.concurrencia ?? 2) === 0 ? (
                // Cero es una elección válida —es cómo se pausa la cola— pero callarlo
                // dejaría un kanban donde nada avanza y nadie sabe por qué.
                <p className={estilos.nota} role="alert">
                  Con 0 la cola queda PAUSADA: nada nuevo arranca.
                </p>
              ) : null}
            </>
          ) : null}

          {seccion === "modelos" ? (
            <>
              {/*
                EL MODELO POR DEFECTO, arriba y antes que las credenciales. Es la primera
                pregunta de esta pantalla —con qué va a trabajar el agente— y hasta ahora no
                tenía respuesta aquí: el `actual` del compositor es el de la SESIÓN abierta,
                así que sin proyecto abierto no había nada que elegir, y con él la elección
                se quedaba en la bandera de esa sesión (moría con el proceso). El defecto sí
                se escribe, y se escribe aquí.

                El control es la MISMA pastilla del compositor —`enLinea`, sin flotar— y no
                una segunda lista: la regla de qué proveedores se ofrecen (los COMPROBADOS),
                el catálogo bajo demanda y el punto de la credencial son los mismos, y una
                copia es el sitio donde divergen. Lo único distinto es de qué pregunta
                habla, y eso lo dice su `titulo`.
              */}
              <h2 className={estilos.encabezado}>Modelo por defecto</h2>
              <p className={estilos.nota}>
                El que usarán las sesiones nuevas. Se guarda para los tres papeles —rápido,
                trabajo y afilado— en el config global de tu cuenta, no en el proyecto, y
                cada sesión puede cambiarlo en caliente sin tocar esto.
              </p>
              {alElegirModelo === undefined || alPedirCatalogo === undefined ? (
                // Los dos hacen falta: sin el catálogo no hay lista de modelos que ofrecer, y
                // sin el envío no hay forma de fijar nada. Se dice en vez de pintar un control
                // que se queda en «sin consultar» para siempre — el botón muerto de siempre.
                <p className={estilos.vacio}>Esta ejecución no puede fijar el modelo por defecto.</p>
              ) : (
                <div className={estilos.elegirModelo}>
                  <PastillaDeModelo
                    {...(modeloPorDefecto === undefined ? {} : { actual: modeloPorDefecto })}
                    proveedores={proveedores}
                    alPedirCatalogo={alPedirCatalogo}
                    alElegir={alElegirModelo}
                    titulo="Modelo por defecto"
                    enLinea
                  />
                </div>
              )}

              <h3 className={estilos.subencabezado}>Proveedores</h3>
              <p className={estilos.nota}>
                La clave se guarda con permisos 0600 en el fichero de credenciales de XOneCode,
                nunca en el navegador.
              </p>
              {proveedores.length === 0 ? (
                <p className={estilos.vacio}>Todavía no ha llegado el estado de modelos.</p>
              ) : anadiendo ? (
                /*
                  Añadir un proveedor es una TAREA: mientras dura, la sección enseña solo el
                  formulario. Igual que registrar un entorno, y por lo mismo — un formulario
                  al final de una lista de nueve tarjetas queda fuera de la vista justo
                  después de pulsar el botón que lo abre.
                */
                <form className={estilos.formulario} ref={traerALaVista} onSubmit={anadirProveedor}>
                  <label className={estilos.etiqueta} htmlFor="ajustes-proveedor-nombre">
                    Nombre
                  </label>
                  <Input
                    id="ajustes-proveedor-nombre"
                    className={estilos.campo}
                    value={nombreDeProveedor}
                    placeholder="Mi LM Studio"
                    onChange={(e) => setNombreDeProveedor(e.target.value)}
                  />
                  <label className={estilos.etiqueta} htmlFor="ajustes-proveedor-url">
                    URL base compatible con OpenAI
                  </label>
                  <Input
                    id="ajustes-proveedor-url"
                    className={estilos.campo}
                    value={urlDeProveedor}
                    placeholder="http://localhost:1234/v1"
                    onChange={(e) => setUrlDeProveedor(e.target.value)}
                  />
                  <p className={estilos.nota}>
                    Se le pedirá <code>{"<URL base>/models"}</code> para listar sus modelos. La clave se
                    añade después, en su fila: así viaja por el único mensaje que lleva credenciales.
                    Debe ser https, salvo en 127.0.0.1 o localhost.
                  </p>
                  {avisoDeProveedor !== undefined ? (
                    <p className={estilos.aviso} role="alert">
                      {avisoDeProveedor}
                    </p>
                  ) : null}
                  <div className={estilos.botones}>
                    <Button
                      variant="outline"
                      className={estilos.accion}
                      onClick={() => {
                        setAnadiendo(false);
                        setNombreDeProveedor("");
                        setUrlDeProveedor("");
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" variant="primary" className={estilos.accion}>
                      Añadir
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <ul className={estilos.filas}>{deSerie.map(filaDeProveedor)}</ul>

                  <h3 className={estilos.subencabezado}>Personalizados</h3>
                  <p className={estilos.nota}>
                    Cualquier servidor que hable la API de OpenAI: LM Studio, llama.cpp, vLLM o un
                    endpoint de tu empresa. La URL y el nombre se guardan en el config global de tu
                    cuenta, nunca en el del proyecto.
                  </p>
                  {alAltaDeProveedor === undefined ? (
                    <p className={estilos.vacio}>Esta ejecución no puede dar de alta proveedores.</p>
                  ) : (
                    <Button
                      variant="outline"
                      className={estilos.accion}
                      disabled={!conectado}
                      onClick={() => setAnadiendo(true)}
                    >
                      Añadir un proveedor
                    </Button>
                  )}
                  {propios.length === 0 ? (
                    <p className={estilos.vacio}>No hay ninguno todavía.</p>
                  ) : (
                    <ul className={estilos.filas}>{propios.map(filaDeProveedor)}</ul>
                  )}
                </>
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

                Mientras se registra, la sección enseña SOLO el formulario: ni el botón, ni
                la lista de entornos, ni las casillas de proyectos. Fue «el botón arriba y
                el formulario al final» y no bastaba —medido en pantalla: el campo de la URL
                quedaba detrás de dieciocho casillas de 54 px, o sea fuera de la vista justo
                después de pulsar el botón que lo abre—. Dar de alta algo es una tarea, no
                una fila más de la lista: mientras dura, lo demás estorba.
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
                {avisoDeRegistro === undefined ? null : (
                  <p className={estilos.aviso} role="alert">
                    {avisoDeRegistro}
                  </p>
                )}
                <div className={estilos.botones}>
                  <Button
                    variant="outline"
                    className={estilos.accion}
                    onClick={() => {
                      setRegistrando(false);
                      setEnviado(undefined);
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
              {registrando ? null : entornos.length === 0 ? (
                <p className={estilos.vacio}>No hay ninguno registrado todavía.</p>
              ) : (
                /*
                  UNA pestaña por entorno registrado, y dentro de cada una lo suyo: su URL y
                  sus proyectos. Fue una lista plana de entornos con UN bloque de casillas
                  debajo —las del activo—, y con dos entornos registrados eso es intrabajable
                  (dicho mirando la pantalla): los dieciocho proyectos de uno en una sola
                  columna, y los del otro sin ninguna puerta para llegar a ellos salvo cambiar
                  el entorno activo en la barra, que es mudarse y no mirar.

                  Pestañas SIEMPRE, también con un solo entorno: la etiqueta contesta «¿de
                  quién son estos proyectos?», que hoy se daba por supuesto.
                */
                <div className={estilos.pestanas} role="tablist" aria-label="Entornos registrados">
                  {entornos.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      role="tab"
                      className={estilos.pestana}
                      aria-selected={e.id === entornoEnPestana}
                      data-actual={e.id === entornoEnPestana ? "" : undefined}
                      onClick={() => setEntornoAbierto(e.id)}
                    >
                      {/* La marca del producto, cuando consta cuál es: el id del entorno lo
                          decide `identidadDeEntorno` a partir de la URL. Un on-premise lleva
                          la marca XOne sin glifo — es lo único que se sabe de él. */}
                      <IconoDeEntorno entorno={e.id} size={18} className={estilos.logo} />
                      {e.nombre}
                    </button>
                  ))}
                </div>
              )}
              {/*
                El panel de la pestaña: la URL de ESE entorno y qué proyectos suyos se
                enseñan en la barra. La casilla marcada es lo que se ve; sin ninguna elección
                hecha se marcan los que la barra está enseñando por omisión, para que la
                primera vez la ventana refleje la pantalla en vez de contradecirla.

                Los tres estados de la lista se dicen distintos, que es la regla de esta
                consola: lista, «no se pudo preguntar» (con el motivo, y sin casillas: no se
                sabe qué proyectos hay) y «todavía no ha llegado». Una lista vacía afirmaría
                un entorno sin proyectos.
              */}
              {!registrando && entornoEnPestana !== undefined ? (
                <div role="tabpanel" className={estilos.panelDePestana}>
                  {/*
                    El nombre, ARRIBA de la URL: es el rótulo de la pestaña en la que estás, y
                    quien lo lee viene a cambiar eso. Se edita aquí y solo aquí — el alta lo
                    sigue deduciendo de la URL, así que registrar un servidor no pregunta nada
                    más que su URL.

                    Los nombres de los DEMÁS se pasan para poder advertir de un repetido: se
                    permiten (dos servidores pueden llamarse igual), pero un aviso delante es
                    la diferencia entre una decisión y un descuido.
                  */}
                  {alRenombrarEntorno === undefined ? null : (
                    <NombreDelEntorno
                      key={entornoEnPestana}
                      entorno={entornos.find((e) => e.id === entornoEnPestana)!}
                      nombresDeOtros={entornos.filter((e) => e.id !== entornoEnPestana).map((e) => e.nombre)}
                      conectado={conectado}
                      alRenombrar={alRenombrarEntorno}
                    />
                  )}
                  {/* La URL y lo que se hace CON ella, en una fila: el botón de quitar suelto en
                      su propio renglón, lejos de lo que quita, se leía como de otra cosa. */}
                  <div className={estilos.filaDeUrl}>
                    <p className={estilos.url}>{entornos.find((e) => e.id === entornoEnPestana)?.url}</p>
                    {alQuitarEntorno === undefined ? null : (
                      <QuitarEntorno
                        key={entornoEnPestana}
                        entorno={entornos.find((e) => e.id === entornoEnPestana)!}
                        conectado={conectado}
                        alQuitar={alQuitarEntorno}
                      />
                    )}
                  </div>
                  <div className={estilos.cabeceraDeProyectos}>
                    <h3 className={estilos.subencabezado}>Proyectos en la barra</h3>
                    {alPedirProyectosDeEntorno === undefined ? null : (
                      <button
                        type="button"
                        className={estilos.recargar}
                        title="Vuelve a preguntar a CloudStudio por los proyectos propios y compartidos de este entorno"
                        disabled={!conectado || refrescandoProyectos[entornoEnPestana] === true}
                        onClick={() => {
                          setRefrescandoProyectos((previo) => ({ ...previo, [entornoEnPestana]: true }));
                          alPedirProyectosDeEntorno(entornoEnPestana);
                        }}
                      >
                        {refrescandoProyectos[entornoEnPestana] === true ? "Refrescando…" : "Refrescar"}
                      </button>
                    )}
                  </div>
                  {(() => {
                    const { proyectos: suyos, error } = listaDe(entornoEnPestana);
                    if (error !== undefined) {
                      return (
                        <p className={estilos.aviso} role="alert">
                          No se pudieron consultar sus proyectos: {error}
                        </p>
                      );
                    }
                    if (suyos === undefined) {
                      return <p className={estilos.nota}>Consultando sus proyectos…</p>;
                    }
                    if (suyos.length === 0) {
                      return <p className={estilos.vacio}>Este entorno no devolvió ningún proyecto.</p>;
                    }
                    const marcados = elegidosDe(entornoEnPestana);
                    /**
                     * **Dos grupos, que son los dos que existen**: los tuyos y los que te han
                     * compartido. Con dieciocho proyectos una sola columna era un rollo de
                     * dieciocho casillas donde encontrar uno es leerlas todas, y además
                     * mezclaba dos cosas que el usuario distingue de un vistazo.
                     *
                     * El TERCER grupo no es una tercera clase de proyecto —el dominio tiene
                     * dos—: es el hueco de cuando CloudStudio no dice de quién es. Medido en
                     * los entornos reales del usuario, cero de dieciocho, así que en la
                     * práctica no se pinta nunca. Existe porque meterlos en «Propios» sería
                     * afirmar una propiedad que nadie midió, y esa es la regla que ya aplican
                     * la barra y el Escritorio al no pintar etiqueta con el dato ausente.
                     *
                     * Agrupar es PRESENTACIÓN: las casillas siguen operando sobre la misma
                     * lista `marcados` y el mismo `p.id`, así que elegir no cambia de
                     * comportamiento por partir la lista en dos.
                     */
                    // Más reciente arriba, y los que no traen fecha al final — el mismo
                    // criterio que `ordenarPorUltimoTurno` en Barra.tsx, pero sobre el
                    // último ACCESO de un proyecto y no el último turno de una sesión: son
                    // dos campos y dos listas sin relación, así que se repite en vez de
                    // forzar un genérico entre dos ficheros que no se conocen.
                    const porUltimoAcceso = <T extends { ultimoAcceso?: string }>(lista: readonly T[]): T[] =>
                      [...lista].sort((a, b) => (b.ultimoAcceso ?? "").localeCompare(a.ultimoAcceso ?? ""));
                    const filtro = filtroDeProyectos[entornoEnPestana] ?? {};
                    // El buscador filtra POR NOMBRE dentro de su columna; la presencia de la
                    // columna (el `.filter` de más abajo) se decide con la lista ENTERA, no
                    // con lo filtrado — así una búsqueda sin resultados enseña «ninguno
                    // coincide» en vez de hacer desaparecer la columna entera.
                    const conFiltro = <T extends { nombre: string }>(
                      lista: readonly T[],
                      aguja: string | undefined
                    ): readonly T[] => {
                      const q = (aguja ?? "").trim().toLowerCase();
                      return q === "" ? lista : lista.filter((p) => p.nombre.toLowerCase().includes(q));
                    };
                    const grupos = [
                      { id: "propios" as const, titulo: "Propios", suyos: suyos.filter((p) => p.compartido === false), aguja: filtro.propios },
                      { id: "compartidos" as const, titulo: "Compartidos contigo", suyos: suyos.filter((p) => p.compartido === true), aguja: filtro.compartidos },
                      { id: "sinAtribuir" as const, titulo: "Sin decir de quién son", suyos: suyos.filter((p) => p.compartido === undefined), aguja: undefined as string | undefined },
                    ]
                      .map((g) => ({ ...g, suyos: porUltimoAcceso(g.suyos) }))
                      .filter((g) => g.suyos.length > 0)
                      .map((g) => ({ ...g, filtrados: conFiltro(g.suyos, g.aguja) }));
                    const casilla = (p: { id: string; nombre: string; ultimoAcceso?: string }) => {
                      const fecha = p.ultimoAcceso === undefined ? undefined : selloDeFecha(p.ultimoAcceso);
                      return (
                      <li key={p.id} className={estilos.fila}>
                        <label className={estilos.casilla}>
                          <input
                            type="checkbox"
                            checked={marcados.includes(p.id)}
                            onChange={(e) => {
                              const siguiente = e.target.checked
                                ? [...marcados, p.id]
                                : marcados.filter((id) => id !== p.id);
                              setElegidosPorEntorno((previo) => ({
                                ...previo,
                                [entornoEnPestana]: siguiente,
                              }));
                              alElegirProyectos(entornoEnPestana, siguiente);
                            }}
                          />
                          <span className={estilos.textoDeProyecto}>
                            <span className={estilos.nombre}>{p.nombre}</span>
                            {fecha === undefined ? null : (
                              <span className={estilos.fechaDeProyecto}>{fecha}</span>
                            )}
                          </span>
                        </label>
                      </li>
                      );
                    };
                    return (
                      <>
                        <p className={estilos.nota}>
                          Sin elegir ninguno se enseñan los {PROYECTOS_POR_OMISION} primeros. Lo que
                          marques aquí manda sobre ese tope.
                        </p>
                        <div className={estilos.columnasDeProyectos}>
                          {grupos.map((g) => (
                            <section key={g.id} className={estilos.columnaDeProyectos}>
                              {/* La cuenta va en el encabezado porque con listas largas es
                                  la mitad de la pregunta: cuántos tengo de cada. Con el
                                  buscador puesto, cuenta lo FILTRADO — un «3» tras buscar que
                                  siguiera diciendo el total de la columna confundiría. */}
                              <h4 className={estilos.encabezadoDeColumna}>
                                {g.titulo} <span className={estilos.cuenta}>{g.filtrados.length}</span>
                              </h4>
                              {g.id === "sinAtribuir" ? null : (
                                <span className={estilos.buscadorDeProyectos}>
                                  <IconSearchOutline16 className={estilos.lupa} size={14} />
                                  <input
                                    type="search"
                                    className={estilos.filtroDeProyectos}
                                    value={g.aguja ?? ""}
                                    onChange={(e) => {
                                      const valor = e.target.value;
                                      setFiltroDeProyectos((previo) => ({
                                        ...previo,
                                        [entornoEnPestana]: {
                                          ...previo[entornoEnPestana],
                                          ...(g.id === "propios" ? { propios: valor } : { compartidos: valor }),
                                        },
                                      }));
                                    }}
                                    placeholder="filtrar por nombre…"
                                    aria-label={`filtrar ${g.titulo.toLowerCase()}`}
                                  />
                                </span>
                              )}
                              {g.filtrados.length === 0 ? (
                                <p className={estilos.vacio}>Ninguno coincide con «{g.aguja}».</p>
                              ) : (
                                <ul className={estilos.filas}>{g.filtrados.map(casilla)}</ul>
                              )}
                            </section>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : null}

            </>
          ) : null}

          {seccion === "agentes" ? (
            <>
              <h2 className={estilos.encabezado}>Subagentes</h2>
              <Agentes
                {...(agentes === undefined ? {} : { agentes: agentes.lista, problemas: agentes.problemas })}
                hayProyecto={hayProyecto}
                // El modelo de un subagente se elige de lo mismo que el del compositor —los
                // proveedores comprobados— o de lo que diga su motor externo.
                {...(proveedores === undefined ? {} : { proveedores })}
                {...(modelosDeMotor === undefined ? {} : { modelosDeMotor })}
                {...(alPedirModelosDeMotor === undefined ? {} : { alPedirModelosDeMotor })}
                {...(alPedirCatalogo === undefined ? {} : { alPedirCatalogo })}
                // Y las skills que HAY, para marcarlas con casillas en vez de teclear sus
                // nombres de memoria. Ausente mientras no llegue el mensaje: el editor se cae
                // al campo de texto, que no miente sobre lo que el `.md` declara.
                {...(skills === undefined ? {} : { catalogoDeSkills: skills.lista })}
                alGuardar={alGuardarAgente}
                alBorrar={alBorrarAgente}
                alRestaurar={alRestaurarAgente}
              />
            </>
          ) : null}

          {seccion === "skills" ? (
            <>
              <h2 className={estilos.encabezado}>Skills</h2>
              <Skills
                {...(skills === undefined ? {} : { skills: skills.lista, problemas: skills.problemas })}
                {...(cuerposDeSkill === undefined ? {} : { cuerpos: cuerposDeSkill })}
                hayProyecto={hayProyecto}
                alPedirCuerpo={alPedirCuerpoDeSkill}
                alGuardar={alGuardarSkill}
                alBorrar={alBorrarSkill}
                {...(alInstalarSkill === undefined ? {} : { alInstalar: alInstalarSkill })}
              />
            </>
          ) : null}

          {/* La comprobación de `conectores !== undefined` se repite aquí, y no solo en el
              filtro de la navegación: nada resetea `seccion` cuando el cable se cae —
              `marcarDesconectado` tira `conectores`, no `seccion`—, así que quien tenía
              esta pestaña abierta y pierde la conexión se queda con `seccion === "conectores"`
              y sin dato. Sin este `null`, el panel intentaría pintar `<Conectores>` con
              `catalogo`/`conectores` de un objeto que ya no existe. Con él, el panel queda en
              blanco (ningún botón de la navegación se marca como actual, porque el filtro ya
              lo retiró de la lista) hasta que vuelva el cable con la ráfaga entera. */}
          {seccion === "conectores" && conectores !== undefined ? (
            <>
              <h2 className={estilos.encabezado}>Conectores</h2>
              <Conectores
                catalogo={conectores.catalogo}
                conectores={conectores.conectores}
                desconocidos={conectores.desconocidos}
                {...(conectores.ilegible === undefined ? {} : { ilegible: conectores.ilegible })}
                {...(conectores.error === undefined ? {} : { error: conectores.error })}
                {...(secreto === undefined ? {} : { secreto })}
                alAccion={alAccionDeConector}
                alCrear={alCrearDeConector}
                alResponderSecreto={alResponderSecreto}
              />
            </>
          ) : null}
        </div>
        <button type="button" className={estilos.cerrar} aria-label="Cerrar ajustes" onClick={alIntentarCerrar}>
          ✕
        </button>
      </div>
      </div>
    </Modal>
    {pendienteDeConfirmar === undefined ? null : (
      <ConfirmarCambiosSinGuardar
        onCancelar={() => setPendienteDeConfirmar(undefined)}
        onConfirmar={() => {
          setDispositivosTecleados(undefined);
          pendienteDeConfirmar();
          setPendienteDeConfirmar(undefined);
        }}
      />
    )}
    </>
  );
}

/**
 * El aviso de cambios sin guardar en Dispositivos, al cambiar de sección o al cerrar
 * Ajustes con el borrador sucio. Mismo esqueleto que `ConfirmarDescarte`
 * (`AccionesDeTarea.tsx`) — `Modal` + las clases de `NuevaSesion.module.css`
 * (`capa`/`velo`/`ventana`/`titulo`/`nota`/`acciones`/`accion`) que ya reutiliza
 * `AccionDeSesion.tsx` para lo mismo: dos copias del mismo velo es cómo se acaba con dos
 * velos distintos.
 *
 * **«Cancelar» no toca nada**: cierra SOLO este aviso, Ajustes se queda abierto en
 * Dispositivos y el borrador sigue ahí. **La acción destructiva** descarta el borrador y
 * ejecuta lo que estaba pendiente (cambiar de sección o cerrar) — en ese orden, para que
 * `dispositivosCambiados` ya sea falso cuando el efecto pendiente se dispara.
 */
function ConfirmarCambiosSinGuardar({ onCancelar, onConfirmar }: { onCancelar: () => void; onConfirmar: () => void }) {
  return (
    <Modal open onClose={onCancelar} title="Cambios sin guardar" headless className={modalDeAviso.capa}>
      <div
        className={modalDeAviso.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) onCancelar();
        }}
      >
        <div className={modalDeAviso.ventana}>
          <h2 className={modalDeAviso.titulo}>Cambios sin guardar</h2>
          <p className={modalDeAviso.nota}>Hay cambios sin guardar en Dispositivos. Si continúas, se pierden.</p>
          <div className={modalDeAviso.acciones}>
            <Button variant="outline" className={modalDeAviso.accion} onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className={`${modalDeAviso.accion} ${modalDeAviso.principal} ${estilos.destructiva}`}
              onClick={onConfirmar}
            >
              Descartar y continuar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}


/**
 * El nombre de un entorno, editable. Vive en la PESTAÑA de su entorno y no en el alta: dar de
 * alta un servidor sigue siendo pedir una URL y nada más, y esto es lo que se arregla después.
 *
 * Tres cosas que no son de forma:
 *
 * - **El vacío se rechaza con la CONSECUENCIA delante** («desaparece de la lista al volver a
 *   arrancar»), no con un «obligatorio»: `validarEntorno` descarta un entorno sin nombre al
 *   leerlo, así que guardarlo no lo dejaría a medias — lo borraría. La frase es la misma que
 *   la del servidor, que es quien manda.
 * - **Dos iguales se permiten y se advierten**: quien los distingue es la URL, y puede haber
 *   dos servidores que se llamen igual. El aviso no bloquea el botón.
 * - **Lo tecleado NO se suelta al guardar** (a diferencia del workspace): si el servidor se
 *   niega, el campo tiene que seguir ahí para poder corregirlo. Se suelta al guardar BIEN.
 */
function NombreDelEntorno({
  entorno,
  nombresDeOtros,
  conectado,
  alRenombrar,
}: {
  entorno: { id: string; nombre: string };
  nombresDeOtros: readonly string[];
  conectado: boolean;
  alRenombrar: (entorno: string, nombre: string) => Promise<string | undefined>;
}) {
  // Ausente = «no lo he tocado», y entonces se pinta lo que dice el servidor. La pestaña
  // lleva `key`, así que cambiar de entorno desmonta esto y lo tecleado no se arrastra.
  const [tecleado, setTecleado] = useState<string | undefined>(undefined);
  const [guardando, setGuardando] = useState(false);
  const [motivo, setMotivo] = useState<string | undefined>(undefined);
  const enElCampo = tecleado ?? entorno.nombre;
  const limpio = enElCampo.trim();
  const inaceptable = motivoDeNombreDeEntornoInaceptable(enElCampo);
  const cambiado = tecleado !== undefined && limpio !== entorno.nombre;
  const repetido = limpio !== "" && limpio !== entorno.nombre && nombresDeOtros.includes(limpio);
  return (
    <>
      <label className={estilos.filaDeNombre}>
        <span className={estilos.etiquetaDeNombre}>Nombre</span>
        <input
          type="text"
          value={enElCampo}
          spellCheck={false}
          autoComplete="off"
          aria-label="Nombre del entorno"
          aria-invalid={inaceptable === undefined ? undefined : true}
          disabled={!conectado || guardando}
          onChange={(e) => {
            setTecleado(e.target.value);
            setMotivo(undefined);
          }}
          // Enter guarda, como en cualquier formulario de una línea. Va en el campo y no en
          // un `<form>` porque esto no es uno: no hay envío por defecto que pueda mandar de
          // más, y el botón es el que manda.
          onKeyDown={(e) => {
            if (e.key !== "Enter" || guardando || !cambiado || inaceptable !== undefined) return;
            void escribir();
          }}
        />
      </label>
      <div className={estilos.accionesDeNombre}>
        <button
          type="button"
          className={estilos.accion}
          disabled={!conectado || guardando || !cambiado || inaceptable !== undefined}
          onClick={() => void escribir()}
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {inaceptable === undefined ? null : (
        <p className={estilos.nota} role="alert">
          {inaceptable}
        </p>
      )}
      {repetido ? (
        <p className={estilos.nota}>
          Ya hay otro entorno que se llama así: en la barra del proyecto los dos saldrán igual. Se
          distingue por su URL, así que se permite — pero no habrá forma de saber cuál es cuál.
        </p>
      ) : null}
      {motivo === undefined ? null : (
        <p className={estilos.nota} role="alert">
          No se ha cambiado: {motivo}
        </p>
      )}
    </>
  );

  async function escribir() {
    setGuardando(true);
    const negativa = await alRenombrar(entorno.id, limpio);
    setGuardando(false);
    setMotivo(negativa);
    // Solo con el sí: a partir de ahí manda lo que acabó en disco, que es lo que reemite el
    // servidor. Con un no, lo tecleado se queda para poder corregirlo.
    if (negativa === undefined) setTecleado(undefined);
  }
}

/**
 * Quitar un entorno, en DOS pasos y en línea: el botón pide confirmación y dice lo que NO se
 * borra (las copias bajadas se quedan en el disco, igual que cambiar el workspace no mueve
 * nada). Si el servidor se niega, el MOTIVO sale aquí mismo, al lado del botón que lo pidió.
 * Con `key` por entorno, el estado de la confirmación no sobrevive a cambiar de pestaña.
 */
function QuitarEntorno({
  entorno,
  conectado,
  alQuitar,
}: {
  entorno: { id: string; nombre: string; copias?: number };
  conectado: boolean;
  alQuitar: (entorno: string, modo: { borrarCopias: boolean }) => Promise<string | undefined>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [motivo, setMotivo] = useState<string | undefined>(undefined);
  // DESMARCADA siempre al abrir: borrar las copias es lo que no tiene vuelta atrás, y tiene
  // que ser una decisión, no lo que ya estaba puesto.
  const [borrarCopias, setBorrarCopias] = useState(false);
  // El NOMBRE escrito: dos clics rápidos en el mismo sitio no pueden quitar un entorno.
  const [escrito, setEscrito] = useState("");
  const confirmado = escrito.trim() === entorno.nombre;
  const copias = entorno.copias ?? 0;
  if (!confirmando) {
    return (
      <>
        <button
          type="button"
          className={estilos.quitar}
          disabled={!conectado}
          onClick={() => {
            setMotivo(undefined);
            setBorrarCopias(false);
            setEscrito("");
            setConfirmando(true);
          }}
        >
          Quitar entorno
        </button>
        {motivo === undefined ? null : (
          <p role="alert" className={`${estilos.aviso} ${estilos.anchoEntero}`}>
            No se ha quitado: {motivo}
          </p>
        )}
      </>
    );
  }
  return (
    // `alertdialog`: es una pregunta de SEGURIDAD —quita credenciales— y no una nota más.
    <div className={estilos.confirmarQuitar} role="alertdialog" aria-label={`Quitar ${entorno.nombre}`}>
      <p className={estilos.tituloDeAviso}>
        <span aria-hidden="true">⚠</span> Atención: vas a quitar <strong>{entorno.nombre}</strong>
      </p>
      <p className={estilos.textoDeAviso}>
        Se borra de la lista y se <strong>cierra su sesión de CloudStudio</strong>: para volver a
        usarlo tendrás que registrarlo y entrar otra vez.{" "}
        {borrarCopias
          ? "Y se BORRAN sus copias locales: el trabajo que no hayas subido se pierde para siempre."
          : "Las copias ya bajadas se quedan en el disco."}
      </p>
      {copias === 0 ? null : (
        <label className={estilos.casillaDeAviso}>
          <input type="checkbox" checked={borrarCopias} onChange={(e) => setBorrarCopias(e.target.checked)} />
          Borrar también las copias locales de este entorno ({copias} {copias === 1 ? "proyecto" : "proyectos"})
        </label>
      )}
      <label className={estilos.escribirNombre}>
        Escribe <strong>{entorno.nombre}</strong> para confirmar
        <input
          type="text"
          value={escrito}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setEscrito(e.target.value)}
        />
      </label>
      <button
        type="button"
        className={estilos.quitarLleno}
        disabled={quitando || !confirmado}
        onClick={async () => {
          setQuitando(true);
          const negativa = await alQuitar(entorno.id, { borrarCopias });
          setQuitando(false);
          setConfirmando(false);
          setMotivo(negativa);
        }}
      >
        {quitando ? "Quitando…" : "Quitar"}
      </button>
      <button type="button" className={estilos.recargar} disabled={quitando} onClick={() => setConfirmando(false)}>
        Cancelar
      </button>
    </div>
  );
}
