/**
 * El puente REAL de la sesión remota. Es el ÚNICO fichero que nombra `@xone/xonecode-remoto`,
 * y lo carga con `import()` dinámico de un nombre en variable: mientras sea experimental no es
 * dependencia de xonecode, así que una release sin él instala y arranca igual, y `npm test` no
 * lo necesita (usa `PuenteRemotoEnMemoria`).
 */
import type { CanalRemoto, EscuchasDelPuente, PuenteRemotoPort } from "../../core/ports.js";

export const NOMBRE_DEL_PAQUETE = "@xone/xonecode-remoto";

/** La parte del paquete que se usa aquí (su API real tiene más). */
export interface ModuloRemoto {
  VERSION_DEL_PROTOCOLO: number;
  generarCredenciales(): { sala: string; secreto: string };
  urlDeSesion(baseHttp: string, sala: string, secreto: string): string;
  baseHttpDe(servidorWs: string): string;
  crearCanal(o: { secreto: string; sala: string; rol: "anfitrion" }): Promise<{
    cifrar(m: unknown): Promise<string>;
    descifrar(carga: string): Promise<unknown>;
  }>;
}

/** `undefined` = el paquete no está instalado: quien llama lo dice, aquí no se propaga el error. */
export async function cargarModuloRemoto(importar: (nombre: string) => Promise<unknown> = (n) => import(n)): Promise<ModuloRemoto | undefined> {
  // En una VARIABLE `string`: un literal haría que tsc y los empaquetadores lo resolvieran.
  const nombre: string = NOMBRE_DEL_PAQUETE;
  try {
    return (await importar(nombre)) as ModuloRemoto;
  } catch {
    return undefined;
  }
}

/** Motivos del relé que acaban la sesión, con texto FIJO: lo que el relé diga no cruza el cable. */
const MOTIVOS: Record<string, string> = {
  version: "la versión del protocolo no casa: actualiza xonecode",
  "sala-ocupada": "esa sala ya tiene un anfitrión",
  ritmo: "el puente cortó la conexión por exceso de mensajes",
  "mensaje-ilegible": "el puente no entendió un mensaje",
};
const MOTIVO_DE_TAMANO = "un mensaje superó el tamaño máximo del puente";
/** Código de cierre WebSocket de «mensaje demasiado grande»: el relé cierra así, sin `error`. */
const CIERRE_MENSAJE_GRANDE = 1009;

export function crearPuenteWebSocket(
  modulo: ModuloRemoto,
  opciones: { esperasMs?: readonly number[] } = {}
): PuenteRemotoPort {
  const esperas = opciones.esperasMs ?? [1_000, 2_000, 5_000, 10_000, 30_000];
  return {
    async abrir(servidor: string, escuchas: EscuchasDelPuente): Promise<CanalRemoto> {
      const { sala, secreto } = modulo.generarCredenciales();
      // UN canal cifrado por encendido, conservado en las reconexiones: uno nuevo al reconectar
      // dejaría al relé repetir mensajes viejos del móvil.
      const canal = await modulo.crearCanal({ secreto, sala, rol: "anfitrion" });
      const url = modulo.urlDeSesion(modulo.baseHttpDe(servidor), sala, secreto);
      let ws: WebSocket | undefined;
      let cerrado = false;
      let intento = 0;
      let cola: Promise<void> = Promise.resolve();
      /**
       * Lo que SALE, también en cola: el canal toma la secuencia al llamar a `cifrar` y el móvil
       * descarta toda secuencia que no supere la última, así que cifrar en paralelo y mandar al
       * terminar perdía un mensaje (una `reemision` o una `aprobacion` grandes, adelantadas por
       * uno pequeño). Cifrar Y mandar van en el orden de llamada; un paso que falla no bloquea.
       */
      let envios: Promise<void> = Promise.resolve();
      let temporizador: ReturnType<typeof setTimeout> | undefined;

      const acabar = (motivo: string) => {
        cerrado = true;
        escuchas.alEstado({ estado: "cerrada", motivo });
      };

      const conectar = () => {
        const socket = new WebSocket(servidor);
        ws = socket;
        socket.onopen = () => {
          intento = 0;
          socket.send(JSON.stringify({ t: "abrir", sala, v: modulo.VERSION_DEL_PROTOCOLO }));
        };
        const procesar = async (ev: MessageEvent) => {
          if (cerrado || ws !== socket) return;
          let s: Record<string, unknown>;
          try {
            s = JSON.parse(String(ev.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (s.t === "abierta") escuchas.alEstado({ estado: "abierta", url });
          else if (s.t === "presencia" && Array.isArray(s.moviles)) escuchas.alPresencia(s.moviles.filter((x): x is string => typeof x === "string"));
          else if (s.t === "dato" && typeof s.de === "string" && typeof s.carga === "string") {
            let claro: unknown;
            try {
              claro = await canal.descifrar(s.carga);
            } catch {
              return; // lo que no descifra no es del móvil: se descarta
            }
            if (claro !== undefined && !cerrado) escuchas.alMensaje(s.de, claro);
          } else if (s.t === "error" && typeof s.motivo === "string" && s.motivo in MOTIVOS) {
            acabar(MOTIVOS[s.motivo]!);
            socket.close();
          }
        };
        // En orden de llegada: el canal real descarta lo que no supera la última secuencia vista,
        // y descifrar en paralelo desordenaría los mensajes legítimos del móvil.
        socket.onmessage = (ev) => {
          cola = cola.then(() => procesar(ev)).catch(() => {});
        };
        socket.onclose = (ev) => {
          if (cerrado || ws !== socket) return;
          if (ev.code === CIERRE_MENSAJE_GRANDE) {
            acabar(MOTIVO_DE_TAMANO);
            return;
          }
          escuchas.alEstado({ estado: "reconectando" });
          const espera = esperas[Math.min(intento, esperas.length - 1)]!;
          intento += 1;
          temporizador = setTimeout(() => {
            if (!cerrado) conectar();
          }, espera);
        };
        // Un fallo de conexión llega también como `close`: aquí solo se evita que `error` sobre.
        socket.onerror = () => {};
      };
      conectar();

      return {
        enviar(para, mensaje) {
          const paso = envios.then(async () => {
            const socket = ws;
            if (cerrado || socket?.readyState !== WebSocket.OPEN) return;
            const carga = await canal.cifrar(mensaje);
            if (cerrado || socket.readyState !== WebSocket.OPEN) return;
            socket.send(JSON.stringify(para === undefined ? { t: "dato", carga } : { t: "dato", para, carga }));
          });
          envios = paso.catch(() => {});
          return paso;
        },
        cerrar() {
          cerrado = true;
          if (temporizador !== undefined) clearTimeout(temporizador);
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "cerrar" }));
          ws?.close();
        },
      };
    },
  };
}
