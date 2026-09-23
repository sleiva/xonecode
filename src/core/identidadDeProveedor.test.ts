import { describe, it, expect } from "vitest";
import { FORMA_DE_USER_ID, subDeJwt, subDeTokens, userIdDeDeepSeek } from "./identidadDeProveedor.js";

/** Un JWT con esa carga y una firma de pega: aquí no se verifica nada. */
const jwt = (carga: unknown): string =>
  `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify(carga)).toString("base64url")}.firma`;

describe("subDeJwt", () => {
  it("lee el sub de la carga", () => {
    expect(subDeJwt(jwt({ sub: "8f1c-GUID", email: "x@y" }))).toBe("8f1c-GUID");
  });

  it("un token opaco, un JSON roto o un sub que no es texto dan undefined, sin lanzar", () => {
    expect(subDeJwt("opaco-sin-puntos")).toBeUndefined();
    expect(subDeJwt("a.no-es-base64-json.c")).toBeUndefined();
    expect(subDeJwt(jwt({ sub: 42 }))).toBeUndefined();
    expect(subDeJwt(jwt({ sub: "   " }))).toBeUndefined();
    expect(subDeJwt(jwt({ nombre: "sin sub" }))).toBeUndefined();
    expect(subDeJwt(jwt(null))).toBeUndefined();
  });
});

describe("subDeTokens", () => {
  it("prefiere el id_token y cae al access_token si aquel no lo trae", () => {
    expect(subDeTokens({ id_token: jwt({ sub: "del-id" }), access_token: jwt({ sub: "del-access" }) })).toBe("del-id");
    expect(subDeTokens({ id_token: "opaco", access_token: jwt({ sub: "del-access" }) })).toBe("del-access");
    expect(subDeTokens({ access_token: jwt({ sub: "del-access" }) })).toBe("del-access");
  });

  it("sin tokens, o con dos opacos, no hay identidad", () => {
    expect(subDeTokens(undefined)).toBeUndefined();
    expect(subDeTokens({ access_token: "opaco" })).toBeUndefined();
  });
});

describe("userIdDeDeepSeek", () => {
  it("cumple la forma que DeepSeek exige, también con un sub que no la cumpliría", () => {
    for (const sub of ["8f1c-GUID", "correo@dominio.es", "con espacios y ñ", "x".repeat(2000)]) {
      expect(userIdDeDeepSeek("webstudio", sub)).toMatch(FORMA_DE_USER_ID);
    }
  });

  it("no deja ver el sub: sale un hash, nunca el identificador del IDS", () => {
    const id = userIdDeDeepSeek("webstudio", "8f1c-guid");
    expect(id).not.toContain("8f1c");
    expect(id).toMatch(/^xonecode-[0-9a-f]{32}$/);
  });

  it("normaliza: el mismo sub con otro case o con espacios es la misma persona", () => {
    expect(userIdDeDeepSeek("webstudio", "  8F1C-GUID ")).toBe(userIdDeDeepSeek("webstudio", "8f1c-guid"));
  });

  it("dos personas son dos ids, y el mismo sub en OTRO entorno también", () => {
    expect(userIdDeDeepSeek("webstudio", "a")).not.toBe(userIdDeDeepSeek("webstudio", "b"));
    expect(userIdDeDeepSeek("webstudio", "a")).not.toBe(userIdDeDeepSeek("manager", "a"));
  });
});
