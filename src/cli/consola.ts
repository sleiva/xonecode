/**
 * El lazo de la consola interactiva y los comandos de barra.
 *
 * La regla que gobierna este fichero: una consola no llama a `input()` ni imprime por su
 * cuenta. `correrConsola` recibe de dónde leer (`consola.lineas`) y a dónde escribir
 * (`consola.escribir`) — en producción stdin y el `escribir` con flush; en los tests, una
 * lista de líneas y un acumulador. Sin esa costura la consola no se puede probar.
 */

import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { cmdConfig } from "./config.js";
import { cmdDescribe } from "./describe.js";
import { cmdDoctor } from "./doctor.js";
import { cmdVerify } from "./verify.js";
import { AgenteGuionizado } from "../agent/guionizado.js";
import { correrTurno } from "../core/turno.js";
import { PAPELES, POR_OMISION, ModeloMalEscrito, parsear, PROVEEDORES, type FuentesDeEleccion, type Proveedor } from "../core/modelos.js";
import type { Aviso } from "../core/config.js";
import type { Papel } from "../core/ports.js";
import { esDoble } from "../core/ports.js";
import { crearPielStdio, type Escribir } from "./stdio.js";
import type { Preguntar } from "./aprobar.js";
import { guardarCredencial, AuthRotoEnDisco } from "../agent/authEnDisco.js";
import { cargar, NOMBRE_CARPETA } from "../agent/configEnDisco.js";

export interface Consola {
  /** De dónde vienen las líneas del usuario. Agotarlo termina la sesión: es EOF, no cuelgue. */
  lineas: AsyncIterable<string>;
  escribir: Escribir;
  /** Para las aprobaciones dentro de un turno. */
  preguntar: Preguntar;
  interactivo: boolean;
  /**
   * Lee una clave SIN eco (para `provider`). El eco-off no se puede probar desde
   * aquí: es la costura de test, y la implementación de producción (raw-mode de
   * stdin) vive fuera — este fichero solo la usa.
   */
  leerSecreto: (pregunta: string) => Promise<string>;
}

export interface EstadoDeSesion {
  hilo: string;
  raiz: string;
  fuentes: FuentesDeEleccion;
}

/** Lo que hace un comando de barra: escribe y puede cambiar el estado de la sesión. */
export type ManejadorDeBarra = (
  args: string[],
  estado: EstadoDeSesion,
  consola: Consola
) => Promise<{ seguir: boolean; estado?: EstadoDeSesion }>;

/** Cómo se corre una línea de prosa. El valor por omisión usa el agente guionizado. */
export type EjecutorDeTurno = (
  peticion: string,
  estado: EstadoDeSesion,
  consola: Consola
) => Promise<void>;

/**
 * Duplicado a propósito de `cli/config.ts` (que a su vez lo duplica de
 * `agent/configEnDisco.ts`, no exportado y no tocable): misma regla y misma
 * omisión — `ollama` no lleva variable porque no necesita credencial.
 */
const VARIABLE_POR_PROVEEDOR: Partial<Record<Proveedor, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
};

/**
 * Un turno con `AgenteGuionizado`, igual que el `cmdRun` sin `--real`.
 *
 * Es el valor por omisión de `correrConsola`: mantiene el invariante de fase 1 (todo corre
 * sin API y sin red). El cableado del agente REAL va en otra tarea y se inyecta como
 * tercer parámetro, mismo patrón que `cmdVerify(ruta, escribir, verificador = ...)`.
 */
export async function ejecutarTurnoGuionizado(
  peticion: string,
  _estado: EstadoDeSesion,
  consola: Consola
): Promise<void> {
  const agente = new AgenteGuionizado();
  const piel = crearPielStdio(consola.escribir);

  if (esDoble(agente)) {
    consola.escribir("⚠  AGENTE DE PEGA: esto es un guion, no ha corrido ningún modelo.\n\n");
  }

  await correrTurno(agente.turno(peticion), piel, {
    avisos: (b) => (b.corrio("verify") && esDoble(agente) ? ["⚠  El veredicto es de pega."] : []),
  });
}

