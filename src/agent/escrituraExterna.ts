/**
 * Qué puede hacer un agente EXTERNO (Claude Code) dentro de la carpeta del proyecto.
 *
 * Este fichero existe porque conceder escritura a un agente externo no es levantar una
 * bandera: sus `Write`/`Edit` van **directos al disco con una ruta ABSOLUTA**, así que se
 * saltan por completo las cuatro capas que protegen al proyecto por el camino de LangGraph
 * —`permisosDe`, el `virtualMode` del backend, las vistas aplanadas y las guardas de
 * artefactos y descargas—. Sin volver a aplicarlas aquí, «el agente externo ya puede
 * escribir» significaría también «ya puede escribir `.env`, `.git` y cualquier sitio fuera
 * del proyecto», y eso no es una capacidad nueva: es el agujero más grande que este repo
 * puede tener.
 *
 * Tres piezas, y las tres son puras o con su dependencia inyectada, para que `npm test` las
 * pruebe sin lanzar un Claude Code:
 * 1. **Tres listas** de tools (`claseDeToolExterna`): lectura, escritura y denegadas. Tres y
 *    no dos, porque conceder escritura NO puede conceder `Bash` ni `WebFetch`.
 * 2. **El veredicto de una ruta** (`veredictoDeRuta`), que vuelve a aplicar las guardas del
 *    proyecto sobre la ruta absoluta del hijo — y las aplica DOS veces, sobre el texto y
 *    sobre el `realpath`, que es la misma regla que ya sostiene `arbolDeProyecto.ts`.
 * 3. **El adaptador de política** (`politicaDeAprobacionExterna`), que convierte el
 *    `pedirAprobacion` que ya existe en la política de escritura del hijo.
 */

import { realpathSync, readFileSync } from "node:fs";
import { dirname, basename, resolve, relative, sep } from "node:path";
import type { LineaDeDiff } from "../core/diff.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { ColaDeEventos } from "../core/entrelazar.js";
import type { ConsumoExterno, EscrituraExternaPedida, PoliticaDeEscrituraExterna } from "../core/ports.js";
import { artefactoFueraDeSitio } from "../core/artefactos.js";
import { descargaFueraDeSitio } from "../core/descargas.js";
import type { Decision } from "../vendor/hitl.js";
import { puedeLeerRuta } from "./perfiles.js";
import { esVistaAplanada } from "./proyecto.js";
import { cambioDe } from "./interrupts.js";

/**
 * Las tools del hijo que solo LEEN.
 *
 * Los nombres salen del SDK instalado y no de la memoria: se comprobaron contra
 * `sdk-tools.d.ts` de `@anthropic-ai/claude-agent-sdk`, cuya unión `ToolInputSchemas`
 * enumera hoy **cuarenta y cuatro** tools —`REPL`, `Workflow`, `Cron*`, `Artifact`,
 * `RemoteTrigger`, `Monitor`, `Mcp`, `EnterWorktree`…— y crece con cada versión del
 * producto. Esa cifra es el argumento entero de este fichero: con una lista negra, la tool
 * que Claude Code añada mañana entraría permitida.
 *
 * `TodoWrite` está dentro pese al nombre: es la lista de tareas del propio hijo, vive en su
 * memoria y no toca el disco del proyecto.
 */
export const TOOLS_EXTERNAS_DE_LECTURA: ReadonlySet<string> = new Set([
  "Read",
  "Glob",
  "Grep",
  "NotebookRead",
  "TodoWrite",
  /**
   * **`ToolSearch` está aquí porque `Glob` y `Grep` vienen DIFERIDAS, y sin ella el agente
   * trabaja a ciegas.** Medido espiando el hook en una ejecución real: el hijo intentó
   * `Bash ls`, luego `Bash find`, y después `ToolSearch {"query":"select:Glob,Grep"}` — o
   * sea que esas dos no las tiene cargadas y hay que pedírselas. Denegándola, el mensaje de
   * denegación le ofrecía literalmente «puedes buscar con Glob, Grep» unas tools que no
   * podía alcanzar, y acababa probando nombres de fichero uno a uno: SESENTA Y CINCO
   * lecturas de ficheros que no existían (`README.md`, `CLAUDE.md`, `app.ini`…) para
   * concluir que «el proyecto está prácticamente vacío para mí, porque no puedo listarlo».
   *
   * Y no abre nada: devuelve ESQUEMAS de tools, no ejecuta ninguna. Lo que consiga con ella
   * vuelve a pasar por este mismo hook, que es el punto por el que pasan todas — así que la
   * lista blanca sigue siendo la barrera, y ahora además es cierta.
   */
  "ToolSearch",
]);

/**
 * Las que escriben en el proyecto, y por tanto pasan por la política.
 *
 * **Solo `Write` y `Edit`**, y las dos por una razón que se puede comprobar: son las únicas
 * cuyos argumentos encajan en `cambioDe()`, o sea las únicas de las que se puede COMPONER
 * el diff que una persona tiene que ver antes de decidir. Medido en `sdk-tools.d.ts`:
 * `FileWriteInput` es `{file_path, content}` y `FileEditInput` es
 * `{file_path, old_string, new_string, replace_all?}`, que son exactamente las claves que
 * `write_file` y `edit_file` ya traen por el camino de LangGraph.
 *
 * Lo que se queda fuera y por qué, dicho aquí para que no parezca un olvido:
 * - **`NotebookEdit`** no lleva `file_path` sino `notebook_path`, y un proyecto XOne no
 *   tiene cuadernos de Jupyter. Conceder una escritura de la que no se sabe componer el
 *   diff sería aprobar a ciegas.
 * - **`MultiEdit`** ya no existe en este SDK (cero apariciones en su unión de tools), y el
 *   día que vuelva tampoco entra de rebote: es una LISTA de ediciones, así que una sola
 *   aprobación cubriría N cambios — o se expande a N decisiones o se deniega. Hoy, denegada.
 */
