/**
 * El túnel REAL de la vía «ngrok» de la sesión remota: arranca el puente del paquete en un
 * puerto libre de loopback, lanza `ngrok http` contra él con log JSON, y lee del log la
 * dirección pública. Entra en el servidor por opción (un `TunelPort`), como el puente: ni
 * `core/` ni `web/` importan este fichero.
 *
 * Reglas, todas por lo mismo —nada de la máquina cruza el cable—:
 * - **Un fallo es un texto de `MOTIVOS_DEL_TUNEL`**, clasificado por el CÓDIGO `ERR_NGROK_xxx`
 *   de las líneas vistas (`motivoDeSalidaDeNgrok`). Lo que ngrok escribe se queda aquí: lleva la
 *   ruta de su configuración, el correo de la cuenta y, en un error de autenticación, el token.
 * - **ngrok va `detached` y se mata el GRUPO** (`matarGrupoReal`), con `SIGTERM`, una espera, y
 *   `SIGKILL` si no salió; y también en el `exit` de este proceso (medido: con SIGINT y SIGTERM
 *   bajo `tsx` no queda ngrok; con un SIGKILL a este proceso, que no deja correr nada, sí queda
 *   huérfano). El cierre ordenado de la consola tiene que llamar a `cerrar()`. Su stdout y su
 *   stderr se consumen siempre: una tubería llena lo bloquearía.
 * - **Cerrar: ngrok PRIMERO y luego el puente**, para que el móvil no vea un puente vivo detrás
 *   de un túnel ya muerto ni al revés un túnel que apunta a nada.
 */
import { StringDecoder } from "node:string_decoder";
import type { TunelAbierto, TunelPort } from "../../core/ports.js";
import { entornoDeShell } from "../../core/shellDeAgente.js";
import { MOTIVOS_DEL_TUNEL, motivoDeDominioInaceptable, motivoDeSalidaDeNgrok, servidorDeTunel, urlPublicaDeLinea } from "../../core/tunel.js";
import { lanzarReal, matarGrupoReal, type Lanzar, type ProcesoHijo } from "../dispositivos/procesosEnMaquina.js";
import { localizarNgrok } from "./ngrokEnMaquina.js";
import { cargarServidorRemoto, type ModuloServidorRemoto } from "./puenteWebSocket.js";

/** Lo que se espera a que ngrok anuncie su dirección pública. */
export const TOPE_DE_TUNEL_MS = 30_000;
/** Lo que se espera a que ngrok salga tras `SIGTERM` antes del `SIGKILL`. */
export const ESPERA_AL_MATAR_MS = 3_000;
/**
 * Las ÚLTIMAS líneas que se guardan para clasificar un fallo (el `ERR_NGROK_xxx` llega al final);
 * después de la dirección, ninguna.
 */
const LINEAS_QUE_SE_GUARDAN = 200;

export interface DependenciasDelTunel {
  cargarServidor?: () => Promise<ModuloServidorRemoto | undefined>;
  /** El binario de ngrok, o `undefined` si no está. */
  localizar?: () => string | undefined;
  lanzar?: Lanzar;
  matarGrupo?: (pid: number, senal: string) => void;
  entorno?: Record<string, string | undefined>;
  topeMs?: number;
  esperaAlMatarMs?: number;
  /** Engancha un aviso de «este proceso sale» y devuelve cómo soltarlo. */
  alSalirDelProceso?: (f: () => void) => () => void;
}

const alSalirReal = (f: () => void): (() => void) => {
  process.once("exit", f);
  return () => process.removeListener("exit", f);
};

class FalloDelTunel extends Error {}

/**
 * Parte en líneas lo que llega por un flujo, guardando el trozo sin salto para el siguiente. Con
 * un `StringDecoder`: un carácter de varios bytes partido entre dos trozos no se rompe.
 */
function porLineas(alLinea: (linea: string) => void): (dato: unknown) => void {
  let resto = "";
  const decodificador = new StringDecoder("utf8");
  return (dato) => {
    resto += typeof dato === "string" ? dato : Buffer.isBuffer(dato) ? decodificador.write(dato) : String(dato);
    const partes = resto.split(/\r?\n/);
    resto = partes.pop() ?? "";
    for (const p of partes) if (p !== "") alLinea(p);
  };
}

