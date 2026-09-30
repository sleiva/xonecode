import { useEffect, useState } from "react";
import { motivoDeNombreDeAvdInaceptable } from "../reglasDeAvd.js";
import type { EstadoDelCliente } from "../store.js";
import { Desplegable } from "./Desplegable.js";
import estilos from "./CrearEmulador.module.css";

const TEXTO_DE_ESTADO: Record<NonNullable<EstadoDelCliente["instalacion"]>["estado"], string> = {
  corriendo: "En curso",
  ok: "Creado",
  fallo: "Falló",
  cancelada: "Cancelado",
  colgada: "Sin respuesta",
};

/**
 * «Crear emulador»: un nombre y un botón. El servidor decide (y crea con `avdmanager`); aquí
 * solo se COMPRUEBA antes con las mismas reglas del host, porque su negativa no llega al
 * navegador (`reglasDeAvd.ts`). El progreso es el `instalacion` con `receta: "crear-avd"`,
 * que la ventana enseña como el de una receta: título, la cola del log y cómo acabó.
 *
 * **A partir de uno existente** cuando ya hay alguno: «Copia de» (la imagen, el perfil, la RAM y el
 * disco salen de la base, así que no se elige imagen) y una casilla para copiar también lo instalado.
 * Sin la casilla el nuevo arranca VACÍO con la misma configuración, y vale con la base encendida; con
 * ella se clona la carpeta y la base tiene que estar APAGADA (sus discos están bloqueados mientras
 * corre), así que encendida la casilla se desactiva y dice por qué. Sin ningún AVD, como siempre.
 */
export function CrearEmulador({
  avds,
  conectado,
  alCrear,
  progreso,
  enMarcha = [],
}: {
  /** Los AVD que ya existen, para no repetir un nombre. */
  avds: readonly string[];
  conectado?: boolean;
  alCrear: (nombre: string, desde?: { base: string; conDatos: boolean }) => void;
  /** Cuáles de esos AVD corren ahora (la última medida). Ausente = ninguno. */
  enMarcha?: readonly string[];
  /** El `instalacion` del store YA filtrado a `crear-avd` (lo filtra quien monta). Ausente = ninguno. */
  progreso?: EstadoDelCliente["instalacion"];
}) {
  const [nombre, setNombre] = useState("");
  const [baseElegida, setBase] = useState<string | undefined>(undefined);
  const [conDatosPedido, setConDatos] = useState(false);
  // Por omisión el primero; si el elegido ya no existe (se borró o se renombró) también.
  const base = baseElegida !== undefined && avds.includes(baseElegida) ? baseElegida : avds[0];
  const baseEncendida = base !== undefined && enMarcha.includes(base);
  // Con la base encendida la casilla se apaga Y deja de contar aunque estuviera marcada: lo que se
  // envía es lo que se ve.
  const conDatos = conDatosPedido && !baseEncendida;
  const propio = progreso;
  // Creado bien: el nombre ya es un AVD de la lista, y dejarlo puesto diría «ya existe».
  const terminado = propio?.estado === "ok";
  useEffect(() => {
    if (terminado) setNombre("");
  }, [terminado]);
  const creando = propio?.estado === "corriendo";
  const motivo = motivoDeNombreDeAvdInaceptable(nombre.trim(), avds);
  // Con el campo vacío no se regaña: el botón apagado ya lo dice y «falta el nombre» sobra.
  const aviso = nombre.trim() === "" ? undefined : motivo;
  return (
    <div className={estilos.envoltura}>
      <h4 className={estilos.titulo}>Nuevo emulador</h4>
      {base === undefined ? null : (
        <>
          <label className={estilos.campo}>
            <span>Copia de:</span>
            <Desplegable
              value={base}
              aria-label="Emulador del que copiar"
              disabled={conectado !== true || creando}
              onChange={(e) => setBase(e.target.value)}
            >
              {avds.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Desplegable>
          </label>
          <label className={estilos.campo}>
            <input
              type="checkbox"
              checked={conDatos}
              disabled={conectado !== true || creando || baseEncendida}
              onChange={(e) => setConDatos(e.target.checked)}
            />
            <span>Copiar también lo instalado (framework y apps)</span>
            {baseEncendida ? <span className={estilos.motivo}>apágalo para clonarlo</span> : null}
          </label>
        </>
      )}
      <div className={estilos.fila}>
        <input
          type="text"
          value={nombre}
          placeholder="Nombre del emulador"
          aria-label="Nombre del emulador nuevo"
          aria-invalid={aviso === undefined ? undefined : true}
          disabled={conectado !== true || creando}
          onChange={(e) => setNombre(e.target.value)}
        />
        <button
          type="button"
          className={estilos.boton}
          disabled={conectado !== true || creando || motivo !== undefined}
          title="Crea un emulador de Android nuevo"
          onClick={() => (base === undefined ? alCrear(nombre.trim()) : alCrear(nombre.trim(), { base, conDatos }))}
        >
          {creando ? "Creando…" : "Crear emulador"}
        </button>
      </div>
      {aviso === undefined ? null : <span className={estilos.motivo}>{aviso}</span>}
      {propio === undefined ? null : (
        <>
          <p className={estilos.estado} data-estado={propio.estado}>
            {propio.titulo === "" ? TEXTO_DE_ESTADO[propio.estado] : `${propio.titulo} · ${TEXTO_DE_ESTADO[propio.estado]}`}
            {propio.motivo === undefined ? null : `: ${propio.motivo}`}
          </p>
          {propio.lineas.length === 0 ? null : <pre className={estilos.log}>{propio.lineas.slice(-5).join("\n")}</pre>}
        </>
      )}
    </div>
  );
}