export const TOOLS_EXTERNAS_DE_ESCRITURA: ReadonlySet<string> = new Set(["Write", "Edit"]);

/**
 * Las que se deniegan SIEMPRE, con escritura concedida o sin ella.
 *
 * Aquí está la mitad del arreglo. Antes la decisión era
 * `permitirEscritura || esDeLectura(nombre)`, o sea que el día que se concediera la
 * escritura se concedía **todo**: `Bash` sola basta para escribir el proyecto entero
 * —saltándose de paso la política, el diff y las guardas de ruta de este fichero—, y
 * `WebFetch`/`WebSearch` no escriben pero sacan el contenido del proyecto fuera de la
 * máquina, que no lo decide un especialista.
 *
 * La lista es ILUSTRATIVA y no la barrera: la barrera es que lo que no esté en las dos
 * listas de arriba se deniega igual (`claseDeToolExterna` contesta «desconocida»). Existe
 * para que el motivo pueda decir POR QUÉ se deniega esta en concreto, que es lo que evita
 * que el hijo insista.
 */
export const TOOLS_EXTERNAS_DENEGADAS: ReadonlySet<string> = new Set([
  "Bash",
  "BashOutput",
  "KillShell",
  "WebFetch",
  "WebSearch",
  "NotebookEdit",
  "MultiEdit",
]);

export type ClaseDeToolExterna = "lectura" | "escritura" | "denegada" | "desconocida";

/**
 * En qué lista cae una tool. **Deniega por omisión**: lo que no se reconoce es
 * «desconocida», que no es un tercer estado benigno — se trata igual que «denegada».
 */
export function claseDeToolExterna(nombre: string): ClaseDeToolExterna {
  if (TOOLS_EXTERNAS_DE_LECTURA.has(nombre)) return "lectura";
  if (TOOLS_EXTERNAS_DE_ESCRITURA.has(nombre)) return "escritura";
  if (TOOLS_EXTERNAS_DENEGADAS.has(nombre)) return "denegada";
  return "desconocida";
}

/** Admitida trae la ruta VIRTUAL (`/app/Clientes.xne`); denegada trae el motivo. */
export type VeredictoDeRuta = { admitida: true; ruta: string } | { admitida: false; motivo: string };

/**
 * Las carpetas de la raíz que el hijo no puede tocar ni con escritura concedida, y que
 * `puedeLeerRuta` no cubre porque por el camino de LangGraph son raíces MONTADAS y no
 * carpetas del proyecto.
 *
 * Aquí sí son carpetas del proyecto —el hijo ve el disco, no un `CompositeBackend`—, así
 * que el daño es otro y el mismo: `permisosDe` deniega `write` sobre `/skills/**` y
 * `/adjuntos/**` incondicionalmente, y la interfaz presenta lo que hay ahí como
 * instrucciones del harness y como los documentos que anexó una persona. Que aquí apunten
 * a otro sitio no cambia lo que alguien leería al verlos cambiados.
 *
 * `escrituraExterna.test.ts` ATA esta lista con las filas de `write` de `DENEGADO_SIEMPRE`
 * en vez de confiarla: son dos formatos de la misma regla (globs para deepagents, prefijos
 * para aquí) y dos copias de una regla son dos copias que divergen.
 */
const CARPETAS_DENEGADAS = ["/skills", "/adjuntos"];

/**
 * La ruta virtual de una ruta absoluta del hijo, o `undefined` si no se puede afirmar que
 * cae dentro del proyecto.
 *
 * Una relativa se rechaza en vez de resolverse contra el `cwd`: el SDK documenta que
 * `file_path` es absoluta («must be absolute, not relative»), así que una relativa es algo
 * que no entendemos, y lo que no se entiende se deniega.
 */
export function rutaVirtualDeEscritura(cwd: string, filePath: string): string | undefined {
  const raiz = resolve(cwd);
  const destino = resolve(filePath);
  if (destino === raiz) return undefined;
  const dentro = relative(raiz, destino);
  // `relative` da algo que empieza por `..` cuando el destino se sale, y una ruta absoluta
  // cuando están en volúmenes distintos (Windows). Las dos cosas son «fuera».
  if (dentro === "" || dentro.startsWith("..") || resolve(dentro) === dentro) return undefined;
  return `/${dentro.split(sep).join("/")}`;
}

