import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Agente } from "../../core/agentes.js";
import { artefactoFueraDeSitio, esRutaDeArtefacto, RUTA_ARTEFACTOS } from "../../core/artefactos.js";
import { NOMBRE_INCORPORAR_ADJUNTO, nombreDeAdjuntoAceptable, RUTA_ADJUNTOS } from "../../core/adjuntos.js";
import { esRutaDePlan, RUTA_PLANES } from "../../core/planes.js";
import { RUTA_HOTSWAP } from "../../core/hotswap.js";
import { RUTA_HISTORIAL_DE_MENSAJES, RUTA_RESULTADOS_GRANDES } from "../../core/descargas.js";
import { RUTA_MEMORIA_VIRTUAL } from "../../core/memoria.js";
import { dentroDeCarpeta, puedeEscribirRuta, type QuienDecidePermisos } from "./perfiles.js";
import { esVistaAplanada, porQueNo } from "./proyecto.js";

export { NOMBRE_INCORPORAR_ADJUNTO };

/**
 * Meter un ADJUNTO del chat en el PROYECTO (IXCODE-7): «pon este icono en el menú».
 *
 * ## Por qué es una tool y no un `read_file` + `write_file`
 *
 * Las tools de fichero son de TEXTO (`write(filePath, content: string)`), y un PNG no
 * sobrevive a esa ida y vuelta: lleva ceros en su cabecera y se copiaría corrupto sin que nadie
 * se enterara hasta abrir la app. Es el mismo reparto que `copiar_artefacto`: el harness copia
 * los BYTES porque el agente no puede, y darle una shell para eso sería peor que el problema.
 *
 * ## Por qué pasa por la APROBACIÓN, y `copiar_artefacto` no
 *
 * `copiar_artefacto` es del documentador, confinado por `escribeEn` a `/doc/`. Ésta es de quien
 * escribe el proyecto ENTERO, así que el destino puede ser cualquier fichero de la app —también
 * uno que ya existe, que se REEMPLAZA—. Eso es exactamente lo que `write_file` no hace sin que
 * alguien lo apruebe, y una tool que lo hiciera sería la puerta trasera de la aprobación. Por
 * eso va en el HITL por su NOMBRE, en los dos motores (`perfiles.ts#hitlDe`, las capacidades de
 * TrueForge), y por eso el destino se llama `file_path`: es la clave que leen `seDetieneEn`, la
 * tarjeta (`interrupts.ts#ficheroDe`) y el modo autónomo al anotar la ruta.
 *
 * ## Las guardas, reaplicadas A MANO
 *
 * Una tool propia no pasa por el middleware de permisos ni por la pila del backend: escribe al
 * disco directo. Así que lo que ahí es gratis aquí hay que decirlo:
 *
 * 1. **El ORIGEN es un adjunto de verdad**: un nombre de la lista BLANCA de forma
 *    (`nombreDeAdjuntoAceptable`), no un `startsWith` — sin eso sería `/adjuntos/../.env`.
 * 2. **El DESTINO lo puede escribir ESTE agente** (`puedeEscribirRuta`), y no es un sitio de
 *    artefacto equivocado (`artefactoFueraDeSitio`).
 * 3. **El destino es el PROYECTO**: ni `/artefactos/`, ni `/planes/`, ni `/adjuntos/`, ni
 *    `/skills/`, ni los otros montajes del backend (`/hotswap/`, las descargas de deepagents,
 *    `/MEMORIA_PROYECTO.md`). Detrás de esas rutas el backend tiene OTRA carpeta; esta tool
 *    escribiría en la del proyecto un fichero con ese nombre. Y es además lo que sostiene a
 *    `seDetieneEn`: por `/artefactos/` y `/planes/` NO se pregunta, así que la única barrera ahí
 *    es este rechazo (`incorporarAdjunto.test.ts` lo ata ruta a ruta).
 * 4. **Ni una vista APLANADA** (`X.xml` con su `X.xne`): la regla es del proyecto, no del
 *    backend por el que esta tool no pasa.
 * 5. **Y todo, dos veces: por TEXTO y por `realpath`**, como `copiar_artefacto` y las escrituras
 *    de los motores externos. En APFS `.XONECODE` abre `.xonecode`, y un enlace dentro de la raíz
 *    puede apuntar fuera. **A diferencia de `copiar_artefacto`, la contención se comprueba ANTES
 *    de crear carpetas**: sobre el primer ancestro que existe, para que un destino que sale del
 *    proyecto no deje un árbol vacío fuera. El fichero final, si existe, no puede ser un enlace:
 *    escribir lo seguiría.
 *
 * Todo rechazo se DEVUELVE como texto, nunca se lanza (un `throw` se lleva el turno), y de un
 * error de Node solo viaja su `code`: su mensaje lleva la ruta de la máquina.
 */

