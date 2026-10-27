/**
 * Hablar con la copia de la GRANJA de la sesión, por el canal local que XOneCode escribe en el fichero del aparato
 * (`dispositivo.mjs#canalDeGranja`, relé de `agent/dispositivos/releDeGranja.ts`). Sin `adb`, sin túnel y sin token: el
 * relé pide la copia al primer uso, añade el token y la huella, y la libera (la BORRA) al acabar el turno.
 *
 * Lo medido en la granja real que esto da por hecho:
 *  - El canal saluda (`server_hello`) y contesta UNA respuesta por comando, en orden, como el de un aparato local.
 *  - Desplegar es subir `debug_app_update.zip` a `file_upload` y `launchApplication`: SIN reiniciar nada. Con la app
 *    abierta, volver a subir y lanzar la recarga. Y el ZIP lleva `bd/`: la copia empieza VACÍA en cada turno.
 *  - La captura es la de la API de la granja (JPEG de la pantalla virtual, con los diálogos): `adb screencap` no ve
 *    las pantallas virtuales.
 *  - `restart` destruye la pantalla y la recrea vacía, y cierra el canal (el relé lo reabre en la siguiente conexión).
 *  - `getLog` trae el log SOLO de esta copia (`logcat`, `exception`, `stackTrace`).
 *
 * Fuera de `scripts/` a propósito: esa carpeta va al PATH y cada fichero suyo es un comando.
 */

/** La base HTTP del relé de la sesión: `ws://127.0.0.1:P/granja/<clave>/hotswap` → `http://127.0.0.1:P/granja/<clave>`. */
export function baseHttpDeGranja(canal) {
  return canal.replace(/^ws:/, "http:").replace(/\/hotswap$/, "");
}

/** Lo que dice el relé cuando se niega: su texto, que ya lleva el motivo (sin copias libres, sin configurar…). */
async function falloDeRele(respuesta, que) {
  const texto = (await respuesta.text().catch(() => "")).trim();
  return new Error(`${que}: la granja contestó ${respuesta.status}${texto === "" ? "" : ` — ${texto}`}`);
}

/** La captura de la pantalla de la copia, en JPEG. `anchura` reduce (la granja escala); sin ella, a tamaño real. */
export async function capturaDeGranja(canal, { anchura } = {}) {
  const consulta = anchura === undefined ? "?quality=85" : `?width=${anchura}&quality=85`;
  const r = await fetch(`${baseHttpDeGranja(canal)}/screenshot${consulta}`);
  if (!r.ok) throw await falloDeRele(r, "no se pudo capturar la copia de la granja");
  return Buffer.from(await r.arrayBuffer());
}

/** Sube el ZIP a la app (`file_upload`): la copia lo descomprime en su carpeta de la app. */
export async function subirAGranja(canal, bytes, app) {
  const consulta = `?file=debug_app_update.zip&appName=${encodeURIComponent(app)}`;
  const r = await fetch(`${baseHttpDeGranja(canal)}/file_upload${consulta}`, { method: "POST", body: bytes });
  if (!r.ok) throw await falloDeRele(r, "no se pudo subir el paquete a la copia de la granja");
}

/** `restart` de la copia: el equivalente al `force-stop` local. La pantalla vuelve vacía y el canal se cierra. */
export async function reiniciarCopia(canal) {
  const r = await fetch(`${baseHttpDeGranja(canal)}/restart`, { method: "POST" });
  if (!r.ok) throw await falloDeRele(r, "no se pudo reiniciar la copia de la granja");
}

/**
 * Un comando por el canal: espera el saludo, manda, devuelve la respuesta (JSON). Un cierre del relé antes de contestar
 * es un error con SU motivo (por ejemplo, «no hay ninguna copia libre en la granja ahora mismo»).
 */
export function comandoEnGranja(canal, comando, tope = 60_000) {
  return new Promise((resolver, rechazar) => {
    const ws = new WebSocket(canal);
    let saludado = false;
    let acabado = false;
    const acabar = (fn) => {
      if (acabado) return;
      acabado = true;
      clearTimeout(reloj);
      fn();
      try {
        ws.close();
      } catch {
        // ya cerrado
      }
    };
    const reloj = setTimeout(() => acabar(() => rechazar(new Error(`la copia de la granja no contestó en ${Math.round(tope / 1000)} s`))), tope);
    ws.addEventListener("message", (e) => {
      let m;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (!saludado && m?.command === "server_hello") {
        saludado = true;
        ws.send(JSON.stringify(comando));
        return;
      }
      if (saludado) acabar(() => resolver(m));
    });
    ws.addEventListener("close", (e) =>
      acabar(() => rechazar(new Error(e.reason ? `la granja cerró el canal: ${e.reason}` : "la granja cerró el canal sin contestar"))),
    );
    ws.addEventListener("error", () => acabar(() => rechazar(new Error("no se pudo abrir el canal local de la granja"))));
  });
}

/**
 * Espera a que la app esté VIVA de verdad: `getCurrentScreen` con una colección y sin el diálogo de carga fallida. El
 * `result:true` de `launchApplication` es un acuse, no una medida (lo mismo que en local).
 */
export async function esperarAppEnGranja(canal, tope = 90_000) {
  const hasta = Date.now() + tope;
  let ultimo;
  while (Date.now() < hasta) {
    const r = await comandoEnGranja(canal, { command: "getCurrentScreen" }).catch((error) => ({ result: false, status: error.message }));
    ultimo = r;
    if (r?.result === true) {
      let pantalla;
      try {
        pantalla = JSON.parse(r.status);
      } catch {
        pantalla = undefined;
      }
      const dialogos = Array.isArray(pantalla?.dialogs) ? pantalla.dialogs.map((d) => d?.name) : [];
      if (dialogos.includes("LoadAppErrorDialog")) return { viva: false, pantalla, motivo: "la app abrió con un diálogo de error al cargar (mira xone-log-android)" };
      if (typeof pantalla?.collection === "string" && pantalla.collection !== "") return { viva: true, pantalla };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { viva: false, motivo: `la app no llegó a una colección en ${Math.round(tope / 1000)} s (${String(ultimo?.status ?? "").slice(0, 120)})` };
}

/** La excepción de `getLog`, si de verdad la hay: la granja rellena el campo con un aviso cuando no la hay (medido). */
export function excepcionDeGetLog(respuesta) {
  const valor = typeof respuesta?.exception === "string" ? respuesta.exception.trim() : "";
  if (valor === "" || /No exception is available/i.test(valor)) return undefined;
  return valor;
}

/**
 * `launchApplication` tras un `restart`, reintentando: medido, justo después la pantalla recreada aún no tiene su
 * actividad ancla y Android lo rechaza («SecurityException: Permission Denial»); la granja la repone en unos segundos.
 */
export async function lanzarEnGranja(canal, app, tope = 45_000) {
  const hasta = Date.now() + tope;
  let ultima;
  while (Date.now() < hasta) {
    ultima = await comandoEnGranja(canal, { command: "launchApplication", appName: app }).catch((error) => ({ result: false, status: error.message }));
    if (ultima?.result === true) return ultima;
    // Que la app no esté subida no se arregla esperando.
    if (/is not installed/i.test(String(ultima?.status ?? ""))) return ultima;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return ultima;
}
