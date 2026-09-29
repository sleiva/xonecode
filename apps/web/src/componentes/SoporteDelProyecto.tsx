import { useEffect, useRef, useState } from "react";
import type { FilaDeSoporte, ListadoDeSoporte } from "../tipos.js";
import estilos from "./SoporteDelProyecto.module.css";

/** La ruta del paquete (`web/servidor/arranque.ts#RUTA_SOPORTE`). Viajan IDs, nunca rutas. */
export function urlDelPaquete(proyecto: string, tipo: "proyecto" | "chat" | "tarea", id?: string): string {
  const query = new URLSearchParams({ tipo, proyecto, ...(id === undefined ? {} : { id }) });
  return `/soporte?${query.toString()}`;
}

/**
 * El listado pedido al servidor, CON el id del proyecto del que es: una respuesta que llega
 * cuando ya se mira otro proyecto se tira (el fallo que cerró `ramasDe`).
 */
interface Medida {
  proyecto: string;
  respondida: boolean;
  listado?: ListadoDeSoporte;
}

function cuantos(fila: FilaDeSoporte): number {
  return fila.analisis.hallazgos.filter((h) => h.gravedad !== "info").length;
}

function textoDeInsignia(fila: FilaDeSoporte): string {
  const n = cuantos(fila);
  if (fila.analisis.gravedad === "ok") return "sin problemas";
  return fila.analisis.gravedad === "error" ? `${n} con error` : `${n} aviso${n === 1 ? "" : "s"}`;
}

/** Un chat sin título se nombra como en la barra (`Barra.tsx`), nunca como una fila en blanco. */
function tituloDe(fila: FilaDeSoporte): string {
  return fila.titulo.trim() === "" ? "Sin título" : fila.titulo;
}

function cuando(fila: FilaDeSoporte): string | undefined {
  const iso = fila.ultimoTurno ?? fila.creada;
  return iso === undefined ? undefined : iso.slice(0, 16).replace("T", " ");
}

const ESTADOS_DE_TAREA: Record<NonNullable<FilaDeSoporte["estado"]>, string> = {
  nuevo: "nueva",
  "en-proceso": "en proceso",
  "requiere-atencion": "requiere atención",
  terminada: "terminada",
};

