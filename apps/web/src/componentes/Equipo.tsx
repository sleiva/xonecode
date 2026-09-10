import { useEffect, useState } from "react";
import type { Dispositivo, Herramienta, InformeDeDispositivos } from "../tipos.js";
import { VerificarDispositivo } from "./VerificarDispositivo.js";
import estilos from "./Equipo.module.css";

/**
 * Tu equipo: el sistema, las herramientas de Android e iOS que tiene, y a qué dispositivos
 * y simuladores se llega. Es el panel del mockup que el escritorio NO pintaba hasta que
 * hubo dato detrás: ahora lo mide el servidor (`agent/dispositivosEnMaquina.ts`) y esto
 * solo lo enseña.
 *
 * Lo que se pinta y por qué:
 * - **Por nombre solo lo que está a mano**: lo conectado o arrancado, y lo que pide algo de
 *   ti (sin autorizar, offline). Los apagados se CUENTAN: esta máquina tiene 35 simuladores
 *   iOS y ninguno arrancado, y 35 filas iguales no dicen nada que «35 apagados» no diga.
 * - **Tres estados por herramienta, no dos**: «no instalada», «falló» con el motivo, y
 *   «no aplica» (iOS fuera de macOS). Decir «sin iOS» en un Linux afirmaría algo que la
 *   máquina no puede saber.
 * - **Es una foto con hora**, no un estado en vivo, y se vuelve a mirar con un botón. No hay
 *   sondeo: `adb devices` arranca el demonio de adb y `xcrun` tarda segundos — refrescar
 *   solo cada pocos segundos lanzaría procesos en el equipo del usuario sin que nadie lo
 *   pidiera. Y ese demonio se dice aquí: es un efecto de medir, también de la primera
 *   medida al conectar, no solo del botón.
 */
export function Equipo({
  informe,
  conectado,
  alActualizar,
  alVerificar,
}: {
  /** Ausente = todavía no ha llegado la primera medida. */
  informe?: InformeDeDispositivos;
  conectado: boolean;
  alActualizar?: () => void;
  /**
   * Habla con un dispositivo y espera respuesta. Ausente = esta ejecución no verifica y no
   * se pinta ningún botón — la foto sigue siendo lo único que se puede afirmar.
   */
  alVerificar?: (id: string) => void;
}) {
  // «Mirando…» desde que se pulsa hasta que llega una foto NUEVA (cambia `medido`). Sin
  // esto el botón se pulsaba y no pasaba nada visible durante los segundos de adb y xcrun.
  const [mirando, setMirando] = useState(false);
  const medido = informe?.medido;
  useEffect(() => setMirando(false), [medido]);
  useEffect(() => {
    if (!conectado) setMirando(false);
  }, [conectado]);

  const android = informe === undefined ? undefined : bloqueAndroid(informe);
  const ios = informe === undefined ? undefined : bloqueIos(informe);

  return (
    <section className={estilos.equipo} aria-label="tu equipo">
      <div className={estilos.cabecera}>
        <h2 className={estilos.titulo}>Tu equipo</h2>
        {informe === undefined ? null : <span className={estilos.sistema}>{NOMBRE_DEL_SISTEMA[informe.sistema]}</span>}
        {alActualizar === undefined ? null : (
          <button
            type="button"
            className={estilos.actualizar}
            disabled={!conectado || mirando || informe === undefined}
            onClick={() => {
              setMirando(true);
              alActualizar();
            }}
          >
            {mirando ? "Mirando…" : "Volver a mirar"}
          </button>
        )}
      </div>

      {informe === undefined ? (
        <p className={estilos.nota}>Consultando qué dispositivos y simuladores hay en este equipo…</p>
      ) : (
        <>
          <div className={estilos.bloques}>
            <Bloque
              titulo="Android"
              {...android!}
              conectado={conectado}
              medido={informe.medido}
              {...(alVerificar === undefined ? {} : { alVerificar })}
            />
            <Bloque
              titulo="iOS"
              {...ios!}
              conectado={conectado}
              medido={informe.medido}
              {...(alVerificar === undefined ? {} : { alVerificar })}
            />
          </div>
          <p className={estilos.nota}>
            Medido a las {horaDe(informe.medido)}.
            {informe.herramientas.some((h) => h.nombre === "adb" && h.estado === "ok")
              ? " Medir arranca el demonio de adb si no estaba corriendo, y esta medida ya lo hizo."
              : ""}
          </p>
        </>
      )}
    </section>
  );
}

