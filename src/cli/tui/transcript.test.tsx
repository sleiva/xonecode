/**
 * El viewport del transcript, probado por su frame (ink-testing-library) y por la
 * lógica PURA de la ventana.
 *
 * El scroll de teclas se prueba de las dos maneras: los cálculos de ventana y de
 * desfase viven en funciones puras exportadas (fiables, sin terminal detrás), y una
 * única prueba escribe la secuencia PageUp en el stdin falso para probar el cable
 * `useInput` → desfase. Si la emulación de teclado se demostrara frágil, las puras
 * sostienen el comportamiento y la de teclas se retira sin perder cobertura.
 */
import { describe, it, expect } from "vitest";
import { Box } from "ink";
import { render } from "ink-testing-library";
import { Transcript, ventanaDe, moverDesfase, colorDeSegmento } from "./transcript.js";
import { crearStore } from "./store.js";
import { crearEmisorDeRueda } from "./raton.js";
import { temaInk } from "./temaInk.js";

const esperar = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

/** Diez actos de sistema numerados, para hablar de la ventana por su contenido. */
const diez = (): { tipo: "sistema"; texto: string }[] =>
  Array.from({ length: 10 }, (_, i) => ({ tipo: "sistema", texto: `t${i}` }));

describe("la ventana pura del transcript", () => {
  it("sin desfase toma los ÚLTIMOS actos que caben", () => {
    expect(ventanaDe(diez(), 3, 0).map((a) => a.texto)).toEqual(["t7", "t8", "t9"]);
  });

  it("con desfase sube la ventana, y no se sale por abajo ni por arriba", () => {
    expect(ventanaDe(diez(), 3, 4).map((a) => a.texto)).toEqual(["t3", "t4", "t5"]);
    // Desfase mayor que el contenido: la ventana queda vacía antes que inventar actos.
    expect(ventanaDe(diez(), 3, 20)).toEqual([]);
    expect(ventanaDe([], 3, 0)).toEqual([]);
  });

  it("moverDesfase acota entre 0 y el último acto: al subir no deja un panel vacío", () => {
    expect(moverDesfase(0, 30, 10)).toBe(10);
    expect(moverDesfase(25, 30, 10)).toBe(29);
    expect(moverDesfase(5, 30, -10)).toBe(0);
  });
});

