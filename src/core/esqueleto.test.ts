import { describe, it, expect } from "vitest";
import { generarEsqueleto, carpetasDelEsqueleto, DatosDelProyecto } from "./esqueleto.js";

const HOLA_MUNDO: DatosDelProyecto = {
  nombre: "GestionClientes",
  titulo: "Gestión de Clientes",
  orientacion: "portrait",
  login: false,
};

describe("generarEsqueleto", () => {
  it("genera los ficheros obligatorios del proyecto mínimo", () => {
    const rutas = generarEsqueleto(HOLA_MUNDO).map((f) => f.ruta);
    expect(rutas).toEqual([
      "app.xml",
      "app.ini",
      "mappings.xne",
      "default.css",
      "functions.js",
      "EntradaApp.xne",
      "MenuPrincipal.xne",
    ]);
  });

  it("mappings.xne SOLO lleva Empresas y Usuarios (regla crítica de XOne)", () => {
    const mappings = generarEsqueleto(HOLA_MUNDO).find((f) => f.ruta === "mappings.xne")!;
    const colecciones = [...mappings.contenido.matchAll(/<coll name="(\w+)"/g)].map((m) => m[1]);
    expect(colecciones).toEqual(["Empresas", "Usuarios"]);
  });

  it("el prefix coincide entre app.xml y mappings.xne", () => {
    const ficheros = generarEsqueleto(HOLA_MUNDO);
    const prefijo = (ruta: string) =>
      ficheros.find((f) => f.ruta === ruta)!.contenido.match(/prefix="([^"]+)"/)![1];
    expect(prefijo("app.xml")).toBe(prefijo("mappings.xne"));
    expect(prefijo("app.xml")).toBe("gen");
  });

  it("sin login: autologon=true y ni login-coll ni Login.xne", () => {
    const ficheros = generarEsqueleto(HOLA_MUNDO);
    const app = ficheros.find((f) => f.ruta === "app.xml")!.contenido;
    expect(app).toContain('autologon="true"');
    expect(app).not.toContain("login-coll");
    expect(ficheros.map((f) => f.ruta)).not.toContain("Login.xne");
  });

  it("con login: autologon=false, login-coll y Login.xne", () => {
    const ficheros = generarEsqueleto({ ...HOLA_MUNDO, login: true });
    const app = ficheros.find((f) => f.ruta === "app.xml")!.contenido;
    expect(app).toContain('autologon="false"');
    expect(app).toContain('<login-coll>');
    expect(app).toContain('<item name="Login"');
    expect(ficheros.map((f) => f.ruta)).toContain("Login.xne");
  });

  it("con login: la pantalla llama a realizarLogin y functions.js lo define", () => {
    // Un login que llame a una función que no existe no da error en XOne: da un
    // botón muerto. La pantalla y el JS tienen que venir del mismo patrón.
    const ficheros = generarEsqueleto({ ...HOLA_MUNDO, login: true });
    const login = ficheros.find((f) => f.ruta === "Login.xne")!.contenido;
    const js = ficheros.find((f) => f.ruta === "functions.js")!.contenido;
    expect(login).toContain("realizarLogin();");
    expect(js).toContain("function realizarLogin()");
    expect(js).toContain("function validarRequerido(");
  });

  it("el nombre interno y el título llegan a app.ini y a las pantallas", () => {
    const ficheros = generarEsqueleto(HOLA_MUNDO);
    const ini = ficheros.find((f) => f.ruta === "app.ini")!.contenido;
    expect(ini).toContain("Name=GestionClientes");
    expect(ini).toContain("Title=Gestión de Clientes");
    const entrada = ficheros.find((f) => f.ruta === "EntradaApp.xne")!.contenido;
    expect(entrada).toContain('title="Gestión de Clientes"');
  });

  it("la orientación llega a app.xml", () => {
    const app = generarEsqueleto({ ...HOLA_MUNDO, orientacion: "landscape" })
      .find((f) => f.ruta === "app.xml")!
      .contenido;
    expect(app).toContain('screen-orientation="landscape"');
  });

  it("las carpetas del runtime: bd, icons y files (sin ficheros)", () => {
    expect(carpetasDelEsqueleto()).toEqual(["bd", "icons", "files"]);
  });
});