import { ficheroDeDispositivo } from "../../core/dispositivoDeSesion.js";
import { existsSync, mkdirSync, readdirSync, statSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { CompositeBackend, FilesystemBackend, LocalShellBackend } from "deepagents";
import { RUTA_MEMORIA_INTERNA, RUTA_MEMORIA_VIRTUAL } from "./memoriaDeProyecto.js";
import { sinContenidoInvalido, validarConXoneLinter, type ValidarContenido } from "./validacionXone.js";
import { escriturasEnSerie } from "./escriturasEnSerie.js";
import { RAIZ_SKILLS, skillsConRuta, skillsMontables, type Montaje } from "./skills.js";
import {
  artefactoFueraDeSitio,
  artefactoSinMontar,
  esBasuraDeArtefacto,
  esRutaDeArtefacto,
  mimeDeArtefacto,
  nombreDeArtefacto,
  RUTA_ARTEFACTOS,
  type Artefacto,
} from "../../core/artefactos.js";
import { RUTA_ADJUNTOS } from "../../core/adjuntos.js";
import { esRutaDeMaquina, porQueNoSuelta } from "../../core/traerDeLaMaquina.js";
import { carpetaDeHotswap, RUTA_HOTSWAP } from "../../core/hotswap.js";
import { CARPETA_DE_PLANES, RUTA_PLANES } from "../../core/planes.js";
import { entornoDeShell, variablesDeAndroid } from "../../core/shellDeAgente.js";
import { localizadorDeAndroid } from "../dispositivos/dispositivosEnMaquina.js";
import {
  RUTAS_DE_DESCARGA,
  carpetaDeDescargas,
  descargaFueraDeSitio,
  porQueNoEsDelProyecto,
} from "../../core/descargas.js";

/**
 * El backend del proyecto: confinado, y sin las vistas aplanadas.
 *
 * **`virtualMode: true` no es configurable.** Medido contra deepagents 1.13.2: con el
 * default (`false`) el backend LEYÓ una ruta absoluta de fuera de la raíz. La propia
 * librería lo dice de su default — «absolute paths and `..` can bypass rootDir».
 *
 * Y sin shell: el `execute` de deepagents solo aparece si el backend sabe ejecutar, así que
 * éste es el que deja a un especialista SIN esa tool. El que sí la tiene es
 * `backendDelProyectoConShell`, y quién se lleva cuál lo decide `ejecucion` en el `.md`.
 */
export function backendDelProyecto(raiz: string): FilesystemBackend {
  return new FilesystemBackend({ rootDir: raiz, virtualMode: true });
}

/**
 * El mismo backend, pero que además EJECUTA — el de un subagente con `ejecucion: true`.
 *
 * Es la pieza que enciende la tool `execute` de deepagents: el middleware la registra solo
 * cuando «el backend resuelto sabe ejecutar», y lo que decide eso es `isSandboxBackend`, que
 * mira que haya un `execute` y un `id` NO vacío (medido en la librería: `id !== ""`).
 *
 * **Lo que `virtualMode` NO hace aquí, y hay que tenerlo delante.** Confina las tools de
 * FICHERO, no los comandos: un `cat ../../otro` del shell sale de la raíz igual. Lo mismo
 * vale para `permisosDe`, y la propia librería se niega a fingir lo contrario — usar
 * `permissions` con un backend ejecutable **lanza `ConfigurationError`** («permissions are
 * not enforced on execute because shell commands can access any path regardless of
 * path-based rules»). O sea que conceder ejecución es conceder la máquina, y por eso se
 * declara en el `.md`, se ve en cada evento y lo lleva un solo subagente.
 *
 * **El entorno se pasa ENTERO y a mano, nunca `inheritEnv`.** Con `inheritEnv: true` la
 * shell hereda `process.env`, donde `guardarCredencial` escribe las claves de API a
 * propósito; un `printenv` las dejaría en el contexto. Lo que se pasa lo decide
 * `core/shellDeAgente.ts#entornoDeShell`, que es puro y tiene test.
 *
 * **Dos límites de la librería, declarados**: el tope es de RELOJ (`timeout`, en segundos) y
 * no de silencio, al revés que `TOPE_SIN_SALIDA_MS` de `agent/dispositivos/`; y al vencer
 * mata al HIJO (`SIGTERM`), no al grupo, así que un nieto sobrevive. Por eso lo que no
 * termina —un emulador— va al fondo desde la propia orden, y eso lo dice la skill.
 */
export function backendDelProyectoConShell(
  raiz: string,
  entorno: Record<string, string>,
): FilesystemBackend {
  return new LocalShellBackend({
    rootDir: raiz,
    virtualMode: true,
    env: entorno,
    timeout: TOPE_DE_COMANDO_S,
  });
}

/**
 * El entorno con el que corre la shell de ESTE proyecto.
 *
 * Una sola llamada para que el montaje no sea una composición dentro de `construirAgente`:
 * ahí lo doblan todos los tests y la regla —qué claves se quitan, qué rutas se añaden—
 * quedaría escrita y sin probar. La decisión es pura y vive en `core/shellDeAgente.ts`; lo
 * que aporta esto es de dónde salen los tres ingredientes.
 *
 * Las skills se leen del disco en cada construcción, igual que `skillsMontables` en el
 * backend y que `cargarAgentes`: una skill instalada con la consola abierta no alcanza a la
 * sesión en curso, que es el límite ya anotado en CLAUDE.md y no uno nuevo.
 */
export function entornoDeLaShellDelProyecto(
  raiz: string,
  artefactos?: string,
  /**
   * El buscador de binarios del SDK de Android. Entra por parámetro **solo** para que un test
   * pueda ver que está montado: esta función toca `process.env` y `existsSync`, así que sin
   * inyectarlo la composición viviría donde ningún test la alcanza — el patrón de fallo que
   * este repo lleva contadas nueve veces. En producción no lo pasa nadie.
   */
  enSdk: (nombre: string, subcarpeta: string) => string | undefined = localizadorDeAndroid({
    plataforma: process.platform,
    entorno: process.env,
    home: process.env["HOME"] ?? "",
    existe: (ruta) => existsSync(ruta),
  }).enSdk,
): Record<string, string> {
  // `skillsConRuta` y no `skillsMontables`: aquélla deja fuera las de SERIE —su raíz se cuelga
  // entera en el backend— y una shell necesita la ruta real de todas. Sin esto, los scripts de
  // las skills de serie no llegan al PATH y el agente se queda buscándolos por el disco.
  const skills = skillsConRuta(raiz).map((m) => ({ nombre: m.nombre, dir: m.dir }));
  return entornoDeShell({
    entorno: process.env,
    skills,
    // La carpeta `scripts/` de cada skill que la tenga, al PATH. La comprobación de que existe
    // va aquí porque `entornoDeShell` es puro: prometer en el PATH una carpeta que no está es
    // el botón muerto de siempre, solo que en una variable de entorno.
    binarios: skills.map((s) => join(s.dir, "scripts")).filter((d) => existsSync(d)),
    // Sin esto, `xone-arrancar-android` tendría que adivinar dónde está el SDK: en un Mac con
    // Homebrew `emulator` no está en el PATH y `ANDROID_HOME` suele estar vacía.
    android: variablesDeAndroid(enSdk),
    // Las DOS carpetas, y la segunda se DERIVA de la primera: es la misma decisión —¿hay una
    // sesión con identidad?— y un segundo parámetro sería un segundo sitio donde contestarla,
    // que es justo el que se cae en un cableado largo.
    // Y el fichero del dispositivo de la sesión, derivado igual: es la misma pregunta.
    ...(artefactos === undefined
      ? {}
      : { artefactos, hotswap: carpetaDeHotswap(artefactos), dispositivo: ficheroDeDispositivo(artefactos) }),
  });
}

/**
 * El tope de reloj de UN comando, en segundos.
 *
 * El de la librería son 120 s. Se sube porque aquí los comandos normales son de dispositivo
 * —un `adb install`, esperar a que un emulador termine de arrancar— y 120 s los corta a
 * mitad; y no se sube más porque un comando que no vuelve deja el turno colgado hasta aquí.
 * Lo que de verdad no termina nunca (arrancar un emulador) no se acota con un tope: se manda
 * al fondo, que es lo que la skill explica.
 */
export const TOPE_DE_COMANDO_S = 600;

/**
 * Añade las skills como una ruta virtual de solo lectura del agente.
 *
 * El proyecto del usuario sigue siendo la raíz predeterminada. `/skills` apunta al
 * catálogo que se distribuye con xonecode: así SkillsMiddleware puede descubrir y
 * cargar bajo demanda cada `SKILL.md` sin conceder al modelo acceso al repositorio
 * del harness ni sacarlo de la raíz del proyecto.
 *
 * **Y las del USUARIO cuelgan de esa misma ruta, una a una.** Viven en otras dos carpetas
 * (`~/.xonecode/skills/` y la del proyecto, `agent/grafo/skills.ts`) y tienen que verse como
 * UNA sola: un subagente declara `skills: [mi-skill]` y eso se traduce a `/skills/mi-skill/`
 * sin saber de dónde salió el fichero. Una raíz aparte —`/skills-tuyas/`— habría metido de
 * quién es la skill dentro de su ruta, y entonces cambiarla de carpeta le cambiaría el
 * nombre al agente.
 *
 * Se apoya en que `CompositeBackend` ordena sus rutas **por longitud descendente** y se
 * queda con la primera que encaja (`sortedRoutes` en deepagents 1.13.2): `/skills/mia/` es
 * más larga que `/skills/`, así que gana para todo lo que cuelgue de ella. Eso no es una
 * suposición sobre la librería: lo ata `proyecto.test.ts` contra la librería REAL, que es la
 * única forma de enterarse el día que cambie.
 *
 * **Límite declarado**: un `ls /skills` enseña solo las de serie. `CompositeBackend.ls`
 * resuelve a UNA ruta y no funde varias, así que las del usuario no salen en ese listado. No
 * importa para lo que esto hace —`SkillsMiddleware` recibe las rutas una a una, ya
 * resueltas, y es así como el modelo las descubre— pero un agente que liste esa carpeta a
 * mano no las verá.
 */
/**
 * Monta la máquina entera bajo `/disco/`, de solo lectura, y contesta bien a quien pegue una
 * ruta absoluta a pelo.
 *
 * El porqué entero está en `core/discoDeLaMaquina.ts`. Aquí, las dos mitades del cableado:
 *
 * - **El montaje**: la misma pieza que `/skills/`, `/adjuntos/` y `/planes/` — otra raíz del
 *   `CompositeBackend`, con su barra final obligatoria. El «solo lectura» no lo pone esto: lo
 *   pone `permisosDe`, que es donde vive esa decisión para todas las raíces.
 * - **La REESCRITURA**, que es lo que evita el viaje en balde. Una ruta de máquina escrita a
 *   pelo (`/Users/…/x.zip`) se resuelve DENTRO del proyecto y vuelve un ENOENT que dice «no
 *   existe» sobre un fichero que sí existe —y de paso filtra la raíz absoluta del proyecto—.
 *   Se intercepta antes y se devuelve la ruta buena ya escrita.
 */
/**
 * Contesta bien a una ruta de la MÁQUINA escrita como si fuera del proyecto.
 *
 * Sin esto se resuelve DENTRO del proyecto y vuelve un ENOENT que dice «no such file or
 * directory» sobre un fichero que sí existe —y de paso filtra la raíz absoluta del proyecto—.
 * Medido: el orquestador concluía que estaba enjaulado y se iba a delegar en el agente con
 * shell. Aquí se le devuelve el paso siguiente ESCRITO, que es el patrón de `porQueNo`.
 *
 * No monta nada y no abre nada: solo sustituye un mensaje que engaña por uno que sirve.
 */
export function conAvisoDeRutaDeMaquina<T extends object>(backend: T): T {
  return new Proxy(backend as object, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;
      return (...args: unknown[]) => {
        const ruta = args[0];
        // Se DEVUELVE `{error}`, como las otras guardas: una excepción se lleva el turno.
        if (typeof ruta === "string" && esRutaDeMaquina(ruta)) {
          return { error: porQueNoSuelta(ruta) };
        }
        return (valor as (...a: unknown[]) => unknown).apply(destino, args);
      };
    },
  }) as T;
}

