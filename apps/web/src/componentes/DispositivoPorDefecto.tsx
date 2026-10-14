import type { Dispositivo, DispositivoElegido } from "../tipos.js";
import { Desplegable } from "./Desplegable.js";
import estilos from "./Ajustes.module.css";

const CLASE: Record<DispositivoElegido["clase"], string> = {
  emulador: "emulador",
  simulador: "simulador",
  fisico: "móvil físico",
};

function rotulo(d: DispositivoElegido): string {
  return `${d.nombre} (${CLASE[d.clase]} ${d.plataforma === "android" ? "Android" : "iOS"})`;
}

/**
 * Con qué aparato NACEN las conversaciones nuevas y las tareas (IXCODE-51, Ajustes > General).
 *
 * Sin él, una sesión nueva no tiene aparato y los scripts del agente prefieren un emulador: con
 * un móvil enchufado, cada conversación nueva y cada tarea acababan en el emulador hasta que
 * alguien cambiaba la pastilla.
 *
 * La lista es la de la última MEDIDA, y se manda solo el ID: el resto lo pone el servidor. El
 * elegido que ya no está en la medida (un móvil desenchufado) se sigue enseñando, marcado, en
 * vez de desaparecer de la lista como si no estuviera guardado. Sin medida todavía no se marca:
 * «no conectado» sería afirmar algo que nadie ha medido.
 */
export function DispositivoPorDefecto({
  actual,
  medidos,
  activo,
  alElegir,
}: {
  actual?: DispositivoElegido;
  medidos?: readonly Dispositivo[];
  activo: boolean;
  alElegir: (id: string | undefined) => void;
}) {
  const lista = medidos ?? [];
  const fuera = actual !== undefined && !lista.some((d) => d.id === actual.id);
  const sinMedir = medidos === undefined;
  return (
    <>
      <label className={estilos.filaDeWorkspace}>
        <span className={estilos.etiquetaDeWorkspace}>Aparato</span>
        <Desplegable
          value={actual?.id ?? ""}
          disabled={!activo}
          onChange={(e) => {
            const id = e.currentTarget.value;
            if (id !== (actual?.id ?? "")) alElegir(id === "" ? undefined : id);
          }}
        >
          <option value="">Ninguno (si hay un emulador, ése)</option>
          {fuera ? <option value={actual.id}>{sinMedir ? rotulo(actual) : `${rotulo(actual)}, no conectado ahora`}</option> : null}
          {lista.map((d) => (
            <option key={d.id} value={d.id}>
              {rotulo(d)}
            </option>
          ))}
        </Desplegable>
      </label>
      <p className={estilos.nota}>
        El aparato con el que empieza cada conversación nueva y cada tarea, en cualquier proyecto. En cada
        conversación se puede cambiar en la pastilla del chat. Si no está conectado al empezar, la
        conversación lo sigue teniendo elegido y lo dice al ejecutar, en vez de pasarse a otro.
      </p>
    </>
  );
}
