import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { imagenReferida, type ImagenReferida } from "../../core/referenciasDeImagen.js";
import type { Papel } from "../../core/ports.js";
import { ErrorDelJuezVisual, type InvocarVisual } from "../dispositivos/juezVisual.js";
import { NOMBRE_TRAER } from "./traerDeLaMaquina.js";

/**
 * `describe_image`: que el agente VEA una imagen (IXCODE-23).
 *
 * ## Por qué existe, medido
 *
 * Con una imagen adjunta, el agente contestaba «en este harness no tengo visión» sin abrirla. Dos
 * causas, las dos nuestras: el aviso de adjuntos se lo DECÍA («no hay visión en este harness
 * todavía»), y el `read_file` de TrueForge devolvía «fichero binario» ante un PNG. Pero el modelo sí
 * ve: medido contra la API, `deepseek-flash` nombró el color de un cuadrado liso y describió bien un
 * icono adjunto («un círculo negro con un símbolo de suma blanco»). No faltaba la visión, faltaba el
 * camino hasta ella.
 *
 * ## Por qué una llamada APARTE y no la imagen en la conversación
 *
 * - En un API compatible con OpenAI, el resultado de una tool es TEXTO: una imagen devuelta por
 *   `read_file` no le llega al modelo como imagen. La única entrada sería un mensaje de usuario falso.
 * - Una imagen en el historial se PAGA en cada llamada siguiente (se cobra por píxeles, no por bytes),
 *   y se quedaría en la foto de TrueForge y en la traza. Una descripción se paga UNA vez y es texto.
 *
 * Es el camino que ya usa `xone_critica_visual` (`invocarVisualConModelos`), con otra pregunta: el
 * crítico JUZGA una pantalla, ésta DESCRIBE lo que haya.
 *
 * ## Las guardas
 *
 * La MISMA regla de ruta que las maquetas del crítico (`imagenReferida`, lista blanca de forma, sin
 * dotfiles) y la misma lectura (`lectorDeReferencias`, texto y `realpath`): una tool de LangChain
 * añadida por xonecode no pasa por el middleware de permisos, así que sin esto mandaría a un modelo
 * cualquier fichero de la máquina. Todo rechazo se DEVUELVE, nunca se lanza. De un error de lectura
 * solo cruza el `code` (su mensaje lleva la ruta absoluta).
 *
 * **Acepta también la ruta COMPLETA de la máquina** (petición suya: es la que el agente ve a veces en
 * un error o la que pega la persona), pero solo si cae dentro de lo montado —el proyecto, los adjuntos
 * y los artefactos de la sesión—: se TRADUCE a su ruta virtual y pasa por la misma regla. Fuera de ahí
 * se rechaza con el camino (`traer_de_la_maquina` y después esta), para que no sea una forma de mandar
 * a un modelo cualquier fichero de la máquina.
 *
 * **Límite declarado**: un modelo SIN visión puede no fallar y describir lo que no recibió. La
 * respuesta dice que la descripción es de un modelo, y quien la lee no debe darla por medida.
 */
export const NOMBRE_DESCRIBIR_IMAGEN = "describe_image";

/** El papel del modelo que mira. `afilado` es del juez (`core/modelos.ts`); describir es trabajo. */
export const PAPEL_DE_DESCRIBIR: Papel = "trabajo";

/** Tope de bytes de la imagen: una captura de pantalla son cientos de KB; esto para un fichero absurdo antes de mandarlo. */
export const TOPE_DE_BYTES_DE_IMAGEN = 10 * 1024 * 1024;

export const PROMPT_DE_DESCRIPCION = [
  "Describe esta imagen para alguien que no puede verla y va a trabajar con ella en una app móvil.",
  "Di QUÉ es (icono, captura de una pantalla, maqueta, foto, diagrama…) y lo que se ve: elementos, textos",
  "legibles tal cual, colores, disposición. Si es una pantalla, de arriba abajo. Sé concreto y no",
  "inventes: lo que no se distinga, dilo. Sin preámbulos.",
].join("\n");

const Entrada = z.object({
  ruta: z
    .string()
    .describe(
      "La ruta de la imagen PNG o JPEG: la VIRTUAL (/adjuntos/x.png, /artefactos/x.png, /icons/x.png) o la completa de la máquina si está dentro del proyecto, los adjuntos o los artefactos."
    ),
  pregunta: z
    .string()
    .optional()
    .describe("OPCIONAL. Qué quieres saber de ella (\"¿qué texto lleva el botón?\"). Sin ella, se describe entera."),
});

