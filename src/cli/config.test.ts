/**
 * Tests de `cmdConfig` (cli/config.ts) y del comportamiento nuevo de `cmdDescribe`
 * (cli/describe.ts): que un aviso GRAVE de configuración también sale en describe.
 *
 * REGLA CRÍTICA de aislamiento, copiada de `agent/configEnDisco.test.ts`: ningún test
 * toca el `~/.xonecode` REAL de esta máquina (puede tener claves válidas). `cargar()`
 * —que ambos comandos usan por dentro— deriva sus rutas de `homedir()`, que lee `HOME`
 * en el momento de la llamada: todo test stubea `HOME` a un temporal con `vi.stubEnv`
 * ANTES de llamar al comando, y borra los temporales al final.
 *
 * Las tres variables de credenciales (ANTHROPIC_API_KEY, OPENAI_API_KEY,
 * GOOGLE_API_KEY) las leen los comandos directamente de `process.env`, sin pasar por
 * `vi.stubEnv`: se guardan y restauran A MANO en beforeEach/afterEach, porque
 * `vi.unstubAllEnvs()` no deshace una asignación directa a `process.env`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdConfig } from "./config.js";
import { cmdDescribe } from "./describe.js";
import {
  NOMBRE_CARPETA,
  rutaConfigDeProyecto,
  rutaConfigGlobal,
  rutaAuth,
} from "../agent/configEnDisco.js";
import type { FuentesDeEleccion } from "../core/modelos.js";

/** Registra los textos que se le pasan a escribir, igual que en aprobar.test.ts. */
function acumulador() {
  const trozos: string[] = [];
  return { trozos, escribir: (t: string) => trozos.push(t) };
}

/**
 * HOME y raíz de proyecto temporales. El objeto devuelto escribe los ficheros de
 * configuración en el sitio correcto (carpeta `.xonecode` de cada raíz) y sabe
 * borrarse entero; los tests lo hacen en `finally` para que un fallo de aserción no
 * deje directorios huérfanos en /tmp.
 */
function entornoTemporal() {
  const home = mkdtempSync(join(tmpdir(), "xc-home-"));
  const raiz = mkdtempSync(join(tmpdir(), "xc-cfg-"));
  // El stubeo llega hasta las rutas porque rutaConfigGlobal/rutaAuth llaman a
  // homedir() en cada invocación (ver configEnDisco.ts). Sin esto, un test de
  // «sin credencial» leería el ~/.xonecode REAL y podría encontrar una clave.
  vi.stubEnv("HOME", home);

  function escribirJson(ruta: string, contenido: string): void {
    mkdirSync(join(ruta, ".."), { recursive: true });
    writeFileSync(ruta, contenido);
  }

  return {
    home,
    raiz,
    escribirConfigProyecto: (contenido: string): void =>
      escribirJson(join(raiz, NOMBRE_CARPETA, "config.json"), contenido),
    escribirConfigGlobal: (contenido: string): void =>
      escribirJson(join(home, NOMBRE_CARPETA, "config.json"), contenido),
    // modo por omisión 0o600: el modo correcto NO genera el aviso grave de permisos;
    // los tests que lo quieren pasan 0o644 explícito.
    escribirAuthGlobal: (contenido: string, modo: number = 0o600): void => {
      const ruta = join(home, NOMBRE_CARPETA, "auth.json");
      escribirJson(ruta, contenido);
      chmodSync(ruta, modo);
    },
    borrar: (): void => {
      rmSync(home, { recursive: true, force: true });
      rmSync(raiz, { recursive: true, force: true });
    },
  };
}

/**
 * Comprueba que un texto NO contiene un secreto, ni entero ni en trozos de 5
 * caracteres (ventana deslizante), como el test homónimo de `core/config.test.ts`:
 * que no salga entero no basta, un truncado tipo «sk-se…» ya es información.
 */
function sinFuga(texto: string, secreto: string): void {
  expect(texto).not.toContain(secreto);
  for (let i = 0; i + 5 <= secreto.length; i++) {
    expect(texto).not.toContain(secreto.slice(i, i + 5));
  }
}

/**
 * Los tests de «sin credencial» no pueden asumir que las variables vienen vacías:
 * en la máquina de quien corre la suite pueden estar puestas de verdad.
 */
function borrarCredencialesDelEntorno(): void {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
}

// Valores originales para restaurar a mano: cmdConfig y cmdDescribe leen estas
// variables con acceso directo a process.env, así que vi.unstubAllEnvs() no basta.
let antropicaOriginal: string | undefined;
let openaiOriginal: string | undefined;
let googleOriginal: string | undefined;