export function backendConSkills<T extends object>(backend: T, propias: readonly Montaje[] = []): T {
  return new CompositeBackend(backend as never, {
    // La barra final importa: CompositeBackend la retira antes de delegar. Sin ella
    // reconstruye `//archify/...`, que FilesystemBackend interpreta fuera de su raíz.
    "/skills/": new FilesystemBackend({ rootDir: RAIZ_SKILLS, virtualMode: true }),
    ...Object.fromEntries(
      propias.map((m) => [
        `/skills/${m.nombre}/`,
        new FilesystemBackend({ rootDir: m.dir, virtualMode: true }),
      ])
    ),
  }) as T;
}

/**
 * Cuelga `/adjuntos/` de la carpeta de la TAREA, de solo lectura.
 *
 * **La misma pieza que `/skills/` y `/artefactos/`**: otra raíz del `CompositeBackend`. Y de
 * solo lectura por lo mismo que las skills — son material de ENTRADA, los documentos que
 * anexó la persona que creó la tarea, no ficheros que reescribir. Quien lo deniega es
 * `permisosDe` (`agent/grafo/perfiles.ts`), incondicionalmente y por patrón: aquí no hay Proxy que
 * rechace, igual que no lo hay para `/skills/`, porque la denegación que el modelo choca es
 * la del middleware de permisos y ese es el sitio donde vive la regla.
 *
 * La carpeta vive FUERA del proyecto (`~/.xonecode/tareas/<id>/adjuntos/`), y eso trae
 * gratis lo que importaba: no entra en git y no sube a CloudStudio, sin depender de ninguna
 * exclusión. El porqué entero está en `core/adjuntos.ts`.
 *
 * **La carpeta no se crea aquí**, misma medida que `/artefactos/`: `FilesystemBackend` no
 * exige que su `rootDir` exista. Y quien monta esto solo lo hace cuando la tarea TRAE
 * adjuntos (`web/servidor/corredorDeTareas.ts`): una raíz vacía sería mandar al agente a
 * mirar un sitio donde no hay nada.
 */