/**
 * Quién la recibe: escribe el PROYECTO y no está confinado por `escribeEn`. Regla de DATO, no una
 * lista de nombres: de los de serie da `designer-xone` y `developer-xone`, que es lo que se
 * decidió. Quien ejecuta no: la shell ya se le quitó el `write_file` para que tocar el proyecto
 * siga siendo el camino del diff. Y quien va acotado por `escribeEn` (el documentador) tiene
 * `copiar_artefacto` para lo suyo.
 *
 * **Solo llega a `motor: "modelo"`**, sin que esta función lo mire: los de motor externo se montan
 * aparte y no reciben tools propias (corren en otro proceso), y tampoco ven `/adjuntos/`: es una
 * ruta virtual de nuestro backend. El inventario que lee el orquestador lo dice
 * (`core/adjuntos.ts#conAdjuntos`).
 */
export function recibeIncorporarAdjunto(a: Pick<Agente, "soloLectura" | "ejecucion" | "escribeEn">): boolean {
  return !a.soloLectura && a.ejecucion !== true && (a.escribeEn ?? []).length === 0;
}

const Entrada = z.object({
  adjunto: z
    .string()
    .describe("El adjunto, por su ruta /adjuntos/<nombre> (la que dice el mensaje) o su nombre a secas"),
  file_path: z
    .string()
    .describe("Dónde va en el PROYECTO, ruta virtual con su nombre de fichero (p. ej. /icons/ic_add.png). Pide aprobación."),
});

export interface DondeIncorporar {
  /** La raíz REAL del proyecto en disco. */
  raiz: string;
  /** La carpeta REAL de adjuntos de esta sesión (o tarea). Puede no existir todavía. */
  carpetaDeAdjuntos: string;
  /** De quién son los permisos que hay que reaplicar. */
  perfil: QuienDecidePermisos;
}

/** Los montajes del backend: detrás de estas rutas NO está el proyecto. */
const MONTAJES = [
  RUTA_ARTEFACTOS,
  RUTA_PLANES,
  RUTA_ADJUNTOS,
  "/skills/",
  RUTA_HOTSWAP,
  RUTA_RESULTADOS_GRANDES,
  RUTA_HISTORIAL_DE_MENSAJES,
];

/**
 * ¿Por qué no vale `ruta` como destino, mirando SOLO el texto? `undefined` = vale.
 *
 * Se aplica dos veces: a lo que escribió el modelo y a la ruta que sale del `realpath`.
 * Todo se compara también sin mayúsculas (APFS: `/Adjuntos/` es la misma carpeta en disco).
 */
function motivoDeDestino(perfil: QuienDecidePermisos, ruta: string): string | undefined {
  // Y en MINÚSCULAS: `puedeEscribirRuta` distingue mayúsculas y APFS no, así que `/.ENV` pasaba el
  // texto y, sin `.env` en disco, tampoco lo paraba el `realpath` (no hay nombre que corregir):
  // el `.ENV` que se creaba ES el `.env`. Medido: `/.ENV`, `/.Env.local` y `/.GIT/config` contestaban
  // «Incorporado» sobre una raíz sin ellos. Negar de más en un sistema que sí distingue es barato.
  if (!puedeEscribirRuta(perfil, ruta) || !puedeEscribirRuta(perfil, ruta.toLowerCase())) {
    return `No puedes escribir en «${ruta}».`;
  }
  if (artefactoFueraDeSitio(ruta) !== undefined) {
    return `«${ruta}» no vale como destino: esa carpeta es la de los artefactos, no la del proyecto.`;
  }
  const minusculas = ruta.toLowerCase();
  if (
    esRutaDeArtefacto(ruta)
    || esRutaDePlan(ruta)
    || minusculas === RUTA_MEMORIA_VIRTUAL.toLowerCase()
    || MONTAJES.some((m) => dentroDeCarpeta(minusculas, m.replace(/\/$/, "")))
  ) {
    return `«${ruta}» no es una ruta del proyecto. Un adjunto se incorpora a una carpeta de la app, como /icons/.`;
  }
  return undefined;
}

