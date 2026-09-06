import { useState } from "react";
import clsx from "clsx";
import {
  Button,
  Input,
  IconEditOutline16,
  IconTrashOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { AgenteDelCable } from "../tipos.js";
import estilos from "./Agentes.module.css";

/**
 * La sección de subagentes de la ventana de ajustes.
 *
 * Un subagente es un fichero `.md` en `.xonecode/agentes/` (`core/agentes.ts`): nombre,
 * descripción, motor, y un cuerpo con sus instrucciones. Esta ventana es una forma de
 * escribir ese fichero sin abrir un editor — no una segunda fuente de verdad. Por eso lo
 * que se guarda vuelve a pasar por el CARGADOR en el servidor antes de escribirse: el mismo
 * fichero se puede editar a mano, así que la autoridad sobre si vale es el cargador y no
 * este formulario.
 *
 * Tres cosas que no son de forma:
 *
 * - **La descripción se etiqueta como lo que es: un PROMPT.** Es el texto que el orquestador
 *   lee para decidir cuándo delegar en este subagente, no un rótulo para el humano. Una
 *   descripción vaga hace que no se use nunca, o que se use para todo, y quien la escribe
 *   tiene que saberlo mientras la escribe.
 * - **El ámbito se ELIGE, no se adivina.** Con un proyecto abierto valen los dos, y decidir
 *   por el usuario es cómo un «revisor» pensado para todos los proyectos acaba escondido en
 *   uno. Sin proyecto abierto solo se ofrece el global, porque el otro no existe.
 * - **`modelo` solo aparece con `motor: modelo`.** Con Claude Code o Codex el modelo lo
 *   elige el propio agente, así que un campo ahí sería un control que no hace nada — y el
 *   servidor RECHAZA el fichero que lo lleve, en vez de ignorarlo en silencio.
 */

/**
 * Los motores, con lo que significan y con lo que HACE FALTA para cada uno.
 *
 * Los dos externos dicen su requisito porque no es el mismo y el fallo se parece: Claude
 * Code va por su SDK (que viene con xonecode) y Codex por el binario que el usuario ya
 * tenga instalado. Un especialista que no arranca porque falta uno de los dos no se monta
 * siquiera —el servidor comprueba `disponible()` antes—, así que decirlo aquí es lo que
 * explica por qué no aparece.
 */
const MOTORES: readonly { id: string; etiqueta: string; detalle: string }[] = [
  { id: "modelo", etiqueta: "Un modelo", detalle: "corre dentro de xonecode, con las tools del proyecto" },
  {
    id: "claude-code",
    etiqueta: "Claude Code",
    detalle: "lanza un Claude Code sobre el proyecto — solo lectura",
  },
  {
    id: "codex",
    etiqueta: "Codex",
    detalle: "lanza el `codex` que tengas instalado — solo lectura",
  },
];

/**
 * Lo que un agente externo puede hacer hoy, dicho donde se decide.
 *
 * No es una advertencia genérica: el servidor RECHAZA el fichero de un agente externo que
 * pida escribir, así que quien marque la casilla y guarde recibiría un error. Decirlo aquí
 * —y forzar la casilla— convierte un error en una explicación.
 */
const AVISO_EXTERNO =
  "Un agente externo solo puede LEER el proyecto: la aprobación humana de xonecode todavía " +
  "no está conectada a ellos, así que sus escrituras se deniegan — a Claude Code tool a " +
  "tool, y a Codex con el sandbox de solo lectura del sistema. Usa su propia cuenta y su " +
  "propia configuración, no las de xonecode.";

/** Un agente vacío, para el formulario de alta. */
function enBlanco(): AgenteDelCable {
  return {
    nombre: "",
    descripcion: "",
    motor: "modelo",
    soloLectura: true,
    skills: [],
    instrucciones: "",
  };
}

export function Agentes({
  agentes,
  problemas,
  hayProyecto,
  alGuardar,
  alBorrar,
}: {
  /** Ausente = todavía no llegó el mensaje, que NO es «no hay ninguno». */
  agentes?: readonly AgenteDelCable[];
  problemas?: readonly string[];
  /** Si hay proyecto abierto: decide si se puede ofrecer el ámbito «de este proyecto». */
  hayProyecto: boolean;
  alGuardar: (agente: AgenteDelCable, ambito: "global" | "proyecto") => void;
  alBorrar: (nombre: string, ambito: "global" | "proyecto") => void;
}) {
  const [editando, setEditando] = useState<AgenteDelCable | undefined>(undefined);
  const [creando, setCreando] = useState(false);
  const [ambito, setAmbito] = useState<"global" | "proyecto">("global");
  const [borrando, setBorrando] = useState<string | undefined>(undefined);

  const cerrar = (): void => {
    setEditando(undefined);
    setCreando(false);
  };

  const guardar = (): void => {
    if (editando === undefined) return;
    alGuardar(editando, ambito);
    cerrar();
  };

  if (agentes === undefined) {
    return <p className={estilos.nota}>Consultando los subagentes…</p>;
  }

  return (
    <>
      {/*
        Editar es un MODO, no un añadido al final de la lista. Con la lista puesta encima, el
        formulario aparecía debajo del todo —fuera de la vista si había cinco subagentes— y
        no quedaba claro cuál se estaba tocando: se veía la fila de «revisor» arriba y unos
        campos sueltos abajo. Se sustituye una cosa por la otra, que es lo que hace evidente
        dónde estás.
      */}
      {editando !== undefined ? null : (
        <>
      <p className={estilos.nota}>
        Cada subagente es un fichero <code>.md</code> en <code>.xonecode/agentes/</code>. Los
        globales valen en todos los proyectos; los de un proyecto solo en ese, y pisan al
        global del mismo nombre.
      </p>

      {/* Los `.md` que no se pudieron leer, con su motivo. Quien los tiene que arreglar está
          mirando esta ventana: un agente que no aparece y nadie dice por qué se lee como que
          la aplicación lo perdió. */}
      {problemas !== undefined && problemas.length > 0 ? (
        <ul className={estilos.problemas} role="alert">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      {agentes.length === 0 ? (
        <p className={estilos.vacio}>
          No hay ningún subagente. Sin ninguno, el orquestador no tiene en quién delegar.
        </p>
      ) : (
        <ul className={estilos.filas}>
          {agentes.map((a) => (
            <li key={a.nombre} className={estilos.fila}>
              <div className={estilos.cabeceraDeFila}>
                <span className={estilos.nombre}>{a.nombre}</span>
                <span className={estilos.motor}>{a.motor}</span>
                {/* De dónde sale. Es lo que explica por qué editarlo aquí no afecta a los
                    demás proyectos — o por qué sí. */}
                {a.origen === undefined ? null : <span className={estilos.origen}>{a.origen}</span>}
                {a.soloLectura ? <span className={estilos.lectura}>solo lectura</span> : null}
                <span className={estilos.relleno} />
                {/*
                  Iconos y no dos botones de texto: con cinco subagentes eran diez rótulos
                  repetidos que pesaban más que los nombres. El nombre accesible va en el
                  `aria-label` y LLEVA EL DEL AGENTE — aquí sí, al revés que en el punto de
                  la pastilla de modelo: allí el `aria-label` se sumaba al nombre del botón
                  que lo contenía y lo estropeaba; estos botones no tienen texto, así que sin
                  `aria-label` no tendrían nombre ninguno, y «Editar» repetido cinco veces no
                  distingue cuál es cuál para quien navega por voz.
                */}
                <button
                  type="button"
                  className={estilos.icono}
                  aria-label={`Editar ${a.nombre}`}
                  title="Editar"
                  onClick={() => {
                    setBorrando(undefined);
                    setAmbito(a.origen === "proyecto" ? "proyecto" : "global");
                    setEditando({ ...a });
                    setCreando(false);
                  }}
                >
                  <IconEditOutline16 size={18} />
                </button>
                <button
                  type="button"
                  className={clsx(estilos.icono, estilos.iconoDestructivo)}
                  aria-label={`Eliminar ${a.nombre}`}
                  title="Eliminar"
                  onClick={() => setBorrando(borrando === a.nombre ? undefined : a.nombre)}
                >
                  <IconTrashOutline16 size={18} />
                </button>
              </div>
              <p className={estilos.descripcion}>{a.descripcion}</p>
              {/* Eliminar se confirma en la propia fila y no al primer clic: borra un fichero
                  y no hay papelera, igual que en la barra de sesiones. */}
              {borrando === a.nombre ? (
                <p className={estilos.confirmar}>
                  Se borra el fichero de «{a.nombre}». No hay papelera.{" "}
                  <Button
                    variant="outline"
                    className={estilos.destructiva}
                    onClick={() => {
                      alBorrar(a.nombre, a.origen === "proyecto" ? "proyecto" : "global");
                      setBorrando(undefined);
                    }}
                  >
                    Eliminar
                  </Button>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

        </>
      )}

      {editando === undefined ? (
        <Button
          variant="outline"
          className={estilos.accion}
          onClick={() => {
            setEditando(enBlanco());
            setCreando(true);
            setAmbito(hayProyecto ? "proyecto" : "global");
          }}
        >
          Nuevo subagente
        </Button>
      ) : (
        <div className={estilos.formulario}>
          <label className={estilos.campo}>
            <span className={estilos.rotulo}>Nombre</span>
            {/* Al editar no se cambia: el nombre ES el fichero, así que renombrarlo desde
                aquí crearía uno nuevo y dejaría el viejo puesto. Se renombra el `.md`. */}
            <Input
              value={editando.nombre}
              disabled={!creando}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
            />
          </label>

          <label className={estilos.campo}>
            <span className={estilos.rotulo}>
              Cuándo usarlo <span className={estilos.pista}>— lo lee el orquestador para elegirlo</span>
            </span>
            <Input
              value={editando.descripcion}
              onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })}
            />
          </label>

          <label className={estilos.campo}>
            <span className={estilos.rotulo}>Motor</span>
            <select
              className={estilos.selector}
              value={editando.motor}
              onChange={(e) =>
                setEditando({
                  ...editando,
                  motor: e.target.value,
                  // El modelo se va al cambiar de motor: con Claude Code o Codex no vale, y
                  // el servidor rechaza el fichero que lo lleve. Dejarlo puesto haría que
                  // guardar fallara con un error que el formulario podía haber evitado.
                  ...(e.target.value === "modelo" ? {} : { modelo: undefined }),
                  // Un agente externo va a solo lectura y no se puede desmarcar: el
                  // servidor rechaza el fichero que pida escribir, así que dejar la casilla
                  // suelta solo serviría para que guardar fallara.
                  ...(e.target.value === "modelo" ? {} : { soloLectura: true }),
                })
              }
            >
              {MOTORES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.etiqueta} — {m.detalle}
                </option>
              ))}
            </select>
          </label>

          {editando.motor === "modelo" ? (
            <label className={estilos.campo}>
              <span className={estilos.rotulo}>
                Modelo <span className={estilos.pista}>— «proveedor/modelo»; vacío = el del papel que le toca</span>
              </span>
              <Input
                value={editando.modelo ?? ""}
                onChange={(e) =>
                  setEditando({
                    ...editando,
                    ...(e.target.value.trim() === "" ? { modelo: undefined } : { modelo: e.target.value }),
                  })
                }
              />
            </label>
          ) : null}

          <label className={estilos.casilla}>
            <input
              type="checkbox"
              checked={editando.soloLectura}
              disabled={editando.motor !== "modelo"}
              onChange={(e) => setEditando({ ...editando, soloLectura: e.target.checked })}
            />
            <span>
              Solo lectura <span className={estilos.pista}>— si escribe, sus cambios pasan por tu aprobación</span>
            </span>
          </label>

          {editando.motor === "modelo" ? null : <p className={estilos.aviso}>{AVISO_EXTERNO}</p>}

          <label className={estilos.campo}>
            <span className={estilos.rotulo}>
              Skills <span className={estilos.pista}>— separadas por comas</span>
            </span>
            <Input
              value={editando.skills.join(", ")}
              onChange={(e) =>
                setEditando({
                  ...editando,
                  skills: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => s !== ""),
                })
              }
            />
          </label>

          <label className={estilos.campo}>
            <span className={estilos.rotulo}>Instrucciones</span>
            <textarea
              className={estilos.instrucciones}
              rows={8}
              value={editando.instrucciones}
              onChange={(e) => setEditando({ ...editando, instrucciones: e.target.value })}
            />
          </label>

          {/* El ámbito solo se ofrece si hay dónde elegir. Con un proyecto abierto valen los
              dos; sin él, el de proyecto no existe y un desplegable con una sola opción es
              una pregunta que no lo es. */}
          {hayProyecto ? (
            <label className={estilos.campo}>
              <span className={estilos.rotulo}>Dónde se guarda</span>
              <select
                className={estilos.selector}
                value={ambito}
                onChange={(e) => setAmbito(e.target.value === "proyecto" ? "proyecto" : "global")}
              >
                <option value="proyecto">En este proyecto</option>
                <option value="global">Global — en todos</option>
              </select>
            </label>
          ) : (
            <p className={estilos.pista}>Se guarda como global: no hay ningún proyecto abierto.</p>
          )}

          <div className={estilos.botones}>
            <Button variant="outline" className={estilos.accion} onClick={cerrar}>
              Cancelar
            </Button>
            {/*
              El `variant` va EXPLÍCITO en los dos. Sin él, el `<Button>` del paquete cae en
              su variante por omisión, que en tema oscuro llega blanca — «Guardar» y
              «Cancelar» salían los dos como cajas blancas y no se distinguía cuál era cuál.
              Guardar es la acción de la pantalla y lleva el primario (que desde el rediseño
              es el negro del tema en claro y el casi blanco en oscuro); cancelar, contorno.
            */}
            <Button
              variant="primary"
              className={estilos.principal}
              // Sin nombre ni descripción el servidor lo rechazaría: es más honesto no
              // dejar pulsar que aceptar y contestar que no.
              disabled={editando.nombre.trim() === "" || editando.descripcion.trim() === ""}
              onClick={guardar}
            >
              Guardar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
