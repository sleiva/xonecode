import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { NAVEGADORES_CONOCIDOS, SIN_NAVEGADOR, exportarAPdf, navegadorParaImprimir } from "./exportarPdf.js";
import { POLITICA_SIN_SCRIPTS } from "../core/exportacion.js";

let raiz: string;

/** Un navegador de mentira que escribe el PDF donde se lo mandan, como haría el de verdad. */
function navegadorQueImprime(vistos: string[][] = []): {
  imprimir: (n: string, a: readonly string[]) => Promise<void>;
  vistos: string[][];
} {
  return {
    vistos,
    imprimir: async (_n, argumentos) => {
      vistos.push([...argumentos]);
      const destino = argumentos.find((a) => a.startsWith("--print-to-pdf="))!.slice("--print-to-pdf=".length);
      const fuente = argumentos.at(-1)!.replace("file://", "");
      writeFileSync(destino, `PDF de ${readFileSync(fuente, "utf8").length} caracteres`);
    },
  };
}

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), "xonecode-exp-"));
  mkdirSync(join(raiz, "doc"), { recursive: true });
  writeFileSync(join(raiz, "doc", "INFORME.md"), "# Título\n\n| a | b |\n| - | - |\n| 1 | 2 |\n");
});

describe("navegadorParaImprimir", () => {
  it("el primero de la lista CERRADA que exista", () => {
    expect(navegadorParaImprimir((r) => r === NAVEGADORES_CONOCIDOS[1])).toBe(NAVEGADORES_CONOCIDOS[1]);
  });

  it("ninguno = ausente, y quien llama lo DICE con el remedio", () => {
    // No hay forma de adivinar que lo que falta es un navegador.
    expect(navegadorParaImprimir(() => false)).toBeUndefined();
    expect(SIN_NAVEGADOR).toMatch(/Chrome|Chromium/);
  });
});

describe("exportarAPdf", () => {
  it("convierte el markdown y deja el PDF AL LADO, con el mismo nombre", async () => {
    const n = navegadorQueImprime();
    const r = await exportarAPdf({ raiz, ruta: "doc/INFORME.md", navegador: "/fake", imprimir: n.imprimir });
    expect(r).toEqual({ ruta: "doc/INFORME.pdf" });
    expect(existsSync(join(raiz, "doc", "INFORME.pdf"))).toBe(true);
  });

  it("el HTML intermedio se escribe FUERA del proyecto", async () => {
    // Dentro entraría en git, en el commit de cada turno y en la subida a CloudStudio: un
    // fichero de andamiaje nuestro en la app del cliente.
    const n = navegadorQueImprime();
    await exportarAPdf({ raiz, ruta: "doc/INFORME.md", navegador: "/fake", imprimir: n.imprimir });
    const fuente = n.vistos[0]!.at(-1)!;
    expect(fuente.startsWith(`file://${raiz}`)).toBe(false);
  });

  it("y lo que se imprime lleva la política que impide EJECUTAR nada", async () => {
    // Un `.md` del proyecto puede traer un `<script>` dentro, y un PDF no necesita ejecutar
    // nada: la misma razón por la que un artefacto se sirve con origen opaco. Va en el
    // DOCUMENTO y no en un flag del navegador — medido: los flags no lo desactivan, y
    // `--blink-settings=scriptEnabled=false` además deja el PDF sin escribir en silencio.
    const vistos: string[] = [];
    const n = navegadorQueImprime();
    await exportarAPdf({
      raiz,
      ruta: "doc/INFORME.md",
      navegador: "/fake",
      imprimir: async (nav, args) => {
        vistos.push(readFileSync(args.at(-1)!.replace("file://", ""), "utf8"));
        await n.imprimir(nav, args);
      },
    });
    expect(vistos[0]).toContain(POLITICA_SIN_SCRIPTS);
  });

  it("y un `.html` ajeno también la lleva, inyectada", async () => {
    writeFileSync(join(raiz, "doc", "web.html"), "<html><head></head><body><script>fuga()</script></body></html>");
    const vistos: string[] = [];
    const n = navegadorQueImprime();
    await exportarAPdf({
      raiz,
      ruta: "doc/web.html",
      navegador: "/fake",
      imprimir: async (nav, args) => {
        vistos.push(readFileSync(args.at(-1)!.replace("file://", ""), "utf8"));
        await n.imprimir(nav, args);
      },
    });
    expect(vistos[0]).toContain(POLITICA_SIN_SCRIPTS);
  });

  it("un `.html` no pasa por el conversor: ya es HTML", async () => {
    writeFileSync(join(raiz, "doc", "web.html"), "<h1>ya soy html</h1>");
    let convertido = false;
    const n = navegadorQueImprime();
    const r = await exportarAPdf({
      raiz,
      ruta: "doc/web.html",
      navegador: "/fake",
      imprimir: n.imprimir,
      aHtml: () => {
        convertido = true;
        return "";
      },
    });
    expect({ r, convertido }).toEqual({ r: { ruta: "doc/web.pdf" }, convertido: false });
  });

  it("las guardas de ruta son las MISMAS que las de la pestaña Ficheros", async () => {
    // No hay una segunda copia: un segundo sitio donde decidir sobre una ruta es un segundo
    // sitio donde el fail-closed puede dejar de estarlo.
    for (const mala of ["../fuera.md", "/etc/passwd.md", ".env.md", "doc/./x.md"]) {
      const r = await exportarAPdf({ raiz, ruta: mala, navegador: "/fake", imprimir: async () => {} });
      expect(r, mala).toHaveProperty("error");
    }
  });

  it("una extensión que no se sabe convertir se rechaza ANTES de tocar nada", async () => {
    let lanzado = false;
    const r = await exportarAPdf({
      raiz,
      ruta: "funciones.js",
      navegador: "/fake",
      imprimir: async () => void (lanzado = true),
    });
    expect({ r, lanzado }).toEqual({ r: { error: expect.stringContaining("solo se exportan") }, lanzado: false });
  });

  it("sin navegador NO se intenta, y se dice con el remedio", async () => {
    // La búsqueda se inyecta: si no, este test diría una cosa en una máquina con Chrome y
    // otra en CI, que es no fijar nada.
    let lanzado = false;
    const r = await exportarAPdf({
      raiz,
      ruta: "doc/INFORME.md",
      buscarNavegador: () => undefined,
      imprimir: async () => void (lanzado = true),
    });
    expect({ r, lanzado }).toEqual({ r: { error: SIN_NAVEGADOR }, lanzado: false });
  });

  it("«terminó bien» y «hay PDF» son dos cosas", async () => {
    // El navegador sale con 0 aunque no escriba nada. Manda la MEDIDA, no el código de salida
    // — la misma regla que la instalación de dispositivos.
    const r = await exportarAPdf({
      raiz,
      ruta: "doc/INFORME.md",
      navegador: "/fake",
      imprimir: async () => {},
    });
    expect(r).toEqual({ error: expect.stringContaining("sin escribir ningún PDF") });
  });

  it("un fichero que no está se dice sin la ruta de la máquina dentro", async () => {
    const r = await exportarAPdf({ raiz, ruta: "doc/NOESTA.md", navegador: "/fake", imprimir: async () => {} });
    expect(r).toEqual({ error: expect.stringContaining("no está en el proyecto") });
    expect(JSON.stringify(r)).not.toContain(raiz);
  });

  it("y un fallo del navegador NO lanza: se devuelve como motivo", async () => {
    const r = await exportarAPdf({
      raiz,
      ruta: "doc/INFORME.md",
      navegador: "/fake",
      imprimir: async () => {
        throw new Error("se fue");
      },
    });
    expect(r).toEqual({ error: expect.stringContaining("se fue") });
  });
});

describe("las imágenes del documento en el PDF", () => {
  /** Un PNG de un píxel: bytes de verdad. */
  const PNG = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
    "hex"
  );

  it("una imagen del proyecto enlazada en relativo va INCRUSTADA: el HTML se imprime desde un temporal", async () => {
    // Medido: con el enlace relativo, el `img/login.png` se buscaba en el temporal y salía rota.
    mkdirSync(join(raiz, "doc", "img"), { recursive: true });
    writeFileSync(join(raiz, "doc", "img", "login.png"), PNG);
    writeFileSync(join(raiz, "doc", "manual.md"), "# Manual\n\n![Login](img/login.png)\n");
    const vistos: string[] = [];
    const n = navegadorQueImprime();
    const r = await exportarAPdf({
      raiz,
      ruta: "doc/manual.md",
      navegador: "/fake",
      imprimir: async (nav, args) => {
        vistos.push(readFileSync(args.at(-1)!.replace("file://", ""), "utf8"));
        await n.imprimir(nav, args);
      },
    });
    expect(r).toEqual({ ruta: "doc/manual.pdf" });
    expect(vistos[0]).toContain(`src="data:image/png;base64,${PNG.toString("base64")}"`);
    expect(vistos[0]).not.toContain('src="img/login.png"');
  });
});
