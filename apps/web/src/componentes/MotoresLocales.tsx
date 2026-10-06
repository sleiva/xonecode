import clsx from "clsx";
import { useEffect, useState } from "react";
import { useEsperaDeRefresco } from "../esperaDeRefresco.js";
import { useMedirAlVolver } from "../medirAlVolver.js";
import type { EstadoDeMotorLocal, MotorLocal, PruebaDeMotorLocal } from "../tipos.js";
import { GUIA_DE_INICIO, NOMBRE_DE_MOTOR } from "./guiaDeMotores.js";
import estilos from "./MotoresLocales.module.css";

export type AccionDeMotorLocal =
  | { accion: "medir" }
  | { accion: "probar" | "cancelar" | "navegador" | "consola"; motor: MotorLocal }
  | { accion: "login"; motor: MotorLocal; modo: "claudeai" | "console" }
  | { accion: "codigo"; motor: MotorLocal; codigo: string }
  | { accion: "modelo"; motor: MotorLocal; modelo?: string };

type ModelosDeMotor = Record<string, { modelos: { id: string; nombre: string }[]; error?: string }>;

const MOTORES: readonly MotorLocal[] = ["claude-code", "codex", "opencode"];

const CAMINO: Readonly<Record<PruebaDeMotorLocal["camino"], string | undefined>> = {
  unico: undefined,
  "sin-ejecucion": "Subagentes sin ejecución",
  "con-ejecucion": "Subagentes con ejecución",
};

/**
 * Ajustes → Motores locales: una pestaña por motor externo (Claude Code, Codex, OpenCode) con su
 * estado, su prueba y cómo iniciar sesión.
 *
 * **Lo que se pinta lo dice el servidor**: si está, con qué sesión, si se puede iniciar desde
 * aquí (`admiteLogin`) o abrir una consola (`admiteConsola`). Sin `alAccion` no hay ningún botón:
 * esta ejecución no los puede cumplir. Se mide al entrar y al VOLVER a la ventana, que es justo
 * lo que pasa cuando la persona vuelve del navegador con la sesión iniciada.
 */