function Fila({ fila, url }: { fila: FilaDeSoporte; url: string }) {
  const [abierta, setAbierta] = useState(false);
  const hayHallazgos = fila.analisis.hallazgos.length > 0;
  const fecha = cuando(fila);
  return (
    <li className={estilos.fila}>
      <div className={estilos.cabecera}>
        <span className={estilos.insignia} data-gravedad={fila.analisis.gravedad}>
          {textoDeInsignia(fila)}
        </span>
        {hayHallazgos ? (
          <button type="button" className={estilos.titulo} aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
            {tituloDe(fila)}
          </button>
        ) : (
          <span className={estilos.titulo}>{tituloDe(fila)}</span>
        )}
        <span className={estilos.dato}>
          {fila.estado === undefined ? null : `${ESTADOS_DE_TAREA[fila.estado]} · `}
          {fila.enVuelo === true ? "en marcha · " : null}
          {fecha}
        </span>
        <a className={estilos.exportar} href={url} download>
          Exportar
        </a>
      </div>
      {/* Lo plegado se DESMONTA. */}
      {abierta && hayHallazgos ? (
        <ul className={estilos.hallazgos}>
          {fila.analisis.hallazgos.map((h, i) => (
            <li key={i} data-gravedad={h.gravedad}>
              {h.turno === undefined ? null : <span className={estilos.turno}>turno {h.turno}</span>}
              {h.mensaje}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Grupo({
  titulo,
  filas,
  vacio,
  url,
}: {
  titulo: string;
  filas: readonly FilaDeSoporte[];
  vacio: string;
  url: (fila: FilaDeSoporte) => string;
}) {
  return (
    <section className={estilos.grupo} aria-label={titulo}>
      <h2 className={estilos.tituloDeGrupo}>{titulo}</h2>
      {filas.length === 0 ? (
        <p className={estilos.aviso}>{vacio}</p>
      ) : (
        <ul className={estilos.lista}>
          {filas.map((f) => (
            <Fila key={f.id} fila={f} url={url(f)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * La pestaña SOPORTE del panel del proyecto: exportar lo necesario para analizar qué pasó —el
 * proyecto entero, o un chat, o una tarea— y un análisis PREVIO de cada uno, hecho con reglas
 * de código en el servidor (`core/analisisDeSesion.ts`), sin llamar a ningún modelo.
 *
 * **Las filas NO abren el chat**: las sesiones se navegan desde la barra. Aquí solo se exporta y
 * se analiza. Las descargas son enlaces `download` a `GET /soporte`, con los IDS del proyecto y
 * del chat o la tarea; el servidor decide la raíz y qué existe.
 *
 * El listado es una FOTO: se pide al entrar y con «Actualizar», sin sondeo.
 */
export function SoporteDelProyecto({
  proyecto,
  conectado,
  alPedir,
}: {
  /** El id del proyecto (el del alta). */
  proyecto: string;
  conectado: boolean;
  /** Pide el listado. `undefined` = no se pudo (sin red, o el servidor se negó). */
  alPedir: (proyecto: string) => Promise<ListadoDeSoporte | undefined>;
}) {
  const [medida, setMedida] = useState<Medida | undefined>(undefined);
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  // El manejador en una ref: `App` lo recompone en cada render (consumo, turno, dispositivos…),
  // y como dependencia del efecto pediría el listado otra vez en cada uno.
  const pedir = useRef(alPedir);
  pedir.current = alPedir;

  useEffect(() => {
    if (!conectado) return;
    let vigente = true;
    setMedida({ proyecto, respondida: false });
    void pedir.current(proyecto).then((listado) => {
      // Tirar la respuesta de otro proyecto, o de un montaje que ya no está.
      if (!vigente) return;
      setMedida({ proyecto, respondida: true, ...(listado === undefined ? {} : { listado }) });
    });
    return () => {
      vigente = false;
    };
  }, [proyecto, conectado, vuelta]);

  const delProyecto = medida?.proyecto === proyecto ? medida : undefined;
  const listado = delProyecto?.listado;
  const filtrar = (filas: readonly FilaDeSoporte[]) => (soloProblemas ? filas.filter((f) => f.analisis.gravedad !== "ok") : filas);

  return (
    <div className={estilos.soporte}>
      <div className={estilos.barra}>
        <a className={estilos.principal} href={urlDelPaquete(proyecto, "proyecto")} download>
          Exportar proyecto
        </a>
        <label className={estilos.filtro}>
          <input type="checkbox" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} />
          Solo con problemas
        </label>
        <button type="button" className={estilos.secundario} disabled={!conectado} onClick={() => setVuelta((v) => v + 1)}>
          Actualizar
        </button>
      </div>
      <p className={estilos.aviso}>
        El paquete lleva el código, las sesiones, sus trazas y la memoria del agente; nunca el .env, el historial de git ni
        las credenciales. Puede incluir rutas de tu equipo.
      </p>
      {delProyecto === undefined || !delProyecto.respondida ? (
        <p className={estilos.aviso} role="status">
          Analizando…
        </p>
      ) : listado === undefined ? (
        <p className={estilos.error} role="status">
          No se pudo pedir el análisis al servidor.
        </p>
      ) : (
        <>
          <Grupo
            titulo="Chats"
            filas={filtrar(listado.chats)}
            vacio={soloProblemas ? "Ningún chat con problemas." : "Este proyecto no tiene chats."}
            url={(f) => urlDelPaquete(proyecto, "chat", f.id)}
          />
          <Grupo
            titulo="Tareas"
            filas={filtrar(listado.tareas)}
            vacio={soloProblemas ? "Ninguna tarea con problemas." : "Este proyecto no tiene tareas en background."}
            url={(f) => urlDelPaquete(proyecto, "tarea", f.id)}
          />
        </>
      )}
    </div>
  );
}
