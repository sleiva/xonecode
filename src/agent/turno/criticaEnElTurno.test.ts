import { describe, expect, it } from "vitest";
import { tocaCriticarPantalla, textoDeReparacion, TOPE_REPARACIONES } from "./turnoReal.js";
import type { HallazgoDelTurno } from "../../core/events.js";

const HALLAZGO: HallazgoDelTurno = {
  code: "REF_JS_COLL_MISSING",
  severidad: "error",
  mensaje: 'Script referencia a colección "OperQueue" no encontrada',
  fichero: "funciones.js",
  linea: 12,
};

const base = { hayCritico: true, capturas: 1, yaDisparo: false, intento: 0 };

describe("tocaCriticarPantalla", () => {
  it("con crítico y una captura, sí", () => {
    expect(tocaCriticarPantalla(base)).toBe(true);
  });

  /** Que no haya crítico NO es «la pantalla está bien»: es que no se puede preguntar. */
  it("sin crítico, no", () => {
    expect(tocaCriticarPantalla({ ...base, hayCritico: false })).toBe(false);
  });

  /**
   * **No conduce nada**: mira lo que el turno ya fotografió. Un turno que no capturó nada no
   * tiene pantalla que criticar, y navegar hasta una necesita un agente — medido: el control
   * que lleva a la Calculadora vive en un cajón cerrado.
   */
  it("sin capturas, no hay nada que mirar", () => {
    expect(tocaCriticarPantalla({ ...base, capturas: 0 })).toBe(false);
  });

  /**
   * UNA vez por turno. Sus observaciones no son una huella —seis vueltas sobre la MISMA
   * captura dieron 4, 2, 4, 5, 3 y 5—, así que la guarda de «no progreso» no puede decidir si
   * una segunda vuelta avanza. Sin forma de medirlo, el tope es uno.
   */
  it("una sola vez por turno", () => {
    expect(tocaCriticarPantalla({ ...base, yaDisparo: true })).toBe(false);
  });

  it("y nunca por encima del tope de reparaciones del turno", () => {
    expect(tocaCriticarPantalla({ ...base, intento: TOPE_REPARACIONES })).toBe(false);
    expect(tocaCriticarPantalla({ ...base, intento: TOPE_REPARACIONES - 1 })).toBe(true);
  });
});

describe("textoDeReparacion", () => {
  it("con solo hallazgos del simulador, no nombra ninguna captura", () => {
    const texto = textoDeReparacion([HALLAZGO], []);

    expect(texto).toContain("REF_JS_COLL_MISSING");
    expect(texto).toContain("funciones.js:12");
    expect(texto).not.toMatch(/captura/i);
  });

  /**
   * El caso que motivó todo esto: el simulador en VERDE y la pantalla rota. Sin hallazgos, el
   * mensaje no puede empezar por «el simulador ha encontrado 0 error(es)».
   */
  it("con solo observaciones visuales, no inventa errores del simulador", () => {
    const texto = textoDeReparacion([], ["el texto de los botones sale cortado"]);

    expect(texto).not.toMatch(/El simulador de XOne ha revisado/);
    expect(texto).toContain("el texto de los botones sale cortado");
  });

  /**
   * **El aviso sobre la redacción está medido**: seis vueltas describieron un texto CORTADO
   * como «girado 180°», y a dónde apuntaba lo acertó las seis. Sin esta línea el desarrollador
   * busca una rotación que no existe y gasta la única vuelta que hay.
   */
  it("y avisa de que la redacción del crítico no es de fiar", () => {
    const texto = textoDeReparacion([], ["algo raro"]);

    expect(texto).toMatch(/no es de\s+fiar/);
    expect(texto).toMatch(/QUÉ control señala/);
  });

  it("con las dos fuentes, las dos salen y separadas", () => {
    const texto = textoDeReparacion([HALLAZGO], ["el visor sale a medias"]);

    expect(texto).toContain("REF_JS_COLL_MISSING");
    expect(texto).toContain("el visor sale a medias");
    expect(texto.indexOf("REF_JS_COLL_MISSING")).toBeLessThan(texto.indexOf("el visor sale a medias"));
  });

  /** La regla que no cambia: no inventarse nada para que el error desaparezca. */
  it("siempre recuerda que no se invente nada", () => {
    for (const texto of [textoDeReparacion([HALLAZGO], []), textoDeReparacion([], ["x"])]) {
      expect(texto).toMatch(/No inventes atributos/);
    }
  });
});

/**
 * El OBJETIVO dentro de la petición de reparación.
 *
 * Nace de un turno real: se pidió «tengo un error al ejecutar la app, arréglalo», se
 * arregló (un `;` que faltaba en `funciones.js`) y entonces el crítico visual vio tres
 * textos recortados en otra pantalla —rotos desde antes—. El turno se fue a rediseñar el
 * menú.
 *
 * La causa no era el modelo: esta petición entra como `HumanMessage`, y `conservarElEncargo`
 * protege «el último humano». Sin el objetivo dentro, el encargo del usuario deja de estar
 * protegido y lo sustituye la lista de hallazgos.
 */
describe("el objetivo del turno viaja con la reparación", () => {
  const OBJETIVO = "tengo un error al ejecutar la app, puedes arreglarlo";

  it("va DELANTE de los hallazgos, y dice que no es un encargo nuevo", () => {
    const texto = textoDeReparacion([HALLAZGO], ["un texto se corta"], OBJETIVO);
    expect(texto).toContain(OBJETIVO);
    // Delante: lo primero que lee el modelo es para qué está, no la lista.
    expect(texto.indexOf(OBJETIVO)).toBeLessThan(texto.indexOf("un texto se corta"));
    expect(texto).toMatch(/no es un encargo\s*\n?\s*nuevo/i);
  });

  /** El reparto que arregla la deriva: lo que sirve al objetivo se arregla, lo demás se CUENTA. */
  it("manda NO tocar lo que no tenga que ver con el objetivo", () => {
    const texto = textoDeReparacion([], ["un texto se corta"], OBJETIVO);
    expect(texto).toMatch(/NO lo toques/);
    expect(texto).toMatch(/dilo en/i);
  });

  it("sin objetivo no se inventa uno, y el texto sigue siendo válido", () => {
    // Ausente = no se pudo saber. Mejor «corrige lo que puedas» que afirmar un objetivo.
    const texto = textoDeReparacion([HALLAZGO], []);
    expect(texto).not.toMatch(/TU OBJETIVO/);
    expect(texto).toContain("Corrige lo que puedas.");
  });
});
