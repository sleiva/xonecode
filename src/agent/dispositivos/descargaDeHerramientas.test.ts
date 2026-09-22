import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { zipSync } from "fflate";
import {
  descargarYDescomprimir,
  TOPE_DE_LA_DESCARGA,
  TOPE_DESCOMPRIMIDO,
} from "./descargaDeHerramientas.js";
import { TOPE_SIN_SALIDA_MS } from "./procesosEnMaquina.js";

/**
 * Una `Response` de mentira que sirve `zip` entero de una vez por `arrayBuffer()` — sin
 * cuerpo en streaming. Vale para los casos que no dependen del progreso a trozos.
 */
function respuestaDeUnGolpe(zip: Uint8Array, opciones: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: opciones.ok ?? true,
    status: opciones.status ?? 200,
    headers: { get: () => null },
    body: null,
    arrayBuffer: async () => zip.slice().buffer,
  } as unknown as Response;
}

/**
 * Una `Response` con el cuerpo en STREAMING, trozo a trozo, para probar el progreso y el
 * vigilante de silencio. `trozos` se entregan en orden; `contentLength` alimenta el `%`.
 */
function respuestaEnTrozos(trozos: Uint8Array[], contentLength?: number): Response {
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: { get: (nombre: string) => (nombre === "content-length" && contentLength !== undefined ? String(contentLength) : null) },
    body: {
      getReader: () => ({
        read: async () => {
          if (i < trozos.length) return { done: false, value: trozos[i++]! };
          return { done: true, value: undefined };
        },
      }),
    },
  } as unknown as Response;
}

