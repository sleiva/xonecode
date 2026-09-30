import { describe, expect, it } from "vitest";

import { carpetaDeLaSalida, comandoDelSelector, comandoParaAbrirCarpeta, comandoParaAbrirDirectorio } from "./selectorDeCarpeta.js";

describe("comandoDelSelector", () => {
  it("en macOS abre el diálogo del sistema", () => {
    const comando = comandoDelSelector("darwin", "/Users/ana/.xonecode/workspace");
    expect(comando?.programa).toBe("osascript");
  });

  it("la carpeta de partida va como ARGUMENTO, nunca dentro del guion", () => {
    // Interpolada en el AppleScript, una comilla en el nombre de una carpeta cierra la
    // cadena y lo que venga detrás se ejecuta. Aparte, el guion la lee con `item 1 of
    // argumentos` y no hay nada que escapar.
    const comando = comandoDelSelector("darwin", '/Users/ana/mi "carpeta"');
    expect(comando?.argumentos).toContain('/Users/ana/mi "carpeta"');
    expect(comando?.argumentos[1]).not.toContain("mi \"carpeta\"");
  });

  it("sin carpeta de partida sigue siendo un comando válido", () => {
    // El guion cae a la casa cuando lo que recibe no vale: un `POSIX file` que no existe
    // haría fallar el diálogo entero.
    const comando = comandoDelSelector("darwin");
    expect(comando?.argumentos.length).toBe(3);
  });

  it("en Linux es zenity", () => {
    const comando = comandoDelSelector("linux", "/home/ana/xone");
    expect(comando?.programa).toBe("zenity");
    expect(comando?.argumentos).toContain("--directory");
  });

  it("en un sistema sin selector conocido, AUSENTE — y eso no es un fallo", () => {
    // Ausente = «aquí no hay selector», y entonces no se ofrece el botón. Un botón que no
    // hace nada es peor que no tenerlo, y el campo de texto ya resuelve el caso.
    expect(comandoDelSelector("aix")).toBeUndefined();
  });
});

describe("carpetaDeLaSalida", () => {
  it("una ruta con su salto de línea del terminal", () => {
    expect(carpetaDeLaSalida("/Users/ana/xone-proyectos\n")).toBe("/Users/ana/xone-proyectos");
  });

  it("la barra final se quita: es del formato, no del dato", () => {
    // `osascript` devuelve `POSIX path of` con barra final siempre.
    expect(carpetaDeLaSalida("/Users/ana/xone-proyectos/\n")).toBe("/Users/ana/xone-proyectos");
  });

  it("cancelar no devuelve ninguna carpeta, y eso no es un fallo", () => {
    expect(carpetaDeLaSalida("")).toBeUndefined();
    expect(carpetaDeLaSalida("\n")).toBeUndefined();
  });

  it("lo que no empieza por «/» no se cuela disfrazado de ruta", () => {
    // Un mensaje de error del propio diálogo saldría por aquí, y sin esta guarda llegaría
    // al campo como si fuera una carpeta.
    expect(carpetaDeLaSalida("User canceled.")).toBeUndefined();
    expect(carpetaDeLaSalida("execution error: …")).toBeUndefined();
  });
});

describe("comandoParaAbrirCarpeta", () => {
  it("en Windows abre `explorer.exe` sobre la carpeta CONTENEDORA, con el `dirname` de Windows", () => {
    const comando = comandoParaAbrirCarpeta("win32", "C:\\Users\\ana\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe");
    expect(comando).toEqual({
      programa: "explorer.exe",
      argumentos: ["C:\\Users\\ana\\AppData\\Local\\Android\\Sdk\\platform-tools"],
    });
  });

  it("en macOS abre `open` sobre la carpeta contenedora", () => {
    const comando = comandoParaAbrirCarpeta("darwin", "/Users/ana/Library/Android/sdk/platform-tools/adb");
    expect(comando).toEqual({ programa: "open", argumentos: ["/Users/ana/Library/Android/sdk/platform-tools"] });
  });

  it("en Linux, y en cualquier otro, `xdg-open`", () => {
    expect(comandoParaAbrirCarpeta("linux", "/home/ana/Android/Sdk/platform-tools/adb")).toEqual({
      programa: "xdg-open",
      argumentos: ["/home/ana/Android/Sdk/platform-tools"],
    });
    expect(comandoParaAbrirCarpeta("aix", "/opt/adb").programa).toBe("xdg-open");
  });

  it("el `dirname` es el de la plataforma pedida, no el del sistema donde corre el test", () => {
    // Sin esto, un `npm test` en Linux/Mac partiría una ruta de Windows con el separador
    // equivocado (no hay ninguna barra `/` que cortar) y devolvería la ruta entera tal cual.
    const comando = comandoParaAbrirCarpeta("win32", "C:\\Sdk\\platform-tools\\adb.exe");
    expect(comando.argumentos[0]).toBe("C:\\Sdk\\platform-tools");
  });
});

