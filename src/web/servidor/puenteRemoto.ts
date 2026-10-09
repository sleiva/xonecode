/**
 * La sesión remota: cada MÓVIL conectado por el puente es un sumidero más del cable, enganchado
 * por la MISMA puerta que una pestaña SSE (`engancharCliente`/`soltarCliente`). Así recibe la
 * misma ráfaga al entrar, sigue a la consola en foco cuando se muda y cuenta como «hay alguien
 * delante» igual que una pestaña. Lo que sale pasa `filtrarSalida`; lo que entra,
 * `validarEntradaDelMovil`, y se despacha por las mismas funciones que `POST /accion`.
 */
import type { CanalRemoto, PuenteRemotoPort } from "../../core/ports.js";
import { ajustarATope, filtrarSalida, TOPE_DE_SALIDA_BYTES, validarEntradaDelMovil, type EntradaDelMovil } from "../../core/remoto.js";
import type { Sumidero } from "./transporte.js";

export type EstadoDeSesionRemota =
  | { estado: "apagada" }
  | { estado: "abriendo" }
  | { estado: "activa"; url: string; moviles: number }
  | { estado: "reconectando"; url: string; moviles: number }
  | { estado: "error"; motivo: string };

export interface OpcionesDeSesionRemota {
  /** `undefined` = el paquete no está instalado. Solo se llama al encender. */
  puerto: () => Promise<PuenteRemotoPort | undefined>;
  servidor: () => string;
  engancharCliente(sumidero: Sumidero): void;
  soltarCliente(sumidero: Sumidero): void;
  despachar(mensaje: EntradaDelMovil): void;
  informar(texto: string): void;
  alCambiar(estado: EstadoDeSesionRemota): void;
  /** Solo para los tests, que no quieren fabricar 700 kB: por omisión `TOPE_DE_SALIDA_BYTES`. */
  topeDeSalida?: number;
}

export interface SesionRemota {
  encender(): Promise<void>;
  revocar(): Promise<void>;
  apagar(): void;
  estado(): EstadoDeSesionRemota;
}

export const SIN_PAQUETE = "la sesión remota no está disponible en esta instalación";

export function crearSesionRemota(o: OpcionesDeSesionRemota): SesionRemota {
  let estado: EstadoDeSesionRemota = { estado: "apagada" };
  let canal: CanalRemoto | undefined;
  let url: string | undefined;
  let reconectando = false;
  const moviles = new Map<string, Sumidero>();

  const poner = (e: EstadoDeSesionRemota) => {
    estado = e;
    o.alCambiar(e);
  };
  const ponerActiva = () => {
    if (url !== undefined) poner({ estado: reconectando ? "reconectando" : "activa", url, moviles: moviles.size });
  };
  const soltarTodos = () => {
    for (const s of moviles.values()) o.soltarCliente(s);
    moviles.clear();
  };

  const apagar = () => {
    soltarTodos();
    canal?.cerrar();
    canal = undefined;
    url = undefined;
    reconectando = false;
    poner({ estado: "apagada" });
  };

  const encender = async () => {
    if (canal !== undefined) return;
    poner({ estado: "abriendo" });
    try {
      const puerto = await o.puerto();
      if (puerto === undefined) {
        poner({ estado: "error", motivo: SIN_PAQUETE });
        return;
      }
      canal = await puerto.abrir(o.servidor(), {
        alEstado: (e) => {
          if (e.estado === "abierta") {
            url = e.url;
            reconectando = false;
            ponerActiva();
          } else if (e.estado === "reconectando") {
            reconectando = true;
            ponerActiva();
          } else {
            soltarTodos();
            canal = undefined;
            url = undefined;
            poner(e.motivo === undefined ? { estado: "apagada" } : { estado: "error", motivo: e.motivo });
          }
        },
        alPresencia: (ids) => {
          for (const [id, s] of moviles) {
            if (!ids.includes(id)) {
              moviles.delete(id);
              o.soltarCliente(s);
            }
          }
          for (const id of ids) {
            if (moviles.has(id)) continue;
            const sumidero: Sumidero = (mensaje) => {
              const filtrado = filtrarSalida(mensaje);
              if (filtrado === undefined) return;
              // Pasarse del tope no da un error legible: el relé cierra la conexión. Se ajusta aquí.
              const salida = ajustarATope(filtrado, o.topeDeSalida ?? TOPE_DE_SALIDA_BYTES);
              if (salida === undefined) {
                o.informar(`sesión remota: un mensaje no cabe en el tope y no se envía (clase ${(filtrado as { clase: string }).clase})`);
                return;
              }
              void canal?.enviar(id, salida).catch(() => {});
            };
            moviles.set(id, sumidero);
            o.engancharCliente(sumidero);
          }
          ponerActiva();
        },
        alMensaje: (de, mensaje) => {
          if (!moviles.has(de)) return;
          const entrada = validarEntradaDelMovil(mensaje);
          if (entrada === undefined) {
            const clase = typeof mensaje === "object" && mensaje !== null ? String((mensaje as { clase?: unknown }).clase) : typeof mensaje;
            o.informar(`sesión remota: se rechazó un mensaje del móvil (clase ${clase})`);
            return;
          }
          o.despachar(entrada);
        },
      });
    } catch (error) {
      canal = undefined;
      poner({ estado: "error", motivo: error instanceof Error ? error.message : String(error) });
    }
  };

  return {
    encender,
    apagar,
    async revocar() {
      apagar();
      await encender();
    },
    estado: () => estado,
  };
}
