import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { FORMA_DE_SALA, VERSION_DEL_PROTOCOLO, interpretarSobre } from "../index.js";
import { Salas, TOPES_POR_OMISION } from "./salas.js";
/** `dist/servidor/` y `src/servidor/` están a la misma profundidad de `web/`, que `npm run build` copia de la web. */
const CARPETA_WEB_DEL_PAQUETE = fileURLToPath(new URL("../../web/", import.meta.url));
/**
 * Un cubo de fichas por conexión: cabe un minuto de ritmo y se rellena a ese ritmo, sin ventanas
 * fijas que dejen pasar el doble a caballo del cambio de minuto. El tope lo da el papel de la
 * conexión en cada mensaje, así que al pasar a anfitrión se rellena a su ritmo.
 */
export function crearCubo(ahora, inicial) {
    let fichas = inicial;
    let desde = ahora();
    return {
        /** Gasta una ficha si la hay; `false` es que se ha pasado del ritmo. */
        gastar(porMinuto) {
            const t = ahora();
            fichas = Math.min(porMinuto, fichas + (Math.max(0, t - desde) * porMinuto) / 60_000);
            desde = t;
            if (fichas < 1)
                return false;
            fichas -= 1;
            return true;
        },
    };
}
export const PLAZO_PRIMER_MENSAJE_MS = 10_000;
const TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".json": "application/json",
};
async function servirEstatico(carpeta, peticion, respuesta) {
    const ruta = new URL(peticion.url ?? "/", "http://x").pathname;
    if (ruta === "/salud") {
        respuesta.writeHead(200, { "content-type": "text/plain" }).end("ok");
        return;
    }
    // Toda URL de sesión sirve la misma página: la sala la lee la web, el secreto está en el fragmento.
    const relativa = ruta === "/" || ruta.startsWith("/r/") ? "index.html" : normalize(ruta).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
    try {
        const cuerpo = await readFile(join(carpeta, relativa));
        respuesta.writeHead(200, {
            "content-type": TIPOS[extname(relativa)] ?? "application/octet-stream",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            ...(relativa === "index.html" ? { "cache-control": "no-store" } : {}),
        });
        respuesta.end(cuerpo);
    }
    catch {
        respuesta.writeHead(404).end();
    }
}
export async function arrancarServidor(opciones) {
    const topes = opciones.topes ?? TOPES_POR_OMISION;
    const ahora = opciones.ahora ?? Date.now;
    const salas = new Salas(topes, ahora);
    const carpetaWeb = opciones.carpetaWeb ?? CARPETA_WEB_DEL_PAQUETE;
    const http = createServer((peticion, respuesta) => void servirEstatico(carpetaWeb, peticion, respuesta));
    const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: topes.bytesPorMensaje });
    const vivos = new WeakMap();
    const barrido = setInterval(() => {
        salas.barrer();
        for (const c of wss.clients) {
            if (vivos.get(c) === false)
                c.terminate();
            else {
                vivos.set(c, false);
                c.ping();
            }
        }
    }, opciones.latidoMs ?? 10_000);
    barrido.unref();
    wss.on("connection", (ws) => {
        let papel;
        let cerrando = false;
        const cortar = () => {
            cerrando = true;
            ws.close();
        };
        const enviar = (s) => {
            if (ws.readyState === ws.OPEN)
                ws.send(JSON.stringify(s));
            // `cerrada` es lo último que oye un móvil: su sala ya no existe, y un socket que sigue abierto es un zombi.
            if (s.t === "cerrada")
                cortar();
        };
        vivos.set(ws, true);
        ws.on("pong", () => vivos.set(ws, true));
        const plazo = setTimeout(() => {
            if (papel === undefined)
                ws.terminate();
        }, opciones.plazoPrimerMensajeMs ?? PLAZO_PRIMER_MENSAJE_MS);
        plazo.unref();
        // Hasta su primer mensaje nadie sabe qué es: va con el tope del móvil, el más estrecho.
        const cubo = crearCubo(ahora, topes.mensajesPorMinuto);
        ws.on("message", (datos) => {
            if (cerrando || ws.readyState !== ws.OPEN)
                return;
            if (!cubo.gastar(papel?.tipo === "anfitrion" ? topes.mensajesPorMinutoAnfitrion : topes.mensajesPorMinuto)) {
                enviar({ t: "error", motivo: "ritmo" });
                cortar();
                return;
            }
            const texto = String(datos);
            if (papel === undefined) {
                const comoAnfitrion = interpretarSobre(texto, "anfitrion");
                const comoMovil = interpretarSobre(texto, "movil");
                const inicio = comoAnfitrion?.t === "abrir" ? comoAnfitrion : comoMovil?.t === "entrar" ? comoMovil : undefined;
                if (inicio === undefined) {
                    enviar({ t: "error", motivo: "mensaje-ilegible" });
                    return;
                }
                if (inicio.v !== VERSION_DEL_PROTOCOLO) {
                    enviar({ t: "error", motivo: "version" });
                    cortar();
                    return;
                }
                if (!FORMA_DE_SALA.test(inicio.sala)) {
                    enviar({ t: "error", motivo: "mensaje-ilegible" });
                    cortar();
                    return;
                }
                if (inicio.t === "abrir") {
                    if (salas.abrir(inicio.sala, enviar))
                        papel = { tipo: "anfitrion", sala: inicio.sala };
                    else
                        cortar();
                }
                else {
                    const id = salas.entrar(inicio.sala, enviar);
                    if (id !== undefined)
                        papel = { tipo: "movil", sala: inicio.sala, id };
                    else
                        cortar();
                }
                return;
            }
            if (papel.tipo === "anfitrion") {
                const s = interpretarSobre(texto, "anfitrion");
                if (s?.t === "dato")
                    salas.datoDelAnfitrion(papel.sala, s.para, s.carga);
                else if (s?.t === "cerrar") {
                    salas.cerrar(papel.sala, enviar);
                    papel = undefined;
                    cortar();
                }
                else
                    enviar({ t: "error", motivo: "mensaje-ilegible" });
                return;
            }
            const s = interpretarSobre(texto, "movil");
            if (s?.t === "dato")
                salas.datoDelMovil(papel.sala, papel.id, s.carga);
            else
                enviar({ t: "error", motivo: "mensaje-ilegible" });
        });
        // Un mensaje mayor que el tope emite `error` en el socket del servidor; sin oyente tumbaría el proceso.
        // `ws` ya ha empezado el cierre con su código (1009 para el tamaño, `TOPE_DE_SOBRE`): terminar aquí
        // cortaría el TCP antes de mandar ese marco y el cliente vería un 1006 sin motivo. Solo se termina
        // lo que siga abierto; el cierre en curso lo remata el propio plazo de `ws`.
        ws.on("error", () => {
            cerrando = true;
            if (ws.readyState === ws.OPEN)
                ws.terminate();
        });
        ws.on("close", () => {
            clearTimeout(plazo);
            if (papel?.tipo === "anfitrion")
                salas.anfitrionCaido(papel.sala, enviar);
            if (papel?.tipo === "movil")
                salas.salir(papel.sala, papel.id);
        });
    });
    await new Promise((resolver) => http.listen(opciones.puerto, opciones.host ?? "127.0.0.1", resolver));
    const direccion = http.address();
    const puerto = typeof direccion === "object" && direccion !== null ? direccion.port : opciones.puerto;
    return {
        urlHttp: `http://127.0.0.1:${puerto}`,
        urlWs: `ws://127.0.0.1:${puerto}/ws`,
        cerrar: async () => {
            clearInterval(barrido);
            for (const c of wss.clients)
                c.terminate();
            await new Promise((r) => wss.close(() => r()));
            await new Promise((r) => http.close(() => r()));
        },
    };
}