beforeEach(() => {
  antropicaOriginal = process.env.ANTHROPIC_API_KEY;
  openaiOriginal = process.env.OPENAI_API_KEY;
  googleOriginal = process.env.GOOGLE_API_KEY;
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (antropicaOriginal === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antropicaOriginal;
  if (openaiOriginal === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = openaiOriginal;
  if (googleOriginal === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = googleOriginal;
});

const SECRETO = "sk-secreta-12345";
const SIN_FUENTES: FuentesDeEleccion = {};

describe("cmdConfig", () => {
  it("con los tres ficheros presentes, las tres rutas salen como existentes", () => {
    const t = entornoTemporal();
    try {
      t.escribirConfigProyecto('{"modelo":"ollama/x"}');
      t.escribirConfigGlobal('{"modelo":"ollama/y"}');
      t.escribirAuthGlobal(`{"anthropic":{"key":"${SECRETO}"}}`);
      const { trozos, escribir } = acumulador();

      const codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

      expect(codigo).toBe(0);
      const salida = trozos.join("");
      // Las rutas esperadas se calculan con las MISMAS funciones que usa el código:
      // hardcodearlas haría el test dependiente de cómo join() resuelve en cada SO.
      for (const ruta of [rutaConfigDeProyecto(t.raiz), rutaConfigGlobal(), rutaAuth()]) {
        expect(salida).toContain(`✓  ${ruta}`);
      }
    } finally {
      t.borrar();
    }
  });

  it("sin ningún fichero, las tres rutas salen como «no existe» y con su ruta completa", () => {
    const t = entornoTemporal();
    try {
      const { trozos, escribir } = acumulador();

      const codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

      expect(codigo).toBe(0);
      const salida = trozos.join("");
      for (const ruta of [rutaConfigDeProyecto(t.raiz), rutaConfigGlobal(), rutaAuth()]) {
        expect(salida).toContain(`✗  ${ruta}  (no existe)`);
      }
    } finally {
      t.borrar();
    }
  });

  describe("procedencia de cada papel", () => {
    it("con SOLO config.json global, los tres papeles salen con (global)", () => {
      const t = entornoTemporal();
      try {
        t.escribirConfigGlobal('{"modelo":"ollama/y"}');
        const { trozos, escribir } = acumulador();

        const codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

        expect(codigo).toBe(0);
        const salida = trozos.join("");
        for (const papel of ["rapido", "trabajo", "afilado"]) {
          expect(salida).toContain(`${papel}   ollama/y  (global)`);
        }
      } finally {
        t.borrar();
      }
    });

    it("con global y proyecto, gana el proyecto: (proyecto)", () => {
      const t = entornoTemporal();
      try {
        t.escribirConfigGlobal('{"modelo":"ollama/y"}');
        t.escribirConfigProyecto('{"modelo":"ollama/x"}');
        const { trozos, escribir } = acumulador();

        const codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

        expect(codigo).toBe(0);
        const salida = trozos.join("");
        for (const papel of ["rapido", "trabajo", "afilado"]) {
          expect(salida).toContain(`${papel}   ollama/x  (proyecto)`);
        }
      } finally {
        t.borrar();
      }
    });

    it("con bandera además de proyecto y global, gana la bandera: (bandera)", () => {
      const t = entornoTemporal();
      try {
        t.escribirConfigGlobal('{"modelo":"ollama/y"}');
        t.escribirConfigProyecto('{"modelo":"ollama/x"}');
        const { trozos, escribir } = acumulador();

        const codigo = cmdConfig({ bandera: "ollama/z" }, {}, escribir, t.raiz);

        expect(codigo).toBe(0);
        const salida = trozos.join("");
        for (const papel of ["rapido", "trabajo", "afilado"]) {
          expect(salida).toContain(`${papel}   ollama/z  (bandera)`);
        }
      } finally {
        t.borrar();
      }
    });
  });

  it("ninguna credencial en la salida de texto, y la línea de anthropic dice «✓ puesta»", () => {
    const t = entornoTemporal();
    try {
      t.escribirAuthGlobal(`{"anthropic":{"key":"${SECRETO}"}}`);
      borrarCredencialesDelEntorno();
      const { trozos, escribir } = acumulador();

      const codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

      expect(codigo).toBe(0);
      const salida = trozos.join("");
      sinFuga(salida, SECRETO);
      // Sin este check el test pasaría aunque la credencial no se detectara en
      // absoluto — el «no fuga» tiene que ir acompañado del «sí detecta».
      expect(salida).toContain("✓ puesta  anthropic");
    } finally {
      t.borrar();
    }
  });

  it("con la variable de entorno puesta Y auth.json, el origen que se informa es «entorno»", () => {
    const t = entornoTemporal();
    try {
      t.escribirAuthGlobal(`{"anthropic":{"key":"${SECRETO}"}}`);
      borrarCredencialesDelEntorno();
      // Asignación directa, no vi.stubEnv: el código bajo test lee process.env
      // directamente y la restauración manual del afterEach se encarga de deshacerla.
      process.env.ANTHROPIC_API_KEY = "sk-de-entorno-67890";
      const { trozos, escribir } = acumulador();

      const codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

      expect(codigo).toBe(0);
      const salida = trozos.join("");
      // El entorno manda en runtime (aplicarAuth no pisa una variable que ya existe),
      // así que el diagnóstico tiene que reflejar el mismo orden.
      expect(salida).toContain("✓ puesta  anthropic  (entorno)");
      expect(salida).not.toContain("anthropic  (auth.json)");
      sinFuga(salida, SECRETO);
      // La variable del entorno tampoco puede salir. No se usa sinFuga aquí a propósito:
      // su valor («…-entorno-…») comparte el trozo «entor» con la palabra «(entorno)»
      // que la salida DEBE imprimir, y la ventana deslizante daría un falso positivo.
      expect(salida).not.toContain("sk-de-entorno-67890");
      expect(salida).not.toContain("sk-d");
    } finally {
      t.borrar();
    }
  });

  it("sin auth.json y sin ninguna variable, los tres proveedores salen «· sin credencial»", () => {
    const t = entornoTemporal();
    try {
      // No se asume que vienen vacías: en esta máquina pueden estar puestas de verdad.
      borrarCredencialesDelEntorno();
      const { trozos, escribir } = acumulador();

      const codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

      expect(codigo).toBe(0);
      const salida = trozos.join("");
      for (const proveedor of ["anthropic", "openai", "gemini"]) {
        expect(salida).toContain(`· sin credencial  ${proveedor}`);
      }
    } finally {
      t.borrar();
    }
  });

  it("un aviso grave sale antes que uno normal en la sección de avisos", () => {
    const t = entornoTemporal();
    try {
      // Grave: auth.json legible por otros. Normal: campo desconocido en el proyecto.
      t.escribirAuthGlobal(`{"anthropic":{"key":"${SECRETO}"}}`, 0o644);
      t.escribirConfigProyecto('{"cosaRara":1}');
      borrarCredencialesDelEntorno();
      const { trozos, escribir } = acumulador();

      const codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

      expect(codigo).toBe(0);
      const salida = trozos.join("");
      // La búsqueda se limita al bloque de avisos porque la sección de credenciales
      // también usa «·» («· sin credencial») y confundiría el índice del primer aviso.
      const avisos = salida.slice(salida.indexOf("--- avisos ---"));
      const iGrave = avisos.indexOf("⚠");
      const iNormal = avisos.indexOf("·");
      expect(iGrave).toBeGreaterThanOrEqual(0);
      expect(iNormal).toBeGreaterThanOrEqual(0);
      expect(iGrave).toBeLessThan(iNormal);
    } finally {
      t.borrar();
    }
  });

  it("--json: salida parseable, con las cuatro claves-array y sin fuga del secreto", () => {
    const t = entornoTemporal();
    try {
      t.escribirAuthGlobal(`{"anthropic":{"key":"${SECRETO}"}}`);
      borrarCredencialesDelEntorno();
      const { trozos, escribir } = acumulador();

      const codigo = cmdConfig(SIN_FUENTES, { json: true }, escribir, t.raiz);

      expect(codigo).toBe(0);
      const crudo = trozos.join("");
      sinFuga(crudo, SECRETO);
      // Si esto lanza, el modo --json no es consumible por otras herramientas, que es
      // para lo que existe.
      const datos: unknown = JSON.parse(crudo);
      expect(datos).toBeTypeOf("object");
      const d = datos as Record<string, unknown>;
      for (const clave of ["rutas", "modelos", "credenciales", "avisos"]) {
        expect(Array.isArray(d[clave]), `clave «${clave}»`).toBe(true);
      }
    } finally {
      t.borrar();
    }
  });

  it("un «modelo» mal escrito en config.json no rompe el comando: devuelve 0, con todo lo demás y un grave", () => {
    const t = entornoTemporal();
    try {
      // «basura-sin-barra» pasa la validación de fichero (es cadena) pero resolver()
      // la rechaza al parsear: es el caso que el fallback de cmdConfig absorbe.
      t.escribirConfigProyecto('{"modelo":"basura-sin-barra"}');
      borrarCredencialesDelEntorno();
      const { trozos, escribir } = acumulador();

      let codigo = -1;
      expect(() => {
        codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);
      }).not.toThrow();

      expect(codigo).toBe(0);
      const salida = trozos.join("");
      // Las rutas y las credenciales salen igualmente: un diagnóstico que se cae con
      // la config mal es inútil justo cuando hace falta.
      for (const ruta of [rutaConfigDeProyecto(t.raiz), rutaConfigGlobal(), rutaAuth()]) {
        expect(salida).toContain(ruta);
      }
      for (const proveedor of ["anthropic", "openai", "gemini"]) {
        expect(salida).toContain(`· sin credencial  ${proveedor}`);
      }
      expect(salida).toContain("⚠");
    } finally {
      t.borrar();
    }
  });
});

describe("cmdDescribe", () => {
  it("un aviso grave de configuración (auth.json legible por otros) sale también en describe", () => {
    const t = entornoTemporal();
    try {
      t.escribirAuthGlobal(`{"anthropic":{"key":"${SECRETO}"}}`, 0o644);
      borrarCredencialesDelEntorno();
      const { trozos, escribir } = acumulador();

      const codigo = cmdDescribe(SIN_FUENTES, escribir, t.raiz);

      expect(codigo).toBe(0);
      const salida = trozos.join("");
      // Subcadenas estables del mensaje de validarAuth en core/config.ts: si ese
      // mensaje cambia de redacción, que falle aquí y no en producción.
      expect(salida).toContain("legible por otros usuarios");
      expect(salida).toContain("chmod 600");
    } finally {
      t.borrar();
    }
  });

  it("no revienta con un «modelo» mal escrito en config.json: devuelve 0", () => {
    const t = entornoTemporal();
    try {
      t.escribirConfigProyecto('{"modelo":"basura-sin-barra"}');
      borrarCredencialesDelEntorno();
      const { trozos, escribir } = acumulador();

      let codigo = -1;
      expect(() => {
        codigo = cmdDescribe(SIN_FUENTES, escribir, t.raiz);
      }).not.toThrow();

      expect(codigo).toBe(0);
      // Y el grave de resolución se canta, no se traga en silencio.
      expect(trozos.join("")).toContain("no se pudo resolver el modelo");
    } finally {
      t.borrar();
    }
  });

  it("ninguna credencial aparece en la salida de describe", () => {
    const t = entornoTemporal();
    try {
      t.escribirAuthGlobal(`{"anthropic":{"key":"${SECRETO}"}}`);
      borrarCredencialesDelEntorno();
      const { trozos, escribir } = acumulador();

      const codigo = cmdDescribe(SIN_FUENTES, escribir, t.raiz);

      expect(codigo).toBe(0);
      // describe ni siquiera menciona las credenciales, pero un diagnóstico es
      // justo el tipo de salida que acaba en un log o una captura: se confirma.
      sinFuga(trozos.join(""), SECRETO);
    } finally {
      t.borrar();
    }
  });
});

describe("cmdConfig — topes de contexto", () => {
  it("enseña el tope de cada papel y de dónde sale: config del proyecto, global o tabla", () => {
    const t = entornoTemporal();
    try {
      // rapido: tabla. trabajo: override del PROYECTO. afilado: override global.
      t.escribirConfigProyecto(
        '{"contextos":{"anthropic/claude-4":100000},"modelos":{"rapido":"anthropic/claude-3","trabajo":"anthropic/claude-4","afilado":"ollama/local"}}'
      );
      t.escribirConfigGlobal('{"contextos":{"ollama/local":131072}}');
      const { trozos, escribir } = acumulador();

      const codigo = cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

      expect(codigo).toBe(0);
      const salida = trozos.join("");
      expect(salida).toContain("--- topes de contexto ---");
      expect(salida).toContain("100000  (config del proyecto)");
      expect(salida).toContain("131072  (config global)");
      expect(salida).toContain("200000  (tabla)");
    } finally {
      t.borrar();
    }
  });

  it("un modelo sin tope conocido se dice así: «sin tope conocido», sin disfraz", () => {
    const t = entornoTemporal();
    try {
      t.escribirConfigProyecto('{"modelos":{"trabajo":"ollama/misterio"}}');
      const { trozos, escribir } = acumulador();

      cmdConfig(SIN_FUENTES, {}, escribir, t.raiz);

      const salida = trozos.join("");
      expect(salida).toContain("sin tope conocido");
      expect(salida).not.toContain("(0)");
    } finally {
      t.borrar();
    }
  });

  it("en JSON, los topes van con su origen por papel", () => {
    const t = entornoTemporal();
    try {
      t.escribirConfigProyecto(
        '{"contextos":{"anthropic/claude-4":100000},"modelos":{"rapido":"anthropic/claude-3","trabajo":"anthropic/claude-4"}}'
      );
      const { trozos, escribir } = acumulador();

      cmdConfig(SIN_FUENTES, { json: true }, escribir, t.raiz);

      const salida = JSON.parse(trozos.join(""));
      expect(salida.contextos).toEqual({
        rapido: { modelo: "anthropic/claude-3", tope: 200000, origen: "tabla" },
        trabajo: { modelo: "anthropic/claude-4", tope: 100000, origen: "proyecto" },
        afilado: { modelo: "ollama/kimi-k3:cloud" },
      });
    } finally {
      t.borrar();
    }
  });
});