/** El nombre del tipo de error y su mensaje: «ModeloMalEscrito: ...» no cuenta lo mismo que «Error: ...». */
function describirError(e: unknown): string {
  if (e instanceof Error) return `${e.constructor.name}: ${e.message}`;
  return String(e);
}

/**
 * Ruta de `auth.json` en el mismo momento de la llamada (no cacheada en un módulo, por lo
 * mismo que `rutaAuth` tampoco lo hace) y SIN importar la función del writer: `provider`
 * solo necesita NOMBRAR la ruta, nunca leerla.
 */
function rutaAuthParaAviso(): string {
  return join(homedir(), NOMBRE_CARPETA, "auth.json");
}

/**
 * El `completer` de readline (ver docs de node:readline: firma síncrona
 * `(line: string) => [string[], string]`). Propone SIEMPRE desde `COMANDOS`,
 * nunca de una lista aparte. Con un único candidato, se completa. Con varios,
 * se listan con su descripción (readline por sí solo no la pinta) usando
 * `escribir`. Fuera de una línea que empiece por «/», no completa nada: en
 * medio de una petición en prosa sería un estorbo.
 */
export function crearCompleter(escribir: Escribir): (linea: string) => [string[], string] {
  return (linea: string) => {
    if (!linea.startsWith("/")) return [[], linea];
    const prefijo = linea.slice(1).toLowerCase();
    const candidatos = Object.keys(COMANDOS)
      .filter((n) => n.startsWith(prefijo))
      .map((n) => `/${n}`);
    if (candidatos.length > 1) {
      escribir("\n");
      for (const c of candidatos) {
        const nombre = c.slice(1);
        escribir(`  ${c.padEnd(20)}  ${COMANDOS[nombre]!.descripcion}\n`);
      }
    }
    return [candidatos, linea];
  };
}

/**
 * La maquinaria común de los cuatro comandos de modelo: validación con `parsear` y cambio
 * del modelo EN CALIENTE. `papel === undefined` fija los TRES papeles (la bandera);
 * en otro caso fija uno, que gana sobre la bandera.
 *
 * El estado solo cambia con un modelo VÁLIDO: un fallo de tecleo no puede dejar la sesión
 * apuntando a algo que revienta al construir el cliente.
 */
function manejadorDeModelo(papel: Papel | undefined): ManejadorDeBarra {
  const nombre = papel === undefined ? "/modelo" : `/modelo-${papel}`;
  return async (args, estado, consola) => {
    const valor = args[0];
    if (!valor) {
      consola.escribir(
        `uso: ${nombre} <proveedor>/<modelo> — proveedores: ${PROVEEDORES.join(", ")}\n`
      );
      return { seguir: true };
    }
    try {
      parsear(valor);
    } catch (e) {
      // El mensaje del error ya lista los proveedores válidos: se reusa, no se reescribe.
      if (!(e instanceof ModeloMalEscrito)) throw e;
      consola.escribir(`${e.message}\n`);
      return { seguir: true };
    }
    const fuentes: FuentesDeEleccion =
      papel === undefined
        ? { ...estado.fuentes, bandera: valor }
        : { ...estado.fuentes, porPapel: { ...estado.fuentes.porPapel, [papel]: valor } };
    consola.escribir(
      papel === undefined ? `modelo (los tres papeles): ${valor}\n` : `modelo ${papel}: ${valor}\n`
    );
    return { seguir: true, estado: { ...estado, fuentes } };
  };
}

