import { describe, it, expect } from "vitest";
import {
  validarSettings,
  rutaDeWorkspace,
  seMira,
  seAplicaSinAprobacion,
  PLATAFORMAS_DE_DISPOSITIVO,
  TOPE_DE_CONCURRENCIA_DE_TAREAS,
} from "./settings.js";

describe("validarSettings", () => {
  it("conserva los entornos bien formados, sin avisos", () => {
    const { settings, avisos } = validarSettings({
      entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
    });
    expect(settings.entornos).toHaveLength(1);
    expect(settings.entornos[0].id).toBe("webstudio");
    expect(avisos).toEqual([]);
  });

  it("descarta en silencio un entorno sin url, en vez de tumbar el arranque", () => {
    const { settings, avisos } = validarSettings({ entornos: [{ id: "roto", nombre: "Roto" }] });
    expect(settings.entornos).toHaveLength(0);
    expect(avisos).toEqual([]);
  });

  it("una clave de API a nivel de fichero deja un AVISO grave y NO lanza: el resto se carga igual", () => {
    const { settings, avisos } = validarSettings({
      entornos: [{ id: "a", nombre: "A", url: "https://a/mcp" }],
      apiKey: "sk-secreta-de-verdad",
    });
    expect(settings.entornos.map((e) => e.id)).toEqual(["a"]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidad).toBe("grave");
    expect(avisos[0].texto).toContain("apiKey");
    expect(avisos[0].texto).not.toContain("sk-secreta-de-verdad");
  });

  it("«key» — el campo EXACTO que usa auth.json — se detecta: es el pegado accidental más plausible", () => {
    const { avisos } = validarSettings({ entornos: [], key: "sk-deberia-fallar" });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidad).toBe("grave");
    expect(avisos[0].texto).toContain("key");
    expect(avisos[0].texto).not.toContain("sk-deberia-fallar");
  });

  it("una clave dentro de un entorno deja aviso y el entorno se carga igual, sin el campo", () => {
    const { settings, avisos } = validarSettings({
      entornos: [{ id: "a", nombre: "A", url: "https://x/mcp", token: "t-secreto" }],
    });
    expect(settings.entornos).toHaveLength(1);
    expect(settings.entornos[0]).toEqual({ id: "a", nombre: "A", url: "https://x/mcp" });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidad).toBe("grave");
    expect(avisos[0].texto).toContain("token");
    expect(avisos[0].texto).not.toContain("t-secreto");
  });

  it("sin entornos, la lista es vacía y no undefined", () => {
    expect(validarSettings({}).settings.entornos).toEqual([]);
  });

  it("conserva la base del workspace si es una cadena", () => {
    expect(validarSettings({ entornos: [], workspace: "/home/u/xone-projects" }).settings.workspace)
      .toBe("/home/u/xone-projects");
  });

  it("un bruto que no es objeto (null, array, primitivo) da settings vacíos y sin avisos, no un fallo", () => {
    expect(validarSettings(null)).toEqual({ settings: { entornos: [] }, avisos: [] });
    expect(validarSettings([1, 2, 3])).toEqual({ settings: { entornos: [] }, avisos: [] });
    expect(validarSettings("no soy un objeto")).toEqual({ settings: { entornos: [] }, avisos: [] });
  });
});

describe("rutaDeWorkspace", () => {
  it("la base es configurable; la disposición de dentro la fija xonecode", () => {
    expect(rutaDeWorkspace("/home/u/.xonecode", "webstudio", "MinitMT"))
      .toBe("/home/u/.xonecode/webstudio/workspace/MinitMT");
  });

  it("un nombre con separador o .. no puede salirse de la base", () => {
    expect(() => rutaDeWorkspace("/base", "webstudio", "../fuera")).toThrow();
    expect(() => rutaDeWorkspace("/base", "..", "p")).toThrow();
    expect(() => rutaDeWorkspace("/base", "webstudio", "a/b")).toThrow();
  });
});

describe("los destinos de prueba en settings.json", () => {
  it("solo booleanos, y «false» de CADENA no cuela por verdadero", () => {
    const { settings } = validarSettings({
      entornos: [],
      dispositivos: { android: false, ios: true, iosSimulador: "false", androidEmulador: 1 },
    });
    // La cadena y el número se descartan como cualquier campo desconocido, y entonces manda
    // la omisión: mirar. Tomar `"false"` por falso es la trampa que este repo ya pagó dos
    // veces, y aquí apagaría un destino que nadie apagó.
    expect(settings.dispositivos).toEqual({ android: false, ios: true });
    expect(seMira(settings.dispositivos, "iosSimulador")).toBe(true);
    expect(seMira(settings.dispositivos, "android")).toBe(false);
  });

  it("ausente y vacío son lo mismo aquí —mirar todo— y no se guarda un objeto vacío", () => {
    expect(validarSettings({ entornos: [] }).settings.dispositivos).toBeUndefined();
    expect(validarSettings({ entornos: [], dispositivos: {} }).settings.dispositivos).toBeUndefined();
    expect(validarSettings({ entornos: [], dispositivos: "no" }).settings.dispositivos).toBeUndefined();
    for (const p of PLATAFORMAS_DE_DISPOSITIVO) expect(seMira(undefined, p)).toBe(true);
  });
});