export function backendConAdjuntos<T extends object>(backend: T, carpeta: string): T {
  return new CompositeBackend(backend as never, {
    // La barra final es obligatoria: `CompositeBackend` la retira antes de delegar, y sin
    // ella reconstruye `//fichero`, fuera de la raíz montada. La misma trampa de `/skills/`.
    [RUTA_ADJUNTOS]: new FilesystemBackend({ rootDir: carpeta, virtualMode: true }),
  }) as T;
}

/**
 * Cuelga `/planes/` de `.xonecode/planes/`, en el repo LOCAL.
 *
 * El porqué de ese sitio está en `core/planes.ts`. Lo que aporta esto es el montaje, y tiene
 * las mismas dos trampas que `/artefactos/` y `/skills/`:
 *
 *  - **La barra final es obligatoria**: `CompositeBackend` la retira antes de delegar, y sin
 *    ella reconstruye `//favoritos/PLAN.md`, que `FilesystemBackend` interpreta fuera de su
 *    raíz.
 *  - **La carpeta NO se crea al montar**: la crea `FilesystemBackend.write` la primera vez que
 *    se escribe. Un proyecto en el que nadie ha planificado no tiene por qué tener la carpeta.
 *
 * Y una diferencia con los artefactos que es el motivo de que exista: esto **no se anuncia**.
 * Un artefacto se enseña una vez; un plan se escribe, se lee y se ACTUALIZA por varios
 * especialistas a lo largo de varios turnos, así que un evento por escritura sería ruido.
 */
export function backendConPlanes<T extends object>(backend: T, raiz: string): T {
  return new CompositeBackend(backend as never, {
    [RUTA_PLANES]: new FilesystemBackend({
      rootDir: join(raiz, CARPETA_DE_PLANES),
      virtualMode: true,
    }),
  }) as T;
}

/**
 * Cuelga `/artefactos/` de la carpeta de la SESIÓN, fuera del proyecto.
 *
 * El porqué está en `core/artefactos.ts`: hoy los diagramas del `mockup` acaban en la raíz
 * del proyecto y de ahí a git y a CloudStudio. Esto es el mismo mecanismo que `/skills/`
 * —otra raíz en el `CompositeBackend`— con dos diferencias que importan:
 *
 * - **Se puede ESCRIBIR.** `/skills/` está denegada en `permisosDe` porque son instrucciones
 *   del harness; esta es justamente donde el agente deja lo que produce.
 * - **Se APUNTA lo que se escribe.** El backend es el único sitio que sabe que una escritura
 *   ocurrió y cuánto pesó, y un artefacto que nadie nombra es un fichero en una carpeta que
 *   nadie abre. El Proxy va sobre el sub-backend y no sobre el compuesto: así solo ve lo de
 *   esta carpeta, sin filtrar las escrituras del proyecto por el mismo sitio.
 *
 * La carpeta **no se crea aquí**. Medido contra deepagents: `FilesystemBackend` no exige que
 * su `rootDir` exista y el `write` lo crea. Crearla al montar dejaría un `artefactos/` vacío
 * en cada sesión que no dibuja nada, que es la mayoría.
 */
export function backendConArtefactos<T extends object>(
  backend: T,
  carpeta: string,
  alEscribir: (artefacto: Artefacto) => void,
): T {
  // Sus escrituras hacen cola en `backendDeAgente#enSerie`, por fuera de todo lo montado.
  const destino = new FilesystemBackend({ rootDir: carpeta, virtualMode: true });

  const anotado = new Proxy(destino, {
    get(objetivo, prop) {
      const valor = Reflect.get(objetivo, prop, objetivo);
      if (typeof valor !== "function") return valor;
      if (prop !== "write" && prop !== "edit") {
        return (valor as (...a: unknown[]) => unknown).bind(objetivo);
      }
      return async (...args: unknown[]) => {
        const resultado = await (valor as (...a: unknown[]) => unknown).apply(objetivo, args);
        // La ruta que llega aquí ya viene sin el prefijo (`CompositeBackend` lo retira antes
        // de delegar), así que se rehace para que lo apuntado sea lo que el agente escribió
        // y lo que después se le pide al lector.
        const relativa = String(args[0] ?? "").replace(/^\/+/, "");
        const ruta = RUTA_ARTEFACTOS + relativa;
        const nombre = nombreDeArtefacto(ruta);
        const mime = mimeDeArtefacto(nombre);
        // El tamaño se mide del DISCO y no del argumento: por aquí pasa también `edit`,
        // cuyo segundo argumento es el texto a sustituir y no el fichero resultante.
        let bytes = 0;
        try {
          bytes = statSync(join(carpeta, relativa)).size;
        } catch {
          // Si no se puede medir, se dice cero: es un dato de adorno, no la existencia.
        }
        alEscribir({ ruta, nombre, bytes, ...(mime === undefined ? {} : { mime }) });
        return resultado;
      };
    },
  });

  return new CompositeBackend(backend as never, { [RUTA_ARTEFACTOS]: anotado as never }) as T;
}