/**
 * ¿Puede el hijo escribir en esta ruta? **Las guardas del proyecto, reaplicadas.**
 *
 * Y se aplican DOS veces, que es la lección de `arbolDeProyecto.ts` medida en su día: sobre
 * el TEXTO —de balde, antes de tocar el disco— y sobre el camino REAL. Sin la segunda no
 * era verdad: en un sistema que no distingue mayúsculas (APFS, NTFS) `.ENV` no es `/.env`
 * para `puedeLeerRuta` pero abre `.env`, y un enlace simbólico dentro de la raíz que apunte
 * a un fichero denegado o a fuera del proyecto pasa la comprobación de «sigue dentro»
 * porque su texto sí lo está. Lo que falla no es el sitio, es el destino.
 *
 * Del fichero que se va a escribir se canonicaliza el PADRE y no él: una escritura normal
 * crea un fichero que todavía no existe, así que su `realpath` lanzaría y esto denegaría
 * toda creación de ficheros nuevos.
 *
 * `real` entra por parámetro como el `leer` de `cambioDe`: en producción es `realpathSync`,
 * y un test puede darle un doble. Que lance —el padre no existe— no es admitir: es denegar,
 * porque entonces no se sabe dónde cae.
 */
export function veredictoDeRuta(opciones: {
  cwd: string;
  ruta: unknown;
  /** Las del proyecto, para reconocer una vista aplanada (`X.xml` con un `X.xne` al lado). */
  ficheros: ReadonlySet<string>;
  real?: (ruta: string) => string;
  /**
   * `true` para una LECTURA: se comprueba el confinamiento y lo que no se puede ni leer,
   * pero no las reglas que solo gobiernan escrituras (un artefacto mal puesto de antes hay
   * que poder leerlo para moverlo, y `/skills/` y `/adjuntos/` existen para leerse).
   */
  soloConfinamiento?: boolean;
}): VeredictoDeRuta {
  const { cwd, ruta, ficheros } = opciones;
  const soloLeer = opciones.soloConfinamiento === true;
  const real = opciones.real ?? realpathSync;
  if (typeof ruta !== "string" || ruta === "") {
    return { admitida: false, motivo: "no dijiste qué fichero, y sin ruta no hay nada que autorizar" };
  }

  /**
   * **Quién decide «dentro o fuera» es UNA pasada, y es la de los caminos REALES.** La del
   * texto no puede decidirlo, y eso salió de la primera ejecución VIVA de este camino
   * (11-09-2026): el proyecto estaba en `/tmp/xc-vivo` y el hijo pidió
   * `/private/tmp/xc-vivo/hola.txt` —canonicaliza él, y en macOS `/tmp` es un enlace a
   * `/private/tmp`—, así que los dos textos no casaban y esto lo rechazaba como «fuera del
   * proyecto»; el hijo solo se salvó reintentando con la ruta sin canonicalizar. Con
   * cualquier componente enlazado en el camino del proyecto —ese `/tmp`, un home detrás de
   * un enlace— escribir habría sido imposible y sin ningún motivo que lo explicara.
   *
   * Del destino se canonicaliza ÉL si existe —eso resuelve el enlace al propio fichero, que
   * es como se llega a `.env` con un nombre inocente— y su PADRE si no, porque una escritura
   * normal crea ficheros que todavía no están y canonicalizar solo él habría denegado toda
   * creación. Que no se pueda preguntar no es admitir: es denegar, porque entonces no se
   * sabe dónde cae.
   *
   * `real` entra por parámetro como el `leer` de `cambioDe`: en producción `realpathSync`, y
   * un test puede darle un doble.
   */
  let destino: string;
  let raizReal: string;
  try {
    destino = canonicalizarLoQueExista(resolve(ruta), real);
    raizReal = real(resolve(cwd));
  } catch {
    return {
      admitida: false,
      motivo: "no se pudo comprobar dónde cae esa ruta de verdad (¿falta la carpeta?), así que no se autoriza",
    };
  }

  /**
   * **La RAÍZ del proyecto es un destino válido para LEER, y rechazarla dejaba al agente
   * ciego.** `rutaVirtualDeEscritura` la descarta a propósito —no es un fichero que
   * escribir—, y eso es correcto para una escritura y falso para un listado: `Glob` y `Grep`
   * apuntan a la carpeta del proyecto, que es exactamente la raíz.
   *
   * Medido en vivo antes de esto, y lo dijo el propio hijo: «el proyecto está prácticamente
   * vacío para mí, porque no puedo listarlo» — y a cambio hizo SESENTA Y CINCO lecturas a
   * ciegas probando nombres de fichero (`README.md`, `CLAUDE.md`, `app.ini`…), ninguno de los
   * cuales existía. Una guarda que no deja mirar no protege: empuja a adivinar.
   */
  if (soloLeer && destino === raizReal) return { admitida: true, ruta: "/" };

  const virtual = rutaVirtualDeEscritura(raizReal, destino);
  if (virtual === undefined) {
    return {
      admitida: false,
      // El texto no nombra la operación, y eso lo señaló el propio hijo en la tercera
      // ejecución viva: decía «solo puedes escribir dentro del proyecto» al denegar una
      // LECTURA. De este mensaje sale lo que el modelo intenta a continuación, así que
      // decirle mal qué se le deniega es empujarlo al camino equivocado.
      motivo:
        "esa ruta cae fuera de la carpeta del proyecto (o no es absoluta), y xonecode acota este agente al proyecto",
    };
  }

  /**
   * Y las reglas se aplican DOS veces: sobre el texto que nombró el hijo y sobre el camino
   * real. Con una sola no era verdad, y estaba medido en su día por `arbolDeProyecto.ts`: en
   * un sistema que no distingue mayúsculas (APFS, NTFS) `.ENV` no es `/.env` para
   * `puedeLeerRuta` pero abre `.env`, y un enlace dentro de la raíz que apunte a un fichero
   * denegado pasa la comprobación de texto porque su nombre sí está dentro. Lo que falla no
   * es el sitio, es el destino — y al revés también: un `.env` nombrado tal cual se rechaza
   * aunque su `realpath` cayera en otra parte.
   */
  const porTexto = rutaVirtualDeEscritura(cwd, ruta);
  if (porTexto !== undefined) {
    const motivo = motivoDeRutaVirtual(porTexto, ficheros, soloLeer);
    if (motivo !== undefined) return { admitida: false, motivo };
  }
  const porReal = motivoDeRutaVirtual(virtual, ficheros, soloLeer);
  if (porReal !== undefined) return { admitida: false, motivo: porReal };

  // Se devuelve la del camino REAL: es la única que está definida siempre —con la raíz
  // nombrada por un enlace, la del texto no sale— y va desde la raíz del proyecto, así que
  // no lleva nada de la máquina dentro.
  return { admitida: true, ruta: virtual };
}

