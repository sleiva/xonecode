import { useRef, useState } from "react";
import clsx from "clsx";
import {
  Button,
  Input,
  IconEditOutline16,
  IconTrashOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { SkillDelCable } from "../tipos.js";
import { abreviar } from "../cifras.js";
import estilos from "./Skills.module.css";

/**
 * La sección de skills de la ventana de ajustes, debajo de Subagentes.
 *
 * Una skill es una carpeta con un `SKILL.md` dentro: unas instrucciones que el modelo carga
 * **bajo demanda**, cuando su descripción le dice que le sirven. Eso es lo que la distingue
 * de un subagente —que es *quién* hace el trabajo— y de las instrucciones del proyecto, que
 * van siempre: una skill se paga solo cuando se usa. Por eso la ficha enseña su COSTE al
 * lado del nombre; es la cifra que decide si merece la pena tenerla.
 *
 * Tres cosas que no son de forma:
 *
 * - **Las de xonecode no se editan, y la ventana lo dice con un camino en vez de con un
 *   botón apagado.** Viven dentro del paquete instalado, así que una edición se la llevaría
 *   el siguiente `npm install` sin avisar. Lo que se ofrece es COPIARLA a las tuyas, que
 *   además deja ver de dónde salió. La negativa vive en el SERVIDOR: aquí solo se deja de
 *   ofrecer, que es presentación.
 * - **El cuerpo de una de serie se pide al abrirla, no al cargar la ventana.** Son ficheros
 *   de decenas de miles de caracteres: mandarlos todos en la ráfaga de bienvenida es pagar
 *   cientos de kilobytes por rellenar un formulario que nadie puede guardar.
 * - **Los anexos se CUENTAN y no se editan.** Una skill puede ser una carpeta entera
 *   —plantillas, ejemplos, un script—, y una ventana que solo enseña el `SKILL.md` haría
 *   creer que editarlo es editarla toda. Se dicen por nombre y se dejan donde viven, que es
 *   la misma postura que `omitidas` en el plan de subida.
 */

type Grupo = "serie" | "propias";

/**
 * Los dos grupos, con su rótulo y lo que dice su panel vacío.
 *
 * Los separa `origen`, que aquí SÍ contesta de quién es el fichero —a diferencia de los
 * subagentes, donde la carpeta global también aloja los del usuario—: `serie` es el paquete
 * y las otras dos son del usuario, en la carpeta que él eligió.
 */
const GRUPOS: readonly { clave: Grupo; titulo: string; vacio: string }[] = [
  {
    clave: "serie",
    titulo: "De xonecode",
    vacio: "No se encontró el catálogo que trae xonecode.",
  },
  {
    clave: "propias",
    titulo: "Tuyas",
    vacio: "No has escrito ninguna. «Nueva skill» escribe la primera, o copia una de xonecode.",
  },
];

/**
 * Cuántos nombres de anexo se enseñan antes de pasar a contarlos.
 *
 * Seis y no todos: medido en el navegador con `archify`, que lleva 76 — la lista entera
 * tapaba la fila y la pestaña dejaba de contestar «qué skills hay» para contestar «qué
 * ficheros tiene ésta».
 */
const ANEXOS_A_LA_VISTA = 6;

/** La pastilla de origen. Dato de máquina: dónde vive el fichero, no una valoración. */
const PASTILLA: Record<SkillDelCable["origen"], string> = {
  serie: "xonecode",
  global: "global",
  proyecto: "proyecto",
};

/** Lo que se está editando: una skill del usuario, más de dónde partió. */
interface Edicion {
  nombre: string;
  descripcion: string;
  cuerpo: string;
  /**
   * El frontmatter de ANTES, que viaja de vuelta sin que la ventana lo toque.
   *
   * Es lo que hace que abrir una skill escrita a mano y pulsar Guardar no le borre su
   * `license`, su `allowed-tools` ni su bloque `metadata`: la ventana edita `name`,
   * `description` y el cuerpo, y lo demás se conserva porque se lleva. Sin esto, la pérdida
   * era muda y sobre un fichero del usuario.
   */
  frontmatter?: string;
  /** El nombre de ANTES. Ausente en un alta y en una copia, que son ficheros nuevos. */
  renombrandoDe?: string;
}

export function Skills({
  skills,
  problemas,
  cuerpos,
  hayProyecto,
  alPedirCuerpo,
  alGuardar,
  alBorrar,
  alInstalar,
}: {
  /** Ausente = todavía no llegó el mensaje, que NO es «no hay ninguna». */
  skills?: readonly SkillDelCable[];
  problemas?: readonly string[];
  /** Los cuerpos ya pedidos. Una clave con `undefined` es «se pidió y no se pudo leer». */
  cuerpos?: Readonly<Record<string, string | undefined>>;
  hayProyecto: boolean;
  alPedirCuerpo: (nombre: string) => void;
  alGuardar: (skill: SkillDelCable, ambito: "global" | "proyecto", renombrandoDe?: string) => void;
  alBorrar: (skill: SkillDelCable, ambito: "global" | "proyecto") => void;
  /**
   * Instala una skill desde un `.zip`. Devuelve el motivo si no se pudo.
   *
   * Un `.zip` y no una carpeta ni un `SKILL.md` suelto: **una skill es una CARPETA** —con
   * sus plantillas, sus ejemplos y sus referencias—, así que subir solo el `.md` instalaría
   * una skill a la que le faltan justo los ficheros a los que apunta. El zip es lo que
   * viaja entero por una sola petición.
   *
   * Ausente = esta consola no sabe instalar (los dobles de los tests), y entonces el botón
   * NO se pinta: un control que no puede cumplir es peor que ninguno.
   */
  alInstalar?: (nombre: string, ambito: "global" | "proyecto", zip: File) => Promise<{ ok: boolean; motivo?: string }>;
}) {
  const [pestana, setPestana] = useState<Grupo>("serie");
  const [editando, setEditando] = useState<Edicion | undefined>(undefined);
  const [ambito, setAmbito] = useState<"global" | "proyecto">("global");
  const [abierta, setAbierta] = useState<string | undefined>(undefined);
  const [borrando, setBorrando] = useState<string | undefined>(undefined);
  /** Lo que pasó con la última instalación. Se tira al empezar otra. */
  const [instalacion, setInstalacion] = useState<{ trabajando: boolean; error?: string }>({ trabajando: false });
  const elector = useRef<HTMLInputElement>(null);

  // Ausente ≠ vacío: mientras el mensaje no ha llegado no se afirma que no haya ninguna.
  if (skills === undefined) {
    return <p className={estilos.nota}>Consultando las skills…</p>;
  }

  const porGrupo: Record<Grupo, SkillDelCable[]> = {
    serie: skills.filter((s) => s.origen === "serie"),
    propias: skills.filter((s) => s.origen !== "serie"),
  };

  /** Abrir una ficha de serie: se pide su cuerpo la PRIMERA vez y no en cada clic. */
  const abrir = (skill: SkillDelCable): void => {
    if (abierta === skill.nombre) {
      setAbierta(undefined);
      return;
    }
    setAbierta(skill.nombre);
    if (skill.cuerpo === undefined && !(cuerpos !== undefined && skill.nombre in cuerpos)) {
      alPedirCuerpo(skill.nombre);
    }
  };

  /**
   * Dónde cae lo que se da de alta desde esta pestaña: el proyecto si hay uno, y si no el
   * global. La misma omisión que el formulario de «Nueva skill», porque son la misma
   * decisión —y ahí se puede cambiar, mientras que instalar un zip es un solo gesto.
   */
  const ambitoDeAlta: "global" | "proyecto" = hayProyecto ? "proyecto" : "global";

  const nueva = (): void => {
    setEditando({ nombre: "", descripcion: "", cuerpo: "" });
    setAmbito(ambitoDeAlta);
    setBorrando(undefined);
  };

  const editar = (skill: SkillDelCable): void => {
    setEditando({
      nombre: skill.nombre,
      descripcion: skill.descripcion,
      cuerpo: skill.cuerpo ?? "",
      ...(skill.frontmatter === undefined ? {} : { frontmatter: skill.frontmatter }),
      renombrandoDe: skill.nombre,
    });
    // El ámbito arranca donde la skill YA vive, para que guardar sin tocarlo no la mueva.
    // **Límite declarado, el mismo que tienen los subagentes**: cambiarlo al editar no la
    // MUDA — escribe una copia en la otra carpeta y deja la original donde estaba, porque el
    // renombrado del servidor busca el origen dentro de la carpeta de destino. Mover una
    // skill de sitio es copiarla y borrar la de antes.
    setAmbito(skill.origen === "proyecto" ? "proyecto" : "global");
    setBorrando(undefined);
  };

  /**
   * Copiar una de serie a las tuyas.
   *
   * Sale SIN `renombrandoDe` —es un fichero nuevo, no un movimiento— y con el nombre vacío a
   * propósito: reutilizarlo daría un destino ocupado, y el servidor lo rechazaría con un
   * mensaje que no explica lo que acaba de pasar. Que lo teclee quien copia es además donde
   * se decide en qué se diferencia la suya.
   */
  const copiar = (skill: SkillDelCable, cuerpo: string): void => {
    // La copia se lleva TAMBIÉN el frontmatter del original: copiar una skill es partir de
    // ella, y `license` o `metadata` son parte de lo que dice el fichero del que se parte.
    setEditando({
      nombre: "",
      descripcion: skill.descripcion,
      cuerpo,
      ...(skill.frontmatter === undefined ? {} : { frontmatter: skill.frontmatter }),
    });
    setAmbito(hayProyecto ? "proyecto" : "global");
    setAbierta(undefined);
  };

  if (editando !== undefined) {
    const malNombre = editando.nombre.trim() === "" || editando.descripcion.trim() === "";
    return (
      <div className={estilos.formulario}>
        <label className={estilos.campo}>
          <span className={estilos.rotulo}>
            Nombre <span className={estilos.pista}>— es la carpeta: minúsculas, dígitos y guiones</span>
          </span>
          <Input
            value={editando.nombre}
            onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
          />
        </label>

        {/*
          La descripción va rotulada como lo que es: el texto que el modelo lee para decidir
          si esta skill le sirve. Es la misma disciplina que la del subagente — una vaga hace
          que no se cargue nunca, o que se cargue para todo, y quien la escribe tiene que
          saberlo mientras la escribe.
        */}
        <label className={estilos.campo}>
          <span className={estilos.rotulo}>
            Descripción <span className={estilos.pista}>— cuándo cargarla; la lee el modelo</span>
          </span>
          <Input
            value={editando.descripcion}
            onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })}
          />
        </label>

        <label className={estilos.campo}>
          <span className={estilos.rotulo}>
            Instrucciones <span className={estilos.pista}>— el cuerpo del SKILL.md</span>
          </span>
          <textarea
            className={estilos.instrucciones}
            rows={14}
            value={editando.cuerpo}
            onChange={(e) => setEditando({ ...editando, cuerpo: e.target.value })}
          />
        </label>

        {/* El ámbito solo se ofrece si hay dónde elegir: sin proyecto abierto, el suyo no
            existe y un desplegable de una sola opción es una pregunta que no lo es. */}
        {hayProyecto ? (
          <label className={estilos.campo}>
            <span className={estilos.rotulo}>Dónde se guarda</span>
            <select
              className={estilos.selector}
              value={ambito}
              onChange={(e) => setAmbito(e.target.value === "proyecto" ? "proyecto" : "global")}
            >
              <option value="proyecto">En este proyecto</option>
              <option value="global">Para todos tus proyectos</option>
            </select>
          </label>
        ) : null}

        <div className={estilos.botones}>
          <Button className={estilos.accion} variant="outline" onClick={() => setEditando(undefined)}>
            Cancelar
          </Button>
          <Button
            className={estilos.principal}
            disabled={malNombre}
            onClick={() => {
              alGuardar(
                {
                  nombre: editando.nombre.trim(),
                  descripcion: editando.descripcion.trim(),
                  origen: ambito,
                  tokens: 0,
                  ficheros: [],
                  cuerpo: editando.cuerpo,
                  ...(editando.frontmatter === undefined ? {} : { frontmatter: editando.frontmatter }),
                },
                ambito,
                editando.renombrandoDe
              );
              setEditando(undefined);
            }}
          >
            Guardar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className={estilos.nota}>
        Una skill es una carpeta con un <code>SKILL.md</code> dentro: instrucciones que el modelo
        carga <strong>solo cuando su descripción le dice que le sirven</strong>. Las tuyas viven en{" "}
        <code>.xonecode/skills/</code>; las de un proyecto solo valen ahí, y pisan a la global del
        mismo nombre.
      </p>

      {/* Las carpetas que no cargan, con su motivo. Quien las tiene que arreglar está
          mirando esta ventana. Que una tuya tape a una de serie NO entra aquí: eso es la
          forma de afinarla, y lo dice su ficha con el origen al lado. */}
      {problemas !== undefined && problemas.length > 0 ? (
        <ul className={estilos.problemas} role="alert">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <div className={estilos.pestanas} role="tablist" aria-label="Skills por origen">
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
              // Lo abierto y lo armado se cierran al cambiar de pestaña: volver a la otra
              // enseñaría un botón rojo apuntando a una fila que ya nadie mira.
              setAbierta(undefined);
              setBorrando(undefined);
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
        {pestana === "propias" ? (
          <>
            <div className={estilos.acciones}>
              <Button className={clsx(estilos.accion, estilos.nuevo)} variant="outline" onClick={nueva}>
                Nueva skill
              </Button>
              {/*
                Instalar una que ya existe. El `<input type="file">` va escondido y lo dispara
                el botón: el control nativo llega con el aspecto del navegador —y con un «Sin
                archivos seleccionados» al lado— en medio de una ventana que no se parece a
                eso. Se esconde con `display: none` a propósito: no tiene que ser alcanzable
                por teclado, porque quien lo es es el botón que lo abre.
              */}
              {alInstalar === undefined ? null : (
                <>
                  <Button
                    className={clsx(estilos.accion, estilos.nuevo)}
                    variant="outline"
                    disabled={instalacion.trabajando}
                    onClick={() => elector.current?.click()}
                  >
                    {instalacion.trabajando ? "Instalando…" : "Instalar un .zip"}
                  </Button>
                  <input
                    ref={elector}
                    type="file"
                    accept=".zip,application/zip"
                    className={estilos.elector}
                    onChange={(e) => {
                      const fichero = e.target.files?.[0];
                      // El valor se limpia SIEMPRE: sin esto, elegir el mismo fichero dos
                      // veces seguidas no dispara `change` y el segundo intento no hace nada.
                      e.target.value = "";
                      if (fichero === undefined) return;
                      setInstalacion({ trabajando: true });
                      void alInstalar(fichero.name, ambitoDeAlta, fichero).then((r) =>
                        setInstalacion({
                          trabajando: false,
                          ...(r.ok ? {} : { error: r.motivo ?? "no se pudo instalar" }),
                        })
                      );
                    }}
                  />
                </>
              )}
            </div>
            {/*
              El motivo del servidor, en su sitio y con palabras: «no trae SKILL.md», «ya hay
              una así». Es lo que hace que un zip rechazado no se lea como que la ventana no
              responde. Un acierto no deja rastro: la skill aparece en la lista, que es el
              acuse.
            */}
            {instalacion.error !== undefined ? (
              <p className={estilos.problemas} role="alert">
                {instalacion.error}
              </p>
            ) : null}
          </>
        ) : null}
        {porGrupo[pestana].length === 0 ? (
          <p className={estilos.vacio}>{GRUPOS.find((g) => g.clave === pestana)!.vacio}</p>
        ) : (
          <ul className={estilos.filas}>
            {porGrupo[pestana].map((s) => (
              <FilaDeSkill
                key={s.nombre}
                skill={s}
                abierta={abierta === s.nombre}
                cuerpoPedido={cuerpos !== undefined && s.nombre in cuerpos ? cuerpos[s.nombre] : undefined}
                sePidio={cuerpos !== undefined && s.nombre in cuerpos}
                borrando={borrando === s.nombre}
                alAbrir={() => abrir(s)}
                alEditar={() => editar(s)}
                alCopiar={(cuerpo) => copiar(s, cuerpo)}
                alArmarBorrado={() => setBorrando(borrando === s.nombre ? undefined : s.nombre)}
                alBorrar={() => {
                  alBorrar(s, s.origen === "proyecto" ? "proyecto" : "global");
                  setBorrando(undefined);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function FilaDeSkill({
  skill,
  abierta,
  cuerpoPedido,
  sePidio,
  borrando,
  alAbrir,
  alEditar,
  alCopiar,
  alArmarBorrado,
  alBorrar,
}: {
  skill: SkillDelCable;
  abierta: boolean;
  cuerpoPedido?: string;
  sePidio: boolean;
  borrando: boolean;
  alAbrir: () => void;
  alEditar: () => void;
  alCopiar: (cuerpo: string) => void;
  alArmarBorrado: () => void;
  alBorrar: () => void;
}) {
  const deSerie = skill.origen === "serie";
  // El del cable si vino (las tuyas), y si no el que se pidió a mano (las de serie).
  const cuerpo = skill.cuerpo ?? cuerpoPedido;

  return (
    <li className={estilos.fila}>
      <div className={estilos.cabeceraDeFila}>
        <span className={estilos.nombre}>{skill.nombre}</span>
        <span className={estilos.origen}>{PASTILLA[skill.origen]}</span>
        {/*
          El coste, que es la cifra que decide si una skill merece la pena: se paga entera
          cada vez que el modelo la carga. Va en la fila y no escondida en un `title` por eso
          mismo — es el dato de la decisión, no un detalle.
        */}
        <span className={estilos.tokens} title={`${skill.tokens} tokens si el modelo la carga`}>
          {abreviar(skill.tokens)} tok
        </span>
        <span className={estilos.relleno} />
        <button
          type="button"
          className={estilos.accionDeFila}
          aria-expanded={abierta}
          onClick={alAbrir}
        >
          {abierta ? "Ocultar" : "Ver"}
        </button>
        {deSerie ? null : (
          <>
            <button
              type="button"
              className={estilos.icono}
              aria-label={`Editar ${skill.nombre}`}
              onClick={alEditar}
            >
              <IconEditOutline16 />
            </button>
            <button
              type="button"
              className={clsx(estilos.icono, estilos.iconoDestructivo)}
              aria-label={`Borrar ${skill.nombre}`}
              onClick={alArmarBorrado}
            >
              <IconTrashOutline16 />
            </button>
          </>
        )}
      </div>

      {abierta ? (
        <div className={estilos.cuerpo}>
          {/*
            El frontmatter ENTERO, tal como está en el fichero, y NO un párrafo con la
            descripción al lado.
            
            Dos cosas, las dos medidas en el navegador. Una: `description` no es lo único que
            puede haber ahí —`archify` declara además `license` y un bloque `metadata`
            anidado—, así que enseñar solo la descripción hacía creer que eso era todo lo que
            el `SKILL.md` dice. Y la otra: puesta ADEMÁS como párrafo legible, la misma frase
            de ocho renglones salía dos veces seguidas, que es la duplicación de siempre —la
            que ya se quitó de las marcas de «trabajando»— y encima hacía dudar de cuál de las
            dos era la de verdad.

            Se pinta CRUDO, sin reordenar ni reformatear: lo que contesta es «qué declara este
            fichero», y una versión maquetada ya no contestaría eso. Y lo que la ventana no
            edita se CONSERVA al guardar, que es la otra mitad de la misma decisión.
          */}
          {skill.frontmatter !== undefined && skill.frontmatter.trim() !== "" ? (
            <>
              <p className={estilos.rotuloDeBloque}>Frontmatter</p>
              <pre className={estilos.frontmatter}>{skill.frontmatter.trimEnd()}</pre>
            </>
          ) : (
            // Sin frontmatter que enseñar —una skill que el cable trajo sin él— queda la
            // descripción, que es lo único que consta. Ausente ≠ vacío también aquí.
            <p className={estilos.descripcion}>{skill.descripcion}</p>
          )}

          {/*
            Y los anexos se CUENTAN, con unos pocos nombres de ejemplo. `archify` lleva 76:
            volcarlos era una pared de rutas. Lo que no cabe se DICE con su número, que es la
            regla de siempre — una lista recortada en silencio se lee como la lista entera.
          */}
          {skill.ficheros.length > 0 ? (
            <p className={estilos.anexos}>
              Además del <code>SKILL.md</code> lleva {skill.ficheros.length}{" "}
              {skill.ficheros.length === 1 ? "fichero" : "ficheros"}:{" "}
              <span className={estilos.listaDeAnexos}>
                {skill.ficheros.slice(0, ANEXOS_A_LA_VISTA).join(", ")}
              </span>
              {skill.ficheros.length > ANEXOS_A_LA_VISTA
                ? ` y ${skill.ficheros.length - ANEXOS_A_LA_VISTA} más`
                : ""}
              . Se quedan como están: aquí solo se edita el <code>SKILL.md</code>.
            </p>
          ) : null}

          {cuerpo !== undefined ? (
            <>
              <p className={estilos.rotuloDeBloque}>Instrucciones</p>
              <pre className={estilos.texto}>{cuerpo}</pre>
              {deSerie ? (
                <div className={estilos.piePropio}>
                  {/* La única acción sobre una de serie, y la ventana lo explica con el
                      camino en vez de con un botón apagado: editarla aquí la perdería el
                      siguiente `npm install`. */}
                  <span>
                    Esta la trae xonecode y no se edita: el siguiente <code>npm install</code> se
                    llevaría el cambio.
                  </span>
                  <button
                    type="button"
                    className={estilos.accionDeFila}
                    onClick={() => alCopiar(cuerpo)}
                  >
                    Copiar a las tuyas
                  </button>
                </div>
              ) : null}
            </>
          ) : sePidio ? (
            // Se pidió y no vino: se DICE. Una ficha en blanco se leería como que la skill
            // no dice nada, y copiarla produciría una copia vacía.
            <p className={estilos.vacio}>No se pudo leer el SKILL.md de esta skill.</p>
          ) : (
            <p className={estilos.vacio}>Leyendo…</p>
          )}
        </div>
      ) : null}

      {borrando ? (
        <div className={estilos.confirmar}>
          <span>Se borra la carpeta entera, anexos incluidos. No hay papelera.</span>
          <Button className={clsx(estilos.accion, estilos.destructiva)} onClick={alBorrar}>
            Borrar
          </Button>
        </div>
      ) : null}
    </li>
  );
}