/**
 * Cuelga `/large_tool_results/` y `/conversation_history/` al lado de los artefactos de la
 * sesión — o sea, FUERA del proyecto.
 *
 * Son las dos carpetas donde deepagents descarga lo que no cabe en el contexto, y hasta
 * ahora no estaban montadas: medido, `large_tool_results/call_866999.txt` (26 KB) acabó
 * dentro del AppDemo del usuario y commiteado. El porqué entero, y por qué la carpeta se
 * deriva de la de artefactos en vez de recibir su propio parámetro, está en
 * `core/descargas.ts`.
 *
 * La misma pieza que `/skills/`, `/artefactos/` y `/adjuntos/`: otra raíz del
 * `CompositeBackend`, con la barra final obligatoria y sin crear la carpeta al montar
 * —`FilesystemBackend` no exige que su `rootDir` exista y el `write` la crea—. Aquí eso
 * importa más que en las otras: la mayoría de las sesiones no descargan nada, y crearlas al
 * montar dejaría dos carpetas vacías en cada una.
 *
 * **Y no se apunta nada de lo que se escriba, al contrario que `/artefactos/`.** Un
 * artefacto es una salida para una persona y por eso se anuncia; esto es el andamio del
 * agente —la salida cruda de una tool que él mismo va a volver a leer— y un evento por cada
 * una sería ruido en la conversación sobre algo que nadie pidió.
 */
export function backendConDescargas<T extends object>(backend: T, carpetaDeArtefactos: string): T {
  const montajes: Record<string, unknown> = {};
  for (const ruta of RUTAS_DE_DESCARGA) {
    montajes[ruta] = new FilesystemBackend({
      rootDir: carpetaDeDescargas(carpetaDeArtefactos, ruta),
      virtualMode: true,
    });
  }
  return new CompositeBackend(backend as never, montajes as never) as T;
}

/**
 * Cuelga `/hotswap/` al lado de los artefactos de la sesión — o sea, FUERA del proyecto.
 *
 * Es donde el script `xone-hotswap` deja lo que saca del contexto: el árbol de controles de
 * una pantalla, el log del aparato. El porqué entero —y la medida de los 10 volcados de los
 * que 6 no volvió a abrir nadie— está en `core/hotswap.ts`.
 *
 * La misma pieza que `/skills/`, `/artefactos/`, `/adjuntos/` y las dos de descarga: otra
 * raíz del `CompositeBackend`, con la barra final obligatoria y sin crear la carpeta al
 * montar. Y **no se anuncia**, igual que las descargas y al contrario que los artefactos:
 * ésa es exactamente la diferencia que esta carpeta existe para marcar.
 *
 * Que esté MONTADA es la otra mitad del arreglo, y no es opcional. El agente tenía la
 * carpeta del disco en `$XONECODE_ARTEFACTOS` y ninguna ruta virtual con la que volver a
 * abrir lo que el script le había guardado; en la traza se le ve probando tres rutas —la
 * absoluta de la máquina incluida— antes de rendirse y leerlo por la shell. Con esto,
 * `read_file("/hotswap/<nombre>")` funciona y el script puede NOMBRAR esa ruta en su salida.
 *
 * No necesita fila en `permisosDe`: los `deny` de ahí son de `write`, así que leer ya está
 * permitido, y escribir cae bajo el `deny` general — que es lo correcto, porque quien escribe
 * aquí es una shell, y una shell no pasa por los permisos.
 */
export function backendConHotswap<T extends object>(backend: T, carpetaDeArtefactos: string): T {
  return new CompositeBackend(backend as never, {
    [RUTA_HOTSWAP]: new FilesystemBackend({
      rootDir: carpetaDeHotswap(carpetaDeArtefactos),
      virtualMode: true,
    }),
  } as never) as T;
}

/**
 * Envuelve el backend del PROYECTO para que una descarga del agente no pueda aterrizar
 * dentro.
 *
 * Con las dos raíces montadas esto no salta nunca —`CompositeBackend` enruta por prefijo de
 * TEXTO, sin mirar si la carpeta destino existe (leído en deepagents 1.13.2)—, y ahí está el
 * sentido: el día que el montaje falte, la escritura falla CERRADO en vez de acabar en la
 * app del cliente. Es la misma lección que la fila incondicional de `/adjuntos/` en
 * `permisosDe`, medida por el mismo camino.
 *
 * Y como `sinArtefactosEnElProyecto`: **solo `write` y `edit`** —leer o borrar una descarga
 * mal puesta de antes tiene que seguir funcionando— y el rechazo se DEVUELVE como `{error}`,
 * nunca se lanza. Leído en deepagents 1.13.2: los tools de fichero hacen
 * `if (result.error) return result.error`, así que un error devuelto vuelve al modelo y una
 * excepción se lleva el turno por delante. Aquí quien escribe es la librería y no una tool,
 * y su hueco en el contexto ya sabe decir «no se pudo guardar»: lanzar reventaría el turno
 * por una descarga que solo es andamio.
 */
export function sinDescargasEnElProyecto<T extends object>(backend: T): T {
  const motivo = (ruta: unknown): string | undefined => {
    if (typeof ruta !== "string") return undefined;
    const destino = descargaFueraDeSitio(ruta);
    return destino === undefined ? undefined : porQueNoEsDelProyecto(ruta, destino);
  };

  return new Proxy(backend, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;
      if (prop !== "write" && prop !== "edit") {
        return (valor as (...a: unknown[]) => unknown).bind(destino);
      }
      return async (...args: unknown[]) => {
        const porQue = motivo(args[0]);
        if (porQue !== undefined) return { error: porQue };
        return (valor as (...a: unknown[]) => unknown).apply(destino, args);
      };
    },
  }) as T;
}

