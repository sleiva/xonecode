import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearLectorDeReferencias } from "./lectorDeReferencias.js";
import { imagenReferida, type ImagenReferida } from "../../core/referenciasDeImagen.js";

const img = (ruta: string): ImagenReferida => imagenReferida(ruta) as ImagenReferida;
function escenario() {
  const raiz = mkdtempSync(join(tmpdir(), "ref-raiz-"));
  const artefactos = mkdtempSync(join(tmpdir(), "ref-art-"));
  const adjuntos = mkdtempSync(join(tmpdir(), "ref-adj-"));
  const fuera = mkdtempSync(join(tmpdir(), "ref-fuera-"));
  mkdirSync(join(raiz, "diseno"));
  writeFileSync(join(raiz, "diseno", "screen.png"), "PROYECTO");
  writeFileSync(join(artefactos, "cap.png"), "ARTEFACTO");
  writeFileSync(join(adjuntos, "mock.png"), "ADJUNTO");
  writeFileSync(join(fuera, "secreto.png"), "FUERA");
  symlinkSync(fuera, join(raiz, "diseno", "enlace"));
  symlinkSync(join(fuera, "secreto.png"), join(raiz, "diseno", "atajo.png"));
  return { raiz, artefactos, adjuntos };
}

describe("lector de referencias", () => {
  it("lee de los tres orígenes", async () => {
    const e = escenario();
    const leer = crearLectorDeReferencias(e);
    expect((await leer(img("/diseno/screen.png"))).toString()).toBe("PROYECTO");
    expect((await leer(img("/artefactos/cap.png"))).toString()).toBe("ARTEFACTO");
    expect((await leer(img("/adjuntos/mock.png"))).toString()).toBe("ADJUNTO");
  });

  /** El texto de la ruta es llano y aun así sale del proyecto: por eso el `realpath`. */
  it("un enlace del proyecto que apunta FUERA se niega, sea carpeta o fichero", async () => {
    const leer = crearLectorDeReferencias(escenario());
    await expect(leer(img("/diseno/enlace/secreto.png"))).rejects.toMatchObject({ code: "EACCES" });
    await expect(leer(img("/diseno/atajo.png"))).rejects.toMatchObject({ code: "EACCES" });
  });

  it("un origen sin montar o un fichero que falta lanzan ENOENT, sin ruta en el mensaje", async () => {
    const e = escenario();
    const sinAdjuntos = crearLectorDeReferencias({ raiz: e.raiz, artefactos: e.artefactos });
    await expect(sinAdjuntos(img("/adjuntos/mock.png"))).rejects.toMatchObject({ code: "ENOENT" });
    const leer = crearLectorDeReferencias(e);
    const error = await leer(img("/diseno/no-existe.png")).catch((x: Error) => x);
    expect((error as { code?: string }).code).toBe("ENOENT");
  });
});