export interface DependenciasDeDescribir {
  invocar: InvocarVisual;
  /** Lee la imagen ya validada (`crearLectorDeReferencias`). Lanza con un `code`. */
  leer: (imagen: ImagenReferida) => Promise<Buffer>;
  /**
   * Las carpetas montadas, para traducir una ruta COMPLETA a la virtual. Ausentes, solo vale la virtual.
   * El orden importa: las de la sesión viven DENTRO del proyecto (`.xonecode/sesiones/…`), así que se
   * miran antes que la raíz.
   */
  carpetas?: { raiz: string; adjuntos?: string; artefactos?: string };
}

/**
 * La ruta virtual de una ruta completa que cae dentro de lo montado, o `undefined`. Solo compara TEXTO:
 * lo que salga pasa después por `imagenReferida` y por el `realpath` del lector, como cualquier otra.
 */
export function rutaVirtualDe(completa: string, carpetas: NonNullable<DependenciasDeDescribir["carpetas"]>): string | undefined {
  const dentro = (base: string | undefined, virtual: string): string | undefined => {
    if (base === undefined) return undefined;
    const b = base.replace(/[\\/]+$/, "");
    if (!completa.startsWith(`${b}/`) && !completa.startsWith(`${b}\\`)) return undefined;
    return `${virtual}${completa.slice(b.length + 1).replace(/\\/g, "/")}`;
  };
  return dentro(carpetas.adjuntos, "/adjuntos/") ?? dentro(carpetas.artefactos, "/artefactos/") ?? dentro(carpetas.raiz, "/");
}

/** ¿Es una ruta de la MÁQUINA y no una virtual? Una virtual empieza por `/` y nunca por la carpeta de un usuario. */
function esRutaDeLaMaquina(ruta: string, carpetas: DependenciasDeDescribir["carpetas"]): boolean {
  if (/^[A-Za-z]:[\\/]/.test(ruta) || ruta.startsWith("\\\\") || ruta.startsWith("~")) return true;
  const raices = [carpetas?.raiz, carpetas?.adjuntos, carpetas?.artefactos].filter((c): c is string => c !== undefined);
  return raices.some((c) => ruta.startsWith(c.replace(/[\\/]+$/, "") + "/")) || /^\/(Users|home|private|tmp|var|Volumes)\//.test(ruta);
}

function mimeDe(nombre: string): string {
  return /\.png$/i.test(nombre) ? "image/png" : "image/jpeg";
}

export function crearDescribirImagen(deps: DependenciasDeDescribir) {
  return tool(
    async ({ ruta, pregunta }: z.infer<typeof Entrada>) => {
      let virtual = ruta.trim();
      if (esRutaDeLaMaquina(virtual, deps.carpetas)) {
        const traducida = deps.carpetas === undefined ? undefined : rutaVirtualDe(virtual, deps.carpetas);
        if (traducida === undefined) {
          return `Esa ruta está fuera del proyecto y de esta sesión: tráela antes con ${NOMBRE_TRAER} y pásame su ruta en /artefactos/.`;
        }
        virtual = traducida;
      }
      const imagen = imagenReferida(virtual);
      if (typeof imagen === "string") return imagen;
      let bytes: Buffer;
      try {
        bytes = await deps.leer(imagen);
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        return `No se pudo leer ${virtual}${typeof code === "string" ? ` (${code})` : ""}: comprueba la ruta con ls.`;
      }
      if (bytes.length > TOPE_DE_BYTES_DE_IMAGEN) return `${virtual} es demasiado grande para describirla.`;
      const prompt =
        pregunta === undefined || pregunta.trim() === ""
          ? PROMPT_DE_DESCRIPCION
          : `${PROMPT_DE_DESCRIPCION}\n\nContesta sobre todo a esto: ${pregunta.trim()}`;
      let texto: string;
      try {
        texto = (await deps.invocar(PAPEL_DE_DESCRIBIR, prompt, { base64: bytes.toString("base64"), mime: mimeDe(imagen.nombre) })).trim();
      } catch (error) {
        return `No se pudo describir ${virtual}: ${error instanceof ErrorDelJuezVisual ? error.message : "falló la llamada al modelo"}.`;
      }
      if (texto === "") return `El modelo no devolvió ninguna descripción de ${virtual}.`;
      return `Lo que se ve en ${virtual} (lo describe un modelo con la imagen delante):\n${texto}`;
    },
    {
      name: NOMBRE_DESCRIBIR_IMAGEN,
      description:
        "Mira una imagen PNG o JPEG y te dice lo que se ve: un adjunto de la persona, una captura, una maqueta, un icono. " +
        "ÚSALA siempre que necesites saber qué hay en una imagen: read_file no puede abrirlas. No describas una imagen " +
        "que no hayas pasado por aquí.",
      schema: Entrada,
    }
  );
}
