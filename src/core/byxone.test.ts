import { describe, expect, it } from "vitest";
import {
  cadenaCanonica, compararVersiones, firmarPeticion, frameworksDelCatalogo, motivoDeCredencialByxone, motivoDeRespuestaByxone,
  resolverCredencialByxone, SHA256_DEL_VACIO, VARIABLE_CLIENTE_BYXONE, VARIABLE_SECRETO_BYXONE,
} from "./byxone.js";

const CREDENCIAL = { clientId: "xcode", secreto: "secreto-de-prueba" };

describe("la firma de byXOne", () => {
  // Los vectores se calcularon aparte con el ejemplo en Python de la guía del servicio
  // (hmac + hashlib + base64): si esto diverge, diverge del servidor.
  it("un GET firma la ruta CON su query y el hash del cuerpo vacío", () => {
    const p = { metodo: "get", ruta: "/api/files?categoria=framework", ts: 1759345678, nonce: "7f3a9c1e2b4d5a60" };
    expect(cadenaCanonica(p)).toBe(`GET\n/api/files?categoria=framework\n1759345678\n7f3a9c1e2b4d5a60\n${SHA256_DEL_VACIO}`);
    expect(firmarPeticion(CREDENCIAL, p)).toEqual({
      "X-Client-Id": "xcode",
      "X-Timestamp": "1759345678",
      "X-Nonce": "7f3a9c1e2b4d5a60",
      "X-Signature": "dnn07Oh1pNi9ZPnovlY7iJ1FyxLKv5w9dfkZFZC+eTY=",
    });
  });

  it("un POST firma los MISMOS bytes que manda", () => {
    const cuerpo = new TextEncoder().encode('{"Categoria":"framework"}');
    const firma = firmarPeticion(CREDENCIAL, { metodo: "POST", ruta: "/api/upload/ticket", ts: 1759345678, nonce: "abc", cuerpo });
    expect(firma["X-Signature"]).toBe("wMRW2CshuhUCEh+8YQRAbgfaiuOi1uGUrTKLlHfzHm4=");
  });

  it("la query cambia la firma: no se puede firmar solo la ruta", () => {
    const base = { metodo: "GET", ts: 1, nonce: "n" };
    expect(firmarPeticion(CREDENCIAL, { ...base, ruta: "/api/files" })["X-Signature"]).not.toBe(
      firmarPeticion(CREDENCIAL, { ...base, ruta: "/api/files?categoria=framework" })["X-Signature"]
    );
  });
});

describe("la credencial", () => {
  it("vale un objeto con clientId y secreto", () => {
    expect(motivoDeCredencialByxone(CREDENCIAL)).toBeUndefined();
  });
  it.each([
    [null],
    [[]],
    ["xcode"],
    [{ clientId: "xcode" }],
    [{ secreto: "s" }],
    [{ clientId: "", secreto: "s" }],
    [{ clientId: " xcode", secreto: "s" }],
  ])("%j no vale, y el motivo no repite el secreto", (valor) => {
    const motivo = motivoDeCredencialByxone(valor);
    expect(motivo).toBeDefined();
    expect(motivo).not.toContain("secreto-de-prueba");
  });

  const EMPAQUETADA = { clientId: "xcode-read", secreto: "del-paquete" };

  it("el entorno manda sobre el fichero y sobre la empaquetada", () => {
    const r = resolverCredencialByxone({ [VARIABLE_CLIENTE_BYXONE]: "ci", [VARIABLE_SECRETO_BYXONE]: "x" }, CREDENCIAL, EMPAQUETADA);
    expect(r).toEqual({ credencial: { clientId: "ci", secreto: "x" }, origen: "entorno" });
  });
  it("una sola variable es un entorno a medias, y no se mezcla con lo de abajo", () => {
    const r = resolverCredencialByxone({ [VARIABLE_CLIENTE_BYXONE]: "ci" }, CREDENCIAL, EMPAQUETADA);
    expect(r).toHaveProperty("motivo");
  });
  it("el fichero personal manda sobre la empaquetada", () => {
    expect(resolverCredencialByxone({}, CREDENCIAL, EMPAQUETADA)).toEqual({ credencial: CREDENCIAL, origen: "personal" });
  });
  it("un fichero personal ROTO se dice, no cae a la empaquetada", () => {
    expect(resolverCredencialByxone({}, { clientId: "xcode-read", secreto: "" }, EMPAQUETADA)).toHaveProperty("motivo");
  });
  it("sin entorno ni fichero, la empaquetada: nadie tiene que crear nada", () => {
    expect(resolverCredencialByxone({}, undefined, EMPAQUETADA)).toEqual({ credencial: EMPAQUETADA, origen: "empaquetada" });
  });
  it("sin ninguna, se dice que lo local se sigue pudiendo instalar", () => {
    expect(resolverCredencialByxone({}, undefined)).toEqual({ motivo: expect.stringContaining("ya descargado") });
  });
});

