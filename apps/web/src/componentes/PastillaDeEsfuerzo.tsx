import { useCallback, useRef, useState } from "react";
import { useCerrarAlPulsarFuera } from "../cerrarAlPulsarFuera.js";
import type { Esfuerzo } from "../tipos.js";
import estilos from "./PastillaDeModelo.module.css";

/**
 * Cuánto tiene que PENSAR el modelo de esta sesión, al lado de la pastilla del modelo.
 *
 * Comparte la hoja de estilos con `PastillaDeModelo` —igual que `PastillaDeDispositivo`—
 * porque es el mismo objeto: una elección de la sesión que decide el servidor y el cliente
 * pinta. Una hoja propia solo serviría para que las tres pastillas de la misma fila
 * divergieran.
 *
 * Cuatro reglas, y ninguna es de forma:
 *
 * - **Sin niveles no se pinta.** `niveles` ausente o vacío significa que el modelo en vigor
 *   no admite que se le pida esfuerzo, y ahí un desplegable apagado sería peor que nada: la
 *   mitad de los modelos de este harness no lo admiten, y un control permanentemente inerte
 *   enseña a ignorar la fila entera. Es la misma regla que ya cumplen la pastilla del
 *   modelo (que no aparece hasta que llega el estado) y el contador de tokens.
 * - **Los niveles vienen DADOS, no se inventan aquí.** Son los que la tabla de `core/` dice
 *   que admite ESE modelo, y no son tres fijos: Anthropic tiene cinco desde Opus 4.7,
 *   Gemini tres, y DeepSeek tres que no son los mismos tres —`low`, `high` y `max`, porque
 *   colapsa `medium` sobre `high`—. Pintar low/medium/high siempre daría, en DeepSeek, dos
 *   opciones que hacen lo mismo sin decirlo.
 * - **El valor se enseña como lo nombra la API** (`low`, `xhigh`), en vez de traducirlo:
 *   son el vocabulario del proveedor y lo que viaja por el cable, y «muy alto» sería un
 *   término que no existe en ninguna documentación que el usuario pueda consultar.
 * - **«Sin fijar» no es «automático»**, y por eso se llama así. Significa que no se manda el
 *   parámetro, y lo que hace el modelo entonces depende de él: en Anthropic omitirlo ya es
 *   `high`, y en Ollama depende del template. Llamarlo «auto» prometería una decisión que
 *   no toma nadie.
 */
export function PastillaDeEsfuerzo({
  niveles,
  actual,
  conectado = true,
  nota,
  alElegir,
}: {
  /**
   * Lo que admite el modelo en vigor. Ausente o vacío = no se pinta la pastilla.
   *
   * Se acepta el vacío además de la ausencia porque el servidor puede mandar una lista sin
   * elementos y las dos cosas significan lo mismo para quien mira: no hay nada que elegir.
   */
  niveles?: readonly Esfuerzo[];
  /** El de la sesión. Ausente = no se manda el parámetro. */
  actual?: Esfuerzo;
  conectado?: boolean;
  /**
   * Lo que hay que decir de ESTE modelo y que la lista no cuenta.
   *
   * Existe por Ollama: su servidor valida los cuatro niveles, pero que los acepte no
   * significa que el modelo los honre —medido, en `glm-5.3-flash:cloud` el `high` se
   * comporta como apagado—. Callarlo haría que la pastilla afirmara una escala que ahí no
   * existe. Ausente = no hay nada que advertir, que es el caso de Gemini y Anthropic.
   */
  nota?: string;
  /** El nivel, o `undefined` para dejar de mandarlo. */
  alElegir: (nivel: Esfuerzo | undefined) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const envoltura = useRef<HTMLDivElement>(null);
  const cerrarMenu = useCallback(() => setAbierta(false), []);
  // El hook va SIEMPRE, antes de cualquier return: las reglas de hooks no admiten que
  // desaparezca cuando la pastilla no se pinta.
  useCerrarAlPulsarFuera(abierta, envoltura, cerrarMenu);

  if (niveles === undefined || niveles.length === 0) return null;

  const elegir = (nivel: Esfuerzo | undefined): void => {
    setAbierta(false);
    alElegir(nivel);
  };

  return (
    <div className={estilos.envoltura} ref={envoltura}>
      <button
        type="button"
        className={estilos.pastilla}
        aria-expanded={abierta}
        aria-haspopup="menu"
        disabled={!conectado}
        title="Cuánto razona el modelo antes de contestar"
        onClick={() => setAbierta((v) => !v)}
      >
        {actual ?? "esfuerzo"}
      </button>
      {abierta ? (
        <div className={estilos.menu} role="menu" aria-label="esfuerzo de razonamiento">
          <div className={estilos.titulo} role="presentation">
            Esfuerzo de razonamiento
          </div>
          <div className={estilos.modelos}>
            <button
              type="button"
              role="menuitem"
              className={estilos.modelo}
              data-actual={actual === undefined ? "" : undefined}
              {...(actual === undefined ? { "aria-current": "true" as const } : {})}
              onClick={() => elegir(undefined)}
            >
              Sin fijar
            </button>
            {niveles.map((nivel) => (
              <button
                key={nivel}
                type="button"
                role="menuitem"
                className={estilos.modelo}
                data-actual={nivel === actual ? "" : undefined}
                {...(nivel === actual ? { "aria-current": "true" as const } : {})}
                onClick={() => elegir(nivel)}
              >
                {nivel}
              </button>
            ))}
          </div>
          <p className={estilos.espera}>
            {nota ?? "Se guarda con la sesión. Sin fijar, decide el modelo."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
