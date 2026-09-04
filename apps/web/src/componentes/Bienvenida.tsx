import estilos from "./Bienvenida.module.css";

/**
 * El saludo de arriba del todo, antes de cualquier paso del alta. `nombre` viaja YA
 * resuelto en el mensaje del alta (`web/servidor/vestibulo.ts#nombreDePersona` — git
 * config, o el usuario del sistema, o nada): este componente no adivina ni inventa un
 * nombre genérico si no lo hay ("Hola, usuario" sería peor que ningún nombre, porque
 * parece uno de verdad y no lo es). Sin `nombre`, el saludo se queda en «Hola» a secas
 * — ni una coma ni un espacio de más colgando.
 */
export function Bienvenida({ nombre }: { nombre?: string }) {
  return (
    <div className={estilos.bienvenida}>
      <p className={estilos.saludo}>{nombre === undefined ? "Hola" : `Hola, ${nombre}`}</p>
      <p className={estilos.texto}>
        Esto es xonecode. Antes de empezar hace falta el modelo con el que vas a trabajar y
        el entorno de CloudStudio de tu proyecto — solo hace falta una vez.
      </p>
    </div>
  );
}