/**
 * El camino real de algo que puede no existir todavía: se canonicaliza el trozo que SÍ
 * existe y se le vuelven a pegar los segmentos que faltan.
 *
 * Canonicalizar solo el padre no basta, y no es un caso raro: `Write` crea las carpetas que
 * falten, así que una escritura en una subcarpeta nueva —`/app/nueva/x.js`— tiene un padre
 * que tampoco está. Con solo el padre eso contestaba «no se pudo comprobar dónde cae» en vez
 * del motivo de verdad (medido: un `/artifacts/login.html` en un proyecto sin esa carpeta
 * perdía su mensaje, que es el que le dice al hijo dónde iba).
 *
 * Se sube hasta el primer ancestro que existe y se para: así se resuelve cualquier enlace
 * del tramo real —que es de donde viene el peligro— y el tramo que todavía no existe no
 * puede esconder ninguno, porque no hay nada que enlazar. Si no existe ni la raíz del
 * sistema, `real` lanza y quien llama deniega.
 */
function canonicalizarLoQueExista(absoluta: string, real: (r: string) => string): string {
  const pendientes: string[] = [];
  let actual = absoluta;
  for (;;) {
    try {
      return resolve(real(actual), ...pendientes);
    } catch {
      const padre = dirname(actual);
      // `dirname("/") === "/"`: sin esta salida el bucle no termina nunca.
      if (padre === actual) throw new Error(`no existe ningún ancestro de ${absoluta}`);
      pendientes.unshift(basename(actual));
      actual = padre;
    }
  }
}

/** Las reglas sobre una ruta VIRTUAL ya normalizada. Las mismas del camino de LangGraph. */
function motivoDeRutaVirtual(
  ruta: string,
  ficheros: ReadonlySet<string>,
  soloLeer = false
): string | undefined {
  if (!puedeLeerRuta(ruta)) {
    return `${ruta} está denegado siempre: ahí viven las credenciales, el historial de git y la carpeta interna de xonecode`;
  }
  if (esVistaAplanada(ruta, ficheros)) {
    // También al LEER, y no es de más: el backend se las retira al agente entero, porque un
    // agente que ve la vista aplanada edita el fichero equivocado.
    return `${ruta} lo genera XOne Studio desde su .xne y no se toca: mira el .xne`;
  }
  if (soloLeer) return undefined;
  for (const carpeta of CARPETAS_DENEGADAS) {
    if (ruta === carpeta || ruta.startsWith(`${carpeta}/`)) {
      return `${carpeta}/ es de solo lectura: son instrucciones y material de entrada, no ficheros que reescribir`;
    }
  }
  const artefacto = artefactoFueraDeSitio(ruta);
  if (artefacto !== undefined) {
    return `los artefactos no van dentro del proyecto. Eso iba en ${artefacto}, no en ${ruta}`;
  }
  const descarga = descargaFueraDeSitio(ruta);
  if (descarga !== undefined) {
    return `${ruta} es una carpeta interna del harness, no del proyecto`;
  }
  return undefined;
}

/**
 * La decisión del hook `PreToolUse`, que es la que NO se puede ensombrecer.
 *
 * **Esto no es un cinturón de más: es el único sitio donde la denegación es cierta**, y sale
 * de leer el SDK instalado en vez de suponerlo. Tres frases suyas, textuales:
 * - «Allow rules from settings files can also shadow the callback» — o sea que `canUseTool`
 *   puede no invocarse nunca.
 * - «Denials that resolve before canUseTool runs — PreToolUse hook denies, and deny-rule
 *   overrides of hook allow/ask decisions — are not covered here» — o sea que un deny del
 *   hook resuelve ANTES y gana.
 * - «With a permission prompt surface (stdio/SDK canUseTool), the 'ask' path surfaces via a
 *   can_use_tool control_request» — o sea que `ask` es cómo se llega a nuestro callback.
 *
 * Y de ahí sale el reparto: el hook contesta las TRES clases explícitamente —`allow` para
 * leer, `deny` para todo lo que no está en las listas, y `ask` para escribir, que es lo que
 * empuja la decisión hacia `canUseTool`, donde sí se puede esperar a una persona— y no deja
 * ninguna sin decidir. Dejar una sin decidir sería dejar que la decida el `permissionMode`,
 * cuyas semánticas exactas NO están medidas: `dontAsk` («deny if not pre-approved») podría
 * denegar la escritura antes del callback y dejar la función muerta con todo en verde, y
 * `default` («prompts for dangerous operations») podría aprobar `WebSearch` por su cuenta
 * sin consultarnos — que es el fallo en la dirección mala.
 */