export function crearTunelNgrok(deps: DependenciasDelTunel = {}): TunelPort {
  const entorno = deps.entorno ?? process.env;
  const cargarServidor = deps.cargarServidor ?? (() => cargarServidorRemoto());
  const localizar = deps.localizar ?? (() => localizarNgrok({ entorno }));
  const lanzar = deps.lanzar ?? lanzarReal;
  const matarGrupo = deps.matarGrupo ?? ((pid: number, senal: string) => matarGrupoReal(pid, senal));
  const topeMs = deps.topeMs ?? TOPE_DE_TUNEL_MS;
  const esperaAlMatarMs = deps.esperaAlMatarMs ?? ESPERA_AL_MATAR_MS;
  const alSalirDelProceso = deps.alSalirDelProceso ?? alSalirReal;

  return {
    async abrir({ dominio }): Promise<TunelAbierto> {
      if (dominio !== undefined && motivoDeDominioInaceptable(dominio) !== undefined) {
        throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.dominio);
      }
      const binario = localizar();
      if (binario === undefined) throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.noInstalado);
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

      // `host:puerto` tal como escucha el puente (127.0.0.1), y no «localhost», que puede
      // resolver a ::1 y dejar a ngrok sin nadie al otro lado.
      const destino = new URL(puente.urlHttp).host;
      const args = ["http", destino, ...(dominio === undefined ? [] : ["--url", dominio]), "--log", "stdout", "--log-format", "json"];

      let hijo: ProcesoHijo;
      try {
        // Sin las claves de los proveedores, con la MISMA regla que la shell del agente: ngrok no
        // las necesita, y `guardarCredencial` las escribe en `process.env`. `NGROK_*`, `PATH` y
        // `HOME` siguen (el authtoken puede venir de `NGROK_AUTHTOKEN`).
        hijo = lanzar(binario, args, { env: entornoDeShell({ entorno }) });
      } catch {
        await cerrarPuente();
        throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.noInstalado);
      }

      let vivo = true;
      let alTerminar!: () => void;
      const terminado = new Promise<void>((r) => (alTerminar = r));
      const soltarSalida = alSalirDelProceso(() => {
        if (vivo) senal("SIGKILL");
      });
      const senal = (s: string) => {
        const pid = hijo.pid;
        try {
          // Nunca con un pid que no sea de un hijo: `kill(-0)` mataría el grupo de quien llama.
          if (typeof pid === "number" && pid > 1) matarGrupo(pid, s);
          else hijo.kill(s);
        } catch {
          // ESRCH: ya no estaba.
        }
      };
      const esperar = (ms: number) =>
        Promise.race([terminado, new Promise<void>((r) => setTimeout(r, ms).unref?.())]);
      let matado: Promise<void> | undefined;
      const matar = (): Promise<void> =>
        (matado ??= (async () => {
          if (!vivo) return;
          senal("SIGTERM");
          await esperar(esperaAlMatarMs);
          if (vivo) {
            senal("SIGKILL");
            await esperar(esperaAlMatarMs);
          }
        })());

      const lineas: string[] = [];
      let guardar = true;
      let alUrl!: (url: string) => void;
      let alFallo!: (motivo: string) => void;
      const url = new Promise<string>((resolver, rechazar) => {
        alUrl = resolver;
        alFallo = (m) => rechazar(new FalloDelTunel(m));
      });
      const alLinea = (linea: string) => {
        if (!guardar) return;
        const publica = urlPublicaDeLinea(linea);
        if (publica !== undefined) {
          guardar = false;
          lineas.length = 0;
          alUrl(publica);
          return;
        }
        lineas.push(linea);
        if (lineas.length > LINEAS_QUE_SE_GUARDAN) lineas.shift();
      };
      hijo.stdout.on("data", porLineas(alLinea));
      hijo.stderr.on("data", porLineas(alLinea));

      /** Resuelve con el motivo cuando el puente YA está cerrado: se avisa después, nunca antes. */
      let caida: Promise<string> | undefined;
      const caidas: ((motivo: string) => void)[] = [];
      /** Un oyente que lanza no tumba la consola ni deja sin aviso a los demás. */
      const avisar = (f: (motivo: string) => void, motivo: string) => {
        if (cerrando) return;
        try {
          f(motivo);
        } catch {
          // es de quien escucha
        }
      };
      let cerrando = false;
      hijo.on("error", ((e: NodeJS.ErrnoException) => {
        alFallo(e?.code === "ENOENT" || e?.code === "EACCES" ? MOTIVOS_DEL_TUNEL.noInstalado : MOTIVOS_DEL_TUNEL.otro);
        // Un `spawn` que falla emite `error` y puede no emitir `close`.
        if (hijo.pid === undefined) {
          vivo = false;
          soltarSalida();
          alTerminar();
        }
      }) as (valor: never) => void);
      hijo.on("close", (() => {
        vivo = false;
        soltarSalida();
        alTerminar();
        if (guardar) {
          alFallo(MOTIVOS_DEL_TUNEL[motivoDeSalidaDeNgrok(lineas)]);
          return;
        }
        if (cerrando || caida !== undefined) return;
        const motivo = MOTIVOS_DEL_TUNEL.seCerro;
        caida = cerrarPuente().then(() => motivo);
        void caida.then((m) => {
          for (const f of caidas.splice(0)) avisar(f, m);
        });
      }) as (valor: never) => void);

      const tope = setTimeout(() => alFallo(MOTIVOS_DEL_TUNEL.sinDireccion), topeMs);
      let publica: string;
      try {
        publica = await url;
      } catch (e) {
        guardar = false;
        lineas.length = 0;
        cerrando = true;
        await matar();
        await cerrarPuente();
        throw e instanceof FalloDelTunel ? e : new FalloDelTunel(MOTIVOS_DEL_TUNEL.otro);
      } finally {
        clearTimeout(tope);
      }

      let servidor: string;
      try {
        servidor = servidorDeTunel(publica);
      } catch {
        cerrando = true;
        await matar();
        await cerrarPuente();
        throw new FalloDelTunel(MOTIVOS_DEL_TUNEL.otro);
      }

      let cerrado: Promise<void> | undefined;
      return {
        servidor,
        cerrar: () =>
          (cerrado ??= (async () => {
            cerrando = true;
            caidas.length = 0;
            await matar();
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