const NOMBRE_DEL_SISTEMA: Record<InformeDeDispositivos["sistema"], string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
  otro: "sistema desconocido",
};

const ETIQUETA_DE_ESTADO: Record<Dispositivo["estado"], string> = {
  conectado: "conectado",
  arrancado: "arrancado",
  apagado: "apagado",
  "sin-autorizar": "sin autorizar",
  offline: "offline",
  "no-disponible": "no disponible",
};

const ETIQUETA_DE_CLASE: Record<Dispositivo["clase"], string> = {
  emulador: "emulador",
  simulador: "simulador",
  fisico: "dispositivo",
};

interface DatosDeBloque {
  /** Una frase que resume la plataforma cuando no hay nada que listar, o su problema. */
  resumen?: string;
  /** Los dispositivos que se listan por nombre. */
  filas: Dispositivo[];
  /** Lo que se cuenta en vez de listarse. */
  cuentas: string[];
  /** Fallos de herramienta, con su motivo. */
  fallos: string[];
}

function Bloque({
  titulo,
  resumen,
  filas,
  cuentas,
  fallos,
  conectado,
  medido,
  alVerificar,
}: DatosDeBloque & { titulo: string; conectado: boolean; medido: string; alVerificar?: (id: string) => void }) {
  return (
    <div className={estilos.bloque}>
      <h3 className={estilos.plataforma}>{titulo}</h3>
      {resumen === undefined ? null : <p className={estilos.resumen}>{resumen}</p>}
      {filas.length === 0 ? null : (
        <ul className={estilos.filas}>
          {filas.map((d) => (
            <li key={d.id} className={estilos.fila} data-estado={d.estado}>
              <span className={estilos.punto} aria-hidden="true" />
              <span className={estilos.nombre}>{d.nombre}</span>
              <span className={estilos.etiqueta}>
                {ETIQUETA_DE_CLASE[d.clase]} · {ETIQUETA_DE_ESTADO[d.estado]}
              </span>
              {d.detalle === undefined ? null : <span className={estilos.detalle}>{d.detalle}</span>}
              <VerificarDispositivo
                dispositivo={d}
                conectado={conectado}
                medidoDeLaFoto={medido}
                {...(alVerificar === undefined ? {} : { alVerificar })}
              />
            </li>
          ))}
        </ul>
      )}
      {cuentas.map((c) => (
        <p key={c} className={estilos.cuenta}>
          {c}
        </p>
      ))}
      {fallos.map((f) => (
        <p key={f} className={estilos.fallo}>
          {f}
        </p>
      ))}
    </div>
  );
}

/** Se listan los que están a mano y los que piden algo; los apagados se cuentan. */
function repartir(dispositivos: Dispositivo[]): { filas: Dispositivo[]; apagados: Dispositivo[] } {
  return {
    filas: dispositivos.filter((d) => d.estado !== "apagado"),
    apagados: dispositivos.filter((d) => d.estado === "apagado"),
  };
}

