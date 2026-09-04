import clsx from "clsx";
import estilos from "./Barra.module.css";

export interface Proyecto { id: string; nombre: string; sesiones: { id: string; titulo: string; historica: boolean }[] }

export function Barra({ entornos, entornoActivo, proyectos, sesionActiva, alElegirEntorno, alAbrirSesion }: {
  entornos: { id: string; nombre: string }[];
  entornoActivo: string;
  proyectos: Proyecto[];
  sesionActiva?: string;
  alElegirEntorno: (id: string) => void;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
}) {
  return (
    <nav className={estilos.barra}>
      <select className={estilos.entorno} value={entornoActivo} onChange={(e) => alElegirEntorno(e.target.value)}>
        {entornos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </select>
      <ul className={estilos.proyectos}>
        {proyectos.map((p) => (
          <li key={p.id}>
            <span className={estilos.proyecto}>{p.nombre}</span>
            <ul className={estilos.sesiones}>
              {p.sesiones.map((s) => (
                <li key={s.id}>
                  <button
                    className={clsx(estilos.sesion, s.historica && estilos.historica, s.id === sesionActiva && estilos.activa)}
                    onClick={() => alAbrirSesion(p.id, s.id)}
                  >
                    {s.titulo}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
