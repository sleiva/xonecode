/**
 * Los adjuntos de un BORRADOR de tarea: subir, quitar y pegar capturas, con su miniatura. Lo comparten «Nueva tarea»
 * (`NuevaTarea.tsx`) y «Reencolar lo pendiente» (`TareasDelProyecto.tsx`): los bytes se suben a la carpeta del
 * borrador ANTES de encolar —el corredor puede arrancar la tarea en el acto— y el servidor la adopta al crearla.
 */
import { useRef, useState, type ClipboardEvent } from "react";
import { nombreDeAdjuntoSeguro } from "../nombreDeAdjunto.js";
import { ficherosDelPegado, renombrarPegados } from "../pegado.js";
import { useVistasPrevias } from "../vistaPrevia.js";
import estilos from "./NuevaTarea.module.css";
import rejilla from "./RejillaDeAdjuntos.module.css";

export interface AdjuntoDeBorrador {
  id: number;
  nombre: string;
  bytes: number;
  estado: "subiendo" | "listo" | "falló";
  motivo?: string;
  /** La miniatura, de los bytes LOCALES (`useVistasPrevias`); solo imágenes. */
  vista?: string;
  /** Pidiendo al servidor que lo borre: el botón espera. */
  quitando?: boolean;
}

export function useAdjuntosDeBorrador(opciones: {
  alSubir: (fichero: File, nombre: string) => Promise<{ ok: boolean; motivo?: string }>;
  alQuitar?: (nombre: string) => Promise<{ ok: boolean; motivo?: string }>;
  /** Nombres que ya están tomados de antes (los adjuntos de la tarea que se reencola): uno nuevo no los pisa. */
  ocupados?: readonly string[];
}) {
  const { alSubir, alQuitar, ocupados = [] } = opciones;
  const [adjuntos, setAdjuntos] = useState<AdjuntoDeBorrador[]>([]);
  const siguienteId = useRef(0);
  const vistas = useVistasPrevias();

  const añadir = async (elegidos: ArrayLike<File> | null): Promise<void> => {
    /**
     * Los nombres ya tomados, en una variable LOCAL y no leídos del estado.
     *
     * Esta es la parte delicada. El «¿ya hay uno con este nombre?» se leía de dentro del
     * actualizador de `setAdjuntos`, y React solo ejecuta ese actualizador en el acto por su
     * vía de estado *eager* —con la fibra sin trabajo pendiente—. Con `<input multiple>` y dos
     * ficheros del mismo nombre en UNA elección, la segunda vuelta del bucle llega después de
     * un `await` con una actualización posiblemente en cola: veía `false`, subía igual, y el
     * servidor sobrescribía el fichero en silencio. Medido: `alSubirAdjunto` se llamaba dos
     * veces con «captura.png» mientras la fila decía «ya hay un adjunto con ese nombre».
     *
     * El Set se siembra con lo que hay en el estado —esta ventana solo AÑADE adjuntos, así
     * que lo que se leyó al pintar sigue siendo cierto— y crece dentro del bucle, que es lo
     * único que la vía eager no garantizaba.
     */
    const tomados = new Set([...ocupados, ...adjuntos.map((a) => a.nombre)]);
    for (const fichero of Array.from(elegidos ?? [])) {
      const nombre = nombreDeAdjuntoSeguro(fichero.name);
      if (nombre === undefined) {
        // No se inventa uno: se dice, y la persona elige otro fichero.
        setAdjuntos((ya) => [
          ...ya,
          { id: siguienteId.current++, nombre: fichero.name, bytes: fichero.size, estado: "falló", motivo: "no se puede usar ese nombre aquí" },
        ]);
        continue;
      }
      const repetido = tomados.has(nombre);
      tomados.add(nombre);
      const id = siguienteId.current++;
      const vista = repetido ? undefined : vistas.crear(fichero);
      setAdjuntos((ya) => [
        ...ya,
        repetido
          ? { id, nombre, bytes: fichero.size, estado: "falló" as const, motivo: "ya hay un adjunto con ese nombre" }
          : { id, nombre, bytes: fichero.size, estado: "subiendo" as const, ...(vista === undefined ? {} : { vista }) },
      ]);
      // El segundo con el mismo nombre se rechaza aquí y no se sube, porque el servidor lo
      // sobrescribiría en silencio.
      if (repetido) continue;
      const r = await alSubir(fichero, nombre);
      setAdjuntos((ya) =>
        ya.map((a) =>
          a.id === id
            ? {
                ...a,
                estado: r.ok ? "listo" : "falló",
                ...(r.ok || r.motivo === undefined ? {} : { motivo: r.motivo }),
              }
            : a
        )
      );
    }
  };

  /**
   * Quitar una fila. Una que FALLÓ no llegó al servidor: se quita de la lista y ya. Una que
   * llegó se BORRA allí primero —el agente ve la carpeta del borrador, no esta lista— y solo
   * con el sí del servidor desaparece; si se niega, el motivo queda en la fila.
   */
  const quitar = async (id: number): Promise<void> => {
    const fila = adjuntos.find((a) => a.id === id);
    if (fila === undefined || fila.estado === "subiendo" || fila.quitando) return;
    const fuera = (): void => {
      vistas.soltar(fila.vista);
      setAdjuntos((ya) => ya.filter((a) => a.id !== id));
    };
    if (fila.estado === "falló") return fuera();
    if (alQuitar === undefined) return;
    setAdjuntos((ya) => ya.map((a) => (a.id === id ? { ...a, quitando: true } : a)));
    const r = await alQuitar(fila.nombre);
    if (r.ok) return fuera();
    setAdjuntos((ya) =>
      ya.map((a) => (a.id === id ? { ...a, quitando: false, motivo: r.motivo ?? "no se pudo quitar" } : a))
    );
  };

  /**
   * Pegar una captura en un campo de texto la ADJUNTA (IXCODE-59), igual que en el compositor del chat: con ficheros
   * en el portapapeles no se pega texto; sin ellos el pegado sigue su camino. El nombre, `pegado-<n>`, salta los que ya
   * hay (y los `ocupados`).
   */
  const alPegar = (evento: ClipboardEvent<HTMLTextAreaElement>): void => {
    const pegados = ficherosDelPegado(evento.clipboardData);
    if (pegados.length === 0) return;
    evento.preventDefault();
    void añadir(renombrarPegados(pegados, new Set([...ocupados, ...adjuntos.map((a) => a.nombre)])));
  };

  return {
    adjuntos,
    añadir,
    quitar,
    alPegar,
    enVuelo: adjuntos.some((a) => a.estado === "subiendo"),
    algunoFalló: adjuntos.some((a) => a.estado === "falló"),
    /** Alguno LLEGÓ al servidor: solo entonces se le menciona el borrador al encolar. */
    algunoListo: adjuntos.some((a) => a.estado === "listo"),
    puedeQuitar: alQuitar !== undefined,
  };
}

