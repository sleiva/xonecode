import { useSyncExternalStore } from "react";
import type { crearStoreDelCliente } from "./store.js";
import type { Conexion } from "./conexion.js";
import { Maqueta } from "./componentes/Maqueta.js";
import { Barra } from "./componentes/Barra.js";
import { Cabecera } from "./componentes/Cabecera.js";
import { Compositor } from "./componentes/Compositor.js";
import { Transcript } from "./componentes/Transcript.js";
import { BarraDeEstado } from "./componentes/BarraDeEstado.js";
import { AvisoDeConexion } from "./componentes/AvisoDeConexion.js";

type Store = ReturnType<typeof crearStoreDelCliente>;

/**
 * La maqueta con datos: `App` es el ÚNICO componente que lee el store —por la costura
 * `suscribir`/`leer`, nunca importándolo dentro de un hijo—, y reparte props hacia abajo.
 * `store` y `enviar` entran INYECTADOS desde `main.tsx` (no se construye aquí un
 * `EventSource`) por lo mismo que documenta `conexion.ts`: jsdom no lo implementa, así
 * que un `new EventSource` a nivel de módulo de este fichero mataría cualquier test que
 * algún día monte `App`.
 */
export function App({ store, enviar }: { store: Store; enviar: Conexion["enviar"] }) {
  const estado = useSyncExternalStore(store.suscribir, store.leer);

  // El PRIMER acto de usuario, no el último: es la misma regla que titula una sesión en
  // disco (`web/servidor/sesiones.ts` — «titulo» se fija una vez y no se vuelve a tocar).
  // Dos reglas para el mismo título es cómo divergen — esta lo mira, no inventa una propia.
  const primerActoDeUsuario = estado.actos.find((a) => a.tipo === "usuario");

  // Las piezas de `BarraDeEstado`, derivadas del transcript a falta de un mensaje propio
  // del cable: ni `sistema` ni `EstadoDelCliente` llevan hoy `contexto`/`tope`
  // (`tipos.ts`, `store.ts`), así que esos dos quedan `undefined` — la misma postura de
  // «lista vacía, no dato inventado» que ya usa la `<Barra>` de abajo con `proyectos={[]}`.
  // «Turnos» cuenta actos `usuario`; «pasos» suma las líneas de los actos `herramientas`
  // —una racha COLAPSADA cuenta como una línea (`core/notify.ts`), así que esto cuenta
  // rachas visibles, no llamadas reales a tool—; el tiempo es el del ÚLTIMO turno
  // cerrado, no un acumulado de sesión.
  const turnos = estado.actos.filter((a) => a.tipo === "usuario").length;
  const pasos = estado.actos
    .filter((a) => a.tipo === "herramientas")
    .reduce((n, a) => n + a.lineas.length, 0);
  const ultimoFin = estado.actos
    .slice()
    .reverse()
    .find((a) => a.tipo === "fin");

  return (
    <Maqueta
      centro={
        <>
          <Cabecera
            titulo={primerActoDeUsuario?.texto ?? "xonecode"}
            conectado={estado.conectado}
          />
          <AvisoDeConexion conectado={estado.conectado} />
          <Transcript actos={estado.actos} />
          <Compositor
            comandos={estado.comandos}
            conectado={estado.conectado}
            // Una línea que empieza por «/» no tiene camino propio: viaja como prosa
            // igual que cualquier otra, y es `correrConsola` quien la despacha contra
            // `COMANDOS` (`cli/consola.ts:819`) del lado del servidor — así `/ayuda`,
            // `/modelo`, `/config` y `/sync` funcionan aquí sin ningún código nuevo.
            alEnviar={(texto) => void enviar({ clase: "prosa", texto })}
          />
          <BarraDeEstado turnos={turnos} pasos={pasos} ms={ultimoFin?.ms} />
        </>
      }
      barra={
        // Sin entornos/proyectos/sesiones que mostrar todavía: `vestibulo.ts` (servidor)
        // ya sabe construir esa jerarquía, pero ningún mensaje del cable la trae aquí —
        // esta tarea solo añadió `comandos`. Listas vacías en vez de datos inventados:
        // rellenarlas con un placeholder sería el mismo bug mudo que un alias de color
        // que no existe.
        <Barra
          entornos={[]}
          entornoActivo=""
          proyectos={[]}
          alElegirEntorno={() => {}}
          alAbrirSesion={() => {}}
        />
      }
    />
  );
}