/** `ic.png` y `/adjuntos/ic.png` son lo mismo: se admite lo que el modelo escriba. */
function nombreDelAdjunto(entrada: string): string {
  const limpia = entrada.trim();
  return limpia.startsWith(RUTA_ADJUNTOS) ? limpia.slice(RUTA_ADJUNTOS.length) : limpia.replace(/^\/+/, "");
}

/** ¿Está `real` dentro de `base` (los dos ya reales)? Por SEGMENTO: `/a/bc` no pasa por `/a/b`. */
function dentroDe(real: string, base: string): boolean {
  return real === base || real.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

/** La ruta VIRTUAL de un camino real que ya se sabe dentro de la raíz real. */
function comoVirtual(real: string, raizReal: string): string {
  const rel = relative(raizReal, real);
  return rel === "" ? "/" : `/${rel.split(sep).join("/")}`;
}

/** De un error de Node, solo su `code`: el mensaje lleva la ruta absoluta. */
function codigoDe(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : error instanceof Error ? error.name : "error";
}

/** ¿Existe `ruta` como entrada del directorio, sin seguir un enlace? */
function existeSinSeguir(ruta: string): boolean {
  try {
    lstatSync(ruta);
    return true;
  } catch {
    return false;
  }
}

/**
 * ¿Es `virtual` una vista APLANADA en el disco de `raiz`? `esVistaAplanada` pide el inventario
 * del proyecto; aquí basta con preguntarle al disco por la ÚNICA fuente que la haría aplanada,
 * su `.xne` al lado.
 */
function aplanadaEnDisco(raiz: string, virtual: string): boolean {
  const fuente = `${virtual.slice(0, -4)}.xne`;
  return esVistaAplanada(virtual, new Set(existsSync(resolve(raiz, fuente.slice(1))) ? [fuente] : []));
}

export function crearIncorporarAdjunto(donde: DondeIncorporar) {
  return tool(
    async ({ adjunto, file_path }: z.infer<typeof Entrada>) => {
      // (1) El origen, por su FORMA.
      const nombre = nombreDelAdjunto(adjunto);
      if (!nombreDeAdjuntoAceptable(nombre)) {
        return `«${adjunto}» no es un adjunto de esta conversación. Solo se incorpora lo que está en ${RUTA_ADJUNTOS}.`;
      }
      const origenVirtual = `${RUTA_ADJUNTOS}${nombre}`;

      // (2-4) El destino, por su TEXTO. Segmentos vacíos, `.` y `..` fuera de entrada: el
      // `realpath` de después también los pararía, pero un destino que dice una cosa y resuelve
      // a otra no debería llegar ni a la tarjeta de aprobación con un nombre engañoso.
      const destinoVirtual = file_path.trim().startsWith("/") ? file_path.trim() : `/${file_path.trim()}`;
      const segmentos = destinoVirtual.slice(1).split("/");
      if (
        destinoVirtual.endsWith("/")
        || destinoVirtual.includes("\\")
        || destinoVirtual.includes("\0")
        || segmentos.some((s) => s === "" || s === "." || s === "..")
      ) {
        return `«${file_path}» no es una ruta de fichero válida. Da la ruta completa con su nombre, como /icons/ic_add.png.`;
      }
      const porTexto = motivoDeDestino(donde.perfil, destinoVirtual);
      if (porTexto !== undefined) return porTexto;
      const destinoReal = resolve(donde.raiz, destinoVirtual.slice(1));
      if (aplanadaEnDisco(donde.raiz, destinoVirtual)) return porQueNo(destinoVirtual);

      // (5a) El origen, por su CAMINO real. La carpeta puede no existir aún: eso es «no existe».
      const origenReal = resolve(donde.carpetaDeAdjuntos, nombre);
      // El tamaño se toma AQUÍ, del origen ya comprobado: medirlo en el destino después de copiar
      // sería una llamada fuera del `try` que, en una carrera, rompería «nunca lanza».
      let bytes: number;
      try {
        const st = lstatSync(origenReal);
        bytes = st.size;
        if (!st.isFile()) return `«${origenVirtual}» no es un fichero adjunto.`;
        if (!dentroDe(realpathSync.native(origenReal), realpathSync.native(donde.carpetaDeAdjuntos))) {
          return `«${origenVirtual}» apunta fuera de la carpeta de adjuntos.`;
        }
      } catch {
        return `No existe el adjunto «${origenVirtual}». Lista ${RUTA_ADJUNTOS} para ver cuáles hay.`;
      }

      // (5b) El destino, por su CAMINO real, ANTES de crear nada: el primer ancestro que existe
      // tiene que caer dentro de la raíz, y lo que resulta se vuelve a juzgar como ruta virtual
      // (un enlace `/icons` → `.xonecode/` pasa el texto y no esto).
      let raizReal: string;
      try {
        raizReal = realpathSync.native(donde.raiz);
        let ancestro = dirname(destinoReal);
        const faltan: string[] = [];
        while (!existeSinSeguir(ancestro)) {
          const padre = dirname(ancestro);
          if (padre === ancestro) return `«${destinoVirtual}» apunta fuera del proyecto.`;
          faltan.unshift(ancestro.slice(padre.length).replace(/^[\\/]+/, ""));
          ancestro = padre;
        }
        const ancestroReal = realpathSync.native(ancestro);
        if (!dentroDe(ancestroReal, raizReal) || !statSync(ancestroReal).isDirectory()) {
          return `«${destinoVirtual}» apunta fuera del proyecto.`;
        }
        // El fichero final, si ya está, no puede ser un enlace (se seguiría) ni una carpeta.
        let finalReal = resolve(ancestroReal, ...faltan, basename(destinoReal));
        if (existeSinSeguir(destinoReal)) {
          const st = lstatSync(destinoReal);
          if (st.isSymbolicLink() || !st.isFile()) return `«${destinoVirtual}» ya existe y no es un fichero normal: no se reemplaza.`;
          finalReal = realpathSync.native(destinoReal);
        }
        if (!dentroDe(finalReal, raizReal)) return `«${destinoVirtual}» apunta fuera del proyecto.`;
        const virtualReal = comoVirtual(finalReal, raizReal);
        const porCamino = motivoDeDestino(donde.perfil, virtualReal);
        if (porCamino !== undefined) return porCamino;
        // Y la vista aplanada, también sobre el camino REAL: un enlace `/v` → `/pantallas`
        // convierte `/v/menu.xml` en `/pantallas/menu.xml`, que el texto no ve.
        if (aplanadaEnDisco(raizReal, virtualReal)) return porQueNo(virtualReal);
      } catch (error) {
        return `No se pudo comprobar la ruta «${destinoVirtual}» (${codigoDe(error)}).`;
      }

      try {
        mkdirSync(dirname(destinoReal), { recursive: true });
        // Leer y escribir, y no `copyFileSync`: ése copia también el MODO, y un adjunto se guarda
        // 0600 (es de la sesión), así que el fichero del proyecto nacería legible solo por su
        // dueño — y así entraría en git. Con `mode: 0o644` un fichero NUEVO nace con el modo
        // normal (0644 menos la umask del proceso); uno que ya existía conserva el suyo.
        writeFileSync(destinoReal, readFileSync(origenReal), { mode: 0o644 });
      } catch (error) {
        return `No se pudo incorporar «${origenVirtual}» (${codigoDe(error)}).`;
      }
      return `Incorporado ${origenVirtual} → ${destinoVirtual} (${bytes} bytes). Ya es un fichero del proyecto.`;
    },
    {
      name: NOMBRE_INCORPORAR_ADJUNTO,
      description:
        "Copia un ADJUNTO que la persona anexó en el chat (/adjuntos/…) a una ruta del PROYECTO"
        + " —un icono a /icons/, una imagen—. Copia los bytes tal cual (sirve para binarios, que"
        + " write_file no puede escribir). Si el destino ya existe, lo reemplaza. Pasa por la"
        + " aprobación de la persona.",
      schema: Entrada,
    },
  );
}
