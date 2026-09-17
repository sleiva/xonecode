import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Button,
  Input,
  IconEditOutline16,
  IconTrashOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  ProveedorDeModelos, AgenteDelCable } from "../tipos.js";
import estilos from "./Agentes.module.css";

/**
 * La sección de subagentes de la ventana de ajustes.
 *
 * Un subagente es un fichero `.md` en `.xonecode/agentes/` (`core/agentes.ts`): nombre,
 * descripción, motor, y un cuerpo con sus instrucciones. Esta ventana es una forma de
 * escribir ese fichero sin abrir un editor — no una segunda fuente de verdad. Por eso lo
 * que se guarda vuelve a pasar por el CARGADOR en el servidor antes de escribirse: el mismo
 * fichero se puede editar a mano, así que la autoridad sobre si vale es el cargador y no
 * este formulario.
 *
 * Tres cosas que no son de forma:
 *
 * - **La descripción se etiqueta como lo que es: un PROMPT.** Es el texto que el orquestador
 *   lee para decidir cuándo delegar en este subagente, no un rótulo para el humano. Una
 *   descripción vaga hace que no se use nunca, o que se use para todo, y quien la escribe
 *   tiene que saberlo mientras la escribe.
 * - **El ámbito se ELIGE, no se adivina.** Con un proyecto abierto valen los dos, y decidir
 *   por el usuario es cómo un «revisor» pensado para todos los proyectos acaba escondido en
 *   uno. Sin proyecto abierto solo se ofrece el global, porque el otro no existe.
 * - **`modelo` solo aparece con `motor: modelo`.** Con Claude Code o Codex el modelo lo
 *   elige el propio agente, así que un campo ahí sería un control que no hace nada — y el
 *   servidor RECHAZA el fichero que lo lleve, en vez de ignorarlo en silencio.
 */

/**
 * Los motores, con lo que significan y con lo que HACE FALTA para cada uno.
 *
 * Los dos externos dicen su requisito porque no es el mismo y el fallo se parece: Claude
 * Code va por su SDK (que viene con xonecode) y Codex por el binario que el usuario ya
 * tenga instalado. Un especialista que no arranca porque falta uno de los dos no se monta
 * siquiera —el servidor comprueba `disponible()` antes—, así que decirlo aquí es lo que
 * explica por qué no aparece.
 */
const MOTORES: readonly { id: string; etiqueta: string; detalle: string }[] = [
  { id: "modelo", etiqueta: "Un modelo", detalle: "corre dentro de xonecode, con las tools del proyecto" },
  {
    id: "claude-code",
    etiqueta: "Claude Code",
    detalle: "lanza un Claude Code sobre el proyecto; si escribe, apruebas cada cambio",
  },
  {
    id: "codex",
    etiqueta: "Codex",
    detalle: "lanza el `codex` que tengas instalado; si escribe, apruebas cada cambio",
  },
  {
    id: "opencode",
    etiqueta: "OpenCode",
    detalle: "lanza el `opencode` que tengas instalado; si escribe, apruebas cada cambio",
  },
];

/**
 * Lo que un agente externo puede hacer hoy, dicho donde se decide.
 *
 * No es una advertencia genérica: el servidor RECHAZA el fichero de un agente externo que
 * pida escribir, así que quien marque la casilla y guarde recibiría un error. Decirlo aquí
 * —y forzar la casilla— convierte un error en una explicación.
 */
const AVISO_EXTERNO =
  "Un agente externo corre fuera de xonecode, con su propia cuenta y su propia " +
  "configuración. Si le dejas escribir, cada escritura te llega con su diff para que la " +
  "apruebes, y las guardas del proyecto siguen puestas: no ESCRIBE en .env, .git, .xonecode, " +
  "una vista aplanada ni fuera de la carpeta. Borrar y renombrar no se le conceden.";

/**
 * Lo que cada motor externo puede LEER, que no es lo mismo en los tres — y decirlo importa.
 *
 * El aviso de arriba era uno solo y decía «nunca toca .env»: cierto para escribir en los tres,
 * y **falso para leer en Codex**, donde lee por la shell de su sandbox y ahí no hay guarda que
 * valga (está declarado en CLAUDE.md). Visto en la pantalla, no en un test: la frase prometía
 * una protección que uno de los tres no da, y quien elige el motor lo hace mirando esto.
 */
const AVISO_DE_LECTURA: Record<string, string> = {
  "claude-code":
    "Leer también está guardado: no puede leer .env, .git, .xonecode, una vista aplanada ni " +
    "nada de fuera del proyecto.",
  codex:
    "OJO: leer NO está guardado. Su sandbox solo le impide ESCRIBIR, así que puede leer .env, " +
    ".git, .xonecode y ficheros de fuera del proyecto. No lo uses en un proyecto cuyos " +
    "secretos no quieras que salgan de tu máquina.",
  opencode:
    "Leer está guardado por reglas de su configuración: no puede leer .env, .git, .xonecode, " +
    "una vista aplanada ni nada de fuera del proyecto.",
};