export const COMANDOS: Record<string, { descripcion: string; manejador: ManejadorDeBarra }> = {
  ayuda: {
    descripcion: "lista los comandos de barra",
    // Se genera RECORRIENDO COMANDOS: una lista escrita a mano se queda vieja en cuanto
    // alguien añade un comando. La auto-referencia es segura porque esto corre en runtime.
    manejador: async (_args, _estado, consola) => {
      consola.escribir("comandos:\n");
      for (const [nombre, c] of Object.entries(COMANDOS)) {
        consola.escribir(`  /${nombre.padEnd(16)}  ${c.descripcion}\n`);
      }
      return { seguir: true };
    },
  },
  config: {
    descripcion: "config y credenciales, sin claves — como `xonecode config`",
    manejador: async (_args, estado, consola) => {
      cmdConfig(estado.fuentes, {}, consola.escribir, estado.raiz);
      return { seguir: true };
    },
  },
  describe: {
    descripcion: "qué hay montado y qué es de pega — como `xonecode describe`",
    manejador: async (_args, estado, consola) => {
      cmdDescribe(estado.fuentes, consola.escribir, estado.raiz);
      return { seguir: true };
    },
  },
  doctor: {
    descripcion: "¿hay proyecto aquí? ¿responde el simulador? — como `xonecode doctor`",
    manejador: async (_args, _estado, consola) => {
      // Firma real de cmdDoctor: pregunta por `process.cwd()`, no por `estado.raiz` — es lo
      // que un diagnóstico de entorno debe hacer, así que no se le pasa la raíz de sesión.
      await cmdDoctor(consola.escribir);
      return { seguir: true };
    },
  },
  verify: {
    descripcion: "valida el proyecto con el simulador — como `xonecode verify`",
    manejador: async (_args, estado, consola) => {
      await cmdVerify(estado.raiz, consola.escribir);
      return { seguir: true };
    },
  },
  modelo: {
    descripcion: "cambia los TRES papeles en caliente: /modelo <proveedor>/<modelo>",
    manejador: manejadorDeModelo(undefined),
  },
  "modelo-rapido": {
    descripcion: "cambia el papel `rapido` en caliente: /modelo-rapido <proveedor>/<modelo>",
    manejador: manejadorDeModelo("rapido"),
  },
  "modelo-trabajo": {
    descripcion: "cambia el papel `trabajo` en caliente: /modelo-trabajo <proveedor>/<modelo>",
    manejador: manejadorDeModelo("trabajo"),
  },
  "modelo-afilado": {
    descripcion: "cambia el papel `afilado` en caliente: /modelo-afilado <proveedor>/<modelo>",
    manejador: manejadorDeModelo("afilado"),
  },
  hilo: {
    descripcion: "muestra el hilo (thread_id) de esta sesión",
    manejador: async (_args, estado, consola) => {
      consola.escribir(`${estado.hilo}\n`);
      return { seguir: true };
    },
  },
  nuevo: {
    descripcion: "abre un hilo nuevo sin salir de la sesión",
    manejador: async (_args, estado, consola) => {
      // Mismo patrón que run.ts: prefijo xonecode- + uuid.
      const nuevoHilo = `xonecode-${randomUUID()}`;
      consola.escribir(`hilo nuevo: ${nuevoHilo}\n`);
      return { seguir: true, estado: { ...estado, hilo: nuevoHilo } };
    },
  },
  provider: {
    descripcion: "lista credenciales o guarda una: /provider [proveedor]",
    manejador: async (args, estado, consola) => {
      const nombre = args[0];
      if (!nombre) {
        // El entorno gana sobre auth.json (aplicarAuth no pisa una variable que ya
        // existía): mismo orden de mirón que cmdConfig — primero env, luego disco.
        const cargado = cargar(estado.raiz);
        for (const p of PROVEEDORES) {
          const variable = VARIABLE_POR_PROVEEDOR[p];
          const enEntorno = variable !== undefined && process.env[variable] !== undefined;
          const enAuth = !enEntorno && cargado.auth[p] !== undefined;
          // ollama no se marca «sin credencial»: no la necesita, no le falta nada.
          const estadoClave = variable === undefined
            ? "no necesita credencial"
            : enEntorno || enAuth
              ? "✓ puesta"
              : "· sin credencial";
          consola.escribir(`  ${p}  ${estadoClave}\n`);
        }
        consola.escribir("--- modelos por omisión ---\n");
        for (const p of PROVEEDORES) {
          const papeles = PAPELES.filter((papel) => POR_OMISION[papel].proveedor === p);
          if (papeles.length > 0) {
            consola.escribir(
              `  ${p}: ${papeles.map((papel) => `${papel}=${POR_OMISION[papel].modelo}`).join(", ")}\n`
            );
          }
        }
        return { seguir: true };
      }
      if (!(PROVEEDORES as readonly string[]).includes(nombre)) {
        consola.escribir(`proveedor «${nombre}» desconocido. Los que hay: ${PROVEEDORES.join(", ")}\n`);
        return { seguir: true };
      }
      if (!consola.interactivo) {
        // Sin TTY no hay eco-off posible: la clave tecleada quedaría en el scrollback.
        consola.escribir(
          `sin TTY no se puede leer la clave sin eco; edita ${rutaAuthParaAviso()} a mano\n`
        );
        return { seguir: true };
      }
      const clave = (await consola.leerSecreto(`clave de ${nombre}: `)).trim();
      if (clave === "") {
        consola.escribir("clave vacía: no se guardó nada\n");
        return { seguir: true };
      }
      try {
        const { ruta, avisos } = guardarCredencial(nombre as Proveedor, clave);
        consola.escribir(`credencial de ${nombre} guardada en ${ruta}\n`);
        for (const a of avisos) {
          consola.escribir(`  ${a.severidad === "grave" ? "⚠" : "·"}  ${a.texto}\n`);
        }
      } catch (e) {
        // AuthRotoEnDisco no se relanza: su mensaje ya dice que no se sobrescribió y hay
        // que editar a mano — el catch genérico de correrConsola no diría eso.
        if (!(e instanceof AuthRotoEnDisco)) throw e;
        consola.escribir(`${e.message}\n`);
      }
      return { seguir: true };
    },
  },
  salir: {
    descripcion: "termina la sesión",
    manejador: async (_args, _estado, consola) => {
      consola.escribir("hasta luego.\n");
      return { seguir: false };
    },
  },
};

