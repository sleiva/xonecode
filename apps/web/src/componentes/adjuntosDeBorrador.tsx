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

/** La lista de adjuntos de un borrador, con su miniatura, su estado y «Quitar». */
export function ListaDeAdjuntos({
  adjuntos,
  quitar,
  puedeQuitar,
}: {
  adjuntos: readonly AdjuntoDeBorrador[];
  quitar: (id: number) => Promise<void>;
  puedeQuitar: boolean;
}) {
  if (adjuntos.length === 0) return null;
  return (
    <ul className={estilos.adjuntos}>
      {adjuntos.map((a) => (
        <li key={a.id} className={estilos.adjunto} data-estado={a.estado}>
          {a.vista === undefined ? null : <img className={estilos.miniatura} src={a.vista} alt="" />}
          <span className={estilos.nombreDeAdjunto}>{a.nombre}</span>
          <span className={estilos.peso}>{peso(a.bytes)}</span>
          <span className={estilos.estado}>
            {a.quitando
              ? "quitando…"
              : a.estado === "subiendo"
                ? "subiendo…"
                : a.estado === "listo"
                  ? (a.motivo ?? "listo")
                  : (a.motivo ?? "no se pudo subir")}
          </span>
          {a.estado === "listo" && !puedeQuitar ? null : (
            <button
              type="button"
              className={estilos.quitar}
              aria-label={`Quitar ${a.nombre}`}
              disabled={a.estado === "subiendo" || a.quitando === true}
              onClick={() => void quitar(a.id)}
            >
              Quitar
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
