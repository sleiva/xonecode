import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { Transcript } from "./Transcript.js";

// `globals` no está activado: sin `cleanup` explícito el segundo `render()` de este
// fichero deja montado el primero y las consultas revientan con «found multiple
// elements» — la misma trampa que ya documenta `Compositor.test.tsx`.
afterEach(cleanup);

/**
 * `Transcript` ya no lleva las pestañas: se fueron a `Cabecera`, que es donde viven en el
 * CSS de deepseek (dentro del mismo `<header>` que pinta la línea de separación), y con
 * ellas se fue el `useState`. Lo que queda que probar aquí es que la pestaña que le
 * DICEN es la vista que pinta — el comportamiento de la tira está en `Cabecera.test.tsx`.
 */
describe("Transcript", () => {
  const ACTOS = [
    { tipo: "usuario", texto: "hola" },
    { tipo: "herramientas", lineas: ["read_file docs/uno.xne"] },
  ] as const;

  /**
   * El trabajo del agente se ve EN EL CHAT, no solo en la otra pestaña. Antes el chat
   * pintaba únicamente los globos y todo lo demás vivía en las Trazas: se escribía una
   * petición y no pasaba nada durante minutos, con el agente trabajando a la vista de nadie.
   */
  it("con «chat» pinta la conversación Y el pulso del turno: tools, fases y razonamiento", () => {
    render(
      <Transcript
        actos={[
          ...ACTOS,
          { tipo: "razonamiento", texto: "lo pienso" },
          { tipo: "fase", texto: "planificando", ms: 2400 },
        ]}
        pestana="chat"
      />
    );
    expect(screen.getByText("hola")).toBeTruthy();
    // En la LISTA del pulso. La misma línea sale además en el `summary` —es el paso actual,
    // que se ve con el pulso plegado—, así que `getByText` a secas encuentra dos.
    expect(document.querySelector("ul li")?.textContent).toMatch(/read_file/);
    expect(screen.getByText(/planificando/)).toBeTruthy();
    // Turno EN CURSO (no ha llegado `fin`): el resumen lo DICE, y el pulso nace PLEGADO
    // también entonces. Se abría, «porque es lo único que se ve mientras trabaja»; dejó de
    // ser cierto cuando ese resumen empezó a llevar el paso actual y su cronómetro —lo que se
    // lee con el pulso plegado—, y un tramo abierto de cuarenta pasos empuja la respuesta
    // fuera de la pantalla.
    expect(screen.getByText(/trabajando/i)).toBeTruthy();
    expect(document.querySelector("details")?.hasAttribute("open")).toBe(false);
  });

  /**
   * Al terminar el turno, el andamio se dobla: la conversación se lee sin él y sigue a un
   * clic. No se borra — lo que pasó, pasó.
   */
  it("cuando el turno TERMINA, el pulso se pliega en una línea con su cuenta", () => {
    render(
      <Transcript
        actos={[
          { tipo: "usuario", texto: "hola" },
          { tipo: "razonamiento", texto: "lo pienso" },
          { tipo: "herramientas", lineas: ["read_file a", "read_file b"] },
          { tipo: "asistente", texto: "hecho" },
          { tipo: "fin", ms: 12400 },
        ]}
        pestana="chat"
      />
    );
    const detalle = document.querySelector("details")!;
    expect(detalle.hasAttribute("open")).toBe(false);
    // Tres pasos: el razonamiento y las dos líneas de tool.
    expect(detalle.textContent).toMatch(/3 pasos/);
    expect(detalle.textContent).toMatch(/12\.4s/);
    // Y la respuesta se sigue leyendo, que es lo que queda cuando se dobla el andamio.
    expect(screen.getByText("hecho")).toBeTruthy();
  });

  /**
   * Los avisos de la consola SÍ se ven en el chat, y esto cambió a propósito: estaban solo
   * en las trazas, y por ese canal pasan la respuesta a un comando que el usuario acaba de
   * teclear y los avisos de honestidad (`core/bitacora.ts`). Un aviso que solo vive en la
   * pestaña de depurar el harness es exactamente el aviso que nadie lee.
   *
   * Lo que sigue siendo SOLO de las trazas es el `fin`: es el cierre del turno con su
   * duración, un dato del registro y no algo que nadie tenga que leer en la conversación.
   */
  it("con «chat» se ven los avisos de sistema, pero no el cierre del turno", () => {
    render(
      <Transcript
        actos={[
          { tipo: "sistema", texto: "credencial guardada en algún sitio" },
          { tipo: "fin", ms: 1200 },
        ]}
        pestana="chat"
      />
    );
    expect(screen.getByText(/credencial guardada/)).toBeTruthy();
    expect(screen.queryByText(/1200|1,2 s|1\.2s/)).toBeNull();
  });

  it("con «trazas» pinta el detalle técnico", () => {
    render(<Transcript actos={[...ACTOS]} pestana="trazas" />);
    expect(screen.getByText(/read_file/)).toBeTruthy();
  });

  /**
   * **La ranura, no el contenido**: cada panel se monta al elegir su pestaña y solo entonces
   * —`{pestana === … ? … : …}`—, que es lo que hace que la petición que cada uno lleva dentro
   * no salga hasta que alguien abre la suya. Si Revisión se cayera del despacho, la pestaña se
   * pintaría VACÍA, y eso es un control sin dato detrás con su botón ya pulsado.
   *
   * Revisión es además la que lleva DENTRO la banda de CloudStudio, así que este es el test
   * que vigila que la mudanza no dejara sus dos botones sin montar en ninguna pestaña.
   */
  it("la pestaña «revision» pinta SU panel, y no el de al lado", () => {
    render(
      <Transcript
        actos={[...ACTOS]}
        pestana="revision"
        revision={<p>lo de revisión</p>}
        ficheros={<p>lo de ficheros</p>}
      />
    );
    expect(screen.getByText("lo de revisión")).toBeTruthy();
    expect(screen.queryByText("lo de ficheros")).toBeNull();
  });

  /**
   * **Y este es el test que faltaba, porque aquí el despacho tiene una trampa que las otras
   * pestañas no tienen: la última rama es un `else` INCONDICIONAL.**
   *
   * La cadena acaba en `: pestana === "tareas" ? (tareas) : (ficheros)` — sin condición—, así
   * que una pestaña que no tenga su rama propia **no se queda vacía: pinta FICHEROS**, que es
   * el panel de otra. Y no se queda vacía en silencio, además: enseña un contenido plausible y
   * equivocado, con lo que el síntoma es «la pestaña Ejecutar me muestra el árbol del
   * proyecto» y no un hueco que alguien vaya a investigar.
   *
   * Por eso este caso no comprueba solo que se pinte SU panel —eso lo haría pasar el `else`
   * por accidente si el panel de al lado no estuviera montado—: monta los dos a la vez y exige
   * que se vea el suyo **y que el de Ficheros NO**. Con la rama borrada, este test se pone
   * rojo; sin él, borrarla no rompía nada.
   */
  it("«ejecutar» pinta SU panel y no Ficheros: la última rama del ternario es un `else`", () => {
    render(
      <Transcript
        actos={[...ACTOS]}
        pestana="ejecutar"
        ejecutar={<p>lo de ejecutar</p>}
        ficheros={<p>lo de ficheros</p>}
      />
    );
    expect(screen.getByText("lo de ejecutar")).toBeTruthy();
    expect(screen.queryByText("lo de ficheros")).toBeNull();
  });
});
