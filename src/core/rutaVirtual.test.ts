import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { rutaRealDeVirtual } from "./rutaVirtual.js";

const RAIZ = resolve("/proyectos", "AppDemo");

describe("rutaRealDeVirtual", () => {
  it("la forma ROOTEADA cae dentro del proyecto, que es lo que `resolve` a secas no hacía", () => {
    // Medido antes de existir esta función: `resolve(raiz, "/app.xne")` devuelve `/app.xne`,
    // porque una absoluta descarta la base. Es la forma que usan las tools y las skills.
    expect(rutaRealDeVirtual(RAIZ, "/app.xne")).toBe(resolve(RAIZ, "app.xne"));
    expect(rutaRealDeVirtual(RAIZ, "/carpeta/Login.xne")).toBe(resolve(RAIZ, "carpeta/Login.xne"));
  });

  it("la forma RELATIVA sigue valiendo: las dos llegan", () => {
    // Las dos funcionan contra el backend del agente, así que tratar una como error dejaría
    // de leer el disco justo en los casos que hoy sí funcionan.
    expect(rutaRealDeVirtual(RAIZ, "app.xne")).toBe(resolve(RAIZ, "app.xne"));
    expect(rutaRealDeVirtual(RAIZ, "./app.xne")).toBe(resolve(RAIZ, "app.xne"));
  });

  it("los separadores de Windows se normalizan ANTES de resolver", () => {
    // En POSIX `resolve` trata «\» como un carácter más del nombre, así que sin normalizar
    // se buscaría en disco un fichero llamado «carpeta\Login.xne». La lección que ya pagó
    // `leerFicheroDeProyecto`.
    expect(rutaRealDeVirtual(RAIZ, "\\carpeta\\Login.xne")).toBe(resolve(RAIZ, "carpeta/Login.xne"));
  });

  it("una barra doble no deja un segmento vacío por medio", () => {
    expect(rutaRealDeVirtual(RAIZ, "//carpeta//Login.xne")).toBe(resolve(RAIZ, "carpeta/Login.xne"));
  });

  it("lo que se SALE del proyecto no se resuelve: de aquí sale una lectura de disco", () => {
    // Sin la contención, el contenido de un fichero de fuera acabaría en la pantalla de la
    // aprobación — y ahí es donde una persona decide creyendo que mira su proyecto.
    expect(rutaRealDeVirtual(RAIZ, "../otro/app.xne")).toBeUndefined();
    expect(rutaRealDeVirtual(RAIZ, "/../otro/app.xne")).toBeUndefined();
    expect(rutaRealDeVirtual(RAIZ, "carpeta/../../otro/app.xne")).toBeUndefined();
  });

  it("la raíz misma y una ruta vacía no son un fichero", () => {
    // La raíz no es un fichero que leer, y una cadena vacía no nombra nada: devolver la raíz
    // haría que quien lea el disco intentara leer un directorio.
    expect(rutaRealDeVirtual(RAIZ, "")).toBeUndefined();
    expect(rutaRealDeVirtual(RAIZ, "/")).toBeUndefined();
    expect(rutaRealDeVirtual(RAIZ, ".")).toBeUndefined();
  });
});