/**
 * El backend con el que el agente ve el proyecto, compuesto entero.
 *
 * Vivía dentro de `construirAgente`, y eso dejaba sin probar justo la parte que decide si
 * las reglas están puestas: los tests de este fichero comprobaban cada envoltorio por
 * separado y `construirAgente` se simula en todos los suyos, así que **el cableado no lo
 * miraba nadie**. Una regla que existe y no está montada es peor que no tenerla, porque
 * hay un test en verde diciendo que sí.
 *
 * El orden es lo que hay que leer aquí:
 * 1. La raíz confinada (`virtualMode`), con la memoria del proyecto expuesta por su ruta
 *    virtual.
 * 2. Las dos reglas del PROYECTO: las vistas aplanadas no existen, y un artefacto no se
 *    puede escribir dentro.
 * 3. `/skills/` colgada, de solo lectura por `permisosDe`.
 * 4. Y `/artefactos/` colgada por FUERA, que es lo que hace que escribir ahí no pase por la
 *    guarda de (2) — son dos raíces distintas del mismo compuesto.
 * 4b. Y las dos carpetas donde deepagents DESCARGA lo que no cabe en el contexto
 *    (`/large_tool_results/`, `/conversation_history/`), al lado de los artefactos. Sin
 *    ellas caían en el proyecto: medido, commiteadas dentro de la app del usuario.
 * 5. Y `/adjuntos/`, cuando la tarea trae alguno: la misma pieza, de solo lectura por
 *    `permisosDe`.
 */
export function backendDeAgente(opciones: {
  raiz: string;
  ficheros: ReadonlySet<string>;
  artefactos?: { carpeta: string; alEscribir: (artefacto: Artefacto) => void };
  /**
   * Presente solo para un subagente con `ejecucion: true` en su `.md`. Cambia la BASE de la
   * cadena por una que ejecuta, y con eso deepagents le registra la tool `execute`. Ausente
   * —que es todo el mundo menos uno— la cadena no es ejecutable y `permisosDe` sigue
   * aplicándose, que es justo lo que la librería prohíbe combinar.
   */
  ejecucion?: { entorno: Record<string, string> };
  /**
   * La carpeta de los adjuntos de una TAREA, si la hay. Ausente —toda sesión de persona, y
   * toda tarea sin adjuntos— y `/adjuntos/` no se monta; entonces esa ruta no es nada, y la
   * denegación incondicional de `permisosDe` evita que se convierta en un fichero del
   * proyecto (medido: sin ella lo era).
   */
  adjuntos?: string;
  /**
   * Con qué se juzga el contenido antes de escribirlo. Entra por parámetro para poder mirar
   * la guarda desde fuera sin un parser delante; en producción es `validarConXoneLinter()`.
   */
  validar?: ValidarContenido;
}): FilesystemBackend {
  const base =
    opciones.ejecucion === undefined
      ? backendDelProyecto(opciones.raiz)
      : backendDelProyectoConShell(opciones.raiz, opciones.ejecucion.entorno);
  /**
   * **La CUARTA guarda va la MÁS INTERNA, y el orden importa en los dos sentidos.**
   *
   * Un Proxy que envuelve a otro intercepta ANTES que él, así que el envoltorio de más afuera
   * es el que corre primero. Las tres de rutas contestan «¿puede tocarse esto?» con una
   * comparación de texto; ésta contesta «¿vale este contenido?» leyendo el fichero de antes y
   * llamando a un parser. Dejándola dentro, una escritura sobre una vista aplanada o sobre
   * `/artefactos/` se rechaza por su RUTA sin haber parseado nada.
   *
   * Y no es solo coste: al revés, el motivo que recibía el modelo era el equivocado. Medido —
   * un `write` sobre `/Clientes.xml` (vista aplanada) contestaba «XML mal formado en la línea
   * 1» en vez de «es una vista aplanada, edita el .xne», que es lo único que le deja corregir.
   * Lo destapó un test que ya existía.
   */
  /*
   * La cola de escrituras (`escriturasEnSerie`) YA NO va aquí: va una vez, por FUERA de todo lo
   * montado —más abajo, `enSerie`—, para que alcance a CUALQUIER fichero.
   */
  const delProyecto = sinDescargasEnElProyecto(
    sinArtefactosEnElProyecto(
      sinVistasAplanadas(
        sinContenidoInvalido(exponerMemoriaDeProyecto(base), opciones.validar ?? validarConXoneLinter()),
        opciones.ficheros
      )
    )
  );
  /**
   * Las del usuario se leen AQUÍ y no entran por parámetro, a propósito: compuesto dentro de
   * `construirAgente` —que todos sus tests doblan— el montaje quedaba escrito y no probado,
   * que es el patrón de fallo de esta arquitectura y el motivo de que esta función exista.
   * Aquí sí hay test (`proyecto.test.ts`). Y se leen en cada construcción del agente, igual que
   * `cargarAgentes` — con el mismo límite que aquélla, que conviene no confundir: construir
   * ocurre al ABRIR la sesión y en `/modelo`, no en cada turno, así que una skill guardada con
   * la consola abierta no alcanza a la sesión en curso. Está anotado en CLAUDE.md.
   */
  const conSkills = backendConSkills(delProyecto, skillsMontables(opciones.raiz));
  const conArtefactos =
    opciones.artefactos === undefined
      ? conSkills
      : backendConArtefactos(conSkills, opciones.artefactos.carpeta, opciones.artefactos.alEscribir);
  // Las descargas cuelgan de la MISMA carpeta de sesión que los artefactos, así que sin
  // ella no hay dónde montarlas — y entonces la guarda de (2) es lo que las para.
  const conDescargas =
    opciones.artefactos === undefined
      ? conArtefactos
      : backendConDescargas(conArtefactos, opciones.artefactos.carpeta);
  // Y `/hotswap/`, de la MISMA carpeta de sesión y por el mismo motivo que las descargas: lo
  // que una shell saca del contexto se tiene que poder releer, y no se anuncia.
  const conHotswap =
    opciones.artefactos === undefined
      ? conDescargas
      : backendConHotswap(conDescargas, opciones.artefactos.carpeta);
  const conAdjuntos =
    opciones.adjuntos === undefined ? conHotswap : backendConAdjuntos(conHotswap, opciones.adjuntos);
  /**
   * Los PLANES van SIEMPRE, sin depender de la sesión: cuelgan del repo local
   * (`.xonecode/planes/`) y no de la carpeta de una sesión, porque un plan se escribe un día y
   * se implementa otro. Es la diferencia con los artefactos, que mueren con su sesión.
   */
  const conPlanes = backendConPlanes(conAdjuntos, opciones.raiz);
  /**
   * Y el aviso de las rutas de MÁQUINA, que no monta nada.
   *
   * Hubo aquí un montaje de `/` bajo `/disco/` y **rompió un turno de producción**: con la
   * máquina entera dentro del `CompositeBackend`, toda operación recursiva sin ruta la
   * recorría — un `grep` sobre el PROYECTO tardaba 30 s y moría con
   * `EPERM … scandir '/Volumes/com.apple.TimeMachine.localsnapshots'`. Lo que hacía falta no
   * era navegar el disco sino TRAERSE un fichero, y eso lo hace la tool
   * `traer_de_la_maquina`. Aquí solo queda contestar bien a quien escriba la ruta a pelo.
   */
  /**
   * **Las escrituras van en serie POR RUTA, y va UNA vez, aquí: por fuera de TODO lo montado.**
   *
   * `write` y `edit` son leer-modificar-escribir sobre el fichero entero, así que dos a la vez
   * se pisan y las DOS contestan que bien. La cola vivía dentro de la pila del PROYECTO, y
   * `/artefactos/` y `/planes/` se montan fuera de ella: no la heredaban. Medido (24-09-2026,
   * MyAllXOne): el diseñador pidió en cinco respuestas seguidas 2, 2, 2, 2 y 5 ediciones del
   * MISMO HTML a la vez, y el artefacto acabó con tres copias de su `</footer></body></html>`
   * detrás del cierre —dos escrituras que truncan el mismo fichero dejan la cola de la larga
   * tras el final de la corta—. Aquí la alcanza cualquier ruta, incluida la carpeta que alguien
   * monte mañana, que es lo que una cola por montaje no podía prometer.
   *
   * Sigue por FUERA de `sinContenidoInvalido` —leer, validar y escribir son un solo turno— y
   * ahora también de las guardas de ruta: una escritura que van a rechazar espera su turno antes
   * de oír el no, que es un coste de milisegundos a cambio de un solo sitio. Solo `write` y
   * `edit`: serializar lecturas no arreglaría nada.
   */
  const enSerie = escriturasEnSerie(conPlanes);
  const conDisco = conAvisoDeRutaDeMaquina(enSerie);
  // Lo que deje un COMANDO en la carpeta de artefactos también se anuncia. Sin esto, la
  // captura que escribe un script existe en el disco y no existe para nadie: el evento
  // `artefacto` lo emite el Proxy de `write`/`edit`, y una shell no pasa por ahí.
  return opciones.ejecucion === undefined || opciones.artefactos === undefined
    ? conDisco
    : anunciarArtefactosDeLaShell(conDisco, opciones.artefactos.carpeta, opciones.artefactos.alEscribir);
}