export function decisionDePreToolUse(opciones: {
  nombre: string;
  entrada: Record<string, unknown>;
  cwd: string;
  ficheros: ReadonlySet<string>;
  real?: (ruta: string) => string;
}): {
  hookEventName: "PreToolUse";
  permissionDecision: "allow" | "deny" | "ask";
  permissionDecisionReason: string;
} {
  const clase = claseDeToolExterna(opciones.nombre);
  if (clase === "lectura") {
    /**
     * **La guarda de ruta de una lectura se resuelve AQUÍ, y eso salió de medirlo dos
     * veces.** Primero el hook contestaba `allow` a secas y la ruta la miraba `canUseTool`:
     * medido en vivo, el hijo leyó `.env`, `.xonecode/config.json`, la vista aplanada y
     * `/etc/hosts` —cinco de cinco, «ninguna fue interceptada»—, porque un `allow` del hook
     * es una PRE-APROBACIÓN y el callback ya no se consulta. O sea el mismo mecanismo de
     * ensombrecimiento que el SDK documenta, construido por nosotros.
     *
     * Así que el hook decide la lectura entera: `allow` solo con la ruta comprobada, y
     * `deny` con el motivo. `canUseTool` mantiene la MISMA comprobación como segunda llave
     * para el día que el hook no corra.
     */
    const v = veredictoDeLectura(opciones);
    return v.admitida
      ? {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: "xonecode permite leer y buscar dentro del proyecto",
        }
      : { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: v.motivo };
  }
  if (clase === "escritura") {
    // `ask` y no `allow`: quien decide una escritura es la política de la sesión, y a ella
    // se llega por `canUseTool`. Un `allow` aquí se saltaría el diff, la política y las
    // guardas de ruta de un salto — que es exactamente lo que le pasó a la lectura.
    return {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "cada escritura de xonecode pasa por una autorización",
    };
  }
  return {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: motivoDeToolDenegada(opciones.nombre, clase),
  };
}

/**
 * **Las tools de LECTURA también llevan guarda de ruta, y esto salió de correrlo.**
 *
 * Medido en la segunda ejecución viva (11-09-2026), dicho por el propio hijo: «`.env` — sí
 * pude leerlo: contiene una línea `CLAVE=secreta`». La lista blanca permitía `Read` a secas,
 * sin mirar la ruta — y era así desde el primer día, o sea que el agujero no lo abrió la
 * escritura: ya estaba. Por el camino de LangGraph esto no pasa porque `DENEGADO_SIEMPRE`
 * deniega `read` sobre `/.env`, `/.git` y `/.xonecode`; ahí dentro además vive el
 * `checkpoint.sqlite`, que lleva la lista de mensajes ENTERA de cada conversación.
 *
 * Qué se deniega leer, y por qué no es la misma lista que para escribir:
 * - `/.env`, `/.git`, `/.xonecode`: las de `DENEGADO_SIEMPRE` para `read`, por lo mismo.
 * - Las **vistas aplanadas**: el backend se las RETIRA al agente entero
 *   (`sinVistasAplanadas`), no solo para escribir — si las ve, edita el fichero equivocado.
 * - Y lo que caiga **fuera de la carpeta del proyecto**, que es la mitad que nadie había
 *   comprobado: el `file_path` de `Read` es absoluto y puede nombrar cualquier cosa.
 * - `/skills/`, `/adjuntos/` y `/artefactos/` NO se deniegan: leerlos es su razón de ser.
 *
 * `Glob` y `Grep` llevan `path` OPCIONAL (medido en `sdk-tools.d.ts`), y ausente significa
 * la raíz: entonces no hay nada que comprobar. **Límite declarado**: un `Grep` sobre la raíz
 * puede devolver líneas de un fichero denegado, porque `canUseTool` decide sobre la LLAMADA
 * y no puede filtrar su salida. Cerrarlo exigiría un hook `PostToolUse`, que no está puesto.
 */
export function veredictoDeLectura(opciones: {
  cwd: string;
  nombre: string;
  entrada: Record<string, unknown>;
  ficheros: ReadonlySet<string>;
  real?: (ruta: string) => string;
}): { admitida: true } | { admitida: false; motivo: string } {
  const { nombre, entrada } = opciones;
  // La clave donde cada tool lleva la ruta. `Read` la exige; `Glob` y `Grep` no.
  const clave = nombre === "Read" || nombre === "NotebookRead" ? "file_path" : "path";
  const ruta = entrada[clave];
  if (ruta === undefined) return { admitida: true };
  if (typeof ruta !== "string" || ruta === "") {
    return { admitida: false, motivo: "esa ruta no se entiende, así que no se lee" };
  }
  const v = veredictoDeRuta({ ...opciones, ruta, soloConfinamiento: true });
  return v.admitida ? { admitida: true } : { admitida: false, motivo: v.motivo };
}

