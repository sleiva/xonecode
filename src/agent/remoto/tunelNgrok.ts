/**
 * El túnel REAL de la vía «ngrok» de la sesión remota: arranca el puente del paquete en un puerto libre de loopback y abre
 * el túnel con el SDK de ngrok (`@ngrok/ngrok`, que viene con xonecode) hacia él. Entra en el servidor por opción (un
 * `TunelPort`), como el puente: ni `core/` ni `web/` importan este fichero.
 *
 * Reglas, todas por lo mismo —nada de la máquina cruza el cable—:
 * - **Un fallo es un texto de `MOTIVOS_DEL_TUNEL`**, clasificado por el CÓDIGO `ERR_NGROK_xxx` que el SDK pone en el error
 *   (`errorCode`). El mensaje del error se queda aquí: puede llevar el correo de la cuenta o el token.
 * - **El túnel vive dentro de este proceso**: no hay programa `ngrok` que lanzar, ni log que leer, ni grupo que matar, y
 *   muere con el proceso —se acabó el ngrok huérfano tras un cierre en seco que había con el programa—.
 * - **Una pérdida de conexión no es una caída todavía**: el SDK reconecta solo (`onStatusChange`: `closed` y luego
 *   `connected`). Solo si no ha vuelto en `ESPERA_DE_RECONEXION_MS` se da el túnel por caído y se avisa.
 * - **Cerrar: el túnel PRIMERO y luego el puente**, para que el móvil no vea un puente vivo detrás de un túnel ya muerto ni
 *   al revés un túnel que apunta a nada.
 */
import type { TunelAbierto, TunelPort } from "../../core/ports.js";
import { MOTIVOS_DEL_TUNEL, motivoDeDominioInaceptable, motivoDeSalidaDeNgrok, servidorDeTunel } from "../../core/tunel.js";
import { authtokenDeNgrok, cargarSdkReal, type SdkDeNgrok } from "./ngrokEnMaquina.js";
import { cargarServidorRemoto, type ModuloServidorRemoto } from "./puenteWebSocket.js";

/** Lo que se espera a que ngrok dé la dirección pública. */
export const TOPE_DE_TUNEL_MS = 30_000;
/** Lo que se espera a que el SDK reconecte tras perder la conexión, antes de dar el túnel por caído. */
export const ESPERA_DE_RECONEXION_MS = 30_000;

export interface DependenciasDelTunel {
  cargarServidor?: () => Promise<ModuloServidorRemoto | undefined>;
  cargarSdk?: () => Promise<SdkDeNgrok | undefined>;
  /** El authtoken que se usará, o `undefined` si no hay cuenta. */
  authtoken?: () => string | undefined;
  topeMs?: number;
  esperaDeReconexionMs?: number;
}

class FalloDelTunel extends Error {}

/** El motivo de un error del SDK, por su CÓDIGO y nunca por su texto. */
function motivoDeErrorDelSdk(error: unknown): string {
  const codigo = (error as { errorCode?: unknown } | undefined)?.errorCode;
  return MOTIVOS_DEL_TUNEL[motivoDeSalidaDeNgrok(typeof codigo === "string" ? [codigo] : [])];
}