function herramienta(informe: InformeDeDispositivos, nombre: Herramienta["nombre"]): Herramienta | undefined {
  return informe.herramientas.find((h) => h.nombre === nombre);
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function bloqueAndroid(informe: InformeDeDispositivos): DatosDeBloque {
  const adb = herramienta(informe, "adb");
  const emulator = herramienta(informe, "emulator");
  const { filas } = repartir(informe.dispositivos.filter((d) => d.plataforma === "android"));
  const cuentas: string[] = [];
  const fallos: string[] = [];
  // Los dos destinos de Android apagados en Ajustes: no se ha mirado, que no es «no hay».
  if (adb?.estado === "desactivada" && emulator?.estado === "desactivada") {
    return { resumen: "Android no se mira: está desactivado en Ajustes.", filas: [], cuentas, fallos };
  }
  if (adb?.estado === "no-encontrada" && emulator?.estado === "no-encontrada") {
    return { resumen: "Sin SDK de Android: no hay adb ni emulator en el PATH ni en ANDROID_HOME.", filas: [], cuentas, fallos };
  }
  for (const h of [adb, emulator]) {
    if (h?.estado === "fallo") fallos.push(`${h.nombre} falló: ${h.detalle ?? "sin motivo"}`);
    if (h?.estado === "no-encontrada") cuentas.push(`${h.nombre} no está instalado.`);
    if (h?.estado === "desactivada") cuentas.push(`${h.nombre} no se ha mirado: desactivado en Ajustes.`);
  }
  if (adb?.estado === "ok" && filas.length === 0) cuentas.push("adb no ve ningún dispositivo ni emulador.");
  if (emulator?.estado === "ok") {
    cuentas.push(
      informe.avds.length === 0
        ? "Ningún AVD definido para el emulador."
        : `${plural(informe.avds.length, "AVD definido", "AVD definidos")}: ${informe.avds.join(", ")}.`
    );
  }
  return { filas, cuentas, fallos };
}

function bloqueIos(informe: InformeDeDispositivos): DatosDeBloque {
  const xcrun = herramienta(informe, "xcrun");
  const devicectl = herramienta(informe, "devicectl");
  const cuentas: string[] = [];
  const fallos: string[] = [];
  if (xcrun?.estado === "desactivada" && devicectl?.estado === "desactivada") {
    return { resumen: "iOS no se mira: está desactivado en Ajustes.", filas: [], cuentas, fallos };
  }
  if (xcrun?.estado === "no-aplica") {
    return { resumen: "Los simuladores y dispositivos iOS solo se detectan en macOS.", filas: [], cuentas, fallos };
  }
  if (xcrun?.estado === "no-encontrada") {
    return { resumen: `Sin herramientas de desarrollo de Xcode${xcrun.detalle === undefined ? "" : ` (${xcrun.detalle})`}.`, filas: [], cuentas, fallos };
  }
  const { filas, apagados } = repartir(informe.dispositivos.filter((d) => d.plataforma === "ios"));
  if (xcrun?.estado === "fallo") fallos.push(`simctl falló: ${xcrun.detalle ?? "sin motivo"}`);
  if (devicectl?.estado === "fallo") fallos.push(`devicectl falló: ${devicectl.detalle ?? "sin motivo"}`);
  if (xcrun?.estado === "desactivada") cuentas.push("Los simuladores no se miran: desactivados en Ajustes.");
  if (devicectl?.estado === "desactivada") cuentas.push("Los iPhone y iPad no se miran: desactivados en Ajustes.");
  if (xcrun?.estado === "ok") {
    const arrancados = filas.filter((d) => d.clase === "simulador").length;
    if (apagados.length > 0) {
      cuentas.push(
        arrancados === 0
          ? `${plural(apagados.length, "simulador disponible", "simuladores disponibles")}, ninguno arrancado.`
          : `${plural(apagados.length, "simulador más", "simuladores más")}, apagados.`
      );
    } else if (arrancados === 0) {
      cuentas.push("Ningún simulador iOS disponible.");
    }
  }
  if (devicectl?.estado === "ok" && !filas.some((d) => d.clase === "fisico")) cuentas.push("Ningún iPhone o iPad conectado.");
  return { filas, cuentas, fallos };
}

function horaDe(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