/**
 * Anuncia lo que un COMANDO deja en la carpeta de artefactos.
 *
 * El evento `artefacto` —«hay un diagrama de 42 KB y se llama así», nunca el contenido— lo
 * emite hoy el Proxy de `backendConArtefactos`, que envuelve `write` y `edit`. Una shell no
 * llama a ninguna de las dos: escribe en el disco de verdad. Así que sin esto, una captura
 * dejada por un script no sale en la pestaña Artefactos ni en el hilo, y el subagente tendría
 * que decir «he dejado una captura» sin que nada lo respalde — que es la clase de afirmación
 * que este harness no quiere.
 *
 * **Se compara una FOTO de antes con una de después** (ruta relativa → tamaño + mtime) en
 * vez de fiarse de lo que el comando diga que hizo. Un comando puede escribir tres ficheros,
 * o ninguno, o pisar el de antes; lo único que lo sabe es la carpeta.
 *
 * **Y la foto es RECURSIVA, porque un `unzip` deja un ÁRBOL y no un fichero.** Era
 * `readdirSync` a secas más un `isFile()`, o sea que una carpeta se saltaba entera y con
 * ella todo lo que llevara dentro. Medido sobre una sesión real: el zip de una maqueta se
 * descomprimió en `/artefactos/stitch-restaurantes/stitch_screen_complex/` y salieron CERO
 * anuncios — los tres ficheros estaban en el disco y no existían para nadie, sin pestaña
 * Artefactos (solo existe si hay alguno) y sin tarjeta en el hilo. Es el mismo fallo que la
 * carpeta sin crear, un escalón más adentro. No se baja por un ENLACE: `Dirent.isDirectory()`
 * es falso para uno, y lo que cuelgue de él no es lo que esta sesión produjo.
 *
 * Lo que la recursión hace aparecer también se filtra, y las dos cribas son la misma idea:
 * **no anunciar lo que acaba en una tarjeta muerta**. `esRutaDeArtefacto` es la barrera que
 * el LECTOR aplica, así que un nombre que él rechazaría (`Diseño final.png`) pintaría una
 * fila cuyo único final es un 403; y `esBasuraDeArtefacto` retira el `__MACOSX/._x.png` que
 * un zip de Finder arrastra, que tiene la extensión del bueno y doscientos bytes dentro.
 *
 * **Y la carpeta se CREA aquí, antes de correr el comando.** Es la excepción a «no se crea
 * al montar», y la pagó una captura: `$XONECODE_ARTEFACTOS` la crea `FilesystemBackend.write`
 * la primera vez que el agente escribe un artefacto por una TOOL, y una shell no pasa por
 * ahí — así que en una sesión que no había dibujado nada, el `writeFileSync` del script de
 * captura reventaba con ENOENT (reproducido) y el modelo se replegaba a dejar el `.png` en
 * la raíz del proyecto, que es justo lo que la regla existe para impedir. El sitio es este y
 * no el script: quien SABE que va a correr una shell y DÓNDE está la carpeta es el harness,
 * y arreglarlo en el script lo dejaría arreglado en uno de cinco —y en ninguna skill del
 * usuario—, que es el patrón de fallo de siempre. Se crea solo cuando hay ejecución, así que
 * una sesión de los otros cuatro especialistas sigue sin carpeta vacía.
 */
