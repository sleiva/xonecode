import { describe, it, expect } from "vitest";
import {
  validarSettings,
  expandirConCasa,
  motivoDeWorkspaceInaceptable,
  rutaDeWorkspace,
  dentroDelWorkspace,
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
    expect(rutaDeWorkspace("/home/u/.xonecode/workspace", "webstudio", "MinitMT"))
      .toBe("/home/u/.xonecode/workspace/webstudio/MinitMT");
  });

  it("la BASE es el workspace: no se le cuelga un «workspace» que nadie pidió", () => {
    // El literal vivía en MEDIO (`<base>/<entorno>/workspace/<proyecto>`), y con la base
    // por omisión en `~/.xonecode` eso dejaba `webstudio/` y `manager/` de hermanos de
    // `agentes/`, `skills/` y `auth.json`. Movido a la base, quien elige una carpeta suya
    // obtiene lo que eligió y no un nivel de más.
    expect(rutaDeWorkspace("/home/u/xone-proyectos", "webstudio", "MinitMT"))
      .toBe("/home/u/xone-proyectos/webstudio/MinitMT");
  });

  it("el segmento del ENTORNO se queda, y no es decoración", () => {
    // El mismo nombre de proyecto existe en dos entornos a la vez, y los on-premise
    // comparten el id «otro» solo si se registran mal (ver `Wizard.tsx`). Sin este
    // segmento, dos copias distintas serían la misma carpeta.
    expect(rutaDeWorkspace("/w", "webstudio", "AppDemo")).not.toBe(rutaDeWorkspace("/w", "manager", "AppDemo"));
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

describe("dentroDelWorkspace: dónde puede xonecode commitear solo", () => {
  it("una copia del workspace sí, y la carpeta que abrió el usuario no", () => {
    // La carpeta del workspace la creó xonecode y es suya: ahí un commit por turno es
    // razonable. En la que abrió el usuario —offline, o `./bin/xonecode` dentro de su
    // repo— sería ensuciarle el historial cada vez que habla con el agente.
    expect(dentroDelWorkspace("/casa/.xonecode/workspace/webstudio/AppDemo", "/casa/.xonecode/workspace")).toBe(true);
    expect(dentroDelWorkspace("/proyectos/mi-app", "/casa/.xonecode/workspace")).toBe(false);
  });

  it("un vecino con el mismo prefijo NO cuela", () => {
    // La trampa de comparar cadenas: `/casa/.xonecodeX` empieza por `/casa/.xonecode`.
    expect(dentroDelWorkspace("/casa/.xonecodeX/workspace/webstudio/A", "/casa/.xonecode/workspace")).toBe(false);
  });

  it("la base a secas no es una copia: ahí no hay ningún proyecto", () => {
    expect(dentroDelWorkspace("/casa/.xonecode/workspace", "/casa/.xonecode/workspace")).toBe(false);
  });

  it("las rutas se normalizan antes de comparar", () => {
    // Una raíz con `..` o con barra final compara mal como texto plano.
    expect(dentroDelWorkspace("/casa/.xonecode/workspace/webstudio/A/", "/casa/.xonecode/workspace")).toBe(true);
    expect(dentroDelWorkspace("/casa/.xonecode/workspace/../../fuera", "/casa/.xonecode/workspace")).toBe(false);
  });
});

describe("expandirConCasa: el «~» es una comodidad de ENTRADA", () => {
  it("resuelve lo que se teclea con «~»", () => {
    expect(expandirConCasa("~/.xonecode/workspace", "/Users/ana")).toBe("/Users/ana/.xonecode/workspace");
    expect(expandirConCasa("~", "/Users/ana")).toBe("/Users/ana");
  });

  it("una ruta entera se queda igual", () => {
    expect(expandirConCasa("/Volumes/Externo/xone", "/Users/ana")).toBe("/Volumes/Externo/xone");
  });

  it("un «~otra» es la casa de OTRA persona y aquí no se resuelve", () => {
    // Se deja tal cual, y entonces no es absoluta: la rechaza el validador.
    expect(expandirConCasa("~otra/cosa", "/Users/ana")).toBe("~otra/cosa");
    expect(motivoDeWorkspaceInaceptable("~otra/cosa")).toBeDefined();
  });
});

describe("motivoDeWorkspaceInaceptable", () => {
  it("una carpeta absoluta vale", () => {
    expect(motivoDeWorkspaceInaceptable("/Users/ana/xone")).toBeUndefined();
  });

  it("en blanco, no: no es una elección", () => {
    expect(motivoDeWorkspaceInaceptable("   ")).toBeDefined();
  });

  it("relativa, tampoco: dependería del directorio desde el que se arrancó la consola", () => {
    expect(motivoDeWorkspaceInaceptable("proyectos")).toBeDefined();
    expect(motivoDeWorkspaceInaceptable("./proyectos")).toBeDefined();
  });
});
