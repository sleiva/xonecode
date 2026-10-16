import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import type { Hallazgo, InformeVerificacion, VerifierPort } from "../../core/ports.js";

const ejecutar = promisify(execFile);

/** La forma que emite `xone-simulator validate --json` (xone-linter 1.4.0). */
/**
 * Cuando el simulador no pudo ni empezar. **Medido**: ante una ruta que no existe devuelve
 * `{"success": false, "error": "No existe el directorio del proyecto: …"}` — sin `issues`,
 * y **saliendo con código 0**, así que no lo caza ningún `catch` del proceso.
 *
 * Es un fallo del ENTORNO, no del proyecto, y por eso es una excepción y no un informe en
 * rojo: un informe rojo dice «tu proyecto tiene errores», que aquí sería mentira.
 */
export class ErrorDelSimulador extends Error {}

export interface SalidaDelSimulador {
  success: boolean;
  path?: string;
  /** Presente SOLO en la forma de fallo, y entonces `issues` no viene. */
  error?: string;
  summary?: { total: number; errors: number; warnings: number };
  issues?: Array<{
    severity: string;
    code: string;
    message: string;
    file?: string;
    location?: { file: string; line?: number; column?: number };
  }>;
}

/**
 * De la salida del simulador al informe del harness. PURA: sin subprocesos.
 *
 * Separada de quien invoca el binario para poder probar la traducción con el fichero de
 * `__oro__/` — es el patrón del puerto aplicado dentro del puerto, igual que el harness
 * Python separa la función que recibe la sesión ya lista del puerto que la construye.
 */
export function aInforme(salida: SalidaDelSimulador): InformeVerificacion {
  // La forma de fallo no trae `issues`. Sin esta guarda, `.map` de `undefined` reventaba
  // con un TypeError que le llegaba al usuario TAL CUAL —«Cannot read properties of
  // undefined (reading 'map')»— tapando el mensaje que el simulador ya daba claro.
  if (!Array.isArray(salida.issues)) {
    throw new ErrorDelSimulador(salida.error ?? "el simulador no devolvió hallazgos ni error");
  }
  const hallazgos: Hallazgo[] = salida.issues.map((i) => ({
    code: i.code,
    severidad: i.severity as Hallazgo["severidad"],
    mensaje: i.message,
    fichero: i.location?.file ?? i.file,
    linea: i.location?.line,
    columna: i.location?.column,
  }));
  return { verde: salida.success, hallazgos };
}

/**
 * El verificador real. NO lleva la marca `ES_DOBLE`: es de verdad, y `describe()` lo dirá.
 *
 * `validate` sale con código != 0 cuando encuentra errores, así que un fallo del proceso
 * NO es un fallo del harness: es el resultado. Se distingue por si hubo JSON parseable —
 * confundir las dos cosas es el patrón «fallo del proyecto != fallo del harness».
 */
export class SimuladorVerifier implements VerifierPort {
  /** Con un binario explícito se usa ESE, por el PATH; sin él, el de nuestra dependencia (`comoLanzarElSimulador`). */
  constructor(private readonly binario?: string) {}

  async verificar(rutaProyecto: string): Promise<InformeVerificacion> {
    const { programa, previos, nombre } =
      this.binario === undefined ? comoLanzarElSimulador() : { programa: this.binario, previos: [], nombre: this.binario };
    let stdout: string;
    try {
      ({ stdout } = await ejecutar(programa, [...previos, "validate", rutaProyecto, "--json"]));
    } catch (e) {
      const conSalida = e as { stdout?: string; code?: unknown };
      // Que el binario no esté se dice con su nombre y su `code`, nunca con el mensaje de Node, que lleva rutas: lo que
      // llegaba al chat era «spawn xone-simulator ENOENT», que no dice que falta un programa (IXCODE-27).
      if (!conSalida.stdout && conSalida.code === "ENOENT") {
        throw new ErrorDelSimulador(`${nombre} no está instalado en esta máquina (ENOENT)`);
      }
      if (!conSalida.stdout) throw e; // reventó de verdad
      stdout = conSalida.stdout;      // salió != 0 porque HAY hallazgos: es el resultado
    }
    return aInforme(JSON.parse(stdout) as SalidaDelSimulador);
  }
}

/**
 * Cómo se lanza `xone-simulator`: **el de NUESTRA dependencia** (`xone-linter`, cuyo `bin` es `dist/cli.js`), con el Node
 * que corre xonecode; y solo si no se encuentra, `xone-simulator` por el PATH. Medido en la máquina Windows de un usuario
 * (instalado con `npx`): el verificador lo llamaba por el PATH, donde no estaba, y cada turno cerraba con «no está
 * instalado (ENOENT)» aunque el programa venía DENTRO del paquete. Aquí funcionaba porque estaba instalado global.
 */
export function comoLanzarElSimulador(
  resolver: (id: string) => string = createRequire(import.meta.url).resolve
): { programa: string; previos: string[]; nombre: string } {
  try {
    return { programa: process.execPath, previos: [resolver("xone-linter/dist/cli.js")], nombre: "xone-simulator" };
  } catch {
    return { programa: "xone-simulator", previos: [], nombre: "xone-simulator" };
  }
}
