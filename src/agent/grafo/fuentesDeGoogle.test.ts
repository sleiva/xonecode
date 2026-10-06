import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FuentesEnMemoria } from "../../core/ports.js";
import { crearBuscarFuente, crearTraerFuente } from "./fuentesDeGoogle.js";
import type { QuienDecidePermisos } from "./perfiles.js";

const CATALOGO = [
  { familia: "Inter", categoria: "Sans Serif", estilos: ["400", "700"] },
  { familia: "Roboto Mono", categoria: "Monospace", estilos: ["400", "700i"] },
];
const DESARROLLADOR: QuienDecidePermisos = { nombre: "developer-xone", soloLectura: false };
const DISENADOR: QuienDecidePermisos = { nombre: "designer-xone", soloLectura: false, escribeEn: ["/icons/", "/fonts/"] };
const SOLO_ICONOS: QuienDecidePermisos = { nombre: "viejo", soloLectura: false, escribeEn: ["/icons/"] };

const raiz = (): string => mkdtempSync(join(tmpdir(), "xc-fuentes-"));

describe("buscar_fuente", () => {
  it("lista familias con sus pesos y el fichero de cada una", async () => {
    const r = await crearBuscarFuente(new FuentesEnMemoria(CATALOGO)).invoke({ consulta: "roboto mono" });
    expect(r).toContain("Roboto Mono (Monospace): pesos 400, 700 cursiva");
    expect(r).toContain("/fonts/RobotoMono-Regular.ttf");
    expect(r).toContain("traer_fuente");
  });
  it("sin coincidencias, lo dice", async () => {
    expect(await crearBuscarFuente(new FuentesEnMemoria(CATALOGO)).invoke({ consulta: "comic" })).toContain("Ninguna familia");
  });
  it("sin red, lo DEVUELVE (no lanza)", async () => {
    const r = await crearBuscarFuente(new FuentesEnMemoria(CATALOGO, "no hay red")).invoke({ consulta: "inter" });
    expect(r).toContain("No se pudo buscar: no hay red");
  });
});