/** Un agente vacío, para el formulario de alta. */
function enBlanco(): AgenteDelCable {
  return {
    nombre: "",
    descripcion: "",
    motor: "modelo",
    soloLectura: true,
    skills: [],
    instrucciones: "",
  };
}

/** Qué significa dejar el modelo sin elegir, que no es lo mismo en los cuatro motores. */
const VACIO_DE_MODELO: Record<string, string> = {
  modelo: "El del papel que le toque",
  "claude-code": "El que use Claude Code",
  codex: "El que use Codex",
  opencode: "El que use OpenCode",
};

/** La pista del rótulo: de dónde sale la lista de cada uno. */
const PISTA_DE_MODELO: Record<string, string> = {
  modelo: "— de tus proveedores comprobados",
  "claude-code": "— los alias de Claude Code",
  codex: "— los que ofrece tu Codex",
  opencode: "— los que ofrece tu OpenCode",
};

/**
 * El botón de alta. Un componente y no dos copias del JSX: sale en dos sitios —la pestaña de
 * los tuyos y el aviso de que no hay ninguno— y duplicarlo es cómo uno de los dos se queda
 * sin el `setAmbito` y guarda en la carpeta que no era.
 */
function BotonDeNuevo({ alPulsar }: { alPulsar: () => void }) {
  return (
    <Button variant="outline" className={clsx(estilos.accion, estilos.nuevo)} onClick={alPulsar}>
      Nuevo subagente
    </Button>
  );
}

/**
 * La regla del nombre, COPIA DECLARADA de la del host (`core/agentes.ts`).
 *
 * Declarada y no importada porque la frontera lo prohíbe (`src/web/frontera.test.ts`): el
 * cliente no puede importar de `src/`. Mismo trato que la URL de un entorno en `Wizard.tsx`.
 * Aquí es de balde y evita un viaje; **quien manda es el servidor**, que la vuelve a aplicar
 * al guardar — esto solo convierte un rechazo mudo en una frase, porque `informar` no llega
 * al navegador desde el vestíbulo.
 */
const FORMA_DEL_NOMBRE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function motivoDeNombreDeAgente(nombre: string): string | undefined {
  if (nombre.trim() === "") return undefined; // vacío ya lo cubre el botón: no es un aviso
  if (nombre !== nombre.trim()) return "no puede empezar ni acabar con espacios";
  if (nombre !== nombre.toLowerCase()) return "no puede llevar mayúsculas: va todo en minúsculas";
  if (!FORMA_DEL_NOMBRE.test(nombre)) {
    return "solo vale minúsculas, dígitos y guiones sencillos (ni espacios, ni acentos, ni guion al principio o al final)";
  }
  return undefined;
}

/** El que SÍ valdría, para poder ofrecerlo. Los acentos se descomponen, no se tiran. */
export function nombreSugeridoDeAgente(nombre: string): string | undefined {
  const slug = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug !== "" && FORMA_DEL_NOMBRE.test(slug) ? slug : undefined;
}

type Grupo = "serie" | "propios";

/**
 * Las dos pestañas: su rótulo y qué dice la vacía.
 *
 * El rótulo de una pestaña vacía no puede quedarse solo: «Tuyos» sin nada debajo se lee como
 * una lista que no cargó. Y los dos vacíos no dicen lo mismo —uno es «no has creado ninguno»
 * y el otro «no tienes en disco los que trae xonecode», que solo pasa si los borraste cuando
 * la papelera todavía estaba ahí—, así que cada uno lleva el suyo.
 */
const GRUPOS: readonly { clave: Grupo; titulo: string; vacio: string }[] = [
  {
    clave: "serie",
    titulo: "De xonecode",
    vacio: "No tienes en disco ninguno de los que trae xonecode.",
  },
  {
    clave: "propios",
    titulo: "Tuyos",
    vacio: "No has creado ninguno. «Nuevo subagente» escribe el primero.",
  },
];

const motorExterno = (motor: string): boolean =>
  motor === "claude-code" || motor === "codex" || motor === "opencode";

