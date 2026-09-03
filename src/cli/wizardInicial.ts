/**
 * El asistente de cuenta: proveedor y modelo, la primera vez.
 *
 * No hace falta una marca de «primer arranque»: la resolución de modelos ya guarda de
 * dónde salió cada valor. Si `trabajo` resuelve por `omisión`, nadie ha elegido nunca.
 * Un flag aparte sería una segunda fuente de verdad sobre algo que el sistema ya sabe.
 */
import { PROVEEDORES, PAPELES, type Proveedor, type Eleccion } from "../core/modelos.js";
import type { Consola } from "./consola.js";

export interface ContextoDelAsistente {
  /**
   * El `origen` con el que resolvió el papel `trabajo` (`Eleccion["origen"]` de
   * `core/modelos.ts`, no una cadena suelta): así un origen mal escrito en el sitio que
   * llama a `asistenteDeModelo` es un error de compilación y no un asistente que nunca
   * se ofrece — el bug mudo que este repo evita en todas partes.
   */
  origenDeTrabajo: Eleccion["origen"];
  /** Proveedores que ya tienen credencial guardada. */
  hayCredencial?: (proveedor: Proveedor) => boolean;
  /**
   * Devuelve la ruta donde quedó, igual que `agent/authEnDisco.ts#guardarCredencial`:
   * si cancelar más adelante (en el paso de MODELO) deja la clave ya escrita, el aviso
   * de cancelación tiene que poder decir, justo antes, QUÉ se guardó y DÓNDE — como ya
   * hace `/provider` (`consola.ts`, «credencial de … guardada en …») — para que ese
   * «cancelado» no dé a entender, en silencio, que no pasó nada.
   */
  guardarCredencial?: (proveedor: Proveedor, clave: string) => { ruta: string };
}

/** Ollama local es la omisión y no lleva clave: pedirla sería mentir sobre lo que hace falta. */
const SIN_CREDENCIAL: ReadonlySet<string> = new Set(["ollama"]);

/**
 * Los proveedores sin credencial (hoy, Ollama local) primero: es la omisión del repo
 * («Ollama por omisión, y a propósito», `core/modelos.ts`) y la ruta sin fricción para
 * quien arranca sin ninguna clave a mano. `filter` en vez de un `sort` con aritmética
 * porque es más fácil de leer y el resultado es el mismo.
 */
function proveedoresParaElAsistente(): Proveedor[] {
  return [
    ...PROVEEDORES.filter((p) => SIN_CREDENCIAL.has(p)),
    ...PROVEEDORES.filter((p) => !SIN_CREDENCIAL.has(p)),
  ];
}

export async function asistenteDeModelo(
  consola: Consola,
  contexto: ContextoDelAsistente
): Promise<void> {
  // Ya hay una elección (proyecto, global, bandera o entorno): no se pregunta.
  if (contexto.origenDeTrabajo !== "omision") return;
  // Sin TTY no se pregunta NADA: las tuberías y `xonecode run` deben seguir dando una
  // salida byte-idéntica.
  if (!consola.interactivo || consola.seleccionar === undefined) return;

  const proveedor = await consola.seleccionar({
    titulo: "Proveedor de modelos",
    opciones: proveedoresParaElAsistente().map((p) => ({
      id: p,
      etiqueta: p,
      detalle: SIN_CREDENCIAL.has(p) ? "local, no necesita clave" : "necesita una clave de API",
    })),
  }) as Proveedor | undefined;

  if (proveedor === undefined || !PROVEEDORES.includes(proveedor)) {
    consola.escribir("asistente cancelado; se usa el modelo por omisión\n");
    return;
  }

  if (!SIN_CREDENCIAL.has(proveedor) && contexto.hayCredencial?.(proveedor) === false) {
    const clave = await consola.leerSecreto(`clave de ${proveedor}: `);
    if (clave.trim() === "") {
      consola.escribir("asistente cancelado; se usa el modelo por omisión\n");
      return;
    }
    // La clave va SOLO a ~/.xonecode/auth.json en 0600. Nunca al proyecto.
    const guardada = contexto.guardarCredencial?.(proveedor, clave.trim());
    if (guardada !== undefined) {
      // Se dice AQUÍ, no al final: si el usuario cancela en el paso de MODELO que
      // viene después, el «asistente cancelado» de más abajo no puede ser la única
      // frase que vea — dejaría creer que no se tocó nada, y la credencial ya está
      // en disco.
      consola.escribir(`credencial de ${proveedor} guardada en ${guardada.ruta}\n`);
    }
  }

  const modelos = await consola.catalogoModelos.listar(proveedor);
  if (modelos.length === 0) {
    consola.escribir(`no hay modelos disponibles para ${proveedor}; se usa el de omisión\n`);
    return;
  }

  const elegido = await consola.seleccionar({
    titulo: `Modelos de ${proveedor}`,
    opciones: modelos.map((m) => ({ id: m.id, etiqueta: m.nombre ?? m.id, detalle: m.id })),
  });
  if (elegido === undefined) {
    consola.escribir("asistente cancelado; se usa el modelo por omisión\n");
    return;
  }

  // Un modelo para los tres papeles, como `/modelo`. Afinar por papel es opt-in con
  // `/modelos`: preguntar tres veces antes de que nadie sepa qué es «afilado» es peaje.
  const id = `${proveedor}/${elegido}`;
  for (const papel of PAPELES) consola.guardarModeloGlobal(papel, id);
  consola.escribir(`→ ${id} guardado para los tres papeles\n`);
}
