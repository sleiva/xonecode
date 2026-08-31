import {
  esDoble,
  McpVacio,
  SkillsEnMemoria,
  StubVerifier,
  ModeloGuionizado,
  type McpPort,
  type ModelosPort,
  type Papel,
  type SkillsPort,
  type VerifierPort,
} from "./ports.js";
import { PAPELES } from "./modelos.js";

/**
 * Todo lo caro, junto y pasado por argumento.
 *
 * La regla dura: esto se PASA al construir, nunca se importa dentro de quien lo usa. Es lo
 * que hace que el lazo entero se recorra sin API, sin red y sin el simulador.
 */
export interface Deps {
  modelos: ModelosPort;
  skills: SkillsPort;
  verifier: VerifierPort;
  /** Declarado y sin cablear en la v1: el proyecto está en el cwd, no en CloudStudio. */
  mcp: McpPort;
}

/** Todo dobles. La suite corre con esto, y `describe` lo canta entero. */
export function depsOffline(): Deps {
  return {
    modelos: new ModeloGuionizado(),
    skills: new SkillsEnMemoria(),
    verifier: new StubVerifier(),
    mcp: new McpVacio(),
  };
}

/** Los puertos, en el orden en que se le cuentan al usuario. */
const PUERTOS: ReadonlyArray<{ clave: keyof Deps; nombre: string; gravedad: "grave" | "aviso" }> = [
  { clave: "verifier", nombre: "verificador", gravedad: "grave" },
  { clave: "modelos", nombre: "modelos", gravedad: "grave" },
  { clave: "skills", nombre: "skills", gravedad: "aviso" },
  { clave: "mcp", nombre: "MCP (proyecto remoto)", gravedad: "aviso" },
];

/**
 * Qué hay montado, y qué de ello es de pega.
 *
 * Pura y sin efectos: no llama a ningún puerto, solo mira qué son. Por eso `xonecode
 * describe` no necesita ni credenciales ni red.
 *
 * El verificador va PRIMERO y como `grave` por un motivo: un verificador de pega dice que
 * todo está bien, así que es el doble que más daño hace pasando desapercibido.
 */
export function describir(deps: Deps): string[] {
  const lineas: string[] = ["--- qué hay montado ---"];
  for (const { clave, nombre, gravedad } of PUERTOS) {
    const doble = esDoble(deps[clave]);
    const marca = doble ? (gravedad === "grave" ? "⚠ DE PEGA" : "· doble") : "✓ real";
    lineas.push(`  ${marca}  ${nombre}`);
  }

  const desc = deps.modelos.descripcion();
  lineas.push("--- modelos por papel ---");
  for (const papel of PAPELES) lineas.push(`  ${papel.padEnd(8)} ${desc[papel]}`);

  const graves = PUERTOS.filter((p) => p.gravedad === "grave" && esDoble(deps[p.clave]));
  if (graves.length > 0) {
    lineas.push("");
    lineas.push(
      `⚠  ${graves.length} pieza(s) de pega: lo que diga este agente NO está respaldado ` +
        `por ${graves.map((g) => g.nombre).join(" ni ")}.`
    );
  }
  return lineas;
}

/** Para el aviso del final del turno: los nombres de los puertos caros que son dobles. */
export function doblesGraves(deps: Deps): string[] {
  return PUERTOS.filter((p) => p.gravedad === "grave" && esDoble(deps[p.clave])).map((p) => p.nombre);
}