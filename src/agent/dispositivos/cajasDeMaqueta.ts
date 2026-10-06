/**
 * Las CAJAS de una maqueta HTML (el `code.html` de Stitch): renderizarla en un Chrome sin ventana y medir
 * cada botón con su texto. Es la mitad «maqueta» de `core/geometriaDePantalla.ts`.
 *
 * Cuatro decisiones, cada una medida:
 * - **Un iframe del tamaño EXACTO de la maqueta.** Chrome sin ventana no baja de 500 px de ancho (medido,
 *   en el modo viejo y en `--headless=new`), y una maqueta de móvil mide 390: con la ventana a 500 se
 *   reparte otro ancho y cada caja sale en otro sitio. Dentro de un iframe de 390×746, el viewport —y los
 *   `100vh` de la maqueta— son los suyos.
 * - **Sin `--allow-file-access-from-files`.** El `code.html` de Stitch carga Tailwind y las fuentes de un
 *   CDN, así que la red va ABIERTA; con ese permiso además, cualquier script de la página podría leer
 *   ficheros locales y mandarlos fuera. El script que mide va DENTRO de la copia de la maqueta y le pasa
 *   el resultado al envoltorio con `postMessage`, que no necesita ese permiso.
 * - **Se comprueba que se RENDERIZÓ antes de fiarse.** Sin red, Tailwind no carga y Chrome devuelve las
 *   cajas de una página sin estilos: una medida falsa en silencio. Si la página pide Tailwind y no lo
 *   tiene, no hay cajas y se dice.
 * - **Se escribe FUERA del proyecto** (un temporal, como `/pdf`) y se borra pase lo que pase.
 *
 * Se guarda por la huella del HTML y el tamaño: cada render son unos 6 s.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MaquetaMedida } from "../../core/geometriaDePantalla.js";
import { navegadorParaImprimir } from "../exportarPdf.js";

/** Lo que tarda como mucho un render: con red lenta, Tailwind y las fuentes son unos segundos. */
export const TOPE_DE_RENDER_MS = 45_000;

const MARCA = "__xonecode_cajas";

/**
 * Qué se mide de la maqueta: los TEXTOS que se ven, cada uno con su caja. Se ejecuta DENTRO de la página (se
 * inyecta con `toString()`), así que es JavaScript que el navegador entiende tal cual y no puede usar nada de fuera.
 * Exportada para probarla con un DOM de pruebas.
 *
 * Antes se medían solo los `<button>`, cada uno con TODO su texto pegado. En la calculadora valía —cada tecla es un
 * botón con un texto—, pero en una pantalla de tarjetas (Maset) cada tarjeta es un botón con título, badge,
 * subtítulo y contador dentro: salía UN elemento «ENTREGAS PRIORIDAD Reparto de pedidos… 12 pend.» que no coincide
 * con ningún control del aparato (BLOQUEANTE falso), y todo lo que no es botón —cabecera, banda, sección, pie— no se
 * veía. Ahora:
 * - un botón con UN texto (sin contar los iconos de Material) es un elemento, con la caja del BOTÓN: su forma es la
 *   de la tecla, no la de las letras;
 * - un botón con VARIOS textos se parte en ellos;
 * - fuera de los botones, cada elemento con texto propio es uno.
 * Cada uno dice si es un botón (`boton`): lo que no lo es y no tiene letras es un dato de ejemplo («12», «09:41»).
 */
export function medirElementos(doc: any): Array<{ texto: string; caja: { x: number; y: number; ancho: number; alto: number }; boton?: true }> {
  var ICONO = /material-(symbols|icons)/;
  var FUERA = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE|HEAD)$/;
  var limpio = function (t: string): string {
    return (t || "").replace(/\s+/g, " ").trim();
  };
  var cajaDe = function (el: any): { x: number; y: number; ancho: number; alto: number } | undefined {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, ancho: r.width, alto: r.height } : undefined;
  };
  var propio = function (el: any): string {
    var t = "";
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) t += n.nodeValue;
    return limpio(t);
  };
  // Todos sus textos, unidos con un espacio: `innerText` pegaría «content_copyCOPY» si el HTML no deja hueco entre ellos.
  var todoElTexto = function (el: any): string {
    var partes: string[] = [];
    var recorrer = function (n: any): void {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) partes.push(c.nodeValue);
        else if (c.nodeType === 1 && !FUERA.test(c.tagName)) recorrer(c);
      }
    };
    recorrer(el);
    return limpio(partes.join(" "));
  };
  var esIcono = function (el: any): boolean {
    return typeof el.className === "string" && ICONO.test(el.className);
  };
  var hojas: any[] = [];
  var todos = doc.body.querySelectorAll("*");
  for (var i = 0; i < todos.length; i++) if (!FUERA.test(todos[i].tagName) && propio(todos[i]) !== "") hojas.push(todos[i]);
  var salida: Array<{ texto: string; caja: { x: number; y: number; ancho: number; alto: number }; boton?: true }> = [];
  var cubiertas: any[] = [];
  var botones = doc.querySelectorAll("button,[role=button]");
  for (var j = 0; j < botones.length; j++) {
    var b = botones[j];
    var dentro = hojas.filter(function (h) {
      return b === h || b.contains(h);
    });
    var textos = dentro.filter(function (h) {
      return !esIcono(h);
    });
    if (textos.length > 1) continue;
    var cb = cajaDe(b);
    if (cb !== undefined) salida.push({ texto: todoElTexto(b), caja: cb, boton: true });
    for (var k = 0; k < dentro.length; k++) cubiertas.push(dentro[k]);
  }
  for (var m = 0; m < hojas.length; m++) {
    if (cubiertas.indexOf(hojas[m]) >= 0) continue;
    var ch = cajaDe(hojas[m]);
    if (ch !== undefined) salida.push({ texto: propio(hojas[m]), caja: ch });
  }
  return salida;
}

/** El script que mide, DENTRO de la maqueta: sus textos (`medirElementos`) y sus bloques anchos, al envoltorio. */
// `var __name`: bajo `tsx`, esbuild envuelve cada función con `__name(fn, "nombre")` (keepNames), y ese ayudante no existe
// dentro de la página: sin él la medida no volvía nunca, en silencio. Con el build de `tsc` no aparece y esto no estorba.
const MEDIDOR = `<script>var __name=function(f){return f};addEventListener("load",function(){setTimeout(function(){var o=(${medirElementos.toString()})(document);var b=[];var cs=document.querySelectorAll("header,nav,section,main,footer,div");for(var j=0;j<cs.length;j++){var q=cs[j].getBoundingClientRect();if(q.width<innerWidth*0.85||q.height<24||q.height>innerHeight*0.6)continue;var rep=false;for(var k=0;k<b.length;k++){if(Math.abs(b[k].y-q.top)<3&&Math.abs(b[k].alto-q.height)<3)rep=true;}if(!rep)b.push({x:q.left,y:q.top,ancho:q.width,alto:q.height});}parent.postMessage(JSON.stringify({ancho:innerWidth,alto:innerHeight,tailwind:typeof tailwind!=="undefined",pideTailwind:!!document.querySelector('script[src*="tailwindcss"]'),elementos:o,bloques:b}),"*");},1200);});</script>`;

function envoltorio(ancho: number, alto: number): string {
  return `<!doctype html><html><body style="margin:0"><iframe src="maqueta.html" style="border:0;width:${ancho}px;height:${alto}px"></iframe><script>addEventListener("message",function(e){var p=document.createElement("pre");p.id="${MARCA}";p.textContent=e.data;document.body.appendChild(p);});</script></body></html>`;
}

/** La escala de una imagen de maqueta: una exportada a 2x o 3x se mide a su tamaño en puntos. Pura. */
export function viewportDeMaqueta(anchoPng: number, altoPng: number): { ancho: number; alto: number } {
  for (const escala of [1, 2, 3]) {
    const ancho = anchoPng / escala;
    if (ancho >= 300 && ancho <= 520) return { ancho: Math.round(ancho), alto: Math.round(altoPng / escala) };
  }
  return { ancho: anchoPng, alto: altoPng };
}

/** El ancho y el alto de un PNG o un JPEG, de su cabecera. `undefined` si no se sabe. Pura. */
export function medidasDeImagen(bytes: Buffer): { ancho: number; alto: number } | undefined {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return undefined;
      const marca = bytes[i + 1]!;
      if (marca >= 0xc0 && marca <= 0xc3) return { alto: bytes.readUInt16BE(i + 5), ancho: bytes.readUInt16BE(i + 7) };
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }
  return undefined;
}

/** Saca la medida del DOM que vuelca Chrome. Pura. */
export function medidaDelDom(dom: string): (MaquetaMedida & { tailwind: boolean; pideTailwind: boolean }) | undefined {
  const m = new RegExp(`<pre id="${MARCA}">([\\s\\S]*?)</pre>`).exec(dom);
  if (m === null) return undefined;
  const texto = m[1]!.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  try {
    return JSON.parse(texto) as MaquetaMedida & { tailwind: boolean; pideTailwind: boolean };
  } catch {
    return undefined;
  }
}

export interface DependenciasDeRender {
  navegador?: string;
  /** Lanza el navegador y devuelve lo que imprime. Los tests no abren un Chrome. */
  volcar?: (navegador: string, argumentos: readonly string[]) => Promise<string>;
}

const cache = new Map<string, MaquetaMedida | { motivo: string }>();

/**
 * Las cajas de `rutaDelHtml` renderizada a `ancho`×`alto`. Nunca lanza: lo que falla vuelve como motivo.
 */
export async function cajasDeMaqueta(
  rutaDelHtml: string,
  ancho: number,
  alto: number,
  deps: DependenciasDeRender = {}
): Promise<MaquetaMedida | { motivo: string }> {
  let html: string;
  try {
    html = readFileSync(rutaDelHtml, "utf8");
  } catch {
    return { motivo: "no pude leer el code.html de la maqueta" };
  }
  const clave = `${createHash("sha256").update(html).digest("hex")}:${ancho}x${alto}`;
  const guardada = cache.get(clave);
  if (guardada !== undefined) return guardada;

  const navegador = deps.navegador ?? navegadorParaImprimir(existsSync);
  if (navegador === undefined) return { motivo: "no hay Chrome ni Chromium con el que renderizar la maqueta" };

  const taller = mkdtempSync(join(tmpdir(), "xonecode-maqueta-"));
  try {
    writeFileSync(join(taller, "maqueta.html"), html.includes("</body>") ? html.replace(/<\/body>/i, `${MEDIDOR}</body>`) : `${html}${MEDIDOR}`, "utf8");
    writeFileSync(join(taller, "envoltorio.html"), envoltorio(ancho, alto), "utf8");
    const dom = await (deps.volcar ?? volcarReal)(navegador, [
      "--headless=new",
      "--disable-gpu",
      `--window-size=${Math.max(ancho + 40, 600)},${alto + 40}`,
      "--virtual-time-budget=15000",
      "--dump-dom",
      `file://${join(taller, "envoltorio.html")}`,
    ]);
    const medida = medidaDelDom(dom);
    let resultado: MaquetaMedida | { motivo: string };
    if (medida === undefined) resultado = { motivo: "el navegador no devolvió la medida de la maqueta" };
    else if (medida.pideTailwind && !medida.tailwind) resultado = { motivo: "la maqueta no cargó sus estilos (Tailwind, de un CDN): ¿hay red?" };
    else if (medida.elementos.length === 0) resultado = { motivo: "la maqueta no tiene botones que medir" };
    else resultado = { ancho: medida.ancho, alto: medida.alto, elementos: medida.elementos, ...(medida.bloques === undefined ? {} : { bloques: medida.bloques }) };
    // Un fallo por la RED no se guarda: con red, la siguiente vez saldrá.
    if (!("motivo" in resultado) || !resultado.motivo.includes("red")) cache.set(clave, resultado);
    return resultado;
  } catch (error) {
    return { motivo: `el navegador no pudo renderizar la maqueta (${error instanceof Error ? error.name : "error"})` };
  } finally {
    rmSync(taller, { recursive: true, force: true });
  }
}

const volcarReal = (navegador: string, argumentos: readonly string[]): Promise<string> =>
  new Promise((resolver, rechazar) => {
    execFile(navegador, [...argumentos], { timeout: TOPE_DE_RENDER_MS, maxBuffer: 64 * 1024 * 1024 }, (error, salida) =>
      error === null ? resolver(String(salida)) : rechazar(error)
    );
  });