describe("las escrituras sin aprobación", () => {
  const RAIZ = "/proyectos/AppDemo";
  const base = { raiz: RAIZ, sinAprobacion: { [RAIZ]: true }, cloudstudio: undefined, interactivo: true };

  it("se aplican solo si lo dijo el dueño de la máquina PARA ESTA raíz", () => {
    expect(seAplicaSinAprobacion(base)).toBe(true);
    expect(seAplicaSinAprobacion({ ...base, sinAprobacion: undefined })).toBe(false);
    expect(seAplicaSinAprobacion({ ...base, sinAprobacion: {} })).toBe(false);
    // Otra carpeta no hereda la decisión, ni siquiera una que empiece igual.
    expect(seAplicaSinAprobacion({ ...base, raiz: "/proyectos/AppDemo2" })).toBe(false);
    expect(seAplicaSinAprobacion({ ...base, raiz: "/proyectos/AppDemo/sub" })).toBe(false);
  });

  it("NUNCA en un proyecto conectado a CloudStudio, diga lo que diga el `modo`", () => {
    // Ahí lo que se escribe acaba subiendo al trabajo de otras personas. Y se mira el
    // bloque `cloudstudio` y no el campo `modo` porque `modo` vive en el mismo fichero que
    // podría venir en la carpeta.
    expect(seAplicaSinAprobacion({ ...base, cloudstudio: { url: "https://x/mcp" } })).toBe(false);
  });

  it("NUNCA sin nadie delante: es «no pulso», no «no hace falta humano»", () => {
    // `xonecode run` en CI y las tuberías siguen sin aplicar nada, que es lo que hacen hoy.
    expect(seAplicaSinAprobacion({ ...base, interactivo: false })).toBe(false);
  });

  it("solo el booleano `true` concede; una cadena «true» no", () => {
    // La trampa que este repo ya pagó dos veces. Se filtra al validar el fichero.
    const { settings } = validarSettings({ entornos: [], sinAprobacion: { [RAIZ]: "true" } });
    expect(settings.sinAprobacion).toBeUndefined();
  });

  it("un `false` no se guarda, y una clave que no es ruta absoluta tampoco", () => {
    // `false` significa lo mismo que no estar; una ruta relativa no casaría nunca con la
    // raíz y quedaría en el fichero pareciendo que hace algo.
    const { settings } = validarSettings({
      entornos: [],
      sinAprobacion: { [RAIZ]: true, "/otro": false, "relativa/x": true },
    });
    expect(settings.sinAprobacion).toEqual({ [RAIZ]: true });
  });
});

describe("el tope de concurrencia de tareas en settings.json", () => {
  it("un entero en rango se conserva, CERO incluido: es cómo se pausa la cola", () => {
    expect(validarSettings({ entornos: [], concurrenciaDeTareas: 0 }).settings.concurrenciaDeTareas).toBe(0);
    expect(validarSettings({ entornos: [], concurrenciaDeTareas: 5 }).settings.concurrenciaDeTareas).toBe(5);
    expect(
      validarSettings({ entornos: [], concurrenciaDeTareas: TOPE_DE_CONCURRENCIA_DE_TAREAS }).settings
        .concurrenciaDeTareas
    ).toBe(TOPE_DE_CONCURRENCIA_DE_TAREAS);
  });

  it("ausente no es cero: es «no lo he dicho», y no se afirma nada", () => {
    expect(validarSettings({ entornos: [] }).settings.concurrenciaDeTareas).toBeUndefined();
  });

  it("lo que no tiene forma de entero en rango se descarta, no se acota", () => {
    expect(validarSettings({ entornos: [], concurrenciaDeTareas: -1 }).settings.concurrenciaDeTareas).toBeUndefined();
    expect(
      validarSettings({ entornos: [], concurrenciaDeTareas: TOPE_DE_CONCURRENCIA_DE_TAREAS + 1 }).settings
        .concurrenciaDeTareas
    ).toBeUndefined();
    expect(validarSettings({ entornos: [], concurrenciaDeTareas: 2.5 }).settings.concurrenciaDeTareas).toBeUndefined();
    expect(validarSettings({ entornos: [], concurrenciaDeTareas: "2" }).settings.concurrenciaDeTareas).toBeUndefined();
  });
});