export function peso(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}


/** Subir, quitar y descartar las imágenes NUEVAS de un formulario bajo su borrador (Reencolar, Editar la tarea). */
export interface AdjuntosDelBorrador {
  subir: (borrador: string, nombre: string, fichero: File) => Promise<{ ok: boolean; motivo?: string }>;
  quitar?: (borrador: string, nombre: string) => Promise<{ ok: boolean; motivo?: string }>;
  descartar: (borrador: string) => void;
}

/** Uno que el formulario YA tenía (los de una tarea que se edita): sin vista, que el servidor no los sirve. */
export interface AdjuntoPrevio {
  nombre: string;
  quitado: boolean;
  alternar: () => void;
}

/**
 * **Las imágenes en MINIATURAS** (su lienzo, 21-10-2026: «Editar la tarea» y «Nueva tarea» iguales): las que ya tenía —con
 * su icono y su nombre— y las nuevas con su vista, cada una con × para quitarla (↺ para recuperar una de antes), y una
 * casilla para añadir que también recibe lo que se ARRASTRA. Pegar en los textos lo lleva el formulario (`alPegar`).
 */
export function RejillaDeAdjuntos({
  nuevos,
  quitar,
  puedeQuitar,
  añadir,
  previos = [],
  deshabilitado = false,
  nota,
}: {
  nuevos: readonly AdjuntoDeBorrador[];
  quitar: (id: number) => Promise<void>;
  puedeQuitar: boolean;
  añadir: (elegidos: ArrayLike<File> | null) => Promise<void>;
  previos?: readonly AdjuntoPrevio[];
  deshabilitado?: boolean;
  /** Lo que se dice a la derecha del título. Ausente = dónde los verá el agente. */
  nota?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const cuantos = previos.filter((p) => !p.quitado).length + nuevos.length;
  return (
    <section
      className={rejilla.imagenes}
      aria-label="Imágenes"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        void añadir(e.dataTransfer.files);
      }}
    >
      <div className={rejilla.cabeceraDeImagenes}>
        <span className={rejilla.etiqueta}>{`Imágenes · ${cuantos}`}</span>
        <span className={rejilla.notaDeImagenes}>{nota ?? "Las verá el agente en /adjuntos/, de solo lectura"}</span>
      </div>
      <ul className={rejilla.rejillaDeImagenes}>
        {previos.map((a) => (
          <li key={`antes-${a.nombre}`} className={rejilla.imagen} data-quitado={a.quitado ? "" : undefined}>
            <span className={rejilla.sinVista} aria-hidden="true">
              <IconoDeImagen />
            </span>
            <span className={rejilla.nombreDeImagen}>{a.nombre}</span>
            <span className={rejilla.estadoDeImagen}>{a.quitado ? "se quitará al guardar" : "ya la tenía"}</span>
            <button
              type="button"
              className={rejilla.quitarImagen}
              aria-label={a.quitado ? `Volver a poner ${a.nombre}` : `Quitar ${a.nombre}`}
              disabled={deshabilitado}
              onClick={a.alternar}
            >
              {a.quitado ? "↺" : "×"}
            </button>
          </li>
        ))}
        {nuevos.map((a) => (
          <li key={`nueva-${a.id}`} className={rejilla.imagen} data-nueva="" data-estado={a.estado}>
            {a.vista === undefined ? (
              <span className={rejilla.sinVista} aria-hidden="true">
                <IconoDeImagen />
              </span>
            ) : (
              <img className={rejilla.vista} src={a.vista} alt="" />
            )}
            <span className={rejilla.nombreDeImagen}>{a.nombre}</span>
            <span className={rejilla.estadoDeImagen}>
              {a.quitando ? "quitando…" : a.estado === "subiendo" ? "subiendo…" : a.estado === "listo" ? (a.motivo ?? "nueva") : (a.motivo ?? "no se pudo subir")}
            </span>
            {a.estado === "listo" && !puedeQuitar ? null : (
              <button
                type="button"
                className={rejilla.quitarImagen}
                aria-label={`Quitar ${a.nombre}`}
                disabled={a.estado === "subiendo" || a.quitando === true}
                onClick={() => void quitar(a.id)}
              >
                ×
              </button>
            )}
          </li>
        ))}
        <li>
          <button type="button" className={rejilla.anadirImagen} disabled={deshabilitado} onClick={() => entrada.current?.click()}>
            <span aria-hidden="true">+</span>
            Añadir imagen o arrástrala aquí
          </button>
        </li>
      </ul>
      <input
        ref={entrada}
        hidden
        type="file"
        multiple
        onChange={(e) => {
          void añadir(e.target.files);
          // El mismo fichero se puede volver a elegir tras un fallo: sin esto el `change` no vuelve a dispararse.
          e.target.value = "";
        }}
      />
      <p className={rejilla.notaDeImagenes}>También puedes pegar una captura en el texto.</p>
    </section>
  );
}

/** Una imagen sin vista. Trazo, en el color del texto. */
function IconoDeImagen() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </svg>
  );
}
