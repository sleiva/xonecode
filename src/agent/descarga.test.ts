import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { CloudStudioEnMemoria } from "../core/ports.js";
import { descargarProyecto, CONCURRENCIA } from "./descarga.js";

const raizNueva = () => mkdtempSync(join(tmpdir(), "xc-desc-"));
const zip = (f: Record<string, string>) => Buffer.from(zipSync(
  Object.fromEntries(Object.entries(f).map(([r, t]) => [r, strToU8(t)]))
)).toString("base64");

const proyecto = { id: "96fe", nombre: "AppForTest" };

/**
 * Envuelve un `CloudStudioEnMemoria` sustituyendo `leerTexto`, para instrumentarlo en el
 * test (contar llamadas en vuelo, forzar un fallo puntual) sin tocar la clase.
 *
 * Dos trampas, las dos medidas al escribir este test:
 *
 * 1. `{ ...base, leerTexto: ... }` NO sirve: los métodos de `CloudStudioEnMemoria` viven
 *    en el PROTOTIPO, y el spread de un objeto solo copia sus propiedades PROPIAS — el
 *    resultado se queda sin `abrir`, `contexto`, etc. y revienta con «is not a function».
 *    `Object.create` conserva la cadena de prototipos.
 * 2. Que la sustitución delegue en `base.leerTexto(ruta)` tampoco sirve: `abrir()` lo
 *    llama `descargarProyecto` sobre el ENVOLTORIO, así que es el envoltorio el que queda
 *    «abierto» — `base` se queda con `abierto: undefined` para siempre, y su
 *    `exigirAbierto()` revienta en cada llamada (silenciado por el catch de la descarga:
 *    el fichero, de nuevo, no aparecía en `descargados`, pero por el motivo EQUIVOCADO).
 *    La sustitución tiene que invocar el método ORIGINAL con `this` puesto en el propio
 *    envoltorio, no en `base`.
 */
function conLeerTextoEnvuelto(
  base: CloudStudioEnMemoria,
  envoltura: (original: (ruta: string) => Promise<string>, ruta: string) => Promise<string>
): CloudStudioEnMemoria {
  const prototipo = Object.getPrototypeOf(base) as CloudStudioEnMemoria;
  const puerto: CloudStudioEnMemoria = Object.assign(Object.create(prototipo), base);
  // Ligado al ENVOLTORIO (`puerto`), no a `base`: es sobre `puerto` donde `abrir()` deja
  // su estado, y es ese estado el que la lógica original necesita para no rechazar todo.
  const original = prototipo.leerTexto.bind(puerto);
  puerto.leerTexto = (ruta: string) => envoltura(original, ruta);
  return puerto;
}

