import { SimuladorVerifier, ErrorDelSimulador } from "../agent/verificador.js";
import { huella, type Hallazgo } from "../core/ports.js";
import { escribirEnStdout, type Escribir } from "./stdio.js";

const MARCA: Record<Hallazgo["severidad"], string> = {
  error: "✗",
  warning: "⚠",
  info: "·",
};

/** `code fichero:linea` — y sin la línea cuando no viene, que es el caso normal. */
function donde(h: Hallazgo): string {
  if (!h.fichero) return "";
  return h.linea === undefined ? ` ${h.fichero}` : ` ${h.fichero}:${h.linea}`;
}

/**
 * Corre el verificador REAL sobre un proyecto y cuenta lo que encuentra.
 *
 * Sale con 1 si hay errores. Los avisos no tumban el comando: son de otra severidad y
 * colapsarlos con los errores es una decisión de producto que nadie ha tomado.
 */
export async function cmdVerify(
  ruta: string,
  escribir: Escribir = escribirEnStdout,
  verificador = new SimuladorVerifier()
): Promise<number> {
  let informe;
  try {
    informe = await verificador.verificar(ruta);
  } catch (e) {
    // Que no esté el binario NO es un fallo del proyecto. Distinguirlo importa: si no,
    // un entorno mal montado se lee como «tu proyecto está roto».
    escribir(`✗ no se pudo verificar: ${e instanceof Error ? e.message : String(e)}\n`);
    // La pista solo si viene al caso. Un `ErrorDelSimulador` significa que el binario
    // CORRIÓ y contestó —lo que falla es la ruta, o el proyecto—, así que preguntar por
    // la instalación manda a mirar donde no es: una pista falsa cuesta más que ninguna.
    if (!(e instanceof ErrorDelSimulador)) {
      escribir("  ¿está `xone-simulator` instalado? Compruébalo con `xonecode doctor`.\n");
    }
    return 70; // EX_SOFTWARE: es del entorno, no del proyecto
  }

  const errores = informe.hallazgos.filter((h) => h.severidad === "error");
  const avisos = informe.hallazgos.filter((h) => h.severidad !== "error");

  for (const h of informe.hallazgos) {
    escribir(`  ${MARCA[h.severidad]} ${h.code}${donde(h)}\n`);
    escribir(`      ${h.mensaje}\n`);
  }

  if (informe.verde) {
    escribir(`\n✓ verde: ${ruta}\n`);
    return 0;
  }

  // Las huellas REPETIDAS son el dato que delata que reparar no avanza. Se cuenta aquí
  // porque es lo que el lazo (fase 7) va a usar para bloquear antes de gastar el tope.
  const repetidas = new Set<string>();
  const vistas = new Set<string>();
  for (const h of informe.hallazgos) {
    const f = huella(h);
    if (vistas.has(f)) repetidas.add(f);
    vistas.add(f);
  }

  escribir(`\n✗ ${errores.length} error(es), ${avisos.length} aviso(s)`);
  escribir(repetidas.size > 0 ? `, ${repetidas.size} huella(s) repetida(s)\n` : "\n");
  return errores.length > 0 ? 1 : 0;
}