#!/usr/bin/env node
/**
 * El canal de comandos del servidor hotswap, desde la línea de órdenes.
 *
 * POR QUÉ EXISTE ESTE FICHERO. Los comandos del servidor hotswap viajan por un **WebSocket**,
 * y `curl` no habla WebSocket. En Android 5.0.2.2dev el `POST /command` por HTTP contesta
 * **404** (eso es del flavor `playStoreDeveloper`, no del standalone), así que sin un cliente
 * no hay forma de mandar `getAllElements` ni `getScreenshot` desde una shell. Esto es ese
 * cliente, y por eso vive dentro de la skill: la skill dice QUÉ comandos hay, y esto es con
 * qué se mandan.
 *
 * USO
 *   node "$XONECODE_SKILL_XONE_HOTSWAP/scripts/hotswap.mjs" '{"command":"getAllElements","format":"xone"}'
 *   node "$XONECODE_SKILL_XONE_HOTSWAP/scripts/hotswap.mjs" '{"command":"launchApplication","appName":"miapp"}' '{"command":"getScreenshot"}'
 *
 * Los comandos se mandan EN ORDEN y cada uno espera la respuesta del anterior.
 *
 * ANTES DE LLAMARLO (Android): tiene que estar el túnel, o `127.0.0.1:8443` no lleva a
 * ninguna parte —el servidor escucha en el localhost del APARATO—:
 *   adb forward tcp:8443 tcp:8443
 * En iOS no hay túnel: el simulador comparte la pila de red del Mac.
 *
 * VARIABLES
 *   HOTSWAP_URL          el destino. Por omisión `wss://127.0.0.1:8443/hotswap`.
 *   XONECODE_ARTEFACTOS  dónde dejar lo binario (una captura). Si no está, se dice y no se
 *                        guarda: escribirlo en el proyecto sería ensuciar la app del usuario.
 *   HOTSWAP_TOPE_MS      tope de espera de UNA respuesta. Por omisión 40000.
 *
 * LO QUE IMPRIME: una línea JSON por respuesta, en stdout. Una respuesta con un binario
 * dentro NO se imprime: se guarda a fichero y lo que sale es su nombre y su tamaño. Un
 * `getScreenshot` son ~57.000 caracteres de base64, y volcarlos en la salida de un comando
 * es meterlos en el contexto para siempre sin que nadie pueda mirarlos.
 *
 * TRES COSAS MEDIDAS contra el framework real (Android 5.0.2.2dev, 16-09-2026), que son las
 * que hacen que esto funcione y un cliente escrito de memoria no:
 *  - **El WebSocket vive en `/hotswap`**, no en la raíz: `/`, `/ws`, `/websocket` dan 400.
 *  - **El servidor habla PRIMERO**: al abrir manda `{"command":"server_hello","protocol_version":2}`.
 *    Se ESPERA ese saludo antes de mandar nada; no se provoca.
 *  - **La respuesta llega en `status`**, no en un campo `image`, y una captura viene en
 *    **JPEG** (`/9j/…`), no en PNG.
 */
// El certificado del aparato es autofirmado. Esto vale para ESTE proceso hijo y solo para él
// —no para el harness—, que es justo por lo que el cliente de xonecode no puede hacerlo así.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// Y se calla SU aviso, no todos: node grita en cada arranque que la verificación está
// desactivada, y ese grito acaba en la salida del comando —o sea en el contexto del agente—
// invitándole a «arreglar» algo que es deliberado y está acotado a este proceso hijo.
process.removeAllListeners("warning");
process.on("warning", (aviso) => {
  if (!String(aviso.message).includes("NODE_TLS_REJECT_UNAUTHORIZED")) console.warn(aviso);
});

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const URL_POR_OMISION = "wss://127.0.0.1:8443/hotswap";
const TOPE_MS = Number(process.env.HOTSWAP_TOPE_MS ?? 40_000);
const ARTEFACTOS = process.env.XONECODE_ARTEFACTOS;
/** A partir de aquí se da por binario y no se imprime. */
const LARGO_DE_BINARIO = 2_000;

const comandos = [];
for (const arg of process.argv.slice(2)) {
  try {
    comandos.push(JSON.parse(arg));
  } catch {
    salir(`no es JSON válido: ${arg.slice(0, 80)}`);
  }
}
if (comandos.length === 0) salir("no me has dado ningún comando");

function salir(motivo) {
  console.error(`hotswap: ${motivo}`);
  process.exit(1);
}

/** Extensión por los primeros bytes en base64, sin adivinar por el nombre del comando. */
function extensionDe(base64) {
  if (base64.startsWith("/9j/")) return "jpg";
  if (base64.startsWith("iVBORw0KGgo")) return "png";
  if (base64.startsWith("UklGR")) return "webp";
  return "bin";
}

/**
 * Guarda lo binario y lo sustituye por lo que se puede decir de ello.
 *
 * Mira TODOS los campos de la respuesta, no solo `status`: el campo donde viene el binario
 * ha cambiado entre versiones, y un cliente que solo mire uno se calla justo cuando el
 * servidor cambia de sitio.
 */
function sinBinarios(respuesta) {
  const copia = { ...respuesta };
  for (const [clave, valor] of Object.entries(copia)) {
    if (typeof valor !== "string" || valor.length < LARGO_DE_BINARIO) continue;
    if (ARTEFACTOS === undefined) {
      copia[clave] = `<${valor.length} car. de binario; sin XONECODE_ARTEFACTOS no hay dónde guardarlo>`;
      continue;
    }
    const nombre = `captura-${Date.now()}.${extensionDe(valor)}`;
    const bytes = Buffer.from(valor, "base64");
    writeFileSync(join(ARTEFACTOS, nombre), bytes);
    copia[clave] = `<guardado como ${nombre}, ${bytes.length} bytes>`;
  }
  return copia;
}

const ws = new WebSocket(process.env.HOTSWAP_URL ?? URL_POR_OMISION);
let saludado = false;
let pendiente;
let reloj;

const rearmar = () => {
  clearTimeout(reloj);
  reloj = setTimeout(() => salir(`sin respuesta en ${TOPE_MS} ms`), TOPE_MS);
};

function siguiente() {
  const comando = comandos.shift();
  if (comando === undefined) {
    clearTimeout(reloj);
    ws.close();
    process.exit(0);
  }
  pendiente = comando;
  rearmar();
  ws.send(JSON.stringify(comando));
}

rearmar();
ws.onerror = (e) => salir(`no se pudo hablar con el aparato: ${e.message ?? e}`);
ws.onclose = (e) => {
  if (pendiente !== undefined || comandos.length > 0) {
    salir(`el canal se cerró antes de terminar (${e.code} ${e.reason || "sin motivo"})`);
  }
};
ws.onmessage = (ev) => {
  const texto = typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString();
  let mensaje;
  try {
    mensaje = JSON.parse(texto);
  } catch {
    console.error(`hotswap: mensaje que no es JSON: ${texto.slice(0, 200)}`);
    return;
  }
  // El servidor saluda primero y ese saludo no es la respuesta de nadie.
  if (!saludado && mensaje.command === "server_hello") {
    saludado = true;
    siguiente();
    return;
  }
  console.log(JSON.stringify({ comando: pendiente?.command, ...sinBinarios(mensaje) }));
  pendiente = undefined;
  siguiente();
};
