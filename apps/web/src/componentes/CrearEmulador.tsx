import { useEffect, useState } from "react";
import { motivoDeNombreDeAvdInaceptable } from "../reglasDeAvd.js";
import type { EstadoDelCliente } from "../store.js";
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
 */
export function CrearEmulador({
  avds,
  conectado,
  alCrear,
  progreso,
}: {
  /** Los AVD que ya existen, para no repetir un nombre. */
  avds: readonly string[];
  conectado?: boolean;
  alCrear: (nombre: string) => void;
  /** El `instalacion` del store YA filtrado a `crear-avd` (lo filtra quien monta). Ausente = ninguno. */
  progreso?: EstadoDelCliente["instalacion"];
}) {
  const [nombre, setNombre] = useState("");
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
          onClick={() => alCrear(nombre.trim())}
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
