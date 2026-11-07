import { useState } from "react";
import { dondeDe, lineasDeVerificacion, marcaDe } from "../lineasDeVerificacion.js";
import { formatearMs } from "../tiempo.js";
import type { Acto, HallazgoDelTurno } from "../tipos.js";
import estilos from "./PanelDeSalida.module.css";

/** Una línea de la pestaña Salida: de qué es y qué dice. */
export interface LineaDeSalida {
  origen: "tú" | "sistema" | "aviso" | "fase" | "tool" | "verificador" | "sync" | "fin";
  texto: string;
}

const TOPE_DE_TEXTO = 160;
const corto = (s: string): string => {
  const una = s.replace(/\s+/g, " ").trim();
  return una.length > TOPE_DE_TEXTO ? `${una.slice(0, TOPE_DE_TEXTO - 1)}…` : una;
};

/**
 * La SALIDA de la sesión: lo que pasó, en el orden en que pasó, una línea por suceso. Sale de los mismos actos que pinta
 * el chat —nada que el chat no tenga—, sin las respuestas del asistente (eso es la conversación, no la salida) ni el
 * razonamiento. La verificación, en su primera línea (el detalle está en Problemas).
 */
export function lineasDeSalida(actos: readonly Acto[]): LineaDeSalida[] {
  const lineas: LineaDeSalida[] = [];
  for (const a of actos) {
    if (a.tipo === "usuario") lineas.push({ origen: "tú", texto: corto(a.texto) });
    else if (a.tipo === "sistema") lineas.push({ origen: a.clase === "aviso" ? "aviso" : "sistema", texto: corto(a.texto) });
    else if (a.tipo === "fase") lineas.push({ origen: "fase", texto: `${a.texto} · ${formatearMs(a.ms)}` });
    else if (a.tipo === "herramientas") for (const l of a.lineas) lineas.push({ origen: "tool", texto: corto(l) });
    else if (a.tipo === "verificacion") lineas.push({ origen: "verificador", texto: lineasDeVerificacion(a)[0]!.trim() });
    else if (a.tipo === "sincronizacion")
      lineas.push({ origen: "sync", texto: a.error === undefined ? `${a.accion} · ${a.lineas.length} línea(s)` : `${a.accion} · ${a.error}` });
    else if (a.tipo === "fin") lineas.push({ origen: "fin", texto: `turno en ${formatearMs(a.ms)}${a.modelo === undefined ? "" : ` · ${a.modelo}`}` });
  }
  return lineas;
}

/** Los hallazgos de la ÚLTIMA verificación. `undefined` = ningún turno verificado (no es «cero problemas»). */
export function problemasDe(actos: readonly Acto[]): HallazgoDelTurno[] | undefined {
  for (let i = actos.length - 1; i >= 0; i--) {
    const a = actos[i]!;
    if (a.tipo === "verificacion") return a.hallazgos ?? [];
  }
  return undefined;
}

type Vista = "salida" | "problemas" | "ejecutar";

/**
 * El PANEL DE SALIDA del estilo «Consola dev», bajo la columna central como el de un IDE. Tres pestañas sobre datos que
 * la consola ya tiene: la salida de la sesión, los problemas de su última verificación y lo último lanzado al aparato.
 * Lo que no consta se dice con palabras, no con una lista vacía ni un cero.
 */
export function PanelDeSalida({
  actos,
  lanzamiento,
  recarga,
  alCerrar,
}: {
  actos: readonly Acto[];
  /** Lo último lanzado al aparato EN ESTE PROYECTO; ausente = nada que contar aquí. */
  lanzamiento?: { fase: string; estado: string; lineas: string[]; ms: number; motivo?: string };
  recarga?: { ruta: string; estado: string; texto: string };
  alCerrar: () => void;
}) {
  const [vista, setVista] = useState<Vista>("salida");
  const salida = lineasDeSalida(actos);
  const problemas = problemasDe(actos);
  const pestanas: { id: Vista; nombre: string; cuenta?: number }[] = [
    { id: "salida", nombre: "Salida" },
    { id: "problemas", nombre: "Problemas", ...(problemas === undefined ? {} : { cuenta: problemas.length }) },
    { id: "ejecutar", nombre: "Ejecutar" },
  ];
  return (
    <section className={estilos.panel} aria-label="Panel de salida">
      <div className={estilos.cabecera} role="tablist" aria-label="Panel de salida">
        {pestanas.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={vista === p.id} className={estilos.pestana} onClick={() => setVista(p.id)}>
            {p.nombre}
            {p.cuenta === undefined ? null : <span className={estilos.cuenta}>{p.cuenta}</span>}
          </button>
        ))}
        <span className={estilos.hueco} />
        <button type="button" className={estilos.cerrar} aria-label="Cerrar el panel de salida" onClick={alCerrar}>
          ×
        </button>
      </div>
      <div className={estilos.cuerpo} role="tabpanel">
        {vista === "salida" ? (
          salida.length === 0 ? (
            <p className={estilos.vacio}>Esta sesión todavía no tiene turnos.</p>
          ) : (
            <ol className={estilos.lista}>
              {salida.map((l, i) => (
                <li key={i} className={estilos.linea}>
                  <span className={estilos.origen} data-origen={l.origen}>
                    {l.origen}
                  </span>
                  <span className={estilos.texto}>{l.texto}</span>
                </li>
              ))}
            </ol>
          )
        ) : vista === "problemas" ? (
          problemas === undefined ? (
            <p className={estilos.vacio}>Ningún turno de esta sesión se ha verificado todavía.</p>
          ) : problemas.length === 0 ? (
            <p className={estilos.vacio}>La última verificación salió en verde, sin hallazgos.</p>
          ) : (
            <ol className={estilos.lista}>
              {problemas.map((h, i) => (
                <li key={i} className={estilos.linea}>
                  <span className={estilos.origen} data-severidad={h.severidad}>
                    {marcaDe(h)} {h.code}
                  </span>
                  <span className={estilos.texto}>
                    {dondeDe(h) === undefined ? "" : `${dondeDe(h)} — `}
                    {h.mensaje}
                  </span>
                </li>
              ))}
            </ol>
          )
        ) : lanzamiento === undefined && recarga === undefined ? (
          <p className={estilos.vacio}>Nada lanzado ni recargado en el aparato desde este proyecto.</p>
        ) : (
          <ol className={estilos.lista}>
            {lanzamiento === undefined ? null : (
              <>
                <li className={estilos.linea}>
                  <span className={estilos.origen} data-origen="fase">
                    lanzar
                  </span>
                  <span className={estilos.texto}>
                    {`${lanzamiento.fase} · ${lanzamiento.estado} · ${formatearMs(lanzamiento.ms)}`}
                    {lanzamiento.motivo === undefined ? "" : ` — ${lanzamiento.motivo}`}
                  </span>
                </li>
                {lanzamiento.lineas.map((l, i) => (
                  <li key={i} className={estilos.linea}>
                    <span className={estilos.origen} />
                    <span className={estilos.texto}>{l}</span>
                  </li>
                ))}
              </>
            )}
            {recarga === undefined ? null : (
              <li className={estilos.linea}>
                <span className={estilos.origen} data-origen="sync">
                  recarga
                </span>
                <span className={estilos.texto}>{`${recarga.ruta} · ${recarga.estado}${recarga.texto === "" ? "" : ` — ${recarga.texto}`}`}</span>
              </li>
            )}
          </ol>
        )}
      </div>
    </section>
  );
}