describe("descargarProyecto", () => {
  it("vía ZIP: extrae y declara la copia completa", async () => {
    const raiz = raizNueva();
    const puerto = new CloudStudioEnMemoria({
      zipBase64: zip({ "app.xml": "<app/>", "icons/a.svg": "<svg/>" }),
      textos: { "app.xml": "<app/>", "icons/a.svg": "<svg/>" },
    });
    const estado = await descargarProyecto({ puerto, raiz, proyecto });

    expect(estado.via).toBe("zip");
    expect(readFileSync(join(raiz, "app.xml"), "utf8")).toBe("<app/>");
    expect(estado.descargados.sort()).toEqual(["app.xml", "icons/a.svg"]);
  });

  it("si el ZIP falla, baja fichero a fichero y guarda el motivo", async () => {
    const raiz = raizNueva();
    const puerto = new CloudStudioEnMemoria({
      zipFalla: "colección AlquilerCoches con error de sintaxis",
      textos: { "app.xml": "<app/>", "BuscarFarmacias.js": "function f(){}" },
    });
    const estado = await descargarProyecto({ puerto, raiz, proyecto });

    expect(estado.via).toBe("parcial");
    expect(estado.motivo).toMatch(/error de sintaxis/);
    expect(readFileSync(join(raiz, "BuscarFarmacias.js"), "utf8")).toBe("function f(){}");
  });

  it("la vía degradada NO pide binarios: el servidor no los sirve por fichero", async () => {
    const raiz = raizNueva();
    const puerto = new CloudStudioEnMemoria({
      zipFalla: "roto",
      textos: { "app.xml": "<app/>" },
      binarios: { "fonts/A.ttf": 126228, "icons/bg.png": 354523 },
    });
    const estado = await descargarProyecto({ puerto, raiz, proyecto });

    expect(estado.descargados).toEqual(["app.xml"]);
    expect(estado.manifiesto.map((e) => e.ruta)).toContain("fonts/A.ttf");
    expect(existsSync(join(raiz, "fonts", "A.ttf"))).toBe(false);
  });

  it("no supera la concurrencia acordada", async () => {
    const raiz = raizNueva();
    const textos = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`f${i}.js`, `// ${i}`])
    );
    const base = new CloudStudioEnMemoria({ zipFalla: "roto", textos });
    let enVuelo = 0;
    let maximo = 0;
    const puerto = conLeerTextoEnvuelto(base, async (original, ruta) => {
      enVuelo += 1;
      maximo = Math.max(maximo, enVuelo);
      await new Promise((r) => setTimeout(r, 1));
      enVuelo -= 1;
      return original(ruta);
    });

    await descargarProyecto({ puerto, raiz, proyecto });
    expect(maximo).toBeLessThanOrEqual(CONCURRENCIA);
    expect(maximo).toBeGreaterThan(1);
  });

  it("un fichero que falla no aborta, y queda fuera de descargados", async () => {
    const raiz = raizNueva();
    const base = new CloudStudioEnMemoria({
      zipFalla: "roto",
      textos: { "app.xml": "<app/>", "roto.js": "x" },
    });
    const puerto = conLeerTextoEnvuelto(base, (original, ruta) =>
      ruta === "roto.js" ? Promise.reject(new Error("500")) : original(ruta)
    );

    const estado = await descargarProyecto({ puerto, raiz, proyecto });
    expect(estado.descargados).toEqual(["app.xml"]);
  });

  it("borra las vistas aplanadas de la copia local y las deja fuera de descargados", async () => {
    const raiz = raizNueva();
    const puerto = new CloudStudioEnMemoria({
      zipBase64: zip({
        "app.xml": "<app/>",
        "BuscarFarmacias.xne": "<coll/>",
        "BuscarFarmacias.xml": "<generado/>",
        "AlquilerCoches.XNE": "<coll/>",
        "AlquilerCoches.XML": "<generado/>",
      }),
      textos: { "app.xml": "<app/>" },
    });
    const estado = await descargarProyecto({ puerto, raiz, proyecto });

    // La fuente y app.xml se quedan; lo que Studio regenera, no.
    expect(existsSync(join(raiz, "BuscarFarmacias.xne"))).toBe(true);
    expect(existsSync(join(raiz, "app.xml"))).toBe(true);
    expect(existsSync(join(raiz, "BuscarFarmacias.xml"))).toBe(false);
    // Sin importar cómo estén escritas las extensiones: el proyecto puede venir de Windows.
    expect(existsSync(join(raiz, "AlquilerCoches.XML"))).toBe(false);

    // Segundo cierre del candado: si no están en `descargados`, no pueden borrarse en Studio
    // aunque alguien reordene las guardas de planDeSubida algún día.
    expect(estado.descargados).not.toContain("BuscarFarmacias.xml");
    expect(estado.descargados).toContain("BuscarFarmacias.xne");
    // Pero en el remoto SÍ existen, así que el manifiesto las conserva.
    expect(estado.manifiesto.map((e) => e.ruta)).toContain("app.xml");
  });

  it("deja sync.json legible bajo .xonecode/cloudstudio", async () => {
    const raiz = raizNueva();
    const puerto = new CloudStudioEnMemoria({ zipBase64: zip({ "app.xml": "<app/>" }), textos: { "app.xml": "<app/>" } });
    await descargarProyecto({ puerto, raiz, proyecto });

    const guardado = JSON.parse(readFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "utf8"));
    expect(guardado.proyecto).toEqual(proyecto);
    expect(guardado.via).toBe("zip");
  });

  // El brief no cubría esto con un test, pero el criterio de aceptación es explícito: un
  // inventario incompleto no puede quedarse callado. Sin este test, una implementación que
  // solo `informar()` el aviso por consola (y lo tirase después) pasaría igual — y el
  // aviso de honestidad no sobrevive al turno si no queda escrito en algún sitio (aquí,
  // el propio `sync.json`, que es lo que se puede releer después).
  it("si la raíz llega truncada, el sync.json lo declara aunque el ZIP funcione", async () => {
    const raiz = raizNueva();
    const textos: Record<string, string> = { "app.xml": "<app/>" };
    for (let i = 0; i < 5; i++) textos[`extra${i}.txt`] = `${i}`;
    const puerto = new CloudStudioEnMemoria({
      zipBase64: zip(textos),
      textos,
      topeEstructura: 2,
    });
    const avisos: string[] = [];
    const estado = await descargarProyecto({ puerto, raiz, proyecto, informar: (t) => avisos.push(t) });

    expect(estado.raizTruncada).toBe(true);
    expect(avisos.join("")).toMatch(/truncó/);
    const guardado = JSON.parse(readFileSync(join(raiz, ".xonecode", "cloudstudio", "sync.json"), "utf8"));
    expect(guardado.raizTruncada).toBe(true);
  });
});
