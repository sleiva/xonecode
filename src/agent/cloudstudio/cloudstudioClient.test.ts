import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { BYTES_POR_TROZO, clienteCloudStudio, PAUSAS_DE_REAPERTURA_MS, type LlamadaMcp } from "./cloudstudioClient.js";

/** Sin esperas de verdad, y apuntando cuáles se pidieron. */
function reloj() {
  const pausas: number[] = [];
  return { pausas, esperar: async (ms: number) => { pausas.push(ms); } };
}

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

  it("si tras reabrir sigue sin proyecto, lo intenta unas pocas veces y PARA", async () => {
    const perdida = new Error("No project is open");
    const intentos = PAUSAS_DE_REAPERTURA_MS.length;
    const falso = clienteFalso([perdida, ...Array.from({ length: intentos }, () => [{ status: "project_open" }, perdida]).flat()]);
    const r = reloj();
    await expect(clienteCloudStudio(falso.invocar, "AppForTest", r.esperar).leerTexto("app.ini"))
      .rejects.toThrow(new RegExp(`no hay proyecto abierto.*AppForTest.*${intentos} veces.*project_open`, "s"));
    // La llamada, y luego abrir+reintentar por cada intento: ni uno más.
    expect(falso.llamadas).toHaveLength(1 + 2 * intentos);
    expect(r.pausas).toEqual(PAUSAS_DE_REAPERTURA_MS.filter((ms) => ms > 0));
  });

  /**
   * MEDIDO en una descarga de un proyecto recién creado («weweewe»): la apertura contestaba
   * bien y la llamada de justo después seguía sin proyecto, A VECES. Una sola vuelta inmediata
   * no bastaba; con una pausa, sí.
   */
  it("una reapertura que no asienta a la primera, asienta a la segunda tras la pausa", async () => {
    const perdida = { content: [{ type: "text", text: "Error: No project is open." }] };
    const falso = clienteFalso([
      perdida,
      { status: "project_open" }, perdida,
      { status: "project_open" }, { content: [{ type: "text", text: '[{"Key":"master"}]' }] },
    ]);
    const r = reloj();
    expect(await clienteCloudStudio(falso.invocar, "weweewe", r.esperar).ramas()).toEqual(["master"]);
    expect(r.pausas).toEqual([PAUSAS_DE_REAPERTURA_MS[1]]);
  });

  it("una apertura RECHAZADA con texto de error falla con SU motivo, no con «no hay proyecto»", async () => {
    const falso = clienteFalso([
      new Error("No project is open"),
      { content: [{ type: "text", text: "Error: Project 'weweewe' not found" }] },
    ]);
    await expect(clienteCloudStudio(falso.invocar, "weweewe", reloj().esperar).leerTexto("app.ini"))
      .rejects.toThrow(/studio_open_project «weweewe»: Error: Project 'weweewe' not found/);
    // Y no se insiste: el servidor ya dijo por qué.
    expect(falso.llamadas).toHaveLength(2);
  });

  it("abrir() también comprueba la respuesta: el rechazo sale AQUÍ y no una llamada después", async () => {
    const falso = clienteFalso([{ content: [{ type: "text", text: "Error: Project 'x' not found" }] }]);
    await expect(clienteCloudStudio(falso.invocar, "x").abrir("x")).rejects.toThrow(/studio_open_project «x»: .*not found/);
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

  /**
   * MEDIDO contra el servidor real: `studio_manage_branches switch` CIERRA el proyecto. Lo
   * dice en su propia respuesta (`action: "closeandopenproject"`), y a partir de ahí toda
   * llamada contesta «Empty response from server» — que NO es «no project is open», así
   * que la reapertura de `conSesion` no se dispara y la descarga entera muere justo
   * después de posicionar la rama. Se reabre aquí porque es el contrato que el servidor
   * declara en la respuesta, no por una heurística sobre el texto de un error: tratar
   * «Empty response from server» como sesión caída taparía cualquier otro fallo del
   * servidor detrás de una reapertura que no arregla nada.
   */
  it("cambiar de rama REABRE el proyecto: el `switch` lo cierra en el servidor", async () => {
    const falso = clienteFalso([
      { action: "closeandopenproject", newBranch: "jose" },
      { status: "project_open" },
    ]);
    await clienteCloudStudio(falso.invocar, "Bequikly").cambiarRama("jose");
    expect(falso.llamadas).toEqual([
      { nombre: "studio_manage_branches", argumentos: { operation: "switch", branchName: "jose" } },
      { nombre: "studio_open_project", argumentos: { project: "Bequikly" } },
    ]);
  });

  it("si tras reabrir el TEXTO sigue diciendo lo mismo, se lanza nombrando la tool", async () => {
    const perdida = { content: [{ type: "text", text: "Error: No project is open." }] };
    const falso = clienteFalso([perdida, ...PAUSAS_DE_REAPERTURA_MS.flatMap(() => [{ status: "project_open" }, perdida])]);
    await expect(clienteCloudStudio(falso.invocar, "AppForTest", reloj().esperar).ramas())
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

  it("studio_get_file manda el fichero como CADENA JSON (medido) y se decodifica (IXCODE-16)", async () => {
    // La forma REAL, medida contra el servidor: el texto del bloque es el contenido
    // serializado con `JSON.stringify` —comillas envolventes, `\"` y `\n` escapados—.
    // Escribirlo tal cual dejaba `app.xml` empezando por `"` y la app sin arrancar.
    const original = '<?xml version="1.0" encoding="utf-8"?>\n<app name="Validación"/>\n';
    const falso = clienteFalso([{ content: [{ type: "text", text: JSON.stringify(original) }] }]);
    expect(await clienteCloudStudio(falso.invocar, "AppForTest").leerTexto("app.xml")).toBe(original);
  });

  it("un fichero cuyo contenido ES una cadena entre comillas se recupera entero, comillas incluidas", async () => {
    const original = '"hola"';
    const falso = clienteFalso([{ content: [{ type: "text", text: JSON.stringify(original) }] }]);
    expect(await clienteCloudStudio(falso.invocar, "AppForTest").leerTexto("a.txt")).toBe(original);
  });

  it("si el ZIP no llega, el error enseña una muestra de lo que contestó el servidor", async () => {
    const falso = clienteFalso([{ content: [{ type: "text", text: "Error: project too large to zip" }] }]);
    await expect(clienteCloudStudio(falso.invocar, "AppForTest").descargarZip())
      .rejects.toThrow(/no devolvió el ZIP.*project too large to zip/);
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

  /**
   * Los binarios van por el modo TROCEADO de `studio_upload_file` con `expectedSha256`: el
   * servidor comprueba el hash en el `commit`, y un fichero que llegue cortado se rechaza en vez
   * de quedarse a medias en Studio sin que nadie lo sepa.
   */
  describe("subirBinario (troceado y con hash)", () => {
    const comoTexto = (o: unknown) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });

    it("begin con tamaño, trozos y sha256 → un chunk por trozo, en orden → commit", async () => {
      const datos = Buffer.alloc(BYTES_POR_TROZO + 1, 7);
      const falso = clienteFalso([comoTexto({ uploadId: "u-1" }), comoTexto({ ok: true }), comoTexto({ ok: true }), comoTexto({ success: true })]);
      await clienteCloudStudio(falso.invocar, "AppForTest").subirBinario("bd/gestion.db", datos);

      expect(falso.llamadas.map((l) => [l.nombre, l.argumentos.action])).toEqual([
        ["studio_upload_file", "begin"], ["studio_upload_file", "chunk"], ["studio_upload_file", "chunk"], ["studio_upload_file", "commit"],
      ]);
      expect(falso.llamadas[0]!.argumentos).toEqual({
        source: "chunked", action: "begin", filePath: "bd/gestion.db",
        totalSize: datos.byteLength, totalChunks: 2,
        expectedSha256: createHash("sha256").update(datos).digest("hex"),
      });
      expect(falso.llamadas[1]!.argumentos).toMatchObject({ source: "chunked", uploadId: "u-1", index: 0 });
      expect(falso.llamadas[2]!.argumentos).toMatchObject({ source: "chunked", uploadId: "u-1", index: 1 });
      // Los trozos, juntos, son EXACTAMENTE los bytes.
      const juntos = Buffer.concat([1, 2].map((i) => Buffer.from(falso.llamadas[i]!.argumentos.base64Chunk as string, "base64")));
      expect(juntos.equals(datos)).toBe(true);
      // Cada trozo cabe en el tope del servidor (5 MB) aun medido en base64.
      for (const i of [1, 2]) expect((falso.llamadas[i]!.argumentos.base64Chunk as string).length).toBeLessThanOrEqual(5 * 1024 * 1024);
      expect(falso.llamadas[3]!.argumentos).toEqual({ source: "chunked", action: "commit", uploadId: "u-1" });
    });

    it("un fichero vacío va en UN trozo vacío", async () => {
      const falso = clienteFalso([comoTexto({ uploadId: "u-0" }), comoTexto({ ok: true }), comoTexto({ ok: true })]);
      await clienteCloudStudio(falso.invocar, "AppForTest").subirBinario("vacio.bin", new Uint8Array());
      expect(falso.llamadas[0]!.argumentos).toMatchObject({ totalSize: 0, totalChunks: 1 });
      expect(falso.llamadas[1]!.argumentos).toMatchObject({ index: 0, base64Chunk: "" });
    });

    it("un commit RECHAZADO (hash que no casa, dicho como texto) es un fallo, y se aborta", async () => {
      const falso = clienteFalso([comoTexto({ uploadId: "u-2" }), comoTexto({ ok: true }), "Error: SHA-256 mismatch", comoTexto({ ok: true })]);
      await expect(clienteCloudStudio(falso.invocar, "AppForTest").subirBinario("logo.png", Buffer.from([1, 2, 3])))
        .rejects.toThrow(/commit.*SHA-256 mismatch/);
      expect(falso.llamadas[3]!.argumentos).toEqual({ source: "chunked", action: "abort", uploadId: "u-2" });
    });

    it("un commit con `success: false` también es un fallo", async () => {
      const falso = clienteFalso([comoTexto({ uploadId: "u-3" }), comoTexto({ ok: true }), comoTexto({ success: false, error: "hash mismatch" }), comoTexto({})]);
      await expect(clienteCloudStudio(falso.invocar, "AppForTest").subirBinario("logo.png", Buffer.from([1])))
        .rejects.toThrow(/hash mismatch/);
    });

    it("si un trozo falla a mitad, se aborta y se lanza el error ORIGINAL aunque el abort falle", async () => {
      const falso = clienteFalso([comoTexto({ uploadId: "u-4" }), new Error("timeout"), new Error("abort también falla")]);
      await expect(clienteCloudStudio(falso.invocar, "AppForTest").subirBinario("logo.png", Buffer.from([1, 2])))
        .rejects.toThrow("timeout");
      expect(falso.llamadas.map((l) => l.argumentos.action)).toEqual(["begin", "chunk", "abort"]);
    });

    it("si el servidor no da `uploadId` (no conoce el modo troceado) es un fallo, y NO cae a base64", async () => {
      const falso = clienteFalso([comoTexto({ error: "Unknown source: chunked" })]);
      await expect(clienteCloudStudio(falso.invocar, "AppForTest").subirBinario("logo.png", Buffer.from([1])))
        .rejects.toThrow(/troceada.*Unknown source: chunked/);
      expect(falso.llamadas).toHaveLength(1);
    });
  });
});
