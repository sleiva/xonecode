import estilos from "./SinProyectoAbierto.module.css";

/**
 * El centro mientras no hay proyecto abierto: ni cabecera de sesión, ni transcript, ni
 * compositor — nada de eso tiene sentido sin un proyecto detrás. El paso de proyecto
 * salió del alta (cambio de rumbo del usuario): ahora se elige en la barra lateral
 * (`Barra.tsx`, entorno → proyectos → sesiones), y esto es lo que se ve mientras tanto.
 *
 * Abrir un proyecto DESDE la barra no está cableado todavía —`App.tsx` lo declara donde
 * monta `Barra`—: el servidor pide una rama para abrir uno
 * (`vestibulo.ts#completarProyecto`), y construir un selector de ramas en la barra es
 * trabajo aparte. Este texto no lo esconde detrás de un «cargando» genérico.
 */
export function SinProyectoAbierto() {
  return (
    <div className={estilos.espera}>
      <p className={estilos.texto}>Elige un proyecto en la barra lateral para empezar.</p>
    </div>
  );
}
