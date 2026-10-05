/**
 * La GEOMETRÍA de una captura: el árbol de controles y las barras del sistema EN EL MISMO MOMENTO,
 * guardados al lado de la imagen con su nombre (`calc_08.jpg` → `calc_08.geometria.json`).
 *
 * POR QUÉ, y por qué AQUÍ. El crítico visual del host (`xone_critica_visual`) compara tecla a tecla
 * —qué falta, en qué fila, qué tamaño, qué queda tapado— leyendo cajas, no píxeles. Para eso necesita
 * el árbol de la MISMA pantalla que la captura: emparejarlo después por la fecha de los ficheros ya
 * cruzó una vez el árbol de una ronda con la captura de otra, y una cifra «exacta» de la ronda
 * equivocada es peor que ninguna. Sacarlo en el mismo comando que la captura lo hace imposible.
 *
 * Las barras salen de `dumpsys window` (`InsetsSource … type=navigationBars frame=[0,2337][1080,2400]`):
 * con Android dibujando de borde a borde, un control puede quedar DEBAJO de la barra de navegación, y
 * su alto cambia según el aparato y el modo de navegación (medido en un pixel8: 63 px con gestos), así
 * que no se adivina.
 *
 * NUNCA hace fallar la captura: si no se puede, se dice por stderr y la captura queda sin geometría.
 * Va a `$XONECODE_HOTSWAP` (andamio, como los volcados del canal), no a artefactos: no es algo que mirar.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NODE, rutaDeAdb } from "./dispositivo.mjs";

/** El nombre del fichero de geometría de una captura: su nombre sin extensión + `.geometria.json`. */
export function nombreDeGeometria(nombreDeCaptura) {
  return `${nombreDeCaptura.replace(/\.[A-Za-z0-9]{2,4}$/, "")}.geometria.json`;
}

/** Las barras del sistema de la salida de `dumpsys window`, o `undefined` si no salen. Pura. */
export function barrasDeDumpsys(salida) {
  const frame = (tipo) => {
    const m = new RegExp(`type=${tipo} frame=\\[(-?\\d+),(-?\\d+)\\]\\[(-?\\d+),(-?\\d+)\\] visible=true`).exec(String(salida));
    return m === null ? undefined : { izquierda: +m[1], arriba: +m[2], derecha: +m[3], abajo: +m[4] };
  };
  const estado = frame("statusBars");
  const navegacion = frame("navigationBars");
  if (estado === undefined && navegacion === undefined) return undefined;
  return { ...(estado === undefined ? {} : { estado }), ...(navegacion === undefined ? {} : { navegacion }) };
}

/** Hasta dónde llegan los controles del árbol (el borde derecho y el inferior más lejanos). Pura. */
export function extensionDelArbol(arbol) {
  let ancho = 0;
  let alto = 0;
  const visitar = (n) => {
    if (Array.isArray(n)) return n.forEach(visitar);
    if (n === null || typeof n !== "object") return;
    const b = n.bounds;
    if (b && typeof b.left === "number" && typeof b.width === "number" && typeof b.top === "number" && typeof b.height === "number") {
      ancho = Math.max(ancho, b.left + b.width);
      alto = Math.max(alto, b.top + b.height);
    }
    for (const v of Object.values(n)) if (v !== null && typeof v === "object") visitar(v);
  };
  visitar(arbol);
  return { ancho, alto };
}

/**
 * La imagen es de UN CONTROL y no de la pantalla entera (`xone-hotswap shot name=…`): es claramente más pequeña que
 * lo que ocupa el árbol. Su geometría no le corresponde —las cajas son de la pantalla— y el crítico mediría píxeles
 * que no son (medido: una foto del visor salía con siete textos «recortados»). Pura.
 */
export function esCapturaDeUnControl(pantalla, arbol) {
  const e = extensionDelArbol(arbol);
  return pantalla !== undefined && e.alto > 0 && (pantalla.alto < e.alto * 0.95 || pantalla.ancho < e.ancho * 0.95);
}

/** El ancho y el alto de un PNG o un JPEG, leídos de su cabecera. `undefined` si no se sabe. Pura. */
export function medidasDeImagen(bytes) {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return undefined;
      const marca = bytes[i + 1];
      const largo = bytes.readUInt16BE(i + 2);
      if (marca >= 0xc0 && marca <= 0xc3) return { alto: bytes.readUInt16BE(i + 5), ancho: bytes.readUInt16BE(i + 7) };
      i += 2 + largo;
    }
  }
  return undefined;
}

/**
 * Guarda `<captura>.geometria.json` en `$XONECODE_HOTSWAP`. Devuelve el nombre, o `undefined` y lo dice.
 * `bytes` son los de la captura (para su tamaño); `serie`, el aparato.
 */
export function guardarGeometria({ nombreDeCaptura, bytes, serie, entorno = process.env }) {
  const destino = entorno.XONECODE_HOTSWAP;
  if (!destino) {
    process.stderr.write("(sin XONECODE_HOTSWAP: la captura queda sin geometría para el crítico)\n");
    return undefined;
  }
  let arbol;
  const temporal = mkdtempSync(join(tmpdir(), "xonecode-geometria-"));
  try {
    // El cliente guarda un árbol grande en `$XONECODE_HOTSWAP`: se le da uno PROPIO para saber cuál es.
    const cliente = join(import.meta.dirname, "..", "scripts", "xone-hotswap");
    execFileSync(NODE, [cliente, "getAllElements", "format=xone", ...(serie ? ["--serie", serie] : [])], {
      encoding: "utf8",
      env: { ...entorno, XONECODE_HOTSWAP: temporal },
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
    });
    const fichero = readdirSync(temporal).find((n) => n.endsWith(".json"));
    if (fichero !== undefined) arbol = JSON.parse(readFileSync(join(temporal, fichero), "utf8"));
  } catch {
    // Sin canal o sin app: se queda sin árbol, y se dice abajo.
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
  if (arbol === undefined) {
    process.stderr.write("(no pude leer el árbol de controles: la captura queda sin geometría para el crítico)\n");
    return undefined;
  }
  let barras;
  try {
    barras = barrasDeDumpsys(
      execFileSync(rutaDeAdb(entorno), [...(serie ? ["-s", serie] : []), "shell", "dumpsys", "window"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 15_000,
      })
    );
  } catch {
    // Sin barras, el crítico no puede decir qué queda tapado: lo dirá él.
  }
  const nombre = nombreDeGeometria(nombreDeCaptura);
  const pantalla = medidasDeImagen(bytes);
  if (esCapturaDeUnControl(pantalla, arbol)) {
    process.stderr.write("(captura de un control, no de la pantalla entera: sin geometría para el crítico)\n");
    return undefined;
  }
  mkdirSync(destino, { recursive: true });
  writeFileSync(
    join(destino, nombre),
    JSON.stringify({ v: 1, captura: nombreDeCaptura, en: new Date().toISOString(), ...(pantalla ? { pantalla } : {}), ...(barras ? { barras } : {}), arbol })
  );
  return nombre;
}
