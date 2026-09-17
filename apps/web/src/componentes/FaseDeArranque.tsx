import estilos from "./FaseDeArranque.module.css";

/**
 * Qué está haciendo el arranque, dicho en el lienzo.
 *
 * El usuario pidió no entrar al Escritorio hasta que todo esté preparado —sesión MCP
 * abierta, proyectos listados—, y esa espera es real: medida en su máquina, con CloudStudio
 * caliente, un segundo y medio. Una espera de ese tamaño sin decir nada se lee como una
 * pantalla colgada, así que se cuenta: es la misma regla que el resto del harness, donde lo
 * que se sabe se dice.
 *
 * El texto lo REDACTA el servidor (`preparando` del mensaje `alta`) porque es quien sabe a
 * qué entorno está llamando; aquí no se compone ninguna frase ni se traduce ningún código de
 * fase. Sin `preparando` este componente no se monta: `App.tsx` lo decide, y así «listo» es
 * la ausencia del dato y no una cadena vacía que haya que interpretar.
 *
 * `role="status"` con `aria-live="polite"`: es un estado que cambia solo, y quien navega con
 * lector de pantalla tiene que enterarse de que se está trabajando sin que le interrumpa.
 * El punto va con `aria-hidden` — es el latido, no información.
 */
export function FaseDeArranque({ texto }: { texto: string }) {
  return (
    <p className={estilos.fase} role="status" aria-live="polite">
      <span className={estilos.punto} aria-hidden="true" />
      {texto}
    </p>
  );
}