export function Agentes({
  agentes,
  problemas,
  hayProyecto,
  proveedores,
  modelosDeMotor,
  alPedirModelosDeMotor,
  alPedirCatalogo,
  alGuardar,
  alBorrar,
  alRestaurar,
}: {
  /** Ausente = todavía no llegó el mensaje, que NO es «no hay ninguno». */
  agentes?: readonly AgenteDelCable[];
  problemas?: readonly string[];
  /** Si hay proyecto abierto: decide si se puede ofrecer el ámbito «de este proyecto». */
  hayProyecto: boolean;
  /**
   * Guardar. `renombrandoDe` va puesto cuando el nombre ha cambiado —solo puede pasar en uno
   * tuyo— y ausente cuando no: renombrar ES guardar, porque el formulario cambia el nombre y
   * el resto en la misma pulsación.
   */
  alGuardar: (agente: AgenteDelCable, ambito: "global" | "proyecto", renombrandoDe?: string) => void;
  alBorrar: (nombre: string, ambito: "global" | "proyecto") => void;
  /**
   * Devuelve un de serie a como lo entrega xonecode. Sin ámbito: la siembra solo escribe en
   * el global, así que no hay dos sitios entre los que elegir — lo decide el servidor.
   */
  alRestaurar: (nombre: string) => void;
  /**
   * Los proveedores del mensaje «modelos», para el desplegable del motor `modelo`. Se
   * ofrecen solo los COMPROBADOS, igual que en la pastilla del compositor: uno sin
   * credencial es algo que falla al usarlo, y ponerlo aquí es prometerlo.
   */
  proveedores?: readonly ProveedorDeModelos[];
  /** Lo que ofrece cada motor externo, por motor. Ausente = no se ha preguntado. */
  modelosDeMotor?: Record<string, { modelos: { id: string; nombre: string }[]; error?: string }>;
  /** Pide los de un motor. Bajo demanda porque el de Codex arranca un proceso. */
  alPedirModelosDeMotor?: (motor: string) => void;
  /** Pide el catálogo de un proveedor nuestro. Sin esto el desplegable solo tendría los de
   *  quien ya se hubiera consultado por otro sitio — Ollama, que se prueba al conectar. */
  alPedirCatalogo?: (proveedor: string) => void;
}) {
  const [editando, setEditando] = useState<AgenteDelCable | undefined>(undefined);
  const [creando, setCreando] = useState(false);
  const [ambito, setAmbito] = useState<"global" | "proyecto">("global");
  /**
   * La confirmación abierta, si hay alguna: de QUIÉN y de QUÉ.
   *
   * Era un `string` con el nombre, cuando lo único confirmable era borrar. Ahora hay dos
   * operaciones que pisan un fichero sin papelera y van en la misma fila, así que el nombre
   * solo no basta: con dos estados sueltos se podrían abrir las dos a la vez sobre la misma
   * fila, y el usuario tendría delante dos botones rojos que hacen cosas distintas.
   */
  const [abierta, setAbierta] = useState<{ nombre: string; que: "borrar" | "restaurar" } | undefined>(undefined);
  const [pestana, setPestana] = useState<Grupo>("serie");
  /**
   * Con qué nombre se abrió el formulario, para saber si se ha renombrado.
   *
   * No se puede deducir de `editando`, que es la copia que el usuario está tecleando, ni de
   * la lista, que ya no tiene el nombre nuevo. Ausente al crear: ahí no hay nada de lo que
   * renombrar.
   */
  const [nombreOriginal, setNombreOriginal] = useState<string | undefined>(undefined);

  /**
   * Los proveedores COMPROBADOS, la misma regla que la pastilla del compositor: con clave
   * puesta, o —los que no la llevan— con su catálogo contestado. Ofrecer aquí uno sin
   * credencial sería prometerle a un subagente un modelo que va a fallar al usarlo.
   */
  const comprobados = (proveedores ?? []).filter((p) => p.credencial === "puesta" || p.modelos !== undefined);

  /** ¿El modelo guardado está entre los que se ofrecen ahora? Ver el `<option>` de reserva. */
  const enLaLista = (a: AgenteDelCable): boolean =>
    a.motor === "modelo"
      ? comprobados.some((p) => (p.modelos ?? []).some((m) => `${p.id}/${m.id}` === a.modelo))
      : (modelosDeMotor?.[a.motor]?.modelos ?? []).some((m) => m.id === a.modelo);

  /**
   * Los modelos de un motor externo se piden al ELEGIRLO, no al abrir la ventana: el de
   * Codex se le pregunta a él y eso arranca un proceso. Una vez por motor y por sesión de
   * ventana — el servidor además los cachea.
   */
  const motorEditado = editando?.motor;
  useEffect(() => {
    if (motorEditado === undefined || !motorExterno(motorEditado)) return;
    if (modelosDeMotor?.[motorEditado] !== undefined) return;
    alPedirModelosDeMotor?.(motorEditado);
  }, [motorEditado, modelosDeMotor, alPedirModelosDeMotor]);

  /**
   * Con el motor `modelo`, los catálogos de los proveedores comprobados que aún no se hayan
   * traído. Sin esto el desplegable solo tenía los de Ollama —el único que se prueba al
   * conectar— y el grupo de los demás salía vacío: un grupo sin nada dentro es peor que no
   * estar, porque parece que ese proveedor no tiene modelos.
   *
   * Al abrir el formulario y no antes: cada catálogo es una llamada de red, y la lista de
   * subagentes se mira mucho más de lo que se edita uno.
   */
  const faltanCatalogos = comprobados.filter((p) => p.modelos === undefined && p.error === undefined);
  const idsSinCatalogo = faltanCatalogos.map((p) => p.id).join(",");
  useEffect(() => {
    if (motorEditado !== "modelo" || idsSinCatalogo === "") return;
    for (const id of idsSinCatalogo.split(",")) alPedirCatalogo?.(id);
  }, [motorEditado, idsSinCatalogo, alPedirCatalogo]);

  /** Los dos grupos, repartidos por `semilla`. Ver el `tablist` para por qué no por `origen`. */
  const porGrupo: Record<Grupo, readonly AgenteDelCable[]> = {
    serie: (agentes ?? []).filter((a) => a.semilla !== undefined),
    propios: (agentes ?? []).filter((a) => a.semilla === undefined),
  };

  /**
   * ¿El nombre que se está tecleando ya lo tiene otro?
   *
   * Existe porque la negativa del servidor NO llega al navegador: `informar` escribe en el
   * terminal y en la consola del proyecto abierto, y la ventana de ajustes se abre desde el
   * vestíbulo, donde no hay ninguno. Sin esto, renombrar a un nombre ocupado cerraba el
   * formulario y no pasaba nada — el botón muerto de siempre, y encima sobre un destino que
   * el usuario creería pisado.
   *
   * Es una EXPLICACIÓN, no la barrera: la barrera sigue siendo `renombrarAgente`, que no pisa
   * un destino que exista. Y por eso se mide contra la lista EN VIGOR, que es lo que el
   * cliente tiene: una colisión en la otra carpeta no se ve desde aquí y la corta el servidor.
   *
   * Cubre también el alta, donde el agujero ya estaba: crear uno llamado `docs` en el global
   * escribía encima del `docs.md` sembrado sin decir nada.
   */
  const ocupado =
    editando !== undefined &&
    editando.nombre.trim() !== "" &&
    editando.nombre !== nombreOriginal &&
    (agentes ?? []).some((a) => a.nombre === editando.nombre.trim());

  /**
   * Lo que impide guardar por el NOMBRE, en una sola frase: ocupado, o mal formado.
   *
   * Los dos apagan «Guardar» y los dos se dicen arriba de los botones, porque los dos se
   * arreglan igual —cambiando el nombre— y son el motivo de que el botón esté apagado. La
   * forma se comprueba incluso en un `.md` que YA estaba: un `Documentador.md` escrito a mano
   * carga (el cargador solo lo dice) y es al guardarlo cuando hay alguien delante para
   * arreglarlo. Un de serie no puede caer aquí: su campo está deshabilitado.
   */
  const malNombre = editando === undefined ? undefined : motivoDeNombreDeAgente(editando.nombre);
  const sugerido = editando === undefined ? undefined : nombreSugeridoDeAgente(editando.nombre);
  const avisoDelNombre =
    editando === undefined
      ? undefined
      : ocupado
        ? `Ya hay un subagente que se llama «${editando.nombre.trim()}». Elige otro nombre, o borra ese primero.`
        : malNombre === undefined
          ? undefined
          : `El nombre ${malNombre}.${sugerido === undefined ? "" : ` Prueba con «${sugerido}».`}`;

  /** Abrir el formulario en blanco. Uno solo: lo llaman los dos sitios donde sale el botón. */
  const nuevo = (): void => {
    setAbierta(undefined);
    setNombreOriginal(undefined);
    setEditando(enBlanco());
    setCreando(true);
    setAmbito(hayProyecto ? "proyecto" : "global");
  };

  const cerrar = (): void => {
    setEditando(undefined);
    setCreando(false);
  };

  const guardar = (): void => {
    if (editando === undefined) return;
    // Ausente cuando no ha cambiado, y no `nombreOriginal` a secas: el servidor ya lo
    // compara, pero mandar un renombrado que no lo es haría que un guardado normal dependiera
    // de esa comparación en vez de decir lo que es.
    const renombrandoDe =
      nombreOriginal !== undefined && nombreOriginal !== editando.nombre ? nombreOriginal : undefined;
    alGuardar(editando, ambito, renombrandoDe);
    cerrar();
  };

  if (agentes === undefined) {
    return <p className={estilos.nota}>Consultando los subagentes…</p>;
  }

  return (
    <>
      {/*
        Editar es un MODO, no un añadido al final de la lista. Con la lista puesta encima, el
        formulario aparecía debajo del todo —fuera de la vista si había cinco subagentes— y
        no quedaba claro cuál se estaba tocando: se veía la fila de «revisor» arriba y unos
        campos sueltos abajo. Se sustituye una cosa por la otra, que es lo que hace evidente
        dónde estás.
      */}
      {editando !== undefined ? null : (
        <>
      <p className={estilos.nota}>
        Cada subagente es un fichero <code>.md</code> en <code>.xonecode/agentes/</code>. Los
        globales valen en todos los proyectos; los de un proyecto solo en ese, y pisan al
        global del mismo nombre.
      </p>

      {/* Los `.md` que no se pudieron leer, con su motivo. Quien los tiene que arreglar está
          mirando esta ventana: un agente que no aparece y nadie dice por qué se lee como que
          la aplicación lo perdió. */}
      {problemas !== undefined && problemas.length > 0 ? (
        <ul className={estilos.problemas} role="alert">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      {/*
        Crear vive con LOS TUYOS, porque un subagente nuevo siempre lo es: no hay forma de
        escribir uno «de xonecode» —eso lo decide la siembra— así que el botón encima de las
        dos pestañas ofrecía una acción sobre un grupo donde no cabe. Y sigue yendo ENCIMA de
        su lista: debajo quedaba fuera de la vista al abrir la sección.

        Sin NINGÚN subagente no hay pestañas que pintar, y entonces el botón va con el aviso
        de que no hay ninguno: es el único sitio desde donde se puede crear el primero.
      */}
      {agentes.length === 0 ? (
        <>
          <p className={estilos.vacio}>
            No hay ningún subagente. Sin ninguno, el orquestador no tiene en quién delegar.
          </p>
          <BotonDeNuevo alPulsar={nuevo} />
        </>
      ) : (
        <>
          {/*
            Dos pestañas, y SIEMPRE las dos —también con una vacía—, por lo mismo que las de
            Entornos: la etiqueta contesta «¿de quién es esto?», que es la pregunta que la
            pantalla no contestaba. Esconder la vacía dejaría a quien no ha creado ninguno sin
            saber dónde van a aparecer los suyos, y al que borró los de serie sin la puerta
            donde mirarlo. La CUENTA sí es condicional: un cero no se pinta, así que una
            pestaña vacía es su rótulo a secas y su panel lo dice con palabras.

            Los separa `semilla` y no `origen`: `origen` es la CARPETA (global o proyecto), y
            un subagente propio también vive en la global — que es lo que hacía que la
            pastilla `GLOBAL` pareciera contestar de quién era el fichero sin contestarlo.
          */}
          <div className={estilos.pestanas} role="tablist" aria-label="Subagentes por origen">
            {GRUPOS.map((g) => (
              <button
                key={g.clave}
                type="button"
                role="tab"
                className={estilos.pestana}
                aria-selected={g.clave === pestana}
                data-actual={g.clave === pestana ? "" : undefined}
                onClick={() => {
                  setPestana(g.clave);
                  // La confirmación abierta se cierra al cambiar de pestaña: si no, volver
                  // a la otra enseñaría un botón rojo armado sobre una fila que el usuario
                  // dejó de mirar hace dos clics.
                  setAbierta(undefined);
                }}
              >
                {g.titulo}
                {porGrupo[g.clave].length > 0 ? (
                  <span className={estilos.cuenta}>{porGrupo[g.clave].length}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div role="tabpanel" className={estilos.panelDePestana}>
            {pestana === "propios" ? <BotonDeNuevo alPulsar={nuevo} /> : null}
            {porGrupo[pestana].length === 0 ? (
              <p className={estilos.vacio}>{GRUPOS.find((g) => g.clave === pestana)!.vacio}</p>
            ) : (
              <ul className={estilos.filas}>
                {porGrupo[pestana].map((a) => (
                  <FilaDeAgente
                    key={a.nombre}
                    agente={a}
                    abierta={abierta}
                    alAbrir={setAbierta}
                    alEditar={() => {
                      setAbierta(undefined);
                      setAmbito(a.origen === "proyecto" ? "proyecto" : "global");
                      setNombreOriginal(a.nombre);
                      setEditando({ ...a });
                      setCreando(false);
                    }}
                    alBorrar={() => alBorrar(a.nombre, a.origen === "proyecto" ? "proyecto" : "global")}
                    alRestaurar={() => alRestaurar(a.nombre)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

        </>
      )}

      {editando === undefined ? null : (
        <div className={estilos.formulario}>
          {/*
            El nombre SE CAMBIA, y solo en uno tuyo.
            Estaba deshabilitado siempre, con el argumento de que renombrarlo crearía uno
            nuevo y dejaría el viejo puesto — cierto de la implementación de entonces, no del
            renombrado: ahora el servidor MUEVE el `.md` (`renombrarAgente`, `renameSync` y
            luego escribir), así que nunca quedan dos.
            Un de serie sigue sin poder: su nombre es lo que lo ata a la marca de la siembra,
            que guarda el hash POR NOMBRE, así que moverlo lo volvería un subagente tuyo y el
            de serie se sembraría otra vez al arrancar — dos especialistas donde había uno. Y
            eso se DICE en el rótulo: un campo apagado sin motivo se lee como un fallo.
          */}
          <label className={estilos.campo}>
            <span className={estilos.rotulo}>
              Nombre
              {editando.semilla === undefined ? null : (
                <span className={estilos.pista}> — no se cambia: lo trae xonecode</span>
              )}
            </span>
            <Input
              value={editando.nombre}
              disabled={!creando && editando.semilla !== undefined}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
            />
          </label>

          <label className={estilos.campo}>
            <span className={estilos.rotulo}>
              Cuándo usarlo <span className={estilos.pista}>— lo lee el orquestador para elegirlo</span>
            </span>
            <Input
              value={editando.descripcion}
              onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })}
            />
          </label>

          <label className={estilos.campo}>
            <span className={estilos.rotulo}>Motor</span>
            <select
              className={estilos.selector}
              value={editando.motor}
              onChange={(e) =>
                setEditando({
                  ...editando,
                  motor: e.target.value,
                  // El modelo se va al cambiar de motor SIEMPRE: un `opus` no vale para el
                  // motor de modelo ni un `gemini/…` para Claude Code, y conservarlo
                  // guardaría un valor que el otro producto rechaza.
                  modelo: undefined,
                  // La casilla ya NO se fuerza. Se forzaba porque el servidor rechazaba el
                  // fichero de un agente externo que pidiera escribir, y dejarla suelta solo
                  // servía para que guardar fallara. Los dos motores escriben ya, cada
                  // escritura con su aprobación delante, así que forzarla ahora escondería
                  // una capacidad que existe.
                })
              }
            >
              {MOTORES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.etiqueta} — {m.detalle}
                </option>
              ))}
            </select>
          </label>

          {/*
            El modelo se ELIGE, y de dónde sale la lista depende del MOTOR. Era un campo de
            texto en el que había que acordarse de la sintaxis `proveedor/modelo`, y con los
            motores externos no había campo — el `.md` que llevara `modelo` se rechazaba, con
            el argumento de que ahí lo elige el agente. Medido: es falso, los dos productos
            aceptan un modelo, así que el campo vale para los tres.
          */}
          <label className={estilos.campo}>
            <span className={estilos.rotulo}>
              Modelo <span className={estilos.pista}>{PISTA_DE_MODELO[editando.motor] ?? ""}</span>
            </span>
            <select
              className={estilos.selector}
              value={editando.modelo ?? ""}
              onChange={(e) =>
                setEditando({
                  ...editando,
                  ...(e.target.value === "" ? { modelo: undefined } : { modelo: e.target.value }),
                })
              }
            >
              {/* No elegir es una opción de verdad, y la que casi siempre vale: el modelo
                  del papel que le toca, o el que el producto externo use por su cuenta. */}
              <option value="">{VACIO_DE_MODELO[editando.motor] ?? "El que le toque"}</option>
              {editando.motor === "modelo"
                ? comprobados
                    // Un grupo VACÍO es peor que no estar: parece que ese proveedor no tiene
                    // modelos, cuando lo que pasa es que su catálogo no ha llegado todavía.
                    .filter((p) => (p.modelos ?? []).length > 0)
                    .map((p) => (
                      // Agrupado por proveedor: el id que se guarda es `proveedor/modelo`, y
                      // sin el grupo dos modelos con el mismo nombre serían indistinguibles.
                      <optgroup key={p.id} label={p.nombre}>
                        {(p.modelos ?? []).map((m) => (
                          <option key={`${p.id}/${m.id}`} value={`${p.id}/${m.id}`}>
                            {m.nombre ?? m.id}
                          </option>
                        ))}
                      </optgroup>
                    ))
                : (modelosDeMotor?.[editando.motor]?.modelos ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
              {/* Lo que ya estaba guardado y no está en la lista se conserva como opción: si
                  no, abrir el formulario y guardar sin tocar nada borraría su modelo. */}
              {editando.modelo !== undefined && !enLaLista(editando) ? (
                <option value={editando.modelo}>{editando.modelo} — el que ya tenía</option>
              ) : null}
            </select>
            {editando.motor === "modelo" && faltanCatalogos.length > 0 ? (
              <p className={estilos.pista}>Consultando los modelos de {faltanCatalogos.map((p) => p.nombre).join(", ")}…</p>
            ) : null}
            {motorExterno(editando.motor) && modelosDeMotor?.[editando.motor]?.error !== undefined ? (
              // Un desplegable vacío sin motivo se lee como que la ventana está rota. El
              // motivo dice que falta instalar Codex, que es accionable.
              <p className={estilos.aviso} role="alert">
                {modelosDeMotor[editando.motor]!.error}
              </p>
            ) : null}
          </label>

          <label className={estilos.casilla}>
            <input
              type="checkbox"
              checked={editando.soloLectura}
              onChange={(e) => setEditando({ ...editando, soloLectura: e.target.checked })}
            />
            <span>
              Solo lectura <span className={estilos.pista}>— si escribe, sus cambios pasan por tu aprobación</span>
            </span>
          </label>

          {editando.motor === "modelo" ? null : (
            <p className={estilos.aviso}>
              {AVISO_EXTERNO} {AVISO_DE_LECTURA[editando.motor] ?? ""}
            </p>
          )}

          <label className={estilos.campo}>
            <span className={estilos.rotulo}>
              Skills <span className={estilos.pista}>— separadas por comas</span>
            </span>
            <Input
              value={editando.skills.join(", ")}
              onChange={(e) =>
                setEditando({
                  ...editando,
                  skills: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => s !== ""),
                })
              }
            />
          </label>

          <label className={estilos.campo}>
            <span className={estilos.rotulo}>Instrucciones</span>
            <textarea
              className={estilos.instrucciones}
              rows={8}
              value={editando.instrucciones}
              onChange={(e) => setEditando({ ...editando, instrucciones: e.target.value })}
            />
          </label>

          {/* El ámbito solo se ofrece si hay dónde elegir. Con un proyecto abierto valen los
              dos; sin él, el de proyecto no existe y un desplegable con una sola opción es
              una pregunta que no lo es. */}
          {hayProyecto ? (
            <label className={estilos.campo}>
              <span className={estilos.rotulo}>Dónde se guarda</span>
              <select
                className={estilos.selector}
                value={ambito}
                onChange={(e) => setAmbito(e.target.value === "proyecto" ? "proyecto" : "global")}
              >
                <option value="proyecto">En este proyecto</option>
                <option value="global">Global — en todos</option>
              </select>
            </label>
          ) : (
            <p className={estilos.pista}>Se guarda como global: no hay ningún proyecto abierto.</p>
          )}

          {/* Y se dice ARRIBA de los botones, no en un `title`: es el motivo de que «Guardar»
              esté apagado, y un botón apagado sin motivo a la vista se lee como un fallo. */}
          {avisoDelNombre === undefined ? null : <p className={estilos.aviso}>{avisoDelNombre}</p>}

          <div className={estilos.botones}>
            <Button variant="outline" className={estilos.accion} onClick={cerrar}>
              Cancelar
            </Button>
            {/*
              El `variant` va EXPLÍCITO en los dos. Sin él, el `<Button>` del paquete cae en
              su variante por omisión, que en tema oscuro llega blanca — «Guardar» y
              «Cancelar» salían los dos como cajas blancas y no se distinguía cuál era cuál.
              Guardar es la acción de la pantalla y lleva el primario (que desde el rediseño
              es el negro del tema en claro y el casi blanco en oscuro); cancelar, contorno.
            */}
            <Button
              variant="primary"
              className={estilos.principal}
              // Sin nombre ni descripción el servidor lo rechazaría: es más honesto no
              // dejar pulsar que aceptar y contestar que no.
              disabled={
                avisoDelNombre !== undefined ||
                editando.nombre.trim() === "" ||
                editando.descripcion.trim() === ""
              }
              onClick={guardar}
            >
              Guardar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Una fila de la lista: quién es, y qué se puede hacer con él.
 *
 * Extraída porque los dos grupos pintan la MISMA fila, y duplicarla es cómo uno de los dos
 * se queda sin el botón nuevo. El precio es el de siempre en este repo —el cableado de una
 * prop se puede olvidar con todo en verde, que es el patrón de `filaDeTarea`—, así que las
 * tres acciones tienen su test por separado y en los dos grupos.
 *
 * La diferencia entre los dos grupos vive AQUÍ y es una sola: **un de serie no lleva
 * papelera.** No por delicadeza, sino porque borrarlo no devolvía el de serie: la marca de la
 * siembra recuerda que se entregó, así que no se resiembra —era perderlo para siempre, con un
 * icono que parecía reversible—. Lo que ese sitio lleva ahora es «Restaurar el de serie», y
 * solo si hay algo que restaurar: sobre uno intacto sería un control sin dato detrás.
 */
function FilaDeAgente({
  agente,
  abierta,
  alAbrir,
  alEditar,
  alBorrar,
  alRestaurar,
}: {
  agente: AgenteDelCable;
  abierta?: { nombre: string; que: "borrar" | "restaurar" };
  alAbrir: (a: { nombre: string; que: "borrar" | "restaurar" } | undefined) => void;
  alEditar: () => void;
  alBorrar: () => void;
  alRestaurar: () => void;
}) {
  const a = agente;
  /** Qué se está confirmando en ESTA fila, si algo. */
  const confirmando = abierta?.nombre === a.nombre ? abierta.que : undefined;
  const alternar = (que: "borrar" | "restaurar"): void =>
    alAbrir(confirmando === que ? undefined : { nombre: a.nombre, que });

  return (
    <li className={estilos.fila}>
      <div className={estilos.cabeceraDeFila}>
        <span className={estilos.nombre}>{a.nombre}</span>
        <span className={estilos.motor}>{a.motor}</span>
        {/* De dónde sale. Es lo que explica por qué editarlo aquí no afecta a los
            demás proyectos — o por qué sí. */}
        {a.origen === undefined ? null : <span className={estilos.origen}>{a.origen}</span>}
        {a.soloLectura ? <span className={estilos.lectura}>solo lectura</span> : null}
        <span className={estilos.relleno} />
        {/*
          Iconos y no dos botones de texto: con cinco subagentes eran diez rótulos
          repetidos que pesaban más que los nombres. El nombre accesible va en el
          `aria-label` y LLEVA EL DEL AGENTE — aquí sí, al revés que en el punto de
          la pastilla de modelo: allí el `aria-label` se sumaba al nombre del botón
          que lo contenía y lo estropeaba; estos botones no tienen texto, así que sin
          `aria-label` no tendrían nombre ninguno, y «Editar» repetido cinco veces no
          distingue cuál es cuál para quien navega por voz.
        */}
        <button
          type="button"
          className={estilos.icono}
          aria-label={`Editar ${a.nombre}`}
          title="Editar"
          onClick={() => {
            alAbrir(undefined);
            alEditar();
          }}
        >
          <IconEditOutline16 size={18} />
        </button>
        {/* Un de serie SE EDITA pero no se borra, así que aquí no hay papelera que esconder:
            no está. El hueco no queda vacío cuando hay algo que restaurar — ese botón va
            abajo, con la frase que explica por qué existe. */}
        {a.semilla === undefined ? (
          <button
            type="button"
            className={clsx(estilos.icono, estilos.iconoDestructivo)}
            aria-label={`Eliminar ${a.nombre}`}
            title="Eliminar"
            onClick={() => alternar("borrar")}
          >
            <IconTrashOutline16 size={18} />
          </button>
        ) : null}
      </div>
      <p className={estilos.descripcion}>{a.descripcion}</p>
      {/*
        Que un de serie esté editado se dice AQUÍ, y esto es lo que salía en la caja roja de
        arriba —junto a los `.md` que no cargan, o sea en rojo y con `role="alert"` sobre dos
        agentes que están perfectamente—. Y se dice la consecuencia, que es lo único que hace
        la frase útil: lo que se pierde no es «ser el de serie», es que las correcciones que
        publiquemos ya no le llegan (`sembrarAgentes` no pisa lo que el usuario tocó).

        La frase de antes mandaba a BORRARLO para tener el nuevo, y eso no funcionaba: la
        marca recuerda que se entregó, así que borrarlo dejaba sin ninguno de los dos.
      */}
      {a.semilla === "modificada" && confirmando !== "restaurar" ? (
        <p className={estilos.restaurar}>
          Lo has editado, así que las mejoras que publiquemos en él ya no te llegan.{" "}
          <Button variant="outline" className={estilos.accionDeFila} onClick={() => alternar("restaurar")}>
            Restaurar el de serie
          </Button>
        </p>
      ) : null}
      {/* Las dos confirmaciones viven en la propia fila y no al primer clic: las dos escriben
          un fichero y no hay papelera, igual que en la barra de sesiones. Restaurar no borra,
          pero pisa un prompt afinado a mano, que es trabajo que tampoco vuelve. */}
      {confirmando === "borrar" ? (
        <p className={estilos.confirmar}>
          Se borra el fichero de «{a.nombre}». No hay papelera.{" "}
          <Button
            variant="outline"
            className={estilos.destructiva}
            onClick={() => {
              alBorrar();
              alAbrir(undefined);
            }}
          >
            Eliminar
          </Button>
        </p>
      ) : null}
      {confirmando === "restaurar" ? (
        <p className={estilos.confirmar}>
          Se pisa tu versión de «{a.nombre}» con la de xonecode. Lo que hayas escrito no vuelve.{" "}
          <Button
            variant="outline"
            className={estilos.destructiva}
            onClick={() => {
              alRestaurar();
              alAbrir(undefined);
            }}
          >
            Restaurar
          </Button>
        </p>
      ) : null}
    </li>
  );
}