export function MotoresLocales({
  motores,
  conectado,
  agentes,
  alAccion,
  modelosDeMotor,
  alPedirModelosDeMotor,
}: {
  motores?: readonly EstadoDeMotorLocal[];
  conectado: boolean;
  /** Los subagentes, para decir quién usa cada motor. */
  agentes?: readonly { nombre: string; motor: string }[];
  alAccion?: (accion: AccionDeMotorLocal) => void;
  /** Los modelos que lista cada motor (el mismo mensaje que el desplegable de un subagente). */
  modelosDeMotor?: ModelosDeMotor;
  alPedirModelosDeMotor?: (motor: string) => void;
}) {
  const [abierto, setAbierto] = useState<MotorLocal>("claude-code");
  useMedirAlVolver(alAccion !== undefined, alAccion === undefined ? undefined : () => alAccion({ accion: "medir" }));
  const medido = motores?.[0]?.medido;
  const refresco = useEsperaDeRefresco(medido, conectado);
  const estado = motores?.find((m) => m.motor === abierto);
  // Lo que la persona eligió manda; sin elegir, abierta mientras no conste una sesión.
  const [guiaElegida, setGuia] = useState<boolean | undefined>(undefined);
  const guiaAbierta = guiaElegida ?? estado?.conSesion !== true;
  const usan = (agentes ?? []).filter((a) => a.motor === abierto).map((a) => a.nombre);

  return (
    <>
      <h2 className={estilos.encabezado}>Motores locales</h2>
      <p className={estilos.nota}>
        Los subagentes con motor Claude Code, Codex u OpenCode usan el programa de este equipo con tu propia
        sesión. Aquí se ve si está listo, se inicia la sesión y se prueba que contesta.
      </p>

      <div className={estilos.pestanas} role="tablist" aria-label="Motores">
        {MOTORES.map((m) => {
          const e = motores?.find((x) => x.motor === m);
          const listo = e?.instalado === "ok" && e.conSesion !== false;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              className={estilos.pestana}
              aria-selected={m === abierto}
              data-actual={m === abierto ? "" : undefined}
              onClick={() => {
                setAbierto(m);
                setGuia(undefined);
              }}
            >
              {NOMBRE_DE_MOTOR[m]}
              {e === undefined ? null : <span className={estilos.punto} data-listo={listo ? "" : undefined} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={NOMBRE_DE_MOTOR[abierto]}>
        {estado === undefined ? (
          <p className={estilos.vacio}>
            {alAccion === undefined || motores?.length === 0
              ? "Esta ejecución no puede comprobar los motores locales."
              : "Comprobando este equipo…"}
          </p>
        ) : (
          <Tarjeta
            estado={estado}
            conectado={conectado}
            {...(alAccion === undefined ? {} : { alAccion })}
            {...(modelosDeMotor?.[estado.motor] === undefined ? {} : { modelos: modelosDeMotor[estado.motor] })}
            {...(alPedirModelosDeMotor === undefined ? {} : { alPedirModelos: alPedirModelosDeMotor })}
          />
        )}

        {usan.length === 0 ? null : (
          <p className={estilos.nota}>
            Lo usan: {usan.join(", ")}.
          </p>
        )}

        {alAccion === undefined ? null : (
          <div className={estilos.acciones}>
            <button
              type="button"
              className={estilos.boton}
              disabled={!conectado || refresco.esperando}
              onClick={() => {
                refresco.empezar();
                alAccion({ accion: "medir" });
              }}
            >
              {refresco.esperando ? "Comprobando…" : "Volver a comprobar"}
            </button>
          </div>
        )}

        {/* Abierta mientras no conste una sesión, que es cuando hace falta. Lo plegado se
            DESMONTA (no un `<details>`, que solo lo esconde). */}
        <button
          type="button"
          className={estilos.plegable}
          aria-expanded={guiaAbierta}
          onClick={() => setGuia(!guiaAbierta)}
        >
          {guiaAbierta ? "▾" : "▸"} Paso a paso para hacerlo a mano
        </button>
        {!guiaAbierta ? null : (
          <ol className={estilos.guia}>
            {GUIA_DE_INICIO[abierto].map((paso) => (
              <li key={paso.texto}>
                {paso.texto}
                {paso.comando === undefined ? null : <code className={estilos.comando}>{paso.comando}</code>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function Tarjeta({
  estado,
  conectado,
  alAccion,
  modelos,
  alPedirModelos,
}: {
  estado: EstadoDeMotorLocal;
  conectado: boolean;
  alAccion?: (accion: AccionDeMotorLocal) => void;
  modelos?: ModelosDeMotor[string];
  alPedirModelos?: (motor: string) => void;
}) {
  const motor = estado.motor;
  const [codigo, setCodigo] = useState("");
  // «Probando…» desde el clic hasta que el servidor lo dice él (`probando`) o llega otra prueba.
  const pulsado = useEsperaDeRefresco(estado.probando ?? estado.pruebas?.[0]?.medido, conectado);
  const probando = estado.probando === true || pulsado.esperando;
  const login = estado.login;
  const esperandoLogin = login?.fase === "esperando";

  return (
    <div className={estilos.tarjeta}>
      <dl className={estilos.datos}>
        <dt>Programa</dt>
        <dd>
          {estado.instalado === "ok"
            ? `Listo${estado.version === undefined ? "" : ` · versión ${estado.version}`}`
            : estado.instalado === "no-encontrado"
              ? "No está instalado"
              : "No arranca"}
          {estado.instalado !== "ok" && estado.detalle !== undefined ? <span className={estilos.detalle}> — {estado.detalle}</span> : null}
        </dd>
        {estado.instalado !== "ok" ? null : (
          <>
            <dt>Sesión</dt>
            <dd data-estado={estado.conSesion === true ? "ok" : estado.conSesion === false ? "falta" : undefined}>
              {estado.sesion ?? (estado.conSesion === undefined ? "No se puede leer desde aquí: lo dirá la prueba" : "—")}
              {estado.detalle === undefined ? null : <span className={estilos.detalle}> — {estado.detalle}</span>}
            </dd>
          </>
        )}
      </dl>

      {estado.admiteModelo === true && estado.instalado === "ok" ? (
        <SelectorDeModelo
          estado={estado}
          conectado={conectado}
          {...(modelos === undefined ? {} : { modelos })}
          {...(alAccion === undefined ? {} : { alAccion })}
          {...(alPedirModelos === undefined ? {} : { alPedirModelos })}
        />
      ) : null}

      {estado.conClave === true ? (
        <p className={estilos.aviso}>
          XOneCode tiene guardada una clave de API de Anthropic. Los subagentes de Claude Code <em>sin ejecución</em> la
          usarán —y se facturará a esa clave— en vez de tu sesión; los que tienen ejecución usan tu sesión.
        </p>
      ) : null}

      {estado.pruebas === undefined || estado.pruebas.length === 0 ? null : (
        <ul className={estilos.pruebas}>
          {estado.pruebas.map((p) => (
            <li key={p.camino} data-ok={p.ok ? "" : undefined}>
              <span aria-hidden="true">{p.ok ? "✓" : "✕"}</span>{" "}
              {CAMINO[p.camino] === undefined ? null : <strong>{CAMINO[p.camino]}: </strong>}
              {p.detalle}
              <span className={estilos.hora}>
                {" "}
                {(p.ms / 1000).toLocaleString("es", { maximumFractionDigits: 1 })} s · {horaDe(p.medido)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {login === undefined || login.fase === "esperando" ? null : (
        <p className={estilos.resultadoDeLogin} data-ok={login.fase === "hecho" ? "" : undefined}>
          {login.fase === "hecho"
            ? "Sesión iniciada."
            : login.fase === "cancelado"
              ? "Inicio de sesión cancelado."
              : `No se pudo iniciar sesión${login.detalle === undefined ? "." : `: ${login.detalle}`}`}
        </p>
      )}

      {esperandoLogin && alAccion !== undefined ? (
        <div className={estilos.login}>
          <p>
            Se ha abierto el navegador en este equipo: entra con tu cuenta y vuelve aquí. Si la web te enseña un
            código al terminar, pégalo abajo.
          </p>
          <form
            className={estilos.filaDeCodigo}
            onSubmit={(e) => {
              e.preventDefault();
              if (codigo.trim() === "") return;
              alAccion({ accion: "codigo", motor, codigo });
              setCodigo("");
            }}
          >
            <input
              type="text"
              value={codigo}
              aria-label="Código de inicio de sesión"
              placeholder="Código de la web (si te lo pide)"
              autoComplete="off"
              spellCheck={false}
              disabled={!conectado}
              onChange={(e) => setCodigo(e.target.value)}
            />
            <button type="submit" className={estilos.boton} disabled={!conectado || codigo.trim() === ""}>
              Enviar código
            </button>
          </form>
          <div className={estilos.acciones}>
            <button type="button" className={estilos.boton} disabled={!conectado} onClick={() => alAccion({ accion: "navegador", motor })}>
              Volver a abrir el navegador
            </button>
            <button type="button" className={estilos.boton} disabled={!conectado} onClick={() => alAccion({ accion: "cancelar", motor })}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {alAccion === undefined || esperandoLogin ? null : (
        <div className={estilos.acciones}>
          {/* Con sesión NO se ofrece: `auth login` reemplaza la sesión de TODOS los Claude Code de
              este equipo —también el que la persona usa a mano—, la misma razón por la que no hay
              «Cerrar sesión». Cambiar de cuenta queda en la guía, a sabiendas. */}
          {estado.admiteLogin === true && estado.conSesion !== true ? (
            <>
              <button
                type="button"
                className={estilos.primario}
                disabled={!conectado}
                title="Abre el navegador para entrar con tu cuenta de Claude (Pro, Max, Team…)"
                onClick={() => alAccion({ accion: "login", motor, modo: "claudeai" })}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className={estilos.boton}
                disabled={!conectado}
                title="Entrar con una cuenta de la Consola de Anthropic: se paga por uso"
                onClick={() => alAccion({ accion: "login", motor, modo: "console" })}
              >
                Con la Consola de Anthropic
              </button>
            </>
          ) : null}
          {estado.admiteConsola === true && estado.conSesion !== true ? (
            <button
              type="button"
              className={estilos.boton}
              disabled={!conectado}
              title="Abre una terminal de este equipo con el comando de inicio de sesión ya escrito"
              onClick={() => alAccion({ accion: "consola", motor })}
            >
              Abrir consola de inicio de sesión
            </button>
          ) : null}
          {estado.instalado !== "ok" ? null : (
            <button
              type="button"
              className={clsx(estilos.boton, estilos.exito)}
              disabled={!conectado || probando}
              title="Le manda un mensaje de verdad y espera su respuesta"
              onClick={() => {
                pulsado.empezar();
                alAccion({ accion: "probar", motor });
              }}
            >
              {probando ? "Probando…" : "Probar"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * El modelo de un motor que lo necesita (OpenCode): la lista la contesta el propio motor
 * (`opencode models`), agrupada por proveedor, y lo elegido lo GUARDA el servidor. Sin elegir,
 * OpenCode coge solo uno de su tier gratuito, que no contesta desde aquí (medido): por eso el
 * aviso. No se filtra por nombre: medido, `opencode/big-pickle` falla y un `-free` de otro
 * proveedor contesta; lo que no vale es el proveedor `opencode` sin credencial suya.
 */
function SelectorDeModelo({
  estado,
  conectado,
  modelos,
  alAccion,
  alPedirModelos,
}: {
  estado: EstadoDeMotorLocal;
  conectado: boolean;
  modelos?: ModelosDeMotor[string];
  alAccion?: (accion: AccionDeMotorLocal) => void;
  alPedirModelos?: (motor: string) => void;
}) {
  const motor = estado.motor;
  const faltaLista = modelos === undefined;
  useEffect(() => {
    if (faltaLista && conectado) alPedirModelos?.(motor);
  }, [faltaLista, conectado, alPedirModelos, motor]);
  const ids = (modelos?.modelos ?? []).map((m) => m.id);
  // El guardado se enseña aunque el motor ya no lo liste: esconderlo diría «sin elegir».
  if (estado.modelo !== undefined && !ids.includes(estado.modelo)) ids.unshift(estado.modelo);
  const grupos = new Map<string, string[]>();
  for (const id of ids) {
    const proveedor = id.includes("/") ? id.slice(0, id.indexOf("/")) : "";
    grupos.set(proveedor, [...(grupos.get(proveedor) ?? []), id]);
  }
  return (
    <div className={estilos.modelo}>
      <label>
        <span>Modelo</span>
        <select
          value={estado.modelo ?? ""}
          aria-label={`Modelo de ${NOMBRE_DE_MOTOR[motor]}`}
          disabled={!conectado || alAccion === undefined || faltaLista}
          onChange={(e) => {
            const modelo = e.target.value;
            alAccion?.(modelo === "" ? { accion: "modelo", motor } : { accion: "modelo", motor, modelo });
          }}
        >
          <option value="">{faltaLista ? "Pidiendo la lista…" : "— Sin elegir —"}</option>
          {[...grupos].map(([proveedor, lista]) => (
            <optgroup key={proveedor} label={proveedor === "" ? "Otros" : proveedor}>
              {lista.map((id) => (
                <option key={id} value={id}>
                  {id.slice(proveedor.length === 0 ? 0 : proveedor.length + 1)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {modelos?.error === undefined ? null : <p className={estilos.detalle}>No se pudo leer la lista: {modelos.error}</p>}
      <p className={estilos.nota}>
        {estado.modelo === undefined
          ? "Sin modelo elegido, OpenCode usa uno de su tier gratuito, que solo funciona dentro de su propia consola. "
          : ""}
        Elige uno de un proveedor con tu cuenta (por ejemplo, opencode-go si tienes OpenCode Go); los del proveedor
        «opencode» sin credencial suya no contestan desde aquí. Lo usan la prueba y los subagentes sin modelo propio.
      </p>
    </div>
  );
}

/** La hora de una medida. Si no se puede leer, no se pinta: nada de «Invalid Date». */
function horaDe(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}
