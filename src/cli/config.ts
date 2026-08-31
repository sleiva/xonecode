/**
 * `xonecode config` — diagnóstico de la configuración SIN llamar a ningún modelo.
 *
 * Un comando de diagnóstico no puede ser la vía por la que una clave acaba en un log o
 * una captura, así que la regla dura de este fichero es: NUNCA se imprime ni un carácter
 * de una credencial — ni truncada, ni los últimos cuatro. Solo «puesta»/«sin credencial»
 * y de dónde sale. Por eso el JSON de salida se construye campo a campo a mano y jamás
 * serializa el objeto `auth` de `cargar`, que SÍ lleva las claves en texto plano.
 *
 * Y al revés: un config MAL escrito no puede impedir que este comando funcione — es
 * justo el que uno corre cuando la configuración está mal. Por eso siempre devuelve 0.
 */

import { cargar } from "../agent/configEnDisco.js";
import type { Aviso } from "../core/config.js";
import {
  ModeloMalEscrito,
  PAPELES,
  resolver,
  type Eleccion,
  type FuentesDeEleccion,
  type Proveedor,
} from "../core/modelos.js";
import type { Papel } from "../core/ports.js";
import { escribirEnStdout, type Escribir } from "./stdio.js";

/**
 * Duplicado a propósito: `agent/configEnDisco.ts` tiene el mismo mapa como `const`
 * privada (no exportada) y ese fichero no se puede tocar. Si cambia allí, cambia aquí.
 * `ollama` no lleva variable: no necesita credencial y se omite de esta sección.
 */
const VARIABLE_POR_PROVEEDOR: Partial<Record<Proveedor, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
};

interface CredencialVista {
  proveedor: Proveedor;
  puesta: boolean;
  origen?: "entorno" | "auth.json";
}

export function cmdConfig(
  fuentes: FuentesDeEleccion,
  opciones: { json?: boolean } = {},
  escribir: Escribir = escribirEnStdout,
  raiz: string = process.cwd()
): number {
  const cargado = cargar(raiz);

  // `validar()` solo exige que «modelo» sea cadena, no que tenga la forma
  // proveedor/modelo: «basura-sin-barra» pasa la validación de fichero pero `resolver`
  // la rechaza al parsear. El fallback deja fuera proyecto/global SOLO para el modelo:
  // las rutas y las credenciales de más abajo salen igualmente.
  let eleccion: Record<Papel, Eleccion>;
  const avisosDeResolucion: Aviso[] = [];
  try {
    eleccion = resolver({
      ...fuentes,
      proyecto: cargado.config.proyecto,
      global: cargado.config.global,
    });
  } catch (e) {
    if (!(e instanceof ModeloMalEscrito)) throw e;
    avisosDeResolucion.push({
      texto: `no se pudo resolver el modelo desde la configuración de fichero (${e.message}); se ignoran proyecto y global solo para el modelo.`,
      severidad: "grave",
    });
    eleccion = resolver(fuentes);
  }

  const modelos = PAPELES.map((papel) => ({
    papel,
    proveedor: eleccion[papel].proveedor,
    modelo: eleccion[papel].modelo,
    origen: eleccion[papel].origen,
  }));

  // El entorno gana sobre auth.json (en runtime `aplicarAuth` no pisa una variable que
  // ya existe), así que el origen se decide mirando PRIMERO el entorno.
  const credenciales: CredencialVista[] = (
    Object.keys(VARIABLE_POR_PROVEEDOR) as Proveedor[]
  ).map((proveedor) => {
    const variable = VARIABLE_POR_PROVEEDOR[proveedor]!;
    const enEntorno = process.env[variable] !== undefined;
    const enAuth = !enEntorno && cargado.auth[proveedor] !== undefined;
    return {
      proveedor,
      puesta: enEntorno || enAuth,
      origen: enEntorno ? "entorno" : enAuth ? "auth.json" : undefined,
    };
  });

  // Graves primero, con orden estable dentro de cada grupo: son lo que hay que mirar
  // antes de seguir, y el resto puede esperar debajo.
  const avisos = [...avisosDeResolucion, ...cargado.avisos];
  const ordenados = [
    ...avisos.filter((a) => a.severidad === "grave"),
    ...avisos.filter((a) => a.severidad === "aviso"),
  ];

  if (opciones.json === true) {
    const salida = {
      rutas: cargado.rutas.map((r) => ({
        ruta: r.ruta,
        existe: r.existe,
        procedencia: r.procedencia,
      })),
      modelos,
      credenciales: credenciales.map((c) =>
        c.puesta ? c : { proveedor: c.proveedor, puesta: false }
      ),
      avisos: ordenados.map((a) => ({ severidad: a.severidad, texto: a.texto })),
    };
    escribir(`${JSON.stringify(salida, null, 2)}\n`);
    return 0;
  }

  escribir("--- ficheros de configuración ---\n");
  for (const r of cargado.rutas) {
    escribir(
      r.existe ? `  ✓  ${r.ruta}\n` : `  ✗  ${r.ruta}  (no existe)\n`
    );
  }

  escribir("--- modelos por papel ---\n");
  for (const m of modelos) {
    escribir(`  ${m.papel}   ${m.proveedor}/${m.modelo}  (${m.origen})\n`);
  }

  escribir("--- credenciales ---\n");
  for (const c of credenciales) {
    escribir(
      c.puesta
        ? `  ✓ puesta  ${c.proveedor}  (${c.origen})\n`
        : `  · sin credencial  ${c.proveedor}\n`
    );
  }

  if (ordenados.length > 0) {
    escribir("--- avisos ---\n");
    for (const a of ordenados) {
      escribir(`  ${a.severidad === "grave" ? "⚠" : "·"}  ${a.texto}\n`);
    }
  }

  return 0;
}