/** El motivo que se le devuelve al hijo cuando la tool entera no está concedida. */
export function motivoDeToolDenegada(nombre: string, clase: ClaseDeToolExterna): string {
  if (clase === "denegada" || clase === "desconocida") {
    return (
      `xonecode no te concede «${nombre}». Puedes leer y buscar (${[...TOOLS_EXTERNAS_DE_LECTURA].join(", ")}) ` +
      `y, si tu papel lo permite, escribir con Write y Edit — cada escritura pasa por una autorización. ` +
      `Todo lo demás está denegado: explica qué harías en vez de intentarlo por otro camino.`
    );
  }
  return (
    "xonecode no te concede escribir: tu papel es de solo lectura. " +
    "Explica qué harías en vez de intentar hacerlo."
  );
}

/** Y el motivo cuando el propio SDK abortó mientras se esperaba la decisión. */
export const MOTIVO_DE_ESCRITURA_ABORTADA =
  "la petición se canceló antes de que nadie autorizara esa escritura, así que no se ha escrito nada.";

/** El motivo cuando la escritura se pidió bien y quien decide dijo que no. */
export const MOTIVO_DE_ESCRITURA_RECHAZADA =
  "la escritura no se ha autorizado. No la intentes por otro camino: explica qué querías cambiar y por qué.";

/**
 * El `pedirAprobacion` de la sesión, convertido en la política de escritura del hijo.
 *
 * **Y aquí está la mitad buena del diseño: la política ya existía.** `pedirAprobacion` es el
 * hueco que `abrirSesionReal` declara y que cada piel rellena, y sus implementaciones son
 * exactamente las dos que hacían falta:
 * - **La interactiva** (`consolaWeb.aprobacionesTui`, el modal de la TUI, `pedirDecisiones`
 *   por readline): enseña el diff y espera. Nace RECHAZADA entera, tiene plazo, y sin
 *   cliente enganchado contesta rechazo sin preguntar. Fail-closed por construcción, ya
 *   probado, ya cableado en las tres pieles.
 * - **La autónoma** (`consolaDeTarea.aprobacionesTui`): concede —la autorización fue crear
 *   la tarea—, lo ANUNCIA con los nombres en el transcript y lo mete en `Tarea.autorizadas`
 *   por su callback `autorizado`. O sea que la escritura de un agente externo dentro de una
 *   tarea de fondo no puede ser muda ni quedarse fuera de la cuenta que lee el juez.
 * Escribir un segundo tipo de política habría sido escribir una segunda forma de decidir
 * sobre lo mismo, con dos sitios donde el fail-closed puede dejar de estarlo.
 *
 * Lo que esto añade es la TRADUCCIÓN, y nada más: un `PendienteDeAprobacion` sintético con
 * la ruta virtual y su diff, por los mismos dos mapas que ya viajan (`ficheros`, `diffs`).
 * El id lleva el prefijo `externo:` para que no pueda colisionar con el de un interrupt del
 * grafo — de esas claves se construye el `resume`, y una colisión resolvería el interrupt
 * equivocado.
 *
 * **Fail-closed hasta el final**: si la promesa revienta, o si el mapa no trae `approve`
 * para nuestro id, la respuesta es NO. Nunca se deja salir la excepción hacia el SDK, cuyo
 * comportamiento ante un `canUseTool` que lanza no está medido.
 */
export function politicaDeAprobacionExterna(
  pedirAprobacion: (
    pendientes: PendienteDeAprobacion[],
    ficheros: Map<string, string>,
    diffs: Map<string, LineaDeDiff[]>
  ) => Promise<Map<string, Decision>>
): PoliticaDeEscrituraExterna {
  let contador = 0;
  return async (peticion: EscrituraExternaPedida): Promise<boolean> => {
    contador += 1;
    const id = `externo:${contador}`;
    const pendiente: PendienteDeAprobacion = {
      id,
      // `origen` es el nombre del agente, igual que el `[dev]` que `hitlDe` mete en la
      // descripción y que `aPendiente` extrae: las tres pieles pintan este campo.
      origen: peticion.agente,
      descripcion: "quiere escribir un fichero del proyecto (agente externo)",
      // Las dos, y en este orden: es lo que las pieles leen para saber si hay botón de
      // aprobar. `consolaDeTarea` además solo concede lo que declara `approve`.
      decisionesPermitidas: ["approve", "reject"],
    };
    try {
      const decisiones = await pedirAprobacion(
        [pendiente],
        new Map([[id, peticion.ruta]]),
        new Map([[id, peticion.lineas]])
      );
      return decisiones.get(id)?.type === "approve";
    } catch {
      // El «sin humano» de `run.ts` corta LANZANDO desde `pedirAprobacion`. Aquí eso es una
      // respuesta y no un fallo: nadie ha autorizado nada.
      return false;
    }
  };
}

/**
 * El diff de una escritura del hijo, con la MISMA función que compone el de una aprobación
 * del grafo (`interrupts.ts#cambioDe`).
 *
 * La traducción es solo el NOMBRE de la tool: las claves de los argumentos coinciden —
 * medido en `sdk-tools.d.ts`—, así que `Write` es un `write_file` y `Edit` un `edit_file`.
 * Compartir la función en vez de escribir un segundo diff es lo que impide que la ventana de
 * aprobación de un agente externo enseñe algo distinto de la de siempre.
 *
 * Un matiz declarado: `Edit` sin `replace_all` cambia UNA aparición y falla si hay varias,
 * mientras que `cambioDe` pinta el reemplazo de todas. Cuando la edición es válida para el
 * hijo hay exactamente una, así que coinciden; cuando no lo es, el diff enseña de más y la
 * escritura no llega a ocurrir.
 */