export function crearTunelNgrok(deps: DependenciasDelTunel = {}): TunelPort {
  const cargarServidor = deps.cargarServidor ?? (() => cargarServidorRemoto());
  const cargarSdk = deps.cargarSdk ?? cargarSdkReal;
  const authtoken = deps.authtoken ?? (() => authtokenDeNgrok());
  const topeMs = deps.topeMs ?? TOPE_DE_TUNEL_MS;
  const esperaDeReconexionMs = deps.esperaDeReconexionMs ?? ESPERA_DE_RECONEXION_MS;

  return {
    async abrir({ dominio }): Promise<TunelAbierto> {
      if (dominio !== undefined && motivoDeDominioInaceptable(dominio) !== undefined) {
        throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.dominio);
      }
      const sdk = await cargarSdk();
      if (sdk === undefined) throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.noInstalado);
      const token = authtoken();
      if (token === undefined) throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.autenticacion);
      const modulo = await cargarServidor();
      if (modulo === undefined) throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.paqueteViejo);

      let puente: Awaited<ReturnType<ModuloServidorRemoto["arrancarServidor"]>>;
      try {
        puente = await modulo.arrancarServidor({ puerto: 0 });
      } catch {
        throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.puente);
      }
      let puenteCerrado: Promise<void> | undefined;
      const cerrarPuente = (): Promise<void> => (puenteCerrado ??= puente.cerrar().catch(() => {}));

      // `host:puerto` tal como escucha el puente (127.0.0.1), y no «localhost», que puede resolver a ::1 y dejar a ngrok
      // sin nadie al otro lado.
      const destino = new URL(puente.urlHttp).host;

      let cerrando = false;
      let caida: Promise<string> | undefined;
      const caidas: ((motivo: string) => void)[] = [];
      let reconexion: ReturnType<typeof setTimeout> | undefined;
      let tunel: { url(): string | null; close(): Promise<void> } | undefined;
      let tunelCerrado: Promise<void> | undefined;
      const cerrarTunel = (): Promise<void> => (tunelCerrado ??= (tunel?.close() ?? Promise.resolve()).catch(() => {}));
      /** Un oyente que lanza no tumba la consola ni deja sin aviso a los demás. */
      const avisar = (f: (motivo: string) => void, motivo: string) => {
        if (cerrando) return;
        try {
          f(motivo);
        } catch {
          // es de quien escucha
        }
      };
      const darPorCaido = (): void => {
        if (cerrando || caida !== undefined) return;
        caida = cerrarTunel()
          .then(() => cerrarPuente())
          .then(() => MOTIVOS_DEL_TUNEL.seCerro);
        void caida.then((m) => {
          for (const f of caidas.splice(0)) avisar(f, m);
        });
      };
      const alCambiarEstado = (estado: string): void => {
        if (estado === "closed") {
          if (reconexion === undefined && !cerrando) {
            reconexion = setTimeout(darPorCaido, esperaDeReconexionMs);
            reconexion.unref?.();
          }
        } else if (estado === "connected" && reconexion !== undefined) {
          clearTimeout(reconexion);
          reconexion = undefined;
        }
      };

      let tope: ReturnType<typeof setTimeout> | undefined;
      let agotado = false;
      try {
        const abierto = sdk.forward({
          addr: destino,
          authtoken: token,
          ...(dominio === undefined ? {} : { domain: dominio }),
          onStatusChange: alCambiarEstado,
        });
        // Si llega DESPUÉS del tope, se cierra: nadie lo va a usar.
        void abierto.then(
          (t) => {
            if (agotado) void t.close().catch(() => {});
          },
          () => {}
        );
        tunel = await Promise.race([
          abierto,
          new Promise<never>((_, rechazar) => {
            tope = setTimeout(() => {
              agotado = true;
              rechazar(new FalloDelTunel(MOTIVOS_DEL_TUNEL.sinDireccion));
            }, topeMs);
          }),
        ]);
      } catch (error) {
        cerrando = true;
        await cerrarPuente();
        throw error instanceof FalloDelTunel ? error : new FalloDelTunel(motivoDeErrorDelSdk(error));
      } finally {
        if (tope !== undefined) clearTimeout(tope);
      }

      let servidor: string;
      try {
        const publica = tunel.url();
        if (publica === null) throw new Error("sin dirección");
        servidor = servidorDeTunel(publica);
      } catch {
        cerrando = true;
        await cerrarTunel();
        await cerrarPuente();
        throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.sinDireccion);
      }

      let cerrado: Promise<void> | undefined;
      return {
        servidor,
        cerrar: () =>
          (cerrado ??= (async () => {
            cerrando = true;
            caidas.length = 0;
            if (reconexion !== undefined) clearTimeout(reconexion);
            await cerrarTunel();
            await cerrarPuente();
          })()),
        alCaer: (f) => {
          if (cerrando) return;
          if (caida !== undefined) {
            void caida.then((m) => avisar(f, m));
            return;
          }
          caidas.push(f);
        },
      };
    },
  };
}
