import { useEffect, useState } from "react";
import type { Dispositivo } from "../tipos.js";
import estilos from "./VerificarDispositivo.module.css";

/**
 * Verificar la conexión con UN dispositivo: el botón y lo que contestó.
 *
 * **Una sola pieza para las dos vistas** —el panel «Tu equipo» del escritorio y la lista de
 * Ajustes → Dispositivos—, que es el patrón de `QuienEjecutaTareas` y `EntregaDeTarea`: el
 * mismo gesto en dos sitios con dos aspectos es cómo se acaba con dos comportamientos.
 *
 * Y responde a otra pregunta que la fila donde vive, que es la razón de que exista:
 * - **La fila es la FOTO** (`adb devices`, `simctl list`) y dice lo que el intermediario
 *   creía cuando se midió. Puede tener diez minutos.
 * - **Esto es AHORA**, y hablando con el dispositivo: `adb shell` en un Android, un proceso
 *   dentro del simulador en iOS. Un teléfono que `adb devices` lista como «device» y cuyo
 *   `adb shell` no contesta es exactamente lo que esto distingue — y medido: `simctl getenv`
 *   contesta de un simulador APAGADO, así que listar no vale como comprobación de nada.
 *
 * Por eso se ofrece en TODAS las filas, incluidas las apagadas: la respuesta «sigue apagado»
 * es información nueva sobre una foto vieja, y arrancar un simulador a mano entre medias es
 * justo el caso en que la foto miente sin que nadie pueda saberlo.
 *
 * Sin `alVerificar` no se pinta ningún botón: esta ejecución no puede verificar, y un botón
 * que no puede cumplir es el botón muerto de siempre.
 */
export function VerificarDispositivo({
  dispositivo,
  conectado,
  medidoDeLaFoto,
  alVerificar,
}: {
  dispositivo: Dispositivo;
  conectado: boolean;
  /**
   * Cuándo se midió la FOTO en que vive esta fila. Sirve para lo de abajo: cuando la
   * verificación la contradice, decir cuál de las dos es más vieja. Ausente = no se sabe, y
   * entonces no se afirma nada de las dos.
   */
  medidoDeLaFoto?: string;
  alVerificar?: (id: string) => void;
}) {
  // «Verificando…» desde que se pulsa hasta que llega una respuesta NUEVA. Se suelta al
  // cambiar `medido` —la marca de que esta verificación es otra— y al caerse el cable: un
  // indicador encendido para siempre es peor que no tenerlo, la misma regla que
  // `pedidoDeApertura`.
  const [verificando, setVerificando] = useState(false);
  const medido = dispositivo.verificado?.medido;
  useEffect(() => setVerificando(false), [medido]);
  useEffect(() => {
    if (!conectado) setVerificando(false);
  }, [conectado]);

  const v = dispositivo.verificado;
  /**
   * **La verificación puede CONTRADECIR a la fila, y entonces hay que decirlo.** Medido en
   * pantalla: se arranca un simulador a mano, se pulsa Verificar, y la fila queda leyéndose
   * «apagado · ✓ responde» — que parece un fallo de la ventana cuando es exactamente lo que
   * esto viene a distinguir. Se dice cuál es más vieja, y solo cuando discrepan: escribirlo
   * en las 35 filas sería ruido en el caso en que las dos dicen lo mismo.
   */
  const alcanzable = dispositivo.estado === "conectado" || dispositivo.estado === "arrancado";
  const discrepa = v !== undefined && medidoDeLaFoto !== undefined && v.ok !== alcanzable && v.medido > medidoDeLaFoto;
  return (
    <span className={estilos.envoltura}>
      {v === undefined ? null : (
        <span className={estilos.resultado} data-ok={v.ok ? "" : undefined}>
          <span aria-hidden="true">{v.ok ? "✓" : "✕"}</span>
          {/* El detalle con palabras y no solo el icono: quien usa un lector de pantalla
              necesita el motivo, que además es lo único accionable de un fallo. */}
          <span>{v.detalle}</span>
          <span className={estilos.hora}>{horaDe(v.medido)}</span>
          {!discrepa ? null : <span className={estilos.desfase}>la lista es de las {horaDe(medidoDeLaFoto!)}</span>}
        </span>
      )}
      {alVerificar === undefined ? null : (
        <button
          type="button"
          className={estilos.boton}
          disabled={!conectado || verificando}
          // Lo que el botón hace de verdad, para quien se pare encima: hablar con el
          // aparato, no releer la lista.
          title={`Habla con ${dispositivo.nombre} y espera respuesta`}
          onClick={() => {
            setVerificando(true);
            alVerificar(dispositivo.id);
          }}
        >
          {verificando ? "Verificando…" : "Verificar"}
        </button>
      )}
    </span>
  );
}

/** La hora de la verificación. Si no se puede leer, no se pinta: nada de «Invalid Date». */
function horaDe(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
