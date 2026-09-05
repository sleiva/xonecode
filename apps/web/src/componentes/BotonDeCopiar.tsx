import { useEffect, useRef, useState } from "react";
import { IconCheckOutline16, IconCopyOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./BotonDeCopiar.module.css";

/**
 * Copiar al portapapeles, con el icono del harness de DeepSeek
 * (`IconCopyOutline16` → `IconCheckOutline16`) en vez de la palabra «Copiar».
 *
 * Los iconos son los del paquete, no unos dibujados a mano: es la misma pareja que su propio
 * `JsonTree` usa para esto (`copyState === "copied" ? check : copy`), así que el gesto se
 * reconoce igual en toda la interfaz.
 *
 * **El acuse dura y luego se va.** Un botón que copia y no dice nada deja al usuario
 * pulsando otra vez por si acaso; uno que se queda en «hecho» para siempre miente en cuanto
 * pasan diez segundos. Dos segundos, y el temporizador se limpia al desmontar — si no, un
 * `setState` sobre un componente que ya no está avisa por consola y, peor, mantiene vivo el
 * cierre.
 *
 * **Un fallo al copiar se DICE.** `navigator.clipboard` no existe fuera de un contexto
 * seguro y puede estar denegado por permisos: quedarse callado sería prometer una copia que
 * no ocurrió. Y el título cambia, que es lo que un lector de pantalla anuncia.
 */
export function BotonDeCopiar({ texto, etiqueta = "Copiar" }: { texto: string; etiqueta?: string }) {
  const [estado, setEstado] = useState<"quieto" | "copiado" | "fallo">("quieto");
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const copiar = async (): Promise<void> => {
    clearTimeout(temporizador.current);
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
    } catch {
      setEstado("fallo");
    }
    temporizador.current = setTimeout(() => setEstado("quieto"), 2000);
  };

  const titulo = estado === "copiado" ? "Copiado" : estado === "fallo" ? "No se pudo copiar" : etiqueta;
  return (
    <button
      type="button"
      className={estilos.boton}
      data-estado={estado}
      title={titulo}
      aria-label={titulo}
      onClick={() => void copiar()}
    >
      {estado === "copiado" ? <IconCheckOutline16 size={14} /> : <IconCopyOutline16 size={14} />}
    </button>
  );
}
