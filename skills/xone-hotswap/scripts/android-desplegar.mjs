#!/usr/bin/env node
/**
 * Poner ESTE proyecto en un Android y dejar la app arrancada. La plantilla completa.
 *
 * POR QUÉ EXISTE. «Lanza la app» no es un comando del protocolo hotswap: es una cadena de
 * cinco pasos, y cuatro de ellos no viajan por el canal (el túnel, el ZIP, la subida HTTP y
 * el reinicio). El canal solo hace el quinto. Esta plantilla es esa cadena, en el orden en el
 * que se midió que funciona.
 *
 * USO (desde la raíz del proyecto, que es el `cwd` de tus comandos):
 *   node "$XONECODE_SKILL_XONE_HOTSWAP/scripts/android-desplegar.mjs"
 *   node "$XONECODE_SKILL_XONE_HOTSWAP/scripts/android-desplegar.mjs" --app MiApp --serie emulator-5554
 *
 * EL ORDEN, Y POR QUÉ ES ESE:
 *  1. **El túnel primero.** Sin `adb forward`, `127.0.0.1:8443` no lleva a ninguna parte: el
 *     servidor escucha en el localhost del APARATO. No se quita al terminar — hay que
 *     reaplicarlo tras cada reconexión, así que quitarlo dejaría el siguiente intento hablando
 *     con nadie.
 *  2. **El ZIP**, sin `.xonecode` ni `.git`. No es higiene: el `checkpoint.sqlite` de un
 *     proyecto real pesaba 122 MB él solo, contra 6,7 MB el proyecto entero.
 *  3. **La subida.** Subir NO aplica: el proceso tiene cargado en memoria lo de antes.
 *  4. **El reinicio**, que es lo único que aplica lo subido. Y es `SetupActivity`, **nunca**
 *     `.mainEntry`: medido, `.mainEntry` no levanta el servidor hotswap.
 *  5. **El lanzamiento**, y LUEGO la comprobación: `{"result":true}` de `launchApplication`
 *     significa «aceptado», no «arrancó». Lo que dice si está viva es el árbol de controles,
 *     que tarda unos segundos en contestar algo.
 *
 * LA TRAMPA QUE CUESTA UNA SESIÓN: **sin `bd/gestion.db` la app no arranca** y el verificador
 * estático dice VERDE igual. El `app.xml` declara `<connection connstring="bd/gestion.db"/>` y
 * esa base se genera FUERA (XOne Studio o `xone-db-tools create-db`). Si la app muere con
 * «Error opening database», mira eso antes que nada.
 *
 * LO QUE NECESITA: `adb` y `zip` en el PATH. En Windows no hay `zip`; ahí esta plantilla no
 * sirve tal cual y hay que decirlo en vez de fingir que sí.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// Y se calla SU aviso, no todos: node grita en cada arranque que la verificación está
// desactivada, y ese grito acaba en la salida del comando —o sea en el contexto del agente—
// invitándole a «arreglar» algo que es deliberado y está acotado a este proceso hijo.
process.removeAllListeners("warning");
process.on("warning", (aviso) => {
  if (!String(aviso.message).includes("NODE_TLS_REJECT_UNAUTHORIZED")) console.warn(aviso);
});

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PAQUETE = "com.xone.android.framework";
const ACTIVIDAD = `${PAQUETE}/com.xone.android.hotswap.activities.SetupActivity`;
const PUERTO = 8443;

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const serie = opcion("serie");
const adb = (...partes) =>
  execFileSync("adb", [...(serie ? ["-s", serie] : []), ...partes], { encoding: "utf8" });

/** El nombre de la app: el del `app.xml`, salvo que se diga otro. */
function nombreDeLaApp() {
  const dicho = opcion("app");
  if (dicho !== undefined) return dicho;
  const xml = readFileSync("app.xml", "utf8");
  const m = /<app\b[^>]*\bname\s*=\s*"([^"]+)"/i.exec(xml);
  if (m === null) {
    console.error("no encuentro el nombre en app.xml; pásalo con --app");
    process.exit(1);
  }
  return m[1];
}

const app = nombreDeLaApp();
const zip = join(tmpdir(), `xone-${process.pid}.zip`);

try {
  console.log(`1/5 túnel: ${PUERTO}`);
  adb("forward", `tcp:${PUERTO}`, `tcp:${PUERTO}`);

  console.log("2/5 empaquetando el proyecto (sin .xonecode ni .git)");
  execFileSync("zip", ["-r", "-q", zip, ".", "-x", ".xonecode/*", ".git/*"], { stdio: "inherit" });

  console.log(`3/5 subiendo a ${app}`);
  const cuerpo = readFileSync(zip);
  const url = `https://127.0.0.1:${PUERTO}/file_upload?file=debug_app_update.zip&appName=${encodeURIComponent(app)}`;
  const respuesta = await fetch(url, {
    method: "POST",
    body: cuerpo,
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String(cuerpo.length) },
  });
  if (!respuesta.ok) {
    console.error(`la subida falló con ${respuesta.status}`);
    process.exit(1);
  }

  console.log("4/5 reiniciando el framework");
  adb("shell", "am", "force-stop", PAQUETE);
  adb("shell", "am", "start", "-n", ACTIVIDAD);

  console.log("5/5 esperando al canal, lanzando y comprobando que está VIVA");
  const cliente = join(import.meta.dirname, "hotswap.mjs");
  const mandar = (comando) =>
    execFileSync("node", [cliente, JSON.stringify(comando)], { encoding: "utf8" }).trim();
  const esperar = (segundos) => execFileSync("sleep", [String(segundos)]);

  /**
   * **El canal no está en pie justo después del reinicio**, y esto se descubrió corriéndolo:
   * el `am start` vuelve en cuanto Android acepta el intent, no cuando el servidor escucha,
   * así que el primer intento moría con «Received network error or non-101 status code».
   * Se espera a que CONTESTE, que es la condición de verdad, en vez de dormir un rato fijo.
   */
  let listo = false;
  for (let intento = 1; intento <= 15 && !listo; intento++) {
    try {
      mandar({ command: "launchApplication", appName: app });
      listo = true;
    } catch {
      esperar(1);
    }
  }
  if (!listo) {
    console.error(`el servidor hotswap no levantó tras el reinicio. Comprueba que ${PAQUETE} está instalado`);
    console.error("y que el puerto es el 8443 (si estaba ocupado, el framework coge el siguiente libre).");
    process.exit(1);
  }

  // El árbol es la comprobación: `result:true` solo dice que el encargo se aceptó. Se
  // reintenta porque la app tarda unos segundos en tener pantalla, y se espera a una
  // CONDICIÓN y no a un número fijo de segundos.
  for (let intento = 1; intento <= 10; intento++) {
    const salida = mandar({ command: "getAllElements", format: "xone" });
    if (!salida.includes("App is not running")) {
      console.log(salida);
      process.exit(0);
    }
    esperar(2);
  }
  console.error("la app no llegó a contestar el árbol de controles: NO está viva.");
  console.error("Lo primero que hay que mirar es si existe bd/gestion.db (la genera XOne Studio, no esto).");
  process.exit(1);
} finally {
  rmSync(zip, { force: true });
}