describe("comandoParaAbrirDirectorio", () => {
  /** La raíz de un proyecto sale de `rutaDeWorkspace` con `/` sobre una base de `\`. */
  it("en Windows abre ESA carpeta, con la ruta mezclada normalizada a barras invertidas", () => {
    expect(comandoParaAbrirDirectorio("win32", "C:\\Users\\ana\\.xonecode\\workspace/webstudio/Tienda")).toEqual({
      programa: "explorer.exe",
      argumentos: ["C:\\Users\\ana\\.xonecode\\workspace\\webstudio\\Tienda"],
    });
  });

  it("en macOS con `open` y en Linux con `xdg-open`, sobre la carpeta misma y no su padre", () => {
    expect(comandoParaAbrirDirectorio("darwin", "/Users/ana/ws/webstudio/Tienda")).toEqual({
      programa: "open",
      argumentos: ["/Users/ana/ws/webstudio/Tienda"],
    });
    expect(comandoParaAbrirDirectorio("linux", "/home/ana/ws/webstudio/Tienda")).toEqual({
      programa: "xdg-open",
      argumentos: ["/home/ana/ws/webstudio/Tienda"],
    });
  });
});

describe("IXCODE-22: el selector de carpeta en Windows", () => {
  it("hay diálogo en win32 (PowerShell, STA) y la ruta de inicio va escapada", () => {
    const c = comandoDelSelector("win32", "C:\\Users\\O'Brien");
    expect(c?.programa).toBe("powershell.exe");
    expect(c?.argumentos).toContain("-STA");
    expect(c?.argumentos.at(-1)).toContain("'C:\\Users\\O''Brien'");
  });
  it("es el diálogo MODERNO (se teclea la ruta), delante de todo, centrado y con la salida en UTF-8", () => {
    // El `FolderBrowserDialog` clásico no tiene barra de direcciones y sin dueño se abría
    // detrás del navegador; sin `OutputEncoding` los acentos llegaban rotos.
    const guion = comandoDelSelector("win32")?.argumentos.at(-1) ?? "";
    expect(guion).not.toContain("FolderBrowserDialog");
    expect(guion).toContain("IFileOpenDialog");
    expect(guion).toContain("SetOptions(0x20 | 0x40)"); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
    expect(guion).toContain("TopMost = true");
    expect(guion).toContain("SetWindowPos");
    expect(guion.startsWith("[Console]::OutputEncoding = [Text.Encoding]::UTF8\n")).toBe(true);
    // El here-string de PowerShell exige que `'@` cierre al PRINCIPIO de una línea.
    expect(guion).toContain("\n'@\n");
    expect(guion).toContain("[SelectorXone]::Elegir('Dónde se bajan los proyectos de XOneCode', '')");
  });
  it("la salida de Windows se acepta; la vacía (cancelar) no", () => {
    expect(carpetaDeLaSalida("C:\\Users\\lolo\\xone\r\n")).toBe("C:\\Users\\lolo\\xone");
    expect(carpetaDeLaSalida("\\\\srv\\comp\\xone\\")).toBe("\\\\srv\\comp\\xone");
    expect(carpetaDeLaSalida("")).toBeUndefined();
  });
});