describe("lo que contesta el servicio, en una frase", () => {
  it.each([
    [401, "FUERA_DE_VENTANA (412s)", /reloj/],
    [401, "FIRMA_INVALIDA", /secreto/],
    [401, "CLIENTE_DESCONOCIDO_O_INACTIVO", /clientId/],
    [403, "SIN_PERMISO: falta download", /permiso/],
    [410, "FICHERO_AUSENTE", /administrador/],
    [404, undefined, /no tiene ese fichero/],
    [500, undefined, /500/],
  ])("%d %s", (status, codigo, frase) => {
    expect(motivoDeRespuestaByxone(status, codigo)).toMatch(frase);
  });
});

describe("el orden de las versiones", () => {
  const ordenar = (xs: string[]): string[] => [...xs].sort(compararVersiones);

  it("es numérico, no de texto: v5.0.5.10 es más nueva que v5.0.5.8", () => {
    expect(ordenar(["v5.0.5.8rel", "v5.0.5.10rel", "v5.0.5.9rel"])).toEqual(["v5.0.5.10rel", "v5.0.5.9rel", "v5.0.5.8rel"]);
  });
  it("con la misma cifra, rel antes que dev", () => {
    expect(ordenar(["v5.0.5.8dev", "v5.0.5.8rel"])).toEqual(["v5.0.5.8rel", "v5.0.5.8dev"]);
  });
  it("una cifra más alta gana aunque sea dev", () => {
    expect(ordenar(["v5.0.5.8rel", "v5.0.5.9dev"])).toEqual(["v5.0.5.9dev", "v5.0.5.8rel"]);
  });
  it("lo que no se reconoce va al final", () => {
    expect(ordenar(["beta rara", "v5.0.1.0rel"])).toEqual(["v5.0.1.0rel", "beta rara"]);
  });
});

describe("el catálogo de frameworks", () => {
  it("deja Android/Frame vivos, sin Url y con fichero, en las dos grafías, de más nuevo a más viejo", () => {
    const items = [
      { Plat: 1, Type: 2, Title: "v5.0.5.8rel", Url: "", StoredFileId: 8 },
      { plat: 1, type: 2, title: "v5.0.5.10rel", url: null, storedFileId: 10 },
      { plat: 1, type: 1, title: "v5.0.6.0rel", storedFileId: 11 }, // Frame+Live
      { plat: 2, type: 2, title: "v5.0.6.0rel", storedFileId: 12 }, // iOS
      { plat: 1, type: 2, title: "v5.0.7.0rel", storedFileId: 13, isDeleted: true },
      { plat: 1, type: 2, title: "v5.0.7.1rel", storedFileId: 14, url: "https://fuera" },
      { plat: 1, type: 2, title: "sin fichero" },
      "basura",
    ];
    expect(frameworksDelCatalogo(items)).toEqual([
      { titulo: "v5.0.5.10rel", ficheroId: 10 },
      { titulo: "v5.0.5.8rel", ficheroId: 8 },
    ]);
  });
  it("acepta { items } y lo que no se entiende es una lista vacía", () => {
    expect(frameworksDelCatalogo({ items: [{ plat: 1, type: 2, title: "v1rel", storedFileId: 1 }] })).toHaveLength(1);
    expect(frameworksDelCatalogo({ error: "x" })).toEqual([]);
    expect(frameworksDelCatalogo(null)).toEqual([]);
  });
});
