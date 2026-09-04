import { useEffect, useState, useSyncExternalStore } from "react";
import type { crearStoreDelCliente } from "./store.js";
import type { Conexion } from "./conexion.js";
import { Maqueta } from "./componentes/Maqueta.js";
import { Barra } from "./componentes/Barra.js";
import { Cabecera } from "./componentes/Cabecera.js";
import { Compositor } from "./componentes/Compositor.js";
import { Transcript } from "./componentes/Transcript.js";
import { BarraDeEstado } from "./componentes/BarraDeEstado.js";
import { AvisoDeConexion } from "./componentes/AvisoDeConexion.js";
import { Pregunta } from "./componentes/Pregunta.js";
import { Aprobacion } from "./componentes/Aprobacion.js";
import { Selector } from "./componentes/Selector.js";
import { Wizard } from "./componentes/Wizard.js";
import { PantallaDeArranque } from "./componentes/PantallaDeArranque.js";
import { Bienvenida } from "./componentes/Bienvenida.js";
import { SinProyectoAbierto } from "./componentes/SinProyectoAbierto.js";

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

  /**
   * Layer C: abrir un proyecto desde la barra. El servidor reutiliza EL MISMO mensaje que
   * usaba el paso de proyecto del wizard (`{clase:"alta", paso:"proyecto", proyecto,
   * rama}`, `vestibulo.ts#completarProyecto`): sin `rama` no abre nada y contesta con las
   * ramas de ESE proyecto (`estado.alta.ramas`), así que hace falta guardar EN EL
   * CLIENTE de cuál de los dos clics se trata —el cable no lo dice, solo manda la lista—.
   * Con una sola rama no se pregunta (mismo criterio que ya usa `cli/consola.ts` cuando
   * cancelar la elección de rama cae a la primera disponible): se manda sola, sin
   * `Selector` de por medio. Con más de una, sí.
   */
  const [proyectoEligiendoRama, setProyectoEligiendoRama] = useState<string | undefined>(undefined);
  const ramasPendientes = estado.alta?.ramas ?? [];

  useEffect(() => {
    if (proyectoEligiendoRama === undefined || ramasPendientes.length !== 1) return;
    const proyecto = proyectoEligiendoRama;
    const rama = ramasPendientes[0]!;
    setProyectoEligiendoRama(undefined);
    void enviar({ clase: "alta", paso: "proyecto", proyecto, rama });
    // `ramasPendientes` no es una dependencia estable (`App.tsx` la recalcula en cada
    // render desde `estado.alta?.ramas ?? []`, un array NUEVO cada vez): comparar por
    // longitud e indexar [0] es correcto, pero listar el array entero como dependencia
    // dispararía este efecto en cada render aunque el CONTENIDO no cambiara. Se lista su
    // longitud y su único valor posible, que sí son estables entre renders sin cambios.
  }, [proyectoEligiendoRama, ramasPendientes.length, ramasPendientes[0]]);

  // El alta es lo ÚNICO que se enseña mientras falte cuenta o entorno — nada de armazón
  // vacío alrededor esperando datos que todavía no llegan (la barra sin entornos, las
  // pestañas sin transcript, el compositor deshabilitado): eso era el problema medido, y
  // la corrección es no enseñarlo, no vestirlo.
  //
  // Cambio de rumbo del usuario: el paso de PROYECTO salió del alta. `pasos: []` ya no
  // implica que haya un proyecto abierto —antes sí, porque era el único paso que podía
  // quedar—; ahora pasa en cuanto cuenta y entorno están resueltos, CON o SIN proyecto.
  // Quien ya tiene las dos cosas puestas entra DIRECTO, sin ver nada de esto: `enAlta`
  // se hace falso y el resto de este componente pinta la maqueta completa, con o sin
  // proyecto (`proyectoAbierto`, ver más abajo decide cuál de las dos).
  //
  // Antes de que `estado.alta` llegue pasa una de dos: el paso de cuenta todavía se está
  // resolviendo (viaja por `selector`/`secreto`, no por `alta`, así que `alta` sigue
  // `undefined`) o ya llegó con el paso de entorno pendiente. Las dos cuentan como
  // «todavía no hay nada que enseñar salvo el alta».
  const enAlta = estado.alta === undefined || estado.alta.pasos.length > 0;

  if (enAlta) {
    return (
      <PantallaDeArranque>
        <Bienvenida nombre={estado.alta?.nombre} />
        {/*
          Antes de que llegue el primer `selector`/`secreto`/`alta` (la conexión SSE
          todavía no ha resuelto nada, o se cayó a mitad del alta) esto era la única
          señal — sin ella, un token inválido o el servidor caído pintaban el splash y
          la bienvenida y NADA más: un fallo mudo, justo lo que este repo persigue en
          todas partes. `AvisoDeConexion` ya devuelve `null` en conectado, así que en el
          camino feliz esto sigue sin enseñar nada de más.
        */}
        <AvisoDeConexion conectado={estado.conectado} />
        {estado.pregunta !== undefined ? (
          <Pregunta
            texto={estado.pregunta.texto}
            alResponder={async (respuesta) => {
              await enviar({ clase: "respuesta", texto: respuesta });
              store.contestarPregunta();
            }}
          />
        ) : null}
        {estado.secreto !== undefined ? (
          <Pregunta
            texto={estado.secreto.pregunta}
            oculta
            alResponder={async (valor) => {
              await enviar({ clase: "secreto", valor });
              store.contestarSecreto();
            }}
          />
        ) : null}
        {estado.selector !== undefined ? (
          <Selector
            titulo={estado.selector.titulo}
            opciones={estado.selector.opciones}
            alElegir={async (id) => {
              await enviar({ clase: "eleccion", id });
              store.contestarSelector();
            }}
          />
        ) : null}
        {estado.alta !== undefined && estado.alta.pasos.length > 0 ? (
          <Wizard
            pasos={estado.alta.pasos}
            proveedores={estado.alta.proveedores}
            entornos={estado.alta.entornos}
            {...(estado.alta.aviso === undefined ? {} : { aviso: estado.alta.aviso })}
            alGuardarCredencial={(_proveedor, clave) => void enviar({ clase: "secreto", valor: clave })}
            alRegistrarEntorno={(entorno) => void enviar({ clase: "alta", paso: "entorno", entorno })}
          />
        ) : null}
      </PantallaDeArranque>
    );
  }

  // Sin proyecto abierto: la maqueta completa (barra con datos reales) pero el centro
  // espera. Antes de este cambio `enAlta` en `false` implicaba SIEMPRE un proyecto
  // abierto —era el único paso que podía quedar—; ahora hace falta mirarlo aparte.
  const proyectoAbierto = estado.alta?.proyectoAbierto ?? false;

  // El PRIMER acto de usuario, no el último: es la misma regla que titula una sesión en
  // disco (`web/servidor/sesiones.ts` — «titulo» se fija una vez y no se vuelve a tocar).
  // Dos reglas para el mismo título es cómo divergen — esta lo mira, no inventa una propia.
  const primerActoDeUsuario = estado.actos.find((a) => a.tipo === "usuario");

  // Las piezas de `BarraDeEstado`, derivadas del transcript a falta de un mensaje propio
  // del cable: ni `sistema` ni `EstadoDelCliente` llevan hoy `contexto`/`tope`
  // (`tipos.ts`, `store.ts`), así que esos dos quedan `undefined` — la misma postura de
  // «lista vacía, no dato inventado» que ya usa la `<Barra>` de abajo cuando el cable
  // todavía no tiene sesiones que contar.
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

  // El nombre para el título del selector de rama; `undefined` si el proyecto ya no está
  // en la lista (improbable, pero `Selector` no necesita un título vacío para funcionar).
  const nombreDelProyectoEligiendoRama = estado.alta?.proyectos.find(
    (p) => p.id === proyectoEligiendoRama
  )?.nombre;

  return (
    <Maqueta
      centro={
        proyectoEligiendoRama !== undefined && ramasPendientes.length > 1 ? (
          // Más de una rama: aquí SÍ hace falta preguntar (con una sola, el `useEffect`
          // de arriba ya la mandó sola y este caso ni se alcanza). Toma el centro
          // ENTERO, tenga o no proyecto abierto — abrir uno nuevo mientras otro está
          // abierto es un cambio legítimo (el servidor ya lo soporta, `vestibulo.ts`
          // cierra el que estuviera abierto antes de abrir el elegido).
          <Selector
            titulo={`Elige la rama de ${nombreDelProyectoEligiendoRama ?? "el proyecto"}`}
            opciones={ramasPendientes.map((r) => ({ id: r, etiqueta: r }))}
            alElegir={async (rama) => {
              const proyecto = proyectoEligiendoRama;
              setProyectoEligiendoRama(undefined);
              // `rama: undefined` es cancelar (mismo contrato que cualquier otro
              // `Selector`): no se manda nada, y el proyecto se queda sin abrir hasta
              // que se vuelva a pulsar en la barra.
              if (rama !== undefined && proyecto !== undefined) {
                await enviar({ clase: "alta", paso: "proyecto", proyecto, rama });
              }
            }}
          />
        ) : proyectoAbierto ? (
          <>
            <Cabecera
              titulo={primerActoDeUsuario?.texto ?? "xonecode"}
              conectado={estado.conectado}
            />
            <AvisoDeConexion conectado={estado.conectado} />
            <Transcript actos={estado.actos} />
            {/*
              Las tres esperas de humano van DELANTE del compositor y cada una con su propio
              cauce: el compositor manda `prosa`, que entra por la cola de líneas del lazo y no
              resuelve ninguna. Retirarlas es cosa del cliente —el servidor resuelve su promesa
              y no emite ningún «ya está»—, y siempre DESPUÉS de que el envío haya llegado: con
              el `POST` fallido, lo que se queda en pantalla es la pregunta sin contestar, que
              es la verdad.
            */}
            {estado.pregunta !== undefined ? (
              <Pregunta
                texto={estado.pregunta.texto}
                alResponder={async (respuesta) => {
                  await enviar({ clase: "respuesta", texto: respuesta });
                  store.contestarPregunta();
                }}
              />
            ) : null}
            {estado.secreto !== undefined ? (
              // La MISMA pregunta, oculta: el valor no entra en el store ni en un acto, y
              // viaja por el único mensaje del cable que lo lleva.
              <Pregunta
                texto={estado.secreto.pregunta}
                oculta
                alResponder={async (valor) => {
                  await enviar({ clase: "secreto", valor });
                  store.contestarSecreto();
                }}
              />
            ) : null}
            {estado.selector !== undefined ? (
              <Selector
                titulo={estado.selector.titulo}
                opciones={estado.selector.opciones}
                alElegir={async (id) => {
                  // `id: undefined` es cancelar, y viaja como la AUSENCIA del campo:
                  // `JSON.stringify` descarta las claves con ese valor, así que por el cable
                  // sale `{"clase":"eleccion"}` — que es lo que `consolaWeb` traduce a
                  // `undefined`. No hay clase nueva para cancelar.
                  await enviar({ clase: "eleccion", id });
                  store.contestarSelector();
                }}
              />
            ) : null}
            {/*
              Nada de alta aquí abajo: mientras `estado.alta.pasos` tiene algo pendiente,
              `enAlta` ya ha hecho el `return` de la pantalla de arranque de más arriba, así
              que este punto del árbol solo se alcanza con el alta resuelta. Un `<Wizard>`
              aquí no pintaría nunca — dos sitios para la misma condición es cómo uno de los
              dos se queda mintiendo el día que el otro cambie.
            */}
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
            {estado.aprobacion !== undefined ? (
              <Aprobacion
                pendientes={estado.aprobacion.pendientes}
                ficheros={estado.aprobacion.ficheros}
                diffs={estado.aprobacion.diffs}
                alDecidir={async (decisiones) => {
                  // Se ESPERA al envío antes de retirar el modal. Medido antes de este
                  // arreglo: `void enviar(...)` no esperaba nada y `cerrarAprobacion` corría
                  // síncrono, así que un `POST` fallido cerraba el modal igual, la aprobación
                  // no llegaba al servidor y diez minutos después vencía como rechazo sin que
                  // nadie lo dijera — el usuario convencido de haber autorizado algo que no se
                  // autorizó. Si esto lanza, el modal se queda, suelta su candado y lo dice.
                  await enviar({ clase: "decision", decisiones });
                  store.cerrarAprobacion();
                }}
              />
            ) : null}
          </>
        ) : (
          // Cuenta y entorno resueltos, pero nadie ha elegido proyecto todavía: se elige
          // en la barra, así que el centro no tiene ni cabecera de sesión, ni transcript,
          // ni compositor que ofrecer.
          <SinProyectoAbierto />
        )
      }
      barra={
        <Barra
          entornos={estado.alta?.entornos ?? []}
          // No hay señal del cable para «cuál es el entorno ACTIVO» —solo se registra
          // uno normalmente—, así que se asume el primero de la lista. Con más de un
          // entorno registrado esto podría mentir; hoy `pasosPendientes()` no distingue
          // entre tener uno o varios, así que no hay un «activo» que leer del servidor.
          entornoActivo={estado.alta?.entornos[0]?.id ?? ""}
          proyectos={(estado.alta?.proyectos ?? []).map((p) => ({ ...p, sesiones: [] }))}
          alElegirEntorno={() => {}}
          alAbrirSesion={() => {}}
          // Pide la rama del proyecto elegido (`vestibulo.ts#completarProyecto` la
          // necesita) sin abrir nada todavía: el `useEffect` de arriba decide, en cuanto
          // `estado.alta.ramas` responda, si la manda sola (una) o pinta el `Selector`
          // de más arriba (varias). Un segundo clic mientras se espera la respuesta
          // simplemente reemplaza cuál proyecto se está preguntando — no hay candado
          // porque no hay nada que envíe dos veces la MISMA cosa.
          alAbrirProyecto={(proyecto) => {
            setProyectoEligiendoRama(proyecto);
            void enviar({ clase: "alta", paso: "proyecto", proyecto });
          }}
          // Mismo motivo: no hay clase del cable para «abre otra sesión de este
          // proyecto» (`Barra.tsx` documenta por qué el botón se enseña de todos modos).
          alNuevaSesion={() => {}}
        />
      }
    />
  );
}