export function anunciarArtefactosDeLaShell<T extends object>(
  backend: T,
  carpeta: string,
  alEscribir: (artefacto: Artefacto) => void,
): T {
  const foto = (): Map<string, string> => {
    const m = new Map<string, string>();
    const recorrer = (dir: string, prefijo: string): void => {
      let entradas: Dirent[];
      try {
        entradas = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entrada of entradas) {
        // La clave se compone con `/` y nunca con `sep`: es la ruta VIRTUAL que se va a
        // anunciar, y una barra invertida de Windows no pasaría `esRutaDeArtefacto`.
        const relativa = prefijo + entrada.name;
        // `isDirectory()` sobre un `Dirent` es FALSO para un enlace —el dirent dice
        // `isSymbolicLink()`—, así que no se baja por él. Es la misma disciplina que el
        // árbol de Ficheros, y aquí importa igual: lo que cuelga de un enlace no es lo que
        // esta sesión produjo, y se anunciaría con ruta de artefacto.
        if (entrada.isDirectory()) {
          recorrer(join(dir, entrada.name), relativa + "/");
          continue;
        }
        if (!entrada.isFile()) continue;
        try {
          const e = statSync(join(dir, entrada.name));
          m.set(relativa, `${e.size}:${e.mtimeMs}`);
        } catch {
          // Un fichero que desaparece entre el listado y la medida no es un artefacto nuevo.
        }
      }
    };
    recorrer(carpeta, "");
    return m;
  };

  return new Proxy(backend, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;
      if (prop !== "execute") return (valor as (...a: unknown[]) => unknown).bind(destino);

      return async (...args: unknown[]) => {
        try {
          // Antes de la foto: si el comando es el que escribe la captura, la carpeta tiene
          // que existir YA. Un fallo al crearla no puede tumbar el comando —se podía correr
          // sin carpeta antes de esto—, así que se traga y la foto sigue tolerando su
          // ausencia.
          mkdirSync(carpeta, { recursive: true });
        } catch {
          // Sin carpeta no hay artefactos que anunciar, y el comando no es asunto suyo.
        }
        const antes = foto();
        try {
          return await (valor as (...a: unknown[]) => unknown).apply(destino, args);
        } finally {
          // En el `finally`: un comando que acaba en error puede haber dejado el fichero, y
          // un fallo al listar la carpeta no puede llevarse por delante el resultado.
          try {
            for (const [relativa, marca] of foto()) {
              if (antes.get(relativa) === marca) continue;
              const ruta = RUTA_ARTEFACTOS + relativa;
              // Lo que el LECTOR rechazaría no se anuncia: su barrera es la lista blanca de
              // forma de `esRutaDeArtefacto`, y una shell escribe el nombre que quiera. Una
              // tarjeta cuyo único final posible es un 403 es la misma mentira que un modal
              // que solo puede acabar en rechazo.
              if (!esRutaDeArtefacto(ruta) || esBasuraDeArtefacto(relativa)) continue;
              // Se compone igual que el Proxy de `write`/`edit`: la RUTA lleva el camino
              // relativo —es lo que después se le pide al lector— y el `nombre` es el
              // último segmento, que es lo que se le enseña a una persona.
              const nombre = nombreDeArtefacto(ruta);
              const mime = mimeDeArtefacto(nombre);
              const bytes = Number(marca.split(":")[0] ?? 0);
              alEscribir({ ruta, nombre, bytes, ...(mime === undefined ? {} : { mime }) });
            }
          } catch {
            // Un artefacto que no se pudo anunciar no invalida el comando.
          }
        }
      };
    },
  }) as T;
}

/**
 * Expone la memoria del proyecto sin abrir la carpeta interna `.xonecode`.
 *
 * Los permisos siguen denegando esa carpeta completa (puede contener configuración), pero
 * esta única ruta virtual permite al agente conservar decisiones aprobadas entre sesiones.
 */
export function exponerMemoriaDeProyecto<T extends object>(backend: T): T {
  const rutaReal = (ruta: unknown): unknown => ruta === RUTA_MEMORIA_VIRTUAL ? RUTA_MEMORIA_INTERNA : ruta;

  return new Proxy(backend, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;

      if (prop === "read" || prop === "readRaw" || prop === "write" || prop === "edit") {
        return async (...args: unknown[]) => {
          args[0] = rutaReal(args[0]);
          return (valor as (...a: unknown[]) => unknown).apply(destino, args);
        };
      }

      return (valor as (...a: unknown[]) => unknown).bind(destino);
    },
  }) as T;
}

/**
 * El motivo con el que se rechaza escribir un artefacto en el proyecto.
 *
 * Mismo criterio que `porQueNo`: rechazar y EXPLICAR. Un error seco haría que el modelo
 * probara otra ruta —o que diera el trabajo por hecho—; diciéndole la ruta buena, corrige a
 * la primera. Y nombra las tres consecuencias porque son el porqué: sin ellas, «usa otra
 * carpeta» se lee como una preferencia de estilo.
 */
export const porQueNoAhi = (ruta: string, destino: string): string =>
  `«${ruta}» está en el PROYECTO, y un artefacto ahí acaba dentro de la app XOne del usuario: ` +
  `pasa por aprobación humana, entra en git y sube a CloudStudio. ` +
  `Los artefactos van en «${destino}», la carpeta de ESTA sesión: se escribe sin aprobación, ` +
  `no entra en git y no sale de aquí. Escríbelo ahí.`;

/**
 * Envuelve el backend del proyecto para que un artefacto NO se pueda escribir dentro.
 *
 * **Por qué es código y no una frase más en el prompt.** La carpeta buena ya la nombran los
 * cuatro sitios que el modelo puede leer, y aun así, medido el 2026-09-07 en dos
 * delegaciones consecutivas del mismo proyecto: la primera escribió
 * `/artifacts/login_flow.html` —la raíz— y la segunda `/artefactos/diagrama.html`. Con la
 * instrucción puesta en los cuatro sitios, añadir un quinto no cambia nada; lo que cambia es
 * que la regla deje de depender de que el modelo la recuerde. Es exactamente el argumento de
 * `sinVistasAplanadas`, y también el de los avisos de honestidad: en este repo lo que tiene
 * que cumplirse es código.
 *
 * Va sobre el backend del PROYECTO, por dentro del compuesto, así que una escritura en
 * `/artefactos/` —que es otra raíz montada— no pasa por aquí y no se ve afectada.
 *
 * **Solo `write` y `edit`.** Leer un artefacto mal puesto de una sesión anterior tiene que
 * seguir funcionando: si no, el agente no podría ni mirar lo que hay que mover. Y borrarlo
 * tampoco se toca — quitar de la app del cliente un diagrama que no debería estar ahí es
 * justo lo que se quiere poder hacer.
 */
