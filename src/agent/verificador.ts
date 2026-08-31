import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Hallazgo, InformeVerificacion, VerifierPort } from "../core/ports.js";

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
  constructor(private readonly binario = "xone-simulator") {}

  async verificar(rutaProyecto: string): Promise<InformeVerificacion> {
    let stdout: string;
    try {
      ({ stdout } = await ejecutar(this.binario, ["validate", rutaProyecto, "--json"]));
    } catch (e) {
      const conSalida = e as { stdout?: string };
      if (!conSalida.stdout) throw e; // el binario no está, o reventó de verdad
      stdout = conSalida.stdout;      // salió != 0 porque HAY hallazgos: es el resultado
    }
    return aInforme(JSON.parse(stdout) as SalidaDelSimulador);
  }
}