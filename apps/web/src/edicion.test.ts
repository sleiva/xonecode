import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TOPE_DEL_CUERPO_DEL_CABLE,
  cabeEnElCable,
  conFinDeLinea,
  esEditable,
  finDeLineaDe,
  motivoParaNoEditar,
  normalizarFinesDeLinea,
} from "./edicion.js";
import type { FicheroDelProyecto } from "./tipos.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const RUTA_ARRANQUE = join(aqui, "..", "..", "..", "src", "web", "servidor", "arranque.ts");

const TEXTO: FicheroDelProyecto = { ruta: "a.xne", texto: "uno", recortado: false, binario: false, bytes: 3, codificacion: "utf-8", huella: "h" };

describe("motivoParaNoEditar", () => {
  it("dice por qué no hay «Editar» en vez de esconderlo sin más", () => {
    expect(motivoParaNoEditar({ ...TEXTO, recortado: true })).toBe("No se puede editar: el fichero pasa del tope de tamaño");
    expect(motivoParaNoEditar({ ...TEXTO, texto: undefined, binario: true })).toBe("No se puede editar: es binario");
    expect(motivoParaNoEditar({ ...TEXTO, texto: undefined, binario: true, mime: "image/png" })).toBe("No se puede editar: es una imagen");
    expect(motivoParaNoEditar({ ...TEXTO, mime: "image/svg+xml" })).toBe("No se puede editar: es una imagen");
  });

  it("sin motivo cuando se puede editar, sin fichero o con un error (el visor ya lo dice)", () => {
    expect(motivoParaNoEditar(TEXTO)).toBeUndefined();
    expect(motivoParaNoEditar({ ...TEXTO, codificacion: "latin1" })).toBeUndefined();
    expect(motivoParaNoEditar(undefined)).toBeUndefined();
    expect(motivoParaNoEditar({ ...TEXTO, error: "no existe" })).toBeUndefined();
  });
});

describe("esEditable", () => {
  it("solo el texto ENTERO en UTF-8 o latin1, con huella, sin error y que no es imagen", () => {
    expect(esEditable(TEXTO)).toBe(true);
    const { codificacion: _c, ...sinCodificacion } = TEXTO;
    expect(esEditable(sinCodificacion)).toBe(true);
    expect(esEditable(undefined)).toBe(false);
    expect(esEditable({ ...TEXTO, recortado: true })).toBe(false);
    // Un latin1 entero se edita: el servidor lo guarda en windows-1252.
    expect(esEditable({ ...TEXTO, codificacion: "latin1" })).toBe(true);
    expect(esEditable({ ...TEXTO, binario: true })).toBe(false);
    expect(esEditable({ ...TEXTO, error: "no existe" })).toBe(false);
    expect(esEditable({ ...TEXTO, mime: "image/svg+xml" })).toBe(false);
    const { huella: _h, ...sinHuella } = TEXTO;
    expect(esEditable(sinHuella)).toBe(false);
  });
});

describe("finales de línea", () => {
  it("detecta el dominante: CRLF solo si son mayoría", () => {
    expect(finDeLineaDe("a\nb\n")).toBe("\n");
    expect(finDeLineaDe("a\r\nb\r\n")).toBe("\r\n");
    expect(finDeLineaDe("a\r\nb\nc\n")).toBe("\n");
    expect(finDeLineaDe("sin saltos")).toBe("\n");
  });

  it("normaliza a \\n y restaura el CRLF al guardar", () => {
    expect(normalizarFinesDeLinea("a\r\nb\rc\n")).toBe("a\nb\nc\n");
    expect(conFinDeLinea("a\nb\n", "\r\n")).toBe("a\r\nb\r\n");
    expect(conFinDeLinea("a\nb\n", "\n")).toBe("a\nb\n");
    expect(conFinDeLinea(normalizarFinesDeLinea("x\r\ny\r\n"), finDeLineaDe("x\r\ny\r\n"))).toBe("x\r\ny\r\n");
  });
});

describe("cabe en el cable", () => {
  it("el tope del cliente es el del cuerpo de POST /accion en el servidor", () => {
    const m = readFileSync(RUTA_ARRANQUE, "utf8").match(/const TOPE_DE_CUERPO = ([\d_]+);/);
    expect(m).not.toBeNull();
    expect(Number(m![1]!.replace(/_/g, ""))).toBe(TOPE_DEL_CUERPO_DEL_CABLE);
  });

  it("mide el mensaje SERIALIZADO en bytes: lo que escapa el JSON también cuenta", () => {
    expect(cabeEnElCable({ clase: "guardarFichero", ruta: "a", texto: "x", huella: "h", id: "i", proyecto: "p" })).toBe(true);
    // Un tabulador son dos bytes en JSON: la mitad del tope en tabuladores ya no cabe.
    expect(cabeEnElCable({ clase: "guardarFichero", ruta: "a", texto: "\t".repeat(TOPE_DEL_CUERPO_DEL_CABLE / 2), huella: "h", id: "i", proyecto: "p" })).toBe(false);
  });
});
