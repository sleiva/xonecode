import { describe, expect, it } from "vitest";
import { secretosQueLleva, TAPADO, taparSecretos, taparSecretosEnJson } from "./secretosEnTexto.js";

// Con la FORMA del mensaje de Maset (27-10-2026), valores inventados.
const PEGADO = [
  'connstring="Data Source=https://pruebas.ejemplo.com;AuthType=ClientSecret;ClientId=0000;ClientSecret=Abc~123secreto;"',
  '<method type="jwt" url="https://login.ejemplo.com/t/oauth2/token" tokenName="access_token">',
  '  <param name="grant_type" value="client_credentials"/>',
  '  <param name="client_id" value="11111111-2222-3333-4444-555555555555"/>',
  '  <param name="client_secret" value="Xy9~otroSecreto.42"/>',
].join("\n");

describe("taparSecretos", () => {
  it("tapa el VALOR del client_secret y del ClientSecret de la cadena de conexión, y nada más", () => {
    const { texto, tapados } = taparSecretos(PEGADO);
    expect(tapados).toBe(2);
    expect(texto).not.toContain("Abc~123secreto");
    expect(texto).not.toContain("Xy9~otroSecreto.42");
    expect(texto).toContain(`ClientSecret=${TAPADO};`);
    expect(texto).toContain(`<param name="client_secret" value="${TAPADO}"/>`);
    // Lo que explica el fallo se queda: las URLs, el client_id, el tipo de token.
    expect(texto).toContain("https://pruebas.ejemplo.com");
    expect(texto).toContain("11111111-2222-3333-4444-555555555555");
    expect(texto).toContain('tokenName="access_token"');
  });

  it.each([
    ["Server=x;Pwd=hunter22;Database=y", `Pwd=${TAPADO};`],
    ['{"password": "s3cr3t0!"}', `"password": "${TAPADO}"`],
    ["api_key: abcd1234efgh", `api_key: ${TAPADO}`],
    ["Authorization: Bearer eyJhbGciOi.payload.firma", `Bearer ${TAPADO}`],
    ["contraseña=MiClave2026", `contraseña=${TAPADO}`],
  ])("%s", (entrada, esperado) => {
    expect(taparSecretos(entrada).texto).toContain(esperado);
  });

  it("una clave privada se tapa entera entre sus marcas", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\n-----END PRIVATE KEY-----";
    expect(taparSecretos(pem).texto).toBe(`-----BEGIN PRIVATE KEY-----${TAPADO}-----END PRIVATE KEY-----`);
  });

  it("no tapa referencias, valores vacíos ni lo ya tapado: aplicarlo dos veces no cambia nada", () => {
    expect(taparSecretos("password=${DB_PASS}").tapados).toBe(0);
    expect(taparSecretos('password=""').tapados).toBe(0);
    const una = taparSecretos(PEGADO).texto;
    expect(taparSecretos(una)).toEqual({ texto: una, tapados: 0 });
  });

  it("una palabra que solo CONTIENE la clave no es la clave: tokenName, secretary, pwdHint", () => {
    expect(taparSecretos("tokenName=abcdef secretary=Maria pwdHint=algo").tapados).toBe(0);
  });
});

describe("taparSecretosEnJson", () => {
  it("una línea de actos.jsonl con el XML pegado ESCAPADO: se tapa en su cadena, no en el texto crudo", () => {
    const linea = JSON.stringify({ tipo: "usuario", texto: PEGADO });
    expect(taparSecretos(linea).texto).toContain("Xy9~otroSecreto.42"); // crudo, las comillas escapadas no casan
    const { valor, tapados } = taparSecretosEnJson(JSON.parse(linea));
    expect(tapados).toBe(2);
    expect(JSON.stringify(valor)).not.toContain("Xy9~otroSecreto.42");
    expect((valor as { tipo: string }).tipo).toBe("usuario");
  });
});

describe("secretosQueLleva", () => {
  it("dice los NOMBRES, nunca el valor", () => {
    expect(secretosQueLleva(PEGADO).sort()).toEqual(["client_secret", "clientsecret"]);
    expect(secretosQueLleva("hola, ¿qué tal?")).toEqual([]);
  });
});