export function sinArtefactosEnElProyecto<T extends object>(backend: T): T {
  const motivo = (ruta: unknown): string | undefined => {
    if (typeof ruta !== "string") return undefined;
    // `/artefactos/` en el backend del PROYECTO = el montaje falta (`core/artefactos.ts`): se
    // rechaza en vez de escribirlo en la app del cliente, que es lo que pasaba y sin aprobación.
    if (artefactoSinMontar(ruta)) {
      return `\`${RUTA_ARTEFACTOS}\` no está disponible en esta sesión, y no se escribe en el proyecto en su lugar: ahí sería un fichero de la app del cliente. Entrega el resultado en tu respuesta.`;
    }
    const destino = artefactoFueraDeSitio(ruta);
    return destino === undefined ? undefined : porQueNoAhi(ruta, destino);
  };

  return new Proxy(backend, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;
      if (prop !== "write" && prop !== "edit") {
        return (valor as (...a: unknown[]) => unknown).bind(destino);
      }
      return async (...args: unknown[]) => {
        // **Se DEVUELVE `{error}`, no se lanza**, y esta es la diferencia entre corregir al
        // modelo y tumbarle el turno. Leído en deepagents 1.13.2: los cuatro tools de
        // fichero hacen `const result = await backend.write(...); if (result.error) return
        // result.error`, así que un error DEVUELTO vuelve al modelo como resultado de la
        // tool y puede reintentar. Un `throw` se sale de la tool y se lleva el turno por
        // delante — medido en vivo el 2026-09-07: el mensaje salió impecable en el chat, el
        // fichero no se escribió, y el agente no reintentó porque el turno ya había muerto.
        const porQue = motivo(args[0]);
        if (porQue !== undefined) return { error: porQue };
        return (valor as (...a: unknown[]) => unknown).apply(destino, args);
      };
    },
  }) as T;
}

/** ¿Es `ruta` una vista aplanada, teniendo a la vista el conjunto de ficheros del proyecto? */
export function esVistaAplanada(ruta: string, todas: ReadonlySet<string>): boolean {
  return ruta.endsWith(".xml") && todas.has(`${ruta.slice(0, -4)}.xne`);
}

/**
 * El mensaje con el que se rechaza tocar una vista aplanada.
 *
 * **Rechazar y explicar, no fallar en seco.** Un «fichero no encontrado» hace que el modelo
 * pruebe otra ruta, o peor, que dé por hecho que el cambio no hacía falta. Diciéndole dónde
 * está la fuente puede corregir — pero solo si el mensaje LLEGA, y para eso hay que
 * devolverlo como `{error}` y no lanzarlo (ver `sinVistasAplanadas`).
 */
export const porQueNo = (ruta: string): string =>
  `«${ruta}» es una vista APLANADA que genera XOne Studio a partir de «${ruta.slice(0, -4)}.xne». ` +
  `No se lee ni se edita: los cambios se hacen en el .xne y Studio regenera esta. ` +
  `Abre «${ruta.slice(0, -4)}.xne».`;

/**
 * Envuelve un backend para que las vistas aplanadas no existan para el agente.
 *
 * **Por qué no basta con decirlo en el prompt.** La regla ya vivía ahí en el harness
 * anterior, solo en el del ejecutor, y falló por donde tenía que fallar: *un permiso solo
 * protege a quien lo choca*. El planner planificaba sobre el `.xml` y el juez exigía el
 * cambio ahí — ninguno de los dos podía conocer una regla que vivía en otro prompt.
 * Retirarlas del backend la convierte en una propiedad del PROYECTO, no de un prompt.
 *
 * **Se ocultan, no se borran.** El disco es del usuario. (El harness con MCP sí las
 * borraba de su copia, pero aquella copia era suya y se tiraba al final.)
 *
 * `app.xml` no tiene hermano `.xne`, así que el propio predicado lo conserva: es fuente.
 */
export function sinVistasAplanadas<T extends object>(backend: T, todas: ReadonlySet<string>): T {
  const motivo = (ruta: unknown): string | undefined =>
    typeof ruta === "string" && esVistaAplanada(ruta, todas) ? porQueNo(ruta) : undefined;

  return new Proxy(backend, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;

      // Las que reciben una ruta y la tocan: se rechazan con explicación.
      if (prop === "read" || prop === "readRaw" || prop === "write" || prop === "edit" || prop === "delete") {
        return async (...args: unknown[]) => {
          // **Devolver `{error}` y no lanzar.** Esto LANZABA, y el comentario de al lado
          // prometía que así el modelo «corrige a la primera» — que era falso y no estaba
          // medido. Leído en deepagents 1.13.2, los cuatro tools de fichero comprueban
          // `result.error` y lo devuelven al modelo; una excepción, en cambio, se sale de la
          // tool y se lleva el turno. Medido en vivo con la guarda hermana
          // (`sinArtefactosEnElProyecto`): mensaje impecable en el chat, fichero no escrito,
          // y ningún reintento porque el turno ya había muerto.
          const porQue = motivo(args[0]);
          if (porQue !== undefined) return { error: porQue };
          return (valor as (...a: unknown[]) => unknown).apply(destino, args);
        };
      }

      // Las que LISTAN: se filtra el resultado, para que ni aparezcan.
      if (prop === "ls" || prop === "grep") {
        return async (...args: unknown[]) => {
          const r = await (valor as (...a: unknown[]) => Promise<unknown>).apply(destino, args);
          return filtrarResultado(r, todas);
        };
      }

      return (valor as (...a: unknown[]) => unknown).bind(destino);
    },
  }) as T;
}

/**
 * Quita las vistas aplanadas de lo que devuelve un `ls`/`grep`.
 *
 * La forma del resultado varía entre versiones de la librería, así que se filtra lo que se
 * reconoce y lo que no se deja pasar TAL CUAL: perder resultados en silencio sería peor que
 * enseñar un `.xml` de más, y esto no es la barrera —la barrera es la guarda de arriba—.
 */
function filtrarResultado(r: unknown, todas: ReadonlySet<string>): unknown {
  const quita = (v: unknown): boolean => typeof v === "string" && esVistaAplanada(v, todas);
  if (Array.isArray(r)) return r.filter((v) => !quita(v));
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    const salida: Record<string, unknown> = { ...o };
    for (const clave of ["files", "matches", "paths", "results", "entries"]) {
      if (Array.isArray(o[clave])) {
        salida[clave] = (o[clave] as unknown[]).filter((v) => {
          if (quita(v)) return false;
          if (v && typeof v === "object") {
            const f = (v as Record<string, unknown>).file ?? (v as Record<string, unknown>).path;
            return !quita(f);
          }
          return true;
        });
      }
    }
    return salida;
  }
  return r;
}