export function diffDeEscrituraExterna(
  tool: string,
  entrada: Record<string, unknown>,
  rutaVirtual: string,
  leer: (ruta: string) => string = leerDelDisco
): LineaDeDiff[] {
  const nombre = tool === "Write" ? "write_file" : "edit_file";
  const vista = cambioDe(
    {
      id: "externo",
      tool: nombre,
      // La ruta VIRTUAL y no la absoluta: de aquí sale lo que se pinta, y la ruta de la
      // máquina no viaja por el cable (puede ir por un túnel).
      args: { ...entrada, file_path: rutaVirtual },
      description: "",
      allowedDecisions: [],
    },
    // `cambioDe` lee por la ruta que le den, o sea la virtual; se traduce aquí, que es el
    // único sitio que conoce la carpeta de verdad.
    () => leer(entrada["file_path"] as string)
  );
  // Sin vista no hay diff que enseñar, y eso NO es un motivo para no preguntar: se pregunta
  // igual con la lista vacía. Decidir sin diff es peor que decidir con diff, pero escribir
  // sin decisión es lo que esto existe para evitar.
  return vista?.lineas ?? [];
}

/** El ANTES de una escritura: el disco. Un fichero que no está es cadena vacía, no un fallo. */
function leerDelDisco(ruta: string): string {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    return "";
  }
}

/**
 * La política de la SESIÓN, derivada de su `pedirAprobacion`. **Extraída y exportada a
 * propósito**: es el cableado, y el cableado es donde este repo lleva SIETE reglas que se
 * quedaron sin montar con todo en verde. Vive fuera del cierre de `abrirSesionReal` para
 * poder probarla contra lo real en vez de contra un doble.
 *
 * Ausente es «no hay a quién preguntar», y entonces no hay política — o sea que el hijo no
 * escribe. Es el caso de `xonecode run` en CI y de cualquier sesión montada sin aprobación:
 * el mismo camino por el que hoy el turno dice «piden aprobación y no hay quién apruebe».
 */
export function politicaExternaDeSesion(
  pedirAprobacion:
    | ((
        pendientes: PendienteDeAprobacion[],
        ficheros: Map<string, string>,
        diffs: Map<string, LineaDeDiff[]>
      ) => Promise<Map<string, Decision>>)
    | undefined
): PoliticaDeEscrituraExterna | undefined {
  return pedirAprobacion === undefined ? undefined : politicaDeAprobacionExterna(pedirAprobacion);
}

/**
 * Cómo se cuenta una tool del hijo en el flujo de eventos: con el nombre CANÓNICO del
 * harness y el mismo campo que la lista blanca de `resumenDeTool.ts` elegiría.
 *
 * El nombre se traduce (`Read` → `read_file`) en vez de inventarse una familia nueva: así
 * el colapsador de `core/notify.ts` las agrupa con las demás —«→ lee ×5 — a, b y 3 más»—,
 * la bitácora las cuenta igual y ninguna piel se entera de que hay dos orígenes. Añadir
 * `Read` a las tablas de icono y verbo habría sido la otra opción, y es la que deja dos
 * nombres para lo mismo en el registro y en las Trazas.
 *
 * Y el detalle es exactamente lo que ya sale de una tool del grafo: una RUTA (virtual, la
 * del proyecto) o un PATRÓN. Nunca contenido, nunca la ruta de la máquina — la misma regla,
 * aplicada en el otro lado de la frontera.
 */
const NOMBRE_CANONICO: Record<string, string> = {
  Read: "read_file",
  NotebookRead: "read_file",
  Glob: "glob",
  Grep: "grep",
  Write: "write_file",
  Edit: "edit_file",
};

export function eventoDeToolExterna(
  nombre: string,
  entrada: Record<string, unknown>,
  cwd: string,
  real: (ruta: string) => string = realpathSync
): { nombre: string; detalle?: string } {
  const canonico = NOMBRE_CANONICO[nombre] ?? nombre;
  // Un patrón para las de búsqueda, una ruta para las de fichero. Igual que `detalleDe`.
  if (canonico === "glob" || canonico === "grep") {
    const patron = entrada["pattern"];
    return typeof patron === "string" && patron !== ""
      ? { nombre: canonico, detalle: patron }
      : { nombre: canonico };
  }
  const ruta = entrada["file_path"];
  if (typeof ruta !== "string" || ruta === "") return { nombre: canonico };
  /**
   * La VIRTUAL: la de la máquina no sale de aquí ni al registro ni al cable. Si la ruta cae
   * fuera del proyecto no se dice cuál era —sería decir dónde miró fuera—, solo la tool.
   *
   * Y contra las DOS formas de la raíz, que es el mismo tropiezo que ya costó una medida en
   * `veredictoDeRuta`: el hijo canonicaliza, así que con el proyecto en `/tmp/x` pide
   * `/private/tmp/x/...` y los textos no casan. Medido en vivo antes de esto: el pulso decía
   * «→ lee ×65» sin UN SOLO nombre de fichero, que es la mitad de lo que esta línea existe
   * para contar.
   */
  const suyo = rutaVirtualDeEscritura(cwd, ruta);
  if (suyo !== undefined) return { nombre: canonico, detalle: suyo };
  try {
    const porLaCanonica = rutaVirtualDeEscritura(real(resolve(cwd)), ruta);
    if (porLaCanonica !== undefined) return { nombre: canonico, detalle: porLaCanonica };
  } catch {
    // Sin poder canonicalizar no se afirma ninguna ruta: se cuenta la tool y ya.
  }
  return { nombre: canonico };
}

