import { describe, expect, it } from "vitest";
import { promptDeAgente, recibeNucleoDeTrabajo, REGLAS_XONE, type Agente } from "./agentes.js";
import { NUCLEO_XONE, TOPE_DE_LINEAS_DEL_ENCABEZADO } from "./nucleoXone.js";

const agente = (c: Partial<Agente> = {}): Agente => ({
  nombre: "x-xone", descripcion: "Hace cosas.", motor: "modelo", soloLectura: false, skills: [], instrucciones: "", origen: "semilla", ...c,
});
const lineas = (t: string): number => t.split("\n").length;

describe("el núcleo de trabajo", () => {
  /** Un núcleo que crece sin freno acaba diluyendo justo lo que quería asegurar. */
  it("el ENCABEZADO entero (reglas + núcleo) no pasa del tope de líneas", () => {
    const total = lineas(REGLAS_XONE) + 1 + lineas(NUCLEO_XONE);
    expect(total).toBeLessThanOrEqual(TOPE_DE_LINEAS_DEL_ENCABEZADO);
    // Y no es una excusa: se aprovecha, no queda a medias.
    expect(total).toBeGreaterThan(TOPE_DE_LINEAS_DEL_ENCABEZADO * 0.7);
  });

  it("ninguna línea es tan larga que se vuelva ilegible", () => {
    for (const l of NUCLEO_XONE.split("\n")) expect(l.length, l).toBeLessThanOrEqual(120);
  });

  /**
   * Cada una salió de un fallo medido; si una desaparece del texto, vuelve el fallo. El test dice CUÁL
   * ha desaparecido, porque estas reglas se pierden por refactor, no por decisión.
   */
  it.each([
    ["un comentario XML con --", /comentario XML no puede llevar `--`/],
    ["un TL que no repinta y el T bloqueado", /`L`\/`TL`[\s\S]*type="T"[\s\S]*locked/],
    ["elevation recorta el fondo redondeado", /`elevation`[\s\S]*recorta/],
    ["el fondo de un botón va en img, no en imgbk", /`imgbk` se ignora/],
    ["la esquina se dibuja en el SVG", /`border-corner-radius` NO recorta/],
    ["el color con el alfa primero", /`#AARRGGBB`, con el alfa PRIMERO/],
    ["los filtros SVG se ignoran", /FILTROS[\s\S]*se ignoran/],
    ["los fondos se generan, no se escriben a mano", /NO se escriben a mano: `generar_fondo_svg`/],
    ["la maqueta como referencia", /`referencia`/],
    ["getText devuelve el valor, no lo pintado", /`getText` devuelve el VALOR/],
    ["un toque real y captura nativa", /toque REAL/],
    ["el repintado es asíncrono", /repintado es asíncrono/],
    ["diferencia_de_capturas", /`diferencia_de_capturas`/],
    ["los hallazgos del plan", /`## Hallazgos`/],
    ["una edición por fichero y ronda", /UNA edición por fichero y por ronda/],
    ["decir qué no se comprobó", /qué NO comprobaste/],
    ["una etiqueta con height se recorta", /`height` propio se recorta/],
    ["la p no es el píxel", /La `p` no es el píxel/],
    ["una fila que se pasa desborda", /desborda por la\s+derecha/],
    ["sin gestion.db no arranca", /Sin `bd\/gestion.db` la app no arranca/],
    ["un .js reinicia el estado del motor", /REINICIA el estado del motor/],
    ["un .css relanza la app", /`\.css`[\s\S]*relanzan la app/],
    ["las skills desde la shell", /\$XONECODE_SKILL_<NOMBRE>/],
    ["el apartado «lo más usado» con bgcolor, img y labelwidth", /LO MÁS USADO\n- `bgcolor`[\s\S]*- `img`[\s\S]*- `labelwidth`/],
    ["quien escribe no puntúa su trabajo", /Quien escribe no puntúa su propio trabajo/],
  ])("sigue diciendo: %s", (_nombre, patron) => {
    expect(NUCLEO_XONE).toMatch(patron);
  });

  it("es del dominio: lo mide, no lo opina (sin fechas ni recuentos que envejecen)", () => {
    expect(NUCLEO_XONE).not.toMatch(/\b\d{2}-\d{2}-20\d{2}\b/);
    expect(NUCLEO_XONE).not.toMatch(/\b\d+\s*(pasadas|llamadas|tokens|minutos)\b/i);
  });
});

describe("a quién llega el núcleo", () => {
  it("a quien escribe el proyecto entero y a quien conduce el aparato", () => {
    expect(recibeNucleoDeTrabajo(agente())).toBe(true);
    expect(recibeNucleoDeTrabajo(agente({ soloLectura: true, ejecucion: true }))).toBe(true);
    expect(promptDeAgente(agente())).toContain(NUCLEO_XONE);
    expect(promptDeAgente(agente({ ejecucion: true, soloLectura: false }))).toContain(NUCLEO_XONE);
  });

  it("NO a quien solo lee ni a quien documenta: pagarían sus tokens sin escribir una pantalla", () => {
    expect(recibeNucleoDeTrabajo(agente({ soloLectura: true }))).toBe(false);
    expect(recibeNucleoDeTrabajo(agente({ escribeEn: ["/doc/"] }))).toBe(false);
    expect(promptDeAgente(agente({ soloLectura: true }))).not.toContain(NUCLEO_XONE);
    expect(promptDeAgente(agente({ escribeEn: ["/doc/"] }))).not.toContain(NUCLEO_XONE);
  });

  it("las reglas van PRIMERO y el núcleo justo detrás, antes de lo que el usuario escribió", () => {
    const p = promptDeAgente(agente({ instrucciones: "LO ESPECÍFICO DE ESTE AGENTE" }));
    expect(p.indexOf(REGLAS_XONE)).toBe(0);
    expect(p.indexOf(NUCLEO_XONE)).toBeGreaterThan(REGLAS_XONE.length - 1);
    expect(p.indexOf(NUCLEO_XONE)).toBeLessThan(p.indexOf("LO ESPECÍFICO DE ESTE AGENTE"));
  });

  it("un subagente que escribe el usuario también lo recibe: viene del código, no del .md", () => {
    expect(promptDeAgente(agente({ nombre: "mio", descripcion: "El mío." }))).toContain("NÚCLEO DE TRABAJO EN XONE");
  });
});
