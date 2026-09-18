import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { mudarWorkspaceLegado } from "./mudanzaEnDisco.js";

let casa: string;
let legado: string;
let workspace: string;
const dichos: string[] = [];
const escribir = (t: string): void => void dichos.push(t);

/** Una copia local del reparto VIEJO, con algo dentro para poder reconocerla luego. */
function copiaVieja(entorno: string, proyecto: string, marca = "hola"): string {
  const raiz = join(legado, entorno, "workspace", proyecto);
  mkdirSync(join(raiz, ".xonecode"), { recursive: true });
  writeFileSync(join(raiz, "app.xml"), marca);
  return raiz;
}

beforeEach(() => {
  casa = mkdtempSync(join(tmpdir(), "xonecode-mudanza-"));
  legado = join(casa, ".xonecode");
  workspace = join(legado, "workspace");
  mkdirSync(legado, { recursive: true });
  dichos.length = 0;
});

describe("mudarWorkspaceLegado", () => {
  it("muda cada copia a `<workspace>/<entorno>/<proyecto>` con lo que tenía dentro", () => {
    copiaVieja("webstudio", "AppDemo", "soy AppDemo");
    copiaVieja("manager", "MyAllXOne", "soy MyAllXOne");

    const { mudadas, chocadas } = mudarWorkspaceLegado({
      casa,
      legado,
      workspace,
      entornos: ["webstudio", "manager"],
      escribir,
    });

    expect({ mudadas, chocadas }).toEqual({ mudadas: 2, chocadas: 0 });
    expect(readFileSync(join(workspace, "webstudio", "AppDemo", "app.xml"), "utf8")).toBe("soy AppDemo");
    expect(readFileSync(join(workspace, "manager", "MyAllXOne", "app.xml"), "utf8")).toBe("soy MyAllXOne");
    // Y el `.xonecode/` del proyecto —sesiones, checkpoint, ref de git— viaja con él: se
    // mueve la CARPETA, no se copia su contenido.
    expect(existsSync(join(workspace, "webstudio", "AppDemo", ".xonecode"))).toBe(true);
    expect(existsSync(join(legado, "webstudio", "workspace", "AppDemo"))).toBe(false);
  });

  it("la carpeta vieja se retira solo si queda VACÍA", () => {
    copiaVieja("webstudio", "AppDemo");
    copiaVieja("manager", "MyAllXOne");
    // Algo que no es un proyecto dentro de la carpeta vieja de manager: ahí no se borra
    // nada. `rmdir` no vacía carpetas, y esa es justo la garantía que se quiere.
    writeFileSync(join(legado, "manager", "workspace", "notas.txt"), "mías");

    mudarWorkspaceLegado({ casa, legado, workspace, entornos: ["webstudio", "manager"], escribir });

    expect(existsSync(join(legado, "webstudio"))).toBe(false);
    expect(readFileSync(join(legado, "manager", "workspace", "notas.txt"), "utf8")).toBe("mías");
  });

  it("un `.DS_Store` solo no salva el husco vacío, y nada más se borra", () => {
    // Medido en un caso real: Finder había dejado uno en las dos carpetas, y sin esto el
    // husco vacío se quedaba en `~/.xonecode` para siempre — justo lo que la mudanza venía
    // a quitar. La lista es la CERRADA de `gitSync.ts`, no «lo que empieza por punto».
    copiaVieja("webstudio", "AppDemo");
    writeFileSync(join(legado, "webstudio", ".DS_Store"), "basura");
    writeFileSync(join(legado, "webstudio", "workspace", ".DS_Store"), "basura");
    copiaVieja("manager", "MyAllXOne");
    writeFileSync(join(legado, "manager", "workspace", ".env"), "SECRETO=1");

    mudarWorkspaceLegado({ casa, legado, workspace, entornos: ["webstudio", "manager"], escribir });

    expect(existsSync(join(legado, "webstudio"))).toBe(false);
    // Un fichero que NO es basura del SO deja la carpeta en pie, con él dentro.
    expect(readFileSync(join(legado, "manager", "workspace", ".env"), "utf8")).toBe("SECRETO=1");
  });

  it("un destino que ya existe NO se pisa, y se dice", () => {
    copiaVieja("webstudio", "AppDemo", "la vieja");
    mkdirSync(join(workspace, "webstudio", "AppDemo"), { recursive: true });
    writeFileSync(join(workspace, "webstudio", "AppDemo", "app.xml"), "la nueva");

    const { mudadas, chocadas } = mudarWorkspaceLegado({
      casa,
      legado,
      workspace,
      entornos: ["webstudio"],
      escribir,
    });

    expect({ mudadas, chocadas }).toEqual({ mudadas: 0, chocadas: 1 });
    expect(readFileSync(join(workspace, "webstudio", "AppDemo", "app.xml"), "utf8")).toBe("la nueva");
    expect(readFileSync(join(legado, "webstudio", "workspace", "AppDemo", "app.xml"), "utf8")).toBe("la vieja");
    expect(dichos.join("\n")).toMatch(/AppDemo/);
  });

  it("reescribe la raíz de las tareas y la autorización sin aprobación", () => {
    const vieja = copiaVieja("webstudio", "AppDemo");
    mkdirSync(join(legado, "tareas"), { recursive: true });
    writeFileSync(
      join(legado, "tareas", "indice.json"),
      JSON.stringify([
        { id: "t1", proyecto: { id: "p1", raiz: vieja, nombre: "AppDemo" }, titulo: "x", estado: "pendiente" },
        { id: "t2", proyecto: { id: "p2", raiz: "/proyectos/otro", nombre: "Otro" }, titulo: "y", estado: "pendiente" },
      ])
    );
    writeFileSync(
      join(legado, "settings.json"),
      JSON.stringify({ entornos: [], sinAprobacion: { [vieja]: true, "/proyectos/otro": true } })
    );

    mudarWorkspaceLegado({ casa, legado, workspace, entornos: ["webstudio"], escribir });

    const indice = JSON.parse(readFileSync(join(legado, "tareas", "indice.json"), "utf8"));
    expect(indice[0].proyecto.raiz).toBe(join(workspace, "webstudio", "AppDemo"));
    // Lo que no se mudó se queda EXACTAMENTE como estaba, y el resto de la entrada también.
    expect(indice[1].proyecto.raiz).toBe("/proyectos/otro");
    expect(indice[0].titulo).toBe("x");

    const settings = JSON.parse(readFileSync(join(legado, "settings.json"), "utf8"));
    expect(settings.sinAprobacion).toEqual({
      [join(workspace, "webstudio", "AppDemo")]: true,
      "/proyectos/otro": true,
    });
  });

  it("sin nada que mudar no dice NADA: un arranque normal no lleva ruido", () => {
    const { mudadas, chocadas } = mudarWorkspaceLegado({
      casa,
      legado,
      workspace,
      entornos: ["webstudio"],
      escribir,
    });
    expect({ mudadas, chocadas }).toEqual({ mudadas: 0, chocadas: 0 });
    expect(dichos).toEqual([]);
  });

  it("una copia que no se puede mover no se lleva a las demás NI reescribe su ruta", () => {
    // El fallo de verdad que esto cubre es EXDEV —un workspace en otro volumen—, que no se
    // puede provocar en un temporal. Lo que se fija es la consecuencia: las otras se mudan,
    // se dice cuál falló, y su raíz en el índice se queda apuntando a donde SIGUE estando.
    const rota = copiaVieja("webstudio", "AppDemo");
    copiaVieja("webstudio", "AppDeve");
    mkdirSync(join(legado, "tareas"), { recursive: true });
    writeFileSync(
      join(legado, "tareas", "indice.json"),
      JSON.stringify([{ id: "t1", proyecto: { id: "p1", raiz: rota, nombre: "AppDemo" }, titulo: "x" }])
    );

    const { mudadas } = mudarWorkspaceLegado({
      casa,
      legado,
      workspace,
      entornos: ["webstudio"],
      escribir,
      mover: (desde, hacia) => {
        if (desde.endsWith("AppDemo")) throw new Error("EXDEV de mentira");
        mkdirSync(join(hacia, ".."), { recursive: true });
        writeFileSync(join(hacia), "");
      },
    });

    expect(mudadas).toBe(1);
    expect(dichos.join("\n")).toMatch(/AppDemo/);
    const indice = JSON.parse(readFileSync(join(legado, "tareas", "indice.json"), "utf8"));
    expect(indice[0].proyecto.raiz).toBe(rota);
  });
});
