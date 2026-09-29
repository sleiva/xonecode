import { describe, expect, it } from "vitest";
import { IconosEnMemoria, esDoble } from "../../core/ports.js";
import { crearBuscarIcono, NOMBRE_BUSCAR_ICONO, recibeBuscarIcono } from "./buscarIcono.js";
import { CAMPOS_SEGUROS, detalleDe } from "../turno/resumenDeTool.js";

const CATALOGO = ["lucide:home", "lucide:home-2", "mdi:home", "lucide:trash"];
const llamar = (iconos: IconosEnMemoria, entrada: Record<string, unknown>): Promise<string> =>
  crearBuscarIcono(iconos).invoke(entrada as never) as Promise<string>;

describe("buscar_icono", () => {
  it("el doble lleva la marca de doble", () => {
    expect(esDoble(new IconosEnMemoria())).toBe(true);
  });

  it("busca, acota por prefijo y dice el siguiente paso", async () => {
    const r = await llamar(new IconosEnMemoria(CATALOGO), { operacion: "buscar", consulta: "home", prefijo: "lucide" });
    expect(r).toContain("lucide:home");
    expect(r).not.toContain("mdi:home");
    expect(r).toContain("obtener");
  });

  it("sin resultados lo dice, no devuelve una lista vacía muda", async () => {
    expect(await llamar(new IconosEnMemoria(CATALOGO), { operacion: "buscar", consulta: "zzz" })).toContain("Ningún icono");
  });

  it("obtener devuelve el SVG con el color y el tamaño pedidos y la ruta donde escribirlo", async () => {
    const iconos = new IconosEnMemoria(CATALOGO);
    const r = await llamar(iconos, { operacion: "obtener", id: "lucide:home", color: "#1a73e8", tamano: 32 });
    expect(iconos.peticiones).toEqual([{ id: "lucide:home", color: "#1a73e8", tamano: 32 }]);
    expect(r).toContain("/icons/ic_home.svg");
    // Se referencia con el nombre A SECAS: los ejemplos de XOne usan img="add.png", y con `icons/`
    // delante buscaría icons/icons/… sin avisar.
    expect(r).toContain('img="ic_home.svg"');
    expect(r).not.toContain('img="icons/');
    expect(r).toContain("<svg");
    expect(r).toContain('height="32"');
  });

  it("sin color NO llega a la red: se devuelve el motivo", async () => {
    const iconos = new IconosEnMemoria(CATALOGO);
    const r = await llamar(iconos, { operacion: "obtener", id: "lucide:home" });
    expect(r).toContain("hexadecimal");
    expect(iconos.peticiones).toHaveLength(0);
  });

  it("currentColor y un id con ruta se rechazan como texto, sin llegar a la red", async () => {
    const iconos = new IconosEnMemoria(CATALOGO);
    expect(await llamar(iconos, { operacion: "obtener", id: "lucide:home", color: "currentColor" })).toContain("no vale");
    expect(await llamar(iconos, { operacion: "obtener", id: "../x:y", color: "#000000" })).toContain("no es un id");
    expect(iconos.peticiones).toHaveLength(0);
  });

  it("sin red se DEVUELVE un texto que manda no dibujar a mano, y no lanza", async () => {
    const r = await llamar(new IconosEnMemoria(CATALOGO, "no hay red o Iconify no responde"), {
      operacion: "obtener", id: "lucide:home", color: "#000000",
    });
    expect(r).toContain("no hay red");
    expect(r).toContain("No dibujes el icono a mano");
    expect(r).not.toContain("<svg");
  });

  it("el esquema real rechaza una operación inventada", async () => {
    await expect(llamar(new IconosEnMemoria(CATALOGO), { operacion: "descargar" })).rejects.toThrow();
  });

  it("el detalle de la línea es la consulta o el id, y el SVG no cruza", () => {
    expect(CAMPOS_SEGUROS[NOMBRE_BUSCAR_ICONO]).toBeDefined();
    expect(detalleDe(NOMBRE_BUSCAR_ICONO, { operacion: "buscar", consulta: "home" })).toBe("home");
  });

  it("la reciben quienes escriben el proyecto, no quien ejecuta ni quien solo lee ni el documentador", () => {
    expect(recibeBuscarIcono({ soloLectura: false, ejecucion: false, escribeEn: [] })).toBe(true);
    expect(recibeBuscarIcono({ soloLectura: true, ejecucion: false, escribeEn: [] })).toBe(false);
    expect(recibeBuscarIcono({ soloLectura: false, ejecucion: true, escribeEn: [] })).toBe(false);
    expect(recibeBuscarIcono({ soloLectura: false, ejecucion: false, escribeEn: ["/doc/"] })).toBe(false);
  });
});