/**
 * Todo lo que un agente externo necesita de la SESIÓN, en un solo sitio y exportado.
 *
 * **Está extraída del cierre de `abrirSesionReal` a propósito**, y no por gusto: son cuatro
 * campos opcionales que se componen dentro de algo que todos sus tests doblan, o sea el
 * patrón de fallo que este repo lleva medido siete veces — una regla que deja de estar
 * montada CON TODO EN VERDE. Aquí los tres que importan se pueden comprobar contra lo real:
 * que sin `pedirAprobacion` no hay política (y por tanto no hay escritura), que la actividad
 * del hijo acaba en la cola de eventos, y que la lista de ficheros es una FUNCIÓN y no una
 * foto congelada al abrir la sesión.
 */
export function opcionesDeSubagenteExterno(opciones: {
  pedirAprobacion?: (
    pendientes: PendienteDeAprobacion[],
    ficheros: Map<string, string>,
    diffs: Map<string, LineaDeDiff[]>
  ) => Promise<Map<string, Decision>>;
  ficherosDelProyecto: () => ReadonlySet<string>;
  eventos: ColaDeEventos;
  /** Lo que el hijo consumió, para la cuenta de la sesión. Ausente = no se lleva la cuenta. */
  alConsumir?: (consumo: ConsumoExterno) => void;
}): {
  aprobarEscritura?: PoliticaDeEscrituraExterna;
  ficherosDelProyecto: () => ReadonlySet<string>;
  alUsarTool: (tool: { nombre: string; detalle?: string }) => void;
  alConsumir?: (consumo: ConsumoExterno) => void;
} {
  const politica = politicaExternaDeSesion(opciones.pedirAprobacion);
  return {
    ...(politica === undefined ? {} : { aprobarEscritura: politica }),
    ficherosDelProyecto: opciones.ficherosDelProyecto,
    // Un evento `tool` normal y corriente: el colapsador lo agrupa con los demás, la
    // bitácora lo cuenta y ninguna piel se entera de que hay dos orígenes.
    alUsarTool: ({ nombre, detalle }) =>
      opciones.eventos.empujar({ tipo: "tool", nombre, ...(detalle === undefined ? {} : { detalle }) }),
    ...(opciones.alConsumir === undefined ? {} : { alConsumir: opciones.alConsumir }),
  };
}

/** Cuántos ficheros se le enumeran. Por encima, se dice cuántos quedan fuera. */
export const TOPE_DE_INVENTARIO = 400;

/**
 * El inventario del proyecto, para un agente EXTERNO.
 *
 * **Existe porque un hijo de Claude Code no puede enumerar la carpeta, y eso está medido**
 * (11-09-2026, espiando el hook en una ejecución real). Intentó `Bash ls`, `Bash find` —
 * denegadas—, pidió `ToolSearch {"query":"select:Glob,Grep"}` y **no las encontró**: ese
 * hijo no trae ninguna herramienta de listado. Después probó las tools MCP del usuario
 * (denegadas también) y acabó leyendo a ciegas nombres inventados —`README.md`,
 * `CLAUDE.md`, `app.ini`, `main.xml`…, ninguno existía— para concluir que «el proyecto está
 * prácticamente vacío para mí, porque no puedo listarlo».
 *
 * La salida fácil habría sido concederle `Bash`, y es justo la que no se puede tomar: con
 * `Bash` escribe el proyecto entero saltándose la política, el diff y las guardas de ruta.
 * La buena es que el harness YA sabe qué ficheros hay —es la misma lista con la que
 * reconoce una vista aplanada— así que se le DICE. Es el patrón de `core/adjuntos.ts`:
 * montar no basta, hay que decir que están.
 *
 * Dos cosas que hereda de las reglas de siempre: las rutas van VIRTUALES (desde la raíz del
 * proyecto, nunca las de la máquina) y la lista va ACOTADA con el total al lado, que es lo
 * que impide leer los que caben como si fueran todos.
 */
export function inventarioDelProyecto(
  ficheros: ReadonlySet<string>,
  tope: number = TOPE_DE_INVENTARIO
): string {
  const todos = [...ficheros].sort();
  if (todos.length === 0) {
    // Vacío es una afirmación, y aquí es cierta: la lista sale del disco. Decirlo evita que
    // se ponga a adivinar nombres, que es exactamente lo que hacía sin inventario.
    return "INVENTARIO DEL PROYECTO: está vacío (no hay ningún fichero que leer).";
  }
  const listados = todos.slice(0, tope);
  const resto = todos.length - listados.length;
  return [
    `INVENTARIO DEL PROYECTO (${todos.length} fichero(s)). No tienes ninguna herramienta para`,
    "listar carpetas, así que esta es la lista: no adivines nombres, lee de aquí. Las rutas van",
    "desde la raíz del proyecto; para leerlas, quítales la barra inicial.",
    ...listados.map((f) => `- ${f}`),
    ...(resto === 0 ? [] : [`- … y ${resto} fichero(s) más que no caben en esta lista.`]),
  ].join("\n");
}
