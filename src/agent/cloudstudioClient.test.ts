import { describe, expect, it } from "vitest";
import { clienteCloudStudio, type LlamadaMcp } from "./cloudstudioClient.js";

/** Cliente MCP falso: registra las llamadas y responde con lo que se le programe. */
function clienteFalso(respuestas: Array<unknown | Error>) {
  const llamadas: LlamadaMcp[] = [];
  let indice = 0;
  return {
    llamadas,
    invocar: async (nombre: string, argumentos: Record<string, unknown>) => {
      llamadas.push({ nombre, argumentos });
      const respuesta = respuestas[indice++];
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
  };
}

describe("clienteCloudStudio", () => {
  it("abre el proyecto por NOMBRE: el id lo rechaza el servidor", async () => {
    const falso = clienteFalso([{ status: "project_open" }]);
    await clienteCloudStudio(falso.invocar, "AppForTest").abrir("AppForTest");
    expect(falso.llamadas[0]).toEqual({
      nombre: "studio_open_project",
      argumentos: { project: "AppForTest" },
    });
  });

  it("lee el contexto y devuelve proyecto y rama", async () => {
    const falso = clienteFalso([{ project: "AppForTest", branch: "master" }]);
    expect(await clienteCloudStudio(falso.invocar, "AppForTest").contexto())
      .toEqual({ proyecto: "AppForTest", rama: "master" });
  });

  it("reabre y reintenta UNA vez cuando la sesión ha caducado", async () => {
    const falso = clienteFalso([
      new Error("No project is open. Use the studio_open_project tool"),
      { status: "project_open" },
      "contenido",
    ]);
    expect(await clienteCloudStudio(falso.invocar, "AppForTest").leerTexto("app.ini")).toBe("contenido");
    expect(falso.llamadas.map((l) => l.nombre)).toEqual([
      "studio_get_file", "studio_open_project", "studio_get_file",
    ]);
  });

  it("si tras reabrir vuelve a fallar, propaga en vez de reintentar sin fin", async () => {
    const falso = clienteFalso([
      new Error("No project is open"),
      { status: "project_open" },
      new Error("No project is open"),
    ]);
    await expect(clienteCloudStudio(falso.invocar, "AppForTest").leerTexto("app.ini"))
      .rejects.toThrow(/No project is open/);
    expect(falso.llamadas).toHaveLength(3);
  });

  /**
   * La forma que se colaba, MEDIDA contra el servidor real: la sesión caída llega como una
   * respuesta CORRECTA cuyo texto empieza por «Error: No project is open». Sin mirar el
   * resultado, la reapertura no se disparaba y ese texto seguía camino hasta el `JSON.parse`
   * de quien llamó — y lo que se veía en la interfaz era «Unexpected token 'E'»: un fallo de
   * sesión disfrazado de fallo de formato.
   */
  it("reabre también cuando la sesión caída viene como TEXTO de una respuesta correcta", async () => {
    const falso = clienteFalso([
      { content: [{ type: "text", text: "Error: No project is open. Use studio_open_project first." }] },
      { status: "project_open" },
      { content: [{ type: "text", text: '[{"Key":"master"}]' }] },
    ]);
    expect(await clienteCloudStudio(falso.invocar, "AppForTest").ramas()).toEqual(["master"]);
    expect(falso.llamadas.map((l) => l.nombre)).toEqual([
      "studio_manage_branches", "studio_open_project", "studio_manage_branches",
    ]);
  });

  it("si tras reabrir el TEXTO sigue diciendo lo mismo, se lanza nombrando la tool", async () => {
    const perdida = { content: [{ type: "text", text: "Error: No project is open." }] };
    const falso = clienteFalso([perdida, { status: "project_open" }, perdida]);
    await expect(clienteCloudStudio(falso.invocar, "AppForTest").ramas())
      .rejects.toThrow(/studio_manage_branches.*no hay proyecto abierto.*AppForTest/s);
  });

  /**
   * Un `JSON.parse` a pelo producía un `SyntaxError` que no nombraba ni la tool ni el
   * contexto. El error que llega al usuario tiene que decir quién contestó y con qué.
   */
  it("una respuesta que no es JSON falla nombrando la tool y enseñando una muestra", async () => {
    const falso = clienteFalso([{ content: [{ type: "text", text: "<html>500</html>" }] }]);
    await expect(clienteCloudStudio(falso.invocar, "AppForTest").ramas())
      .rejects.toThrow(/studio_manage_branches no devolvió JSON: «<html>500<\/html>»/);
  });

  it("desenvuelve el bloque de texto del SDK", async () => {
    const falso = clienteFalso([{ content: [{ type: "text", text: "hola" }] }]);
    expect(await clienteCloudStudio(falso.invocar, "AppForTest").leerTexto("a.js")).toBe("hola");
  });

  it("estructura() propaga el truncado del servidor con sus argumentos reales", async () => {
    const falso = clienteFalso([
      {
        truncated: true,
        tree: {
          type: "directory",
          children: [
            { type: "file", path: "app.xml", size: 12 },
            { type: "file", path: "icons/a.svg", size: 3 },
          ],
        },
      },
    ]);
    const resultado = await clienteCloudStudio(falso.invocar, "AppForTest").estructura();
    expect(resultado).toEqual({
      entradas: [{ ruta: "app.xml", bytes: 12 }, { ruta: "icons/a.svg", bytes: 3 }],
      truncado: true,
    });
    expect(falso.llamadas[0]).toEqual({
      nombre: "studio_get_project_structure",
      argumentos: { mode: "filesystem", maxFiles: 2000 },
    });
  });

  it("estructura() no inventa un truncado que el servidor no mandó, y pide un directorio concreto", async () => {
    const falso = clienteFalso([{ tree: { type: "directory", children: [] } }]);
    const resultado = await clienteCloudStudio(falso.invocar, "AppForTest").estructura("icons");
    expect(resultado.truncado).toBe(false);
    expect(falso.llamadas[0]!.argumentos).toEqual({ mode: "filesystem", maxFiles: 2000, directoryPath: "icons" });
  });

  it("un fallo de escritura no filtra el contenido del fichero en el error", async () => {
    const contenidoSecreto = "SECRETO-QUE-NO-DEBE-VIAJAR";
    const falso = clienteFalso([new Error("boom")]);
    // El error se propaga tal cual desde `invocar`: nunca se reconstruye incluyendo el
    // contenido que se intentaba escribir. Una implementación que envolviera el error
    // con `${ruta}: ${contenido}` haría fallar este `not.toContain`.
    await expect(clienteCloudStudio(falso.invocar, "AppForTest").escribirTexto("a.js", contenidoSecreto))
      .rejects.toSatisfy((error: unknown) =>
        error instanceof Error && error.message === "boom" && !error.message.includes(contenidoSecreto));
  });
});
