import { useEffect, useState } from "react";
import type { EstadoDeGranja } from "../store.js";
import estilos from "./AjustesDeGranja.module.css";

/** Lo que Ajustes manda al guardar: la dirección (vacía = quitarla) y/o el token tecleado, o quitarlo. */
export interface CambioDeGranja {
  direccion?: string;
  token?: string;
  quitarToken?: true;
}

/** Una huella SHA-256 abreviada para leerla de un vistazo; la entera va en el `title`. */
export function huellaCorta(huella: string): string {
  const octetos = huella.split(":");
  return octetos.length <= 4 ? huella : `${octetos.slice(0, 2).join(":")}:…:${octetos.slice(-2).join(":")}`;
}

/** La hora local de una medida ISO, como en el resto de Ajustes. */
function hora(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "" : fecha.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * La pestaña Granja de Ajustes → Dispositivos (`core/granja.ts`): dónde está la granja de dispositivos
 * XOne y con qué token se entra. Una sola granja por equipo; usarla lo decide cada PROYECTO en la
 * pastilla del chat, no aquí.
 *
 * **Quien decide qué vale es el SERVIDOR**: la dirección se normaliza allí (`direccionDeGranja`) y su
 * negativa llega como texto; el resultado de «Probar conexión» llega con su `motivo` ya escrito. Aquí no
 * hay una segunda copia de esas reglas.
 *
 * **El token SE TECLEA aquí**, en un campo de contraseña: se manda con «Guardar» y el campo se vacía. El
 * servidor no lo devuelve nunca —solo `hayToken`—, así que la pestaña no puede enseñar cuál hay.
 */
export function AjustesDeGranja({
  granja,
  conectado = true,
  alGuardar,
  alProbar,
  alAceptarHuella,
}: {
  granja: EstadoDeGranja;
  conectado?: boolean;
  /** Devuelve el motivo si el servidor se negó; `undefined` = guardado. */
  alGuardar: (cambio: CambioDeGranja) => Promise<string | undefined>;
  alProbar: () => void;
  /** Devuelve el motivo si el servidor se negó. */
  alAceptarHuella: (huella: string) => Promise<string | undefined>;
}) {
  const [direccion, setDireccion] = useState(granja.direccion ?? "");
  const [token, setToken] = useState("");
  const [reemplazando, setReemplazando] = useState(false);
  const [negativa, setNegativa] = useState<string | undefined>(undefined);
  const [probando, setProbando] = useState(false);
  // Si el servidor confirma otra dirección (normalizada, o quitada), el campo la sigue.
  useEffect(() => setDireccion(granja.direccion ?? ""), [granja.direccion]);
  // Una prueba nueva (o una configuración nueva) acaba la espera del botón.
  useEffect(() => setProbando(false), [granja.prueba?.medido, granja.direccion, granja.hayToken]);

  const pideToken = !granja.hayToken || reemplazando;
  const direccionCambiada = direccion.trim() !== (granja.direccion ?? "");
  const hayQueGuardar = direccionCambiada || token.trim() !== "";

  const guardar = async (cambio: CambioDeGranja): Promise<void> => {
    setNegativa(undefined);
    const motivo = await alGuardar(cambio);
    if (motivo !== undefined) {
      setNegativa(motivo);
      return;
    }
    setToken("");
    setReemplazando(false);
    // Con dirección y token el servidor prueba solo: el botón espera esa prueba.
    if ((cambio.direccion ?? granja.direccion ?? "").trim() !== "" && (cambio.token !== undefined || granja.hayToken)) setProbando(true);
  };

  const prueba = granja.prueba;
  return (
    <div className={estilos.envoltura}>
      <p className={estilos.nota}>
        Teléfonos Android conectados a otro PC, con varias copias del framework cada uno. Aquí se dice dónde está la
        granja y con qué token se entra; cada proyecto elige en la pastilla del chat si usa este equipo o la granja.
      </p>

      <form
        className={estilos.formulario}
        onSubmit={(e) => {
          e.preventDefault();
          if (!hayQueGuardar) return;
          void guardar({
            ...(direccionCambiada ? { direccion: direccion.trim() } : {}),
            ...(token.trim() === "" ? {} : { token: token.trim() }),
          });
        }}
      >
        <label className={estilos.etiqueta} htmlFor="granja-direccion">
          Dirección
        </label>
        <input
          id="granja-direccion"
          className={estilos.campo}
          type="text"
          value={direccion}
          placeholder="192.168.1.40"
          autoComplete="off"
          spellCheck={false}
          disabled={!conectado}
          onChange={(e) => setDireccion(e.target.value)}
        />
        <p className={estilos.nota}>URL o IP. Con solo la IP se usa https://&lt;ip&gt;:8090.</p>

        <span className={estilos.etiqueta} id="granja-token">
          Token de acceso
        </span>
        {pideToken ? (
          <input
            className={estilos.campo}
            type="password"
            aria-labelledby="granja-token"
            value={token}
            placeholder="xfarm_…"
            autoComplete="off"
            spellCheck={false}
            disabled={!conectado}
            onChange={(e) => setToken(e.target.value)}
          />
        ) : (
          <div className={estilos.guardado}>
            <span>Guardado en este equipo</span>
            <button type="button" className={estilos.boton} disabled={!conectado} onClick={() => setReemplazando(true)}>
              Reemplazar
            </button>
            <button
              type="button"
              className={estilos.botonPeligro}
              disabled={!conectado}
              onClick={() => void guardar({ quitarToken: true })}
            >
              Quitar
            </button>
          </div>
        )}
        <p className={estilos.nota}>
          Se crea en la web de la granja, menú ☰ → «Tokens de acceso». Se guarda solo en este equipo: no vuelve al
          navegador ni lo ve el agente.
        </p>

        {negativa === undefined ? null : (
          <p className={estilos.motivo} role="alert">
            {negativa}
          </p>
        )}

        <div className={estilos.acciones}>
          <button type="submit" className={estilos.botonPrimario} disabled={!conectado || !hayQueGuardar}>
            Guardar
          </button>
          {reemplazando ? (
            <button
              type="button"
              className={estilos.boton}
              onClick={() => {
                setReemplazando(false);
                setToken("");
              }}
            >
              Cancelar
            </button>
          ) : null}
          <button
            type="button"
            className={estilos.boton}
            disabled={!conectado || granja.direccion === undefined || !granja.hayToken || probando}
            aria-busy={probando}
            onClick={() => {
              setProbando(true);
              alProbar();
            }}
          >
            {probando ? "Probando…" : "Probar conexión"}
          </button>
          {prueba === undefined ? null : <span className={estilos.hora}>Probada a las {hora(prueba.medido)}</span>}
        </div>
      </form>

      {prueba === undefined ? null : prueba.estado === "conectada" ? (
        <div className={estilos.conectada} role="status">
          <strong>
            Conectada como {prueba.usuario} ({prueba.rol === "admin" ? "administrador" : "usuario normal"})
          </strong>
          <dl className={estilos.datos}>
            <dt>Teléfonos</dt>
            <dd>
              {prueba.resumen.telefonos} {prueba.resumen.telefonos === 1 ? "listo" : "listos"}
            </dd>
            <dt>Copias</dt>
            <dd>
              {prueba.resumen.copias.libres} libres
              {prueba.resumen.copias.tuyas === 0 ? "" : `, ${prueba.resumen.copias.tuyas} tuyas`}
            </dd>
            {prueba.resumen.frameworks.length === 0 ? null : (
              <>
                <dt>Framework</dt>
                <dd>{prueba.resumen.frameworks.join(", ")}</dd>
              </>
            )}
            {granja.huella === undefined ? null : (
              <>
                <dt>Certificado</dt>
                <dd title={granja.huella}>autofirmado, huella {huellaCorta(granja.huella)} aceptada</dd>
              </>
            )}
          </dl>
        </div>
      ) : (
        <div className={prueba.estado === "huella-distinta" ? estilos.huella : estilos.fallo} role="alert">
          <span>{prueba.motivo}</span>
          {prueba.estado === "huella-distinta" ? (
            <>
              <span className={estilos.nota}>
                Aceptada: <span title={prueba.aceptada}>{huellaCorta(prueba.aceptada)}</span>. Ahora:{" "}
                <span title={prueba.ahora}>{huellaCorta(prueba.ahora)}</span>.
              </span>
              <button
                type="button"
                className={estilos.boton}
                disabled={!conectado}
                onClick={() => {
                  setNegativa(undefined);
                  void alAceptarHuella(prueba.ahora).then((motivo) => {
                    if (motivo !== undefined) setNegativa(motivo);
                    else setProbando(true);
                  });
                }}
              >
                Aceptar el nuevo
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