/**
 * El lazo: una línea, una acción, y a la siguiente.
 *
 * Tres cosas NO tumban la sesión: un comando de barra que lanza, un turno que lanza y un
 * comando desconocido (que jamás se manda al modelo). El hilo vive en el checkpointer, así
 * que lo que falle en un turno lo pierde ese turno, no la sesión.
 */
export async function correrConsola(
  consola: Consola,
  estado: EstadoDeSesion,
  ejecutarTurno: EjecutorDeTurno = ejecutarTurnoGuionizado
): Promise<number> {
  for await (const cruda of consola.lineas) {
    const linea = cruda.trim();
    // Un Enter de más no gasta ni una llamada al modelo ni un error: no hay nada que hacer.
    if (linea === "") continue;

    if (linea.startsWith("/")) {
      // El comando se compara en minúsculas; los args respetan lo tecleado (p.ej. un id
      // de Ollama con mayúsculas tiene que llegar entero a `parsear`).
      const trozos = linea.split(/\s+/);
      const comando = trozos[0]!.slice(1).toLowerCase();
      const args = trozos.slice(1);
      const entrada = COMANDOS[comando];
      if (!entrada) {
        consola.escribir(`comando desconocido: /${comando} (usa /ayuda)\n`);
        continue;
      }
      try {
        const resultado = await entrada.manejador(args, estado, consola);
        if (!resultado.seguir) return 0;
        // El estado MÁS RECIENTE manda: el turno siguiente parte de lo que devolvió el
        // último manejador, no del estado de arranque.
        if (resultado.estado !== undefined) estado = resultado.estado;
      } catch (e) {
        consola.escribir(`${describirError(e)}\n`);
      }
      continue;
    }

    try {
      await ejecutarTurno(linea, estado, consola);
    } catch (e) {
      consola.escribir(`${describirError(e)}\n`);
    }
  }

  // EOF: la misma salida que /salir — un pipe que se cierra no es un error.
  return 0;
}