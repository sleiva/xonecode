import clsx from "clsx";
import estilos from "./Cabecera.module.css";

/**
 * La cabecera de la sesión: título y estado de conexión.
 *
 * No lleva más que eso hoy porque no hay más que eso: el registro de entornos/proyectos/
 * sesiones (`vestibulo.ts` en el servidor) todavía no manda nada por el cable —el único
 * mensaje nuevo de esta tarea es `comandos`—, así que un título de proyecto o de rama
 * aquí sería un dato inventado, el mismo bug mudo que este repo persigue en los alias de
 * color. `App.tsx` pasa lo que hoy tiene: el título de la sesión y si el SSE sigue vivo.
 */
export function Cabecera({ titulo, conectado }: { titulo: string; conectado: boolean }) {
  return (
    <header className={estilos.cabecera}>
      <h1 className={estilos.titulo}>{titulo}</h1>
      <span className={clsx(estilos.estado, conectado ? estilos.conectado : estilos.desconectado)}>
        <span className={estilos.punto} aria-hidden="true" />
        {conectado ? "conectado" : "sin conexión"}
      </span>
    </header>
  );
}