describe("traer_fuente", () => {
  const traer = (fuentes: FuentesEnMemoria, perfil: QuienDecidePermisos, r: string) => crearTraerFuente(fuentes, { raiz: r, perfil });

  it("escribe los bytes en fonts/ con el nombre de la convención, y dice el fontname y que hay que desplegar", async () => {
    const r = raiz();
    const fuentes = new FuentesEnMemoria(CATALOGO);
    const salida = await traer(fuentes, DISENADOR, r).invoke({ familia: "Inter", peso: 700, file_path: "/fonts/Inter-Bold.ttf" });
    expect(salida).toContain("fontname: Inter-Bold.ttf");
    expect(salida).toContain("DESPLEGAR");
    const bytes = readFileSync(join(r, "fonts", "Inter-Bold.ttf"));
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0, 1, 0, 0]);
    expect(fuentes.peticiones).toEqual([{ familia: "Inter", peso: 700, cursiva: false }]);
  });

  it("vale también para el desarrollador, y reemplaza un fichero que ya estaba", async () => {
    const r = raiz();
    mkdirSync(join(r, "fonts"));
    writeFileSync(join(r, "fonts", "RobotoMono-BoldItalic.ttf"), "viejo");
    const salida = await traer(new FuentesEnMemoria(CATALOGO), DESARROLLADOR, r)
      .invoke({ familia: "Roboto Mono", peso: 700, cursiva: true, file_path: "fonts/RobotoMono-BoldItalic.ttf" });
    expect(salida).toContain("Escrito /fonts/RobotoMono-BoldItalic.ttf");
    expect(readFileSync(join(r, "fonts", "RobotoMono-BoldItalic.ttf"), "latin1")).not.toBe("viejo");
  });

  it("el destino lo decide el código: otro file_path se rechaza diciendo el bueno, sin pedir nada a la red", async () => {
    const r = raiz();
    const fuentes = new FuentesEnMemoria(CATALOGO);
    for (const ruta of ["/fonts/inter.ttf", "/icons/Inter-Bold.ttf", "/fonts/../.env", "/.xonecode/Inter-Bold.ttf"]) {
      const salida = await traer(fuentes, DISENADOR, r).invoke({ familia: "Inter", peso: 700, file_path: ruta });
      expect(salida).toContain("es /fonts/Inter-Bold.ttf");
    }
    expect(fuentes.peticiones).toEqual([]);
    expect(existsSync(join(r, "fonts"))).toBe(false);
  });

  it("un estilo que la familia no tiene se dice con los que sí; una familia que no existe, también", async () => {
    const r = raiz();
    const fuentes = new FuentesEnMemoria(CATALOGO);
    expect(await traer(fuentes, DISENADOR, r).invoke({ familia: "Inter", peso: 300, file_path: "/fonts/Inter-Light.ttf" }))
      .toContain("tiene 400, 700");
    expect(await traer(fuentes, DISENADOR, r).invoke({ familia: "Comic Neue", peso: 400, file_path: "/fonts/ComicNeue-Regular.ttf" }))
      .toContain("no tiene la familia");
    expect(await traer(fuentes, DISENADOR, r).invoke({ familia: "Inter", peso: 450, file_path: "/fonts/x.ttf" })).toContain("no es un peso");
    expect(await traer(fuentes, DISENADOR, r).invoke({ familia: "../x", peso: 400, file_path: "/fonts/x.ttf" })).toContain("no es un nombre");
    expect(existsSync(join(r, "fonts"))).toBe(false);
  });

  it("sin red no se escribe nada, y se DEVUELVE", async () => {
    const r = raiz();
    const salida = await traer(new FuentesEnMemoria(CATALOGO, "no hay red"), DISENADOR, r)
      .invoke({ familia: "Inter", peso: 400, file_path: "/fonts/Inter-Regular.ttf" });
    expect(salida).toContain("No se ha escrito nada");
    expect(existsSync(join(r, "fonts"))).toBe(false);
  });

  it("quien no puede escribir en fonts/ no escribe (el permiso se reaplica a mano)", async () => {
    const r = raiz();
    const fuentes = new FuentesEnMemoria(CATALOGO);
    const salida = await traer(fuentes, SOLO_ICONOS, r).invoke({ familia: "Inter", peso: 400, file_path: "/fonts/Inter-Regular.ttf" });
    expect(salida).toContain("No puedes escribir");
    expect(fuentes.peticiones).toEqual([]);
  });

  it("un fonts/ que es un enlace hacia fuera del proyecto se rechaza", async () => {
    const r = raiz();
    const fuera = mkdtempSync(join(tmpdir(), "xc-fuera-"));
    symlinkSync(fuera, join(r, "fonts"));
    const salida = await traer(new FuentesEnMemoria(CATALOGO), DISENADOR, r)
      .invoke({ familia: "Inter", peso: 400, file_path: "/fonts/Inter-Regular.ttf" });
    expect(salida).toContain("fuera del proyecto");
    expect(existsSync(join(fuera, "Inter-Regular.ttf"))).toBe(false);
  });

  it("un fichero final que es un enlace no se sigue", async () => {
    const r = raiz();
    mkdirSync(join(r, "fonts"));
    writeFileSync(join(r, "otro.ttf"), "x");
    symlinkSync(join(r, "otro.ttf"), join(r, "fonts", "Inter-Regular.ttf"));
    const salida = await traer(new FuentesEnMemoria(CATALOGO), DISENADOR, r)
      .invoke({ familia: "Inter", peso: 400, file_path: "/fonts/Inter-Regular.ttf" });
    expect(salida).toContain("no es un fichero normal");
    expect(readFileSync(join(r, "otro.ttf"), "utf8")).toBe("x");
  });
});
