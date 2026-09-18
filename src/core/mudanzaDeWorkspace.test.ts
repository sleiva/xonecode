import { describe, expect, it } from "vitest";

import { mudanzasPendientes, rutaMudada } from "./mudanzaDeWorkspace.js";

/** Una foto de disco de mentira: qué existe y qué carpetas cuelgan de dónde. */
function disco(arbol: Record<string, readonly string[]>): {
  existe: (r: string) => boolean;
  listar: (r: string) => readonly string[];
} {
  const rutas = new Set<string>();
  for (const [padre, hijos] of Object.entries(arbol)) {
    rutas.add(padre);
    for (const h of hijos) rutas.add(`${padre}/${h}`);
  }
  return {
    existe: (r) => rutas.has(r),
    listar: (r) => arbol[r] ?? [],
  };
}

describe("mudanzasPendientes: del reparto viejo al de ahora", () => {
  it("una copia por proyecto, del medio a la base", () => {
    const { mudanzas, chocadas } = mudanzasPendientes({
      legado: "/casa/.xonecode",
      workspace: "/casa/.xonecode/workspace",
      entornos: ["webstudio", "manager"],
      ...disco({
        "/casa/.xonecode/webstudio/workspace": ["AppDemo", "AppDeve"],
        "/casa/.xonecode/manager/workspace": ["MyAllXOne"],
      }),
    });

    expect(mudanzas).toEqual([
      { entorno: "webstudio", proyecto: "AppDemo", desde: "/casa/.xonecode/webstudio/workspace/AppDemo", hacia: "/casa/.xonecode/workspace/webstudio/AppDemo" },
      { entorno: "webstudio", proyecto: "AppDeve", desde: "/casa/.xonecode/webstudio/workspace/AppDeve", hacia: "/casa/.xonecode/workspace/webstudio/AppDeve" },
      { entorno: "manager", proyecto: "MyAllXOne", desde: "/casa/.xonecode/manager/workspace/MyAllXOne", hacia: "/casa/.xonecode/workspace/manager/MyAllXOne" },
    ]);
    expect(chocadas).toEqual([]);
  });

  it("un entorno sin carpeta vieja no es un fallo: es uno del que nunca se bajó nada", () => {
    const { mudanzas } = mudanzasPendientes({
      legado: "/casa/.xonecode",
      workspace: "/casa/.xonecode/workspace",
      entornos: ["webstudio", "on-premise"],
      ...disco({ "/casa/.xonecode/webstudio/workspace": ["AppDemo"] }),
    });
    expect(mudanzas.map((m) => m.entorno)).toEqual(["webstudio"]);
  });

  it("un destino que YA existe no se pisa: se cuenta aparte", () => {
    // Nunca sobrescribir es la regla: ahí hay una copia con su historia de git, sus
    // sesiones y su checkpoint. Y callarlo dejaría dos copias del mismo proyecto sin que
    // nadie supiera cuál mira la consola.
    const { mudanzas, chocadas } = mudanzasPendientes({
      legado: "/casa/.xonecode",
      workspace: "/casa/.xonecode/workspace",
      entornos: ["webstudio"],
      ...disco({
        "/casa/.xonecode/webstudio/workspace": ["AppDemo"],
        "/casa/.xonecode/workspace/webstudio": ["AppDemo"],
      }),
    });
    expect(mudanzas).toEqual([]);
    expect(chocadas.map((m) => m.proyecto)).toEqual(["AppDemo"]);
  });

  it("con el workspace elegido a mano, la vieja cuelga de ÉL y la mudanza sigue teniendo sentido", () => {
    // El reparto viejo era `<base>/<entorno>/workspace/<proyecto>` fuera cual fuera la
    // base, así que quien la había configurado también tiene el nivel de más.
    const { mudanzas } = mudanzasPendientes({
      legado: "/u/xone-proyectos",
      workspace: "/u/xone-proyectos",
      entornos: ["webstudio"],
      ...disco({ "/u/xone-proyectos/webstudio/workspace": ["AppDemo"] }),
    });
    expect(mudanzas).toEqual([
      { entorno: "webstudio", proyecto: "AppDemo", desde: "/u/xone-proyectos/webstudio/workspace/AppDemo", hacia: "/u/xone-proyectos/webstudio/AppDemo" },
    ]);
  });

  it("una carpeta que se llame «workspace» dentro del propio workspace nuevo NO se muda sobre sí misma", () => {
    // El caso degenerado: `<w>/webstudio/workspace` existe porque alguien llamó
    // «workspace» a un proyecto. Mudarlo a `<w>/webstudio` sería moverlo encima de su
    // propio padre.
    const { mudanzas, chocadas } = mudanzasPendientes({
      legado: "/w",
      workspace: "/w",
      entornos: ["webstudio"],
      ...disco({ "/w/webstudio/workspace": ["workspace"] }),
    });
    expect(mudanzas).toEqual([]);
    expect(chocadas).toEqual([]);
  });

  it("un id de entorno que no es un segmento llano no compone ninguna ruta", () => {
    const { mudanzas } = mudanzasPendientes({
      legado: "/casa/.xonecode",
      workspace: "/casa/.xonecode/workspace",
      entornos: ["..", "a/b", ""],
      existe: () => true,
      listar: () => ["p"],
    });
    expect(mudanzas).toEqual([]);
  });

  it("un nombre de proyecto que no es un segmento llano tampoco", () => {
    const { mudanzas } = mudanzasPendientes({
      legado: "/casa/.xonecode",
      workspace: "/casa/.xonecode/workspace",
      entornos: ["webstudio"],
      existe: (r) => r === "/casa/.xonecode/webstudio/workspace",
      listar: () => ["..", "a/b"],
    });
    expect(mudanzas).toEqual([]);
  });
});

describe("rutaMudada: las rutas absolutas que ya están grabadas", () => {
  const mudanzas = [
    { entorno: "webstudio", proyecto: "AppDemo", desde: "/casa/.xonecode/webstudio/workspace/AppDemo", hacia: "/casa/.xonecode/workspace/webstudio/AppDemo" },
  ];

  it("la raíz exacta se reescribe", () => {
    expect(rutaMudada("/casa/.xonecode/webstudio/workspace/AppDemo", mudanzas))
      .toBe("/casa/.xonecode/workspace/webstudio/AppDemo");
  });

  it("y lo que cuelga de ella también", () => {
    expect(rutaMudada("/casa/.xonecode/webstudio/workspace/AppDemo/doc/x.md", mudanzas))
      .toBe("/casa/.xonecode/workspace/webstudio/AppDemo/doc/x.md");
  });

  it("un vecino con el mismo PREFIJO de texto no cuela", () => {
    // La trampa de siempre: `AppDemoViejo` empieza por `AppDemo`. Se compara por
    // SEGMENTOS, igual que `dentroDelWorkspace`.
    expect(rutaMudada("/casa/.xonecode/webstudio/workspace/AppDemoViejo", mudanzas)).toBeUndefined();
  });

  it("una ruta de fuera se queda como está, y eso se DICE devolviendo ausente", () => {
    // Ausente no es «no cambia»: es «esto no lo mudé yo», y quien llama distingue entre
    // reescribir una entrada y dejarla intacta.
    expect(rutaMudada("/proyectos/mi-app", mudanzas)).toBeUndefined();
  });

  it("se normaliza antes de comparar: una barra final no es otra ruta", () => {
    expect(rutaMudada("/casa/.xonecode/webstudio/workspace/AppDemo/", mudanzas))
      .toBe("/casa/.xonecode/workspace/webstudio/AppDemo");
  });
});