describe("el transcript pintado", () => {
  it("el color de un segmento inline: negrita, código en ACENTO y mudo; lo demás sin color", () => {
    // Los tests no ven color (sin TTY chalk no emite): la elección vive en una función
    // pura. El código inline va en acento — la decisión de la captura de OpenCode.
    expect(colorDeSegmento("negrita")).toBe(temaInk.negrita);
    expect(colorDeSegmento("codigo")).toBe(temaInk.acento);
    expect(colorDeSegmento("mudo")).toBe(temaInk.mudo);
    expect(colorDeSegmento("normal")).toBeUndefined();
  });

  it("pinta los últimos actos y el colchón como línea en curso", () => {
    const s = crearStore();
    s.usuario("hola");
    s.token("¡Hola! **listo**\n");
    const { lastFrame } = render(<Transcript store={s} altura={10} />);
    const salida = lastFrame() ?? "";
    expect(salida).toContain("┃ hola");
    expect(salida).not.toContain("❯");
    expect(salida).toContain("¡Hola! listo");
    expect(salida).not.toContain("**");
  });

  it("con más actos que altura, la ventana vive al fondo", () => {
    const s = crearStore();
    for (let i = 0; i < 30; i++) s.linea(`línea ${i}`, "sistema");
    // La ventana se mide en FILAS físicas: el contenido completo se deja a Ink y el
    // contenedor de cinco filas recorta lo antiguo por arriba.
    const { lastFrame } = render(
      <Box height={5} flexDirection="column">
        <Transcript store={s} altura={5} />
      </Box>
    );
    expect(lastFrame()).toContain("línea 29");
    expect(lastFrame()).not.toContain("línea 0\n");
  });

  it("el markdown del asistente: cabecera, viñeta y código sin marcadores", () => {
    const s = crearStore();
    s.linea("## Resumen", "asistente");
    s.linea("- punto uno", "asistente");
    s.linea("usa `xne` ya", "asistente");
    const { lastFrame } = render(<Transcript store={s} altura={10} />);
    const salida = lastFrame() ?? "";
    expect(salida).toContain("Resumen");
    expect(salida).not.toContain("##");
    expect(salida).toContain("• punto uno");
    expect(salida).toContain("usa xne ya");
    expect(salida).not.toContain("`");
  });

  it("cada acto se pinta por su tipo", () => {
    const s = crearStore({ ahora: () => 1000 });
    s.usuario("hazlo");
    s.linea("→ lee app.xne", "tool");
    s.linea("aviso honesto", "sistema");
    s.fase("planificando");
    s.fin(2400);
    const { lastFrame } = render(<Transcript store={s} altura={10} />);
    const salida = lastFrame() ?? "";
    expect(salida).toContain("┃ hazlo");
    expect(salida).toContain("→ lee app.xne");
    expect(salida).toContain("aviso honesto");
    // El fin cierra la fase viva con su duración, y él mismo se pinta con la suya.
    expect(salida).toContain("+ planificando: 0.0s");
    expect(salida).toContain("■ 2.4s");
    expect(salida).not.toContain("(2.4s)");
  });

  it("el cerco de código: el contenido en mudo y los marcadores fuera del frame", () => {
    const s = crearStore();
    s.linea("Mira:", "asistente");
    s.linea("```ts", "asistente");
    s.linea("const x = 1", "asistente");
    s.linea("```", "asistente");
    const salida = render(<Transcript store={s} altura={12} />).lastFrame() ?? "";
    expect(salida).toContain("const x = 1");
    expect(salida).toContain("ts"); // la cabecera del lenguaje, en mudo
    expect(salida).not.toContain("```");
  });

  it("el cerco sin cerrar deja el resto dentro: nada de cierres inventados", () => {
    const s = crearStore();
    s.linea("```ts", "asistente");
    s.linea("x = 1", "asistente");
    const salida = render(<Transcript store={s} altura={10} />).lastFrame() ?? "";
    expect(salida).toContain("x = 1");
    expect(salida).not.toContain("```");
  });

  it("las listas anidadas llevan sangría y las numeradas su número; ambas con marcador en acento", () => {
    const s = crearStore();
    s.linea("- padre", "asistente");
    s.linea("  - hijo", "asistente");
    s.linea("1. primero", "asistente");
    const lineas = (render(<Transcript store={s} altura={10} />).lastFrame() ?? "").split("\n");
    expect(lineas[0]).toContain("• padre");
    expect(lineas[1]).toContain("  • hijo");
    expect(lineas[2]).toContain("1. primero");
    // La guía del bloque precede a la lista, pero la sangría relativa de cada viñeta se
    // conserva: insertar en un Text anidado no remide (ink 5.2.1).
    expect(lineas[0]!.indexOf("• padre")).toBeLessThan(lineas[1]!.indexOf("• hijo"));
  });

  it("la cita lleva barra tenue, la hr se pinta de guiones, no literal", () => {
    const s = crearStore();
    s.linea("> ojo al dato", "asistente");
    s.linea("---", "asistente");
    const lineas = (render(<Transcript store={s} altura={10} />).lastFrame() ?? "").split("\n");
    expect(lineas[0]!.trimStart().startsWith("┃")).toBe(true); // la barra de la cita
    expect(lineas[0]).toContain("ojo al dato");
    expect(lineas[1]).toContain("───");
    expect(lineas[1]).not.toContain("---");
  });

  it("una cita sin contenido no se pinta: la barra huérfana no existe", () => {
    // Medido en el terminal: un «>» suelto del modelo dejaba una barra ┃ sola en la
    // pantalla. Una cita sin nada que citar es ruido.
    const s = crearStore();
    s.linea("texto normal", "asistente");
    s.linea(">", "asistente");
    s.linea(">   ", "asistente");
    const salida = render(<Transcript store={s} altura={10} />).lastFrame() ?? "";
    // La respuesta lleva su propia guía visual; no debe sumar otra para citas vacías.
    expect(salida).not.toContain("┃ ┃");
    expect(salida).toContain("texto normal");
  });

  it("una tabla markdown se pinta de GRID, como el TextTable de OpenTUI: borde single", () => {
    // Lo que OpenTUI dibuja con borderStyle "single": ┌┬┐ cabecera, ├┼┤ separador,
    // └┴┘ cierre; columnas a su máximo común. Las barras literales del markdown, fuera.
    const s = crearStore();
    s.linea("texto antes", "asistente");
    s.linea("| Colección | Nota |", "asistente");
    s.linea("|---|---|", "asistente");
    s.linea("| Empresas | mappings.xne |", "asistente");
    s.linea("texto después", "asistente");
    const lineas = (render(<Transcript store={s} altura={12} />).lastFrame() ?? "").split("\n");
    const iTop = lineas.findIndex((l) => l.includes("┌"));
    expect(iTop).toBeGreaterThan(0);
    expect(lineas[iTop]).toContain("┬");
    expect(lineas[iTop + 1]).toContain("│ Colección");
    expect(lineas[iTop + 1]).toContain("Nota"); // rellena a la anchura de la columna
    expect(lineas[iTop + 2]).toContain("┼");
    expect(lineas[iTop + 3]).toContain("│ Empresas");
    expect(lineas[iTop + 4]).toContain("└");
    // El texto alrededor no come de la tabla ni la barra literal queda.
    expect(lineas[0]).toContain("texto antes");
    expect(lineas.some((l) => l.includes("texto después"))).toBe(true);
    expect(lineas.filter((l) => l.includes("| Colección |"))).toHaveLength(0);
  });

  it("calcula la tabla con el ancho ÚTIL de la respuesta sangrada", () => {
    // La respuesta deja dos columnas a la izquierda, como OpenCode. Si el cálculo de
    // la tabla usase el ancho exterior, su borde derecho se envolvería y las columnas
    // quedarían partidas, justo el fallo que se ve en la terminal real.
    const s = crearStore();
    s.linea("| Propiedad | Tipo | Descripción |", "asistente");
    s.linea("|---|---|---|", "asistente");
    s.linea("| MAP_LOGIN_TITLE | T | Título de acceso |", "asistente");
    const lineas = (
      render(
        <Box width={40}>
          <Transcript store={s} altura={10} ancho={40} />
        </Box>
      ).lastFrame() ?? ""
    ).split("\n");
    for (const linea of lineas.filter((l) => l.includes("┌") || l.includes("┬") || l.includes("┤") || l.includes("┘"))) {
      expect(linea.length).toBeLessThanOrEqual(40);
    }
    const fila = lineas.find((linea) => linea.includes("MAP_LOGIN"));
    expect(fila?.lastIndexOf("│")).toBe(39);
  });

  it("el inline se parsea DENTRO de las celdas: ni ** ni comillas literales en la tabla", () => {
    // Medido en terminal: «**NO SE USA**» y `NoReplica` salían crudos dentro del grid.
    const s = crearStore();
    s.linea("| Campo | Valor |", "asistente");
    s.linea("|---|---|", "asistente");
    s.linea("| hash | marcada como **NO SE USA** en el `XML` |", "asistente");
    const salida = render(<Transcript store={s} altura={10} />).lastFrame() ?? "";
    expect(salida).toContain("NO SE USA");
    expect(salida).toContain("XML");
    expect(salida).not.toContain("**");
    expect(salida).not.toContain("`");
  });

  it("un enlace: su texto en acento y la url visible en mudo, entre paréntesis", () => {
    // En TUI no se puede hacer clic: la url se queda a la vista (en mudo) — despintarla
    // es quitarle información a quien lee. El color vive en colorDeSegmento.
    const s = crearStore();
    s.linea("mira [la doc](https://x.one/app)", "asistente");
    const salida = render(<Transcript store={s} altura={10} />).lastFrame() ?? "";
    expect(salida).toContain("la doc(https://x.one/app)");
    expect(salida).not.toContain("[");
    expect(salida).not.toContain("](https");
  });

  it("el fin con modelo se pinta como «■ modelo · Ns»", () => {
    const s = crearStore();
    s.fin(1800, "ollama/glm");
    expect(render(<Transcript store={s} altura={5} />).lastFrame()).toContain("■ ollama/glm · 1.8s");
  });

  it("PageUp sube la ventana y un acto nuevo la reancla al fondo", async () => {
    const s = crearStore();
    for (let i = 0; i < 30; i++) s.linea(`línea ${i}`, "sistema");
    const instancia = render(<Transcript store={s} altura={5} />);
    // Un tick antes de teclear: los efectos de Ink (el cable de useInput) se asientan
    // después del primer frame, y una tecla anterior se perdería en el stdin falso.
    await esperar();
    instancia.stdin.write("\x1b[5~"); // PageUp
    await esperar();
    expect(instancia.lastFrame()).toContain("línea 19");
    expect(instancia.lastFrame()).not.toContain("línea 29");
    // Lo nuevo manda: la ventana vuelve al fondo sin que el usuario pida nada.
    s.linea("acto nuevo", "sistema");
    await esperar();
    expect(instancia.lastFrame()).toContain("línea 29");
    expect(instancia.lastFrame()).toContain("acto nuevo");
  });

  it("la rueda del ratón mueve la ventana 3 actos por muesca, y un acto nuevo la reancla", async () => {
    const s = crearStore();
    for (let i = 0; i < 30; i++) s.linea(`línea ${i}`, "sistema");
    const rueda = crearEmisorDeRueda();
    const instancia = render(<Transcript store={s} altura={5} rueda={rueda} />);
    await esperar();
    rueda.emitir(1); // una muesca hacia arriba: ver lo viejo
    await esperar();
    expect(instancia.lastFrame()).toContain("línea 26");
    expect(instancia.lastFrame()).not.toContain("línea 29");
    rueda.emitir(-1); // hacia abajo: de vuelta al fondo
    await esperar();
    expect(instancia.lastFrame()).toContain("línea 29");
    rueda.emitir(2);
    await esperar();
    expect(instancia.lastFrame()).toContain("línea 23");
    s.linea("acto nuevo", "sistema");
    await esperar();
    expect(instancia.lastFrame()).toContain("acto nuevo");
  });

  it("el grupo de herramientas: una fila de aire encima, las ÚLTIMAS 4 líneas y cuántas hay antes", () => {
    const s = crearStore();
    s.linea("Delego en el planner:", "asistente");
    for (let i = 0; i < 7; i++) s.linea(`→ lee /f${i}`);
    const { lastFrame } = render(<Transcript store={s} altura={20} />);
    const lineas = (lastFrame() ?? "").split("\n");
    expect(lineas[0]).toContain("Delego en el planner:");
    expect(lineas[1]!.trim()).toBe(""); // el aire que separa el grupo del texto
    expect(lineas[2]).toContain("… 3 pasos antes");
    expect(lineas[3]).toContain("→ lee /f3");
    expect(lineas[6]).toContain("→ lee /f6");
    expect(lastFrame()).not.toContain("/f2");
    // Sangría: el paisaje va metido, la conversación no.
    expect(lineas[3]!.startsWith("  ")).toBe(true);
  });

  it("aire: fila tras el grupo de herramientas y fila antes del cierre «■»", () => {
    // El ritmo de OpenCode: cada bloque lleva su marginTop 1 — el grupo de tools también
    // deja aire DETRÁS, y el cierre «▣ modo · modelo» lleva el suyo DELANTE.
    const s = crearStore();
    s.linea("texto del asistente", "asistente");
    s.linea("→ lee /f0", "tool");
    s.linea("más texto", "asistente");
    s.fin(2400);
    const lineas = (render(<Transcript store={s} altura={20} />).lastFrame() ?? "").split("\n");
    expect(lineas[0]).toContain("texto del asistente");
    expect(lineas[1]!.trim()).toBe(""); // el aire que abre el grupo (ya estaba)
    expect(lineas[2]).toContain("→ lee /f0");
    expect(lineas[3]!.trim()).toBe(""); // NUEVO: el aire que cierra el grupo
    expect(lineas[4]!.trim()).toBe(""); // margen del siguiente bloque de respuesta
    expect(lineas[5]).toContain("más texto");
    expect(lineas[6]!.trim()).toBe(""); // aire antes del ■
    expect(lineas[7]).toContain("■");
  });

  it("entre herramientas y el cierre no se dobla el aire: UNA fila en blanco", () => {
    const s = crearStore();
    s.linea("→ lee /f0", "tool");
    s.fin(2400);
    const lineas = (render(<Transcript store={s} altura={20} />).lastFrame() ?? "").split("\n");
    expect(lineas[0]!.trim()).toBe(""); // el aire que abre el grupo
    expect(lineas[1]).toContain("→ lee /f0");
    expect(lineas[2]!.trim()).toBe(""); // UNA sola fila de aire hasta el cierre
    expect(lineas[3]).toContain("■");
  });

  it("un grupo de 4 o menos no dice «pasos antes»", () => {
    const s = crearStore();
    for (let i = 0; i < 4; i++) s.linea(`→ lee /f${i}`);
    const salida = render(<Transcript store={s} altura={20} />).lastFrame() ?? "";
    expect(salida).not.toContain("pasos antes");
    expect(salida).toContain("/f0");
    expect(salida).toContain("/f3");
  });

  it("el bloque de usuario es una TARJETA: barra, aire, texto, aire — como la Entrada", () => {
    // La forma de OpenCode: barra izquierda y el aire DENTRO (padding arriba/abajo con
    // fondo, que el test no ve). Tres filas por mensaje, no una: `ventanaDe` sigue
    // contando actos, y el recorte por arriba se lleva tarjetas enteras — bien.
    const s = crearStore();
    s.usuario("uno");
    s.usuario("dos");
    const { lastFrame } = render(<Transcript store={s} altura={12} ancho={20} />);
    const lineas = (lastFrame() ?? "").split("\n");
    expect(lineas).toHaveLength(6); // [aire, uno, aire] + [aire, dos, aire]
    for (const linea of lineas) expect(linea.startsWith("┃")).toBe(true);
    expect(lineas[1]).toContain("uno");
    expect(lineas[4]).toContain("dos");
    // Los aires: solo la barra y espacios — sin texto, y sin bordes nuevos arriba/abajo.
    for (const i of [0, 2, 3, 5]) expect(lineas[i]!.replace("┃", "").trim()).toBe("");
  });

  it("con pocos actos el transcript llena la altura del padre y el contenido nace ARRIBA", () => {
    const s = crearStore();
    s.usuario("hola");
    s.linea("→ x", "sistema");
    // La altura la pone el PADRE: el transcript es elástico (`flexGrow`), porque en la
    // App es la única pieza que cede. Ocupa las 10 filas y, como en OpenCode, el
    // contenido se apoya arriba: el hueco queda entre la conversación y la Entrada. El
    // recorte cuando NO cabe sigue siendo por arriba (el test siguiente).
    const { lastFrame } = render(
      <Box height={10} flexDirection="column">
        <Transcript store={s} altura={10} />
      </Box>
    );
    const lineas = (lastFrame() ?? "").split("\n");
    expect(lineas).toHaveLength(10);
    // La tarjeta de usuario lleva su aire dentro: el texto nace en la fila 1.
    expect(lineas[1]).toContain("hola");
    expect(lineas[3]).toContain("→ x");
    expect(lineas.at(-1)!.trim()).toBe("");
  });

  it("cuando NO cabe, el recorte sigue siendo por arriba: lo nuevo se ve, lo viejo se pierde", () => {
    const s = crearStore();
    for (let i = 0; i < 20; i++) s.linea(`línea ${i}`, "sistema");
    const { lastFrame } = render(
      <Box height={5} flexDirection="column">
        <Transcript store={s} altura={20} />
      </Box>
    );
    const lineas = (lastFrame() ?? "").split("\n");
    expect(lineas).toHaveLength(5);
    expect(lineas.at(-1)).toContain("línea 19");
    expect(lineas[0]).toContain("línea 15");
  });
});