describe("descargarYDescomprimir", () => {
  it("descarga, descomprime y escribe cada fichero bajo el destino — caso feliz", async () => {
    const zip = zipSync({ "platform-tools/adb.exe": new Uint8Array([1, 2, 3]), "platform-tools/fastboot.exe": new Uint8Array([4]) });
    const escritos: { ruta: string; datos: Uint8Array }[] = [];
    const carpetas: string[] = [];
    const lineas: string[] = [];
    const { terminado } = descargarYDescomprimir(
      "https://dl.google.com/x.zip",
      "C:\\Sdk",
      {},
      {
        fetch: (async () => respuestaDeUnGolpe(zip)) as unknown as typeof fetch,
        crearCarpeta: (r) => carpetas.push(r),
        escribir: (r, d) => escritos.push({ ruta: r, datos: d }),
        alSalirLinea: (l) => lineas.push(l),
      }
    );
    const r = await terminado;
    expect(r.estado).toBe("ok");
    expect(escritos.map((e) => e.ruta).sort()).toEqual(
      [join("C:\\Sdk", "platform-tools", "adb.exe"), join("C:\\Sdk", "platform-tools", "fastboot.exe")].sort()
    );
    expect(escritos.find((e) => e.ruta.endsWith("adb.exe"))!.datos).toEqual(new Uint8Array([1, 2, 3]));
    expect(lineas.some((l) => l.startsWith("listo:"))).toBe(true);
  });

  it("con `renombrarCarpetaUnicaA`, la única carpeta de primer nivel del zip cae con el nombre FIJO", async () => {
    // El caso del JDK de Adoptium: la carpeta trae la versión en el nombre.
    const zip = zipSync({ "jdk-17.0.20.1+1/bin/java.exe": new Uint8Array([9]) });
    const escritos: { ruta: string; datos: Uint8Array }[] = [];
    const { terminado } = descargarYDescomprimir(
      "https://api.adoptium.net/x",
      join("C:\\Users\\yo\\AppData\\Local", "Android"),
      { renombrarCarpetaUnicaA: "jdk17" },
      { fetch: (async () => respuestaDeUnGolpe(zip)) as unknown as typeof fetch, crearCarpeta: () => {}, escribir: (r, d) => escritos.push({ ruta: r, datos: d }) }
    );
    expect(await terminado).toMatchObject({ estado: "ok" });
    expect(escritos[0]!.ruta).toBe(join("C:\\Users\\yo\\AppData\\Local", "Android", "jdk17", "bin", "java.exe"));
  });

  it("sin `renombrarCarpetaUnicaA`, la carpeta del zip se conserva TAL CUAL (caso platform-tools)", async () => {
    const zip = zipSync({ "platform-tools/adb.exe": new Uint8Array([1]) });
    const escritos: string[] = [];
    const { terminado } = descargarYDescomprimir(
      "https://dl.google.com/x.zip",
      "C:\\Sdk",
      {},
      { fetch: (async () => respuestaDeUnGolpe(zip)) as unknown as typeof fetch, crearCarpeta: () => {}, escribir: (r) => escritos.push(r) }
    );
    await terminado;
    expect(escritos).toEqual([join("C:\\Sdk", "platform-tools", "adb.exe")]);
  });

  it("un HTTP que no es 200 es fallo, con el código en el motivo — y no intenta descomprimir nada", async () => {
    const escritos: string[] = [];
    const { terminado } = descargarYDescomprimir(
      "https://dl.google.com/x.zip",
      "C:\\Sdk",
      {},
      { fetch: (async () => respuestaDeUnGolpe(new Uint8Array(), { ok: false, status: 404 })) as unknown as typeof fetch, escribir: (r) => escritos.push(r) }
    );
    const r = await terminado;
    expect(r).toMatchObject({ estado: "fallo" });
    expect(r.motivo).toMatch(/404/);
    expect(escritos).toEqual([]);
  });

  it("un zip corrupto no revienta: fallo con motivo de una línea", async () => {
    const { terminado } = descargarYDescomprimir(
      "https://dl.google.com/x.zip",
      "C:\\Sdk",
      {},
      { fetch: (async () => respuestaDeUnGolpe(new Uint8Array([1, 2, 3, 4, 5]))) as unknown as typeof fetch }
    );
    const r = await terminado;
    expect(r.estado).toBe("fallo");
    expect(r.motivo).toMatch(/no se pudo abrir/);
  });

  it("una entrada que se sale de su carpeta (zip-slip) se rechaza ENTERA, nada se escribe", async () => {
    // La MISMA guarda que `core/zipDeSkill.ts`, reutilizada y no reescrita: un zip que se
    // descarga de internet es la misma clase de entrada, aunque el host sea de confianza.
    const zip = zipSync({ "../fuera/malo.txt": new Uint8Array([1]) }, { level: 0 });
    const escritos: string[] = [];
    const { terminado } = descargarYDescomprimir(
      "https://dl.google.com/x.zip",
      "C:\\Sdk",
      {},
      { fetch: (async () => respuestaDeUnGolpe(zip)) as unknown as typeof fetch, escribir: (r) => escritos.push(r) }
    );
    const r = await terminado;
    expect(r.estado).toBe("fallo");
    expect(r.motivo).toMatch(/se sale de su carpeta/);
    expect(escritos).toEqual([]);
  });

  it("la descarga se para por lo que pesa RECIBIDO, antes de intentar descomprimir nada", async () => {
    // No hace falta que sea un zip de verdad: el tope de la descarga se comprueba ANTES del
    // `unzipSync`, así que unos bytes cualquiera de más del tope bastan para probarlo.
    const grande = new Uint8Array(TOPE_DE_LA_DESCARGA + 1);
    const { terminado } = descargarYDescomprimir(
      "https://dl.google.com/x.zip",
      "C:\\Sdk",
      {},
      { fetch: (async () => respuestaDeUnGolpe(grande)) as unknown as typeof fetch }
    );
    const r = await terminado;
    expect(r.estado).toBe("fallo");
    expect(r.motivo).toMatch(/pesa más/);
  });

  it("un zip bomba se para por lo que ocupa DESCOMPRIMIDO", async () => {
    // Todo-ceros comprime a casi nada con deflate, así que el ZIP en sí es pequeño — lo que
    // se prueba es el tope de después de descomprimir, no el de la descarga.
    const zip = zipSync({ "x.bin": new Uint8Array(TOPE_DESCOMPRIMIDO + 1) });
    const { terminado } = descargarYDescomprimir(
      "https://dl.google.com/x.zip",
      "C:\\Sdk",
      {},
      { fetch: (async () => respuestaDeUnGolpe(zip)) as unknown as typeof fetch }
    );
    const r = await terminado;
    expect(r.estado).toBe("fallo");
    expect(r.motivo).toMatch(/descomprimido/);
  }, 20_000);

  it("con cuerpo en STREAMING, informa el progreso a saltos de 10 puntos", async () => {
    const zip = zipSync({ "a.txt": new Uint8Array([1, 2, 3, 4]) });
    // Se parte en 4 trozos iguales para que el `content-length` dé un `%` que se pueda leer.
    const cuarto = Math.ceil(zip.length / 4);
    const trozos = [zip.slice(0, cuarto), zip.slice(cuarto, cuarto * 2), zip.slice(cuarto * 2, cuarto * 3), zip.slice(cuarto * 3)];
    const lineas: string[] = [];
    const { terminado } = descargarYDescomprimir(
      "https://dl.google.com/x.zip",
      "C:\\Sdk",
      {},
      { fetch: (async () => respuestaEnTrozos(trozos, zip.length)) as unknown as typeof fetch, alSalirLinea: (l) => lineas.push(l) }
    );
    await terminado;
    expect(lineas.some((l) => /^descargando… \d+%$/.test(l))).toBe(true);
    expect(lineas.some((l) => l === "descomprimiendo…")).toBe(true);
  });

  it("cancelar aborta el `fetch` en curso y se reporta como cancelada, no como fallo", async () => {
    const fetchQueEsperaAlAborto = ((_url: string, opciones: { signal: AbortSignal }) =>
      new Promise((_resolver, rechazar) => {
        opciones.signal.addEventListener("abort", () => rechazar(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch;
    const { cancelar, terminado } = descargarYDescomprimir("https://dl.google.com/x.zip", "C:\\Sdk", {}, { fetch: fetchQueEsperaAlAborto });
    cancelar();
    expect(await terminado).toMatchObject({ estado: "cancelada" });
  });

  it("sin ningún trozo durante mucho rato se da por COLGADA, no por cancelada ni por fallo", async () => {
    vi.useFakeTimers();
    let rechazarPorAborto: (() => void) | undefined;
    const fetchColgado = ((_url: string, opciones: { signal: AbortSignal }) =>
      new Promise((_resolver, rechazar) => {
        rechazarPorAborto = () => rechazar(Object.assign(new Error("aborted"), { name: "AbortError" }));
        opciones.signal.addEventListener("abort", () => rechazarPorAborto!());
      })) as unknown as typeof fetch;
    const { terminado } = descargarYDescomprimir("https://dl.google.com/x.zip", "C:\\Sdk", {}, { fetch: fetchColgado });
    await vi.advanceTimersByTimeAsync(TOPE_SIN_SALIDA_MS + 1000);
    expect(await terminado).toMatchObject({ estado: "colgada" });
    vi.useRealTimers();
  });
});
