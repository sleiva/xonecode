import { describe, expect, it } from "vitest";
import { crearCriticaVisual } from "./criticaVisual.js";
import type { InvocarVisual } from "../dispositivos/juezVisual.js";

const invocando = (respuesta: string): InvocarVisual => async () => respuesta;
const unosBytes = async () => Buffer.from([0xff, 0xd8, 0xff]);

const tool = (respuesta: string, leer = unosBytes) =>
  crearCriticaVisual({ leerArtefacto: leer, invocar: invocando(respuesta) });

describe("xone_critica_visual", () => {
  it("cuenta el veredicto y lo que se ve", async () => {
    const salida = await tool(
      '{"veredicto":"rojo","hallazgos":["el texto de los botones sale cortado"]}'
    ).invoke({ captura: "/artefactos/captura-1.jpg", pantalla: "Calculadora" });

    expect(salida).toContain("rojo");
    expect(salida).toContain("el texto de los botones sale cortado");
  });

  /**
   * MEDIDO seis veces: describe un texto CORTADO como «girado 180°», y pedirle en el prompt
   * que no diagnostique no lo evita. A dónde apunta sí lo acertó las seis. Sin este aviso, el
   * desarrollador se pone a buscar una rotación que no existe.
   */
  it("avisa de que la REDACCIÓN no es fiable, y solo cuando hay algo que leer", async () => {
    const conAlgo = await tool('{"veredicto":"rojo","hallazgos":["algo raro"]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
    });
    expect(conAlgo).toMatch(/no es fiable/);

    const limpio = await tool('{"veredicto":"verde","hallazgos":[]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
    });
    expect(limpio).not.toMatch(/no es fiable/);
  });

  /**
   * **Un rojo tiene que enterar a alguien.** La regla de «vuelve al developer» vive en el
   * prompt del orquestador, a miles de tokens del veredicto; el sitio fuerte es el resultado
   * de la tool, como hace `xone_navegacion` cuando no sabe contestar: el paso siguiente
   * ESCRITO, no un consejo.
   */
  it("un ROJO trae el paso siguiente escrito, no un «arréglalo»", async () => {
    const salida = await tool('{"veredicto":"rojo","hallazgos":["el texto sale cortado"]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "Calculadora",
    });

    expect(salida).toContain("developer-xone");
    expect(salida).toMatch(/vuelve a llamarme con la captura/);
    expect(salida).toMatch(/SIN ARREGLAR/);
  });

  /**
   * **Y ese paso va CONDICIONADO al encargo, que es la cuarta puerta de la deriva.**
   *
   * Medido en un turno real: la tarea era DOCUMENTAR, el conductor sacó una captura, esto
   * la vio en rojo y el turno se fue a arreglar la pantalla. La tool no puede saber el
   * encargo —se construye por sesión— así que escribe las dos ramas y elige quien lo sabe.
   */
  it("y ese paso dice que arreglar solo va SI el encargo lo incluye", async () => {
    const salida = await tool('{"veredicto":"rojo","hallazgos":["el texto sale cortado"]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "Calculadora",
    });

    // La rama de arreglar va condicionada…
    expect(salida).toMatch(/Si el encargo incluye ARREGLAR/);
    // …y la otra rama existe y dice que NO se toque el proyecto.
    expect(salida).toMatch(/documentar/);
    expect(salida).toMatch(/NO toques el proyecto/);
    // Lo único incondicional: no callárselo.
    expect(salida).toMatch(/callártelo/);
  });

  it("y un VERDE no manda a nadie a arreglar nada", async () => {
    const salida = await tool('{"veredicto":"verde","hallazgos":[]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
    });

    expect(salida).not.toContain("developer-xone");
  });

  it("dice qué pantallas pide y qué hacer con eso", async () => {
    const salida = await tool(
      '{"veredicto":"rojo","hallazgos":["algo"],"necesito":["Productos"]}'
    ).invoke({ captura: "/artefactos/c.jpg", pantalla: "X" });

    expect(salida).toContain("Productos");
    expect(salida).toMatch(/conductor/);
  });

  /**
   * **La guarda se re-aplica A MANO**: una tool de LangChain añadida por xonecode no pasa por
   * el middleware de permisos, así que sin esto sería una forma de leerle al modelo cualquier
   * fichero de la máquina. Y no se lee NADA antes de comprobarlo.
   */
  it("fuera de /artefactos/ no se abre nada", async () => {
    let abierto = false;
    const espia = crearCriticaVisual({
      leerArtefacto: async () => {
        abierto = true;
        return Buffer.from([]);
      },
      invocar: invocando('{"veredicto":"verde","hallazgos":[]}'),
    });

    for (const ruta of ["/.env", "../../../etc/passwd", "/artefactos/../secreto.jpg", "/app.xml"]) {
      const salida = await espia.invoke({ captura: ruta, pantalla: "X" });
      expect(salida, ruta).toMatch(/no es una captura de esta sesión/);
    }
    expect(abierto).toBe(false);
  });

  it("lo que no es una imagen no se le enseña a nadie", async () => {
    const salida = await tool('{"veredicto":"verde","hallazgos":[]}').invoke({
      captura: "/artefactos/informe.html",
      pantalla: "X",
    });

    expect(salida).toMatch(/no es una imagen/);
  });

  /** Que falte la captura o el modelo NO puede llevarse el turno por delante. */
  it("un fallo se DEVUELVE, nunca se lanza, y sin la ruta de la máquina", async () => {
    const sinFichero = crearCriticaVisual({
      leerArtefacto: async () => {
        throw new Error("ENOENT: no such file or directory, open '/Users/alguien/.xonecode/x.jpg'");
      },
      invocar: invocando('{"veredicto":"verde","hallazgos":[]}'),
    });

    const salida = await sinFichero.invoke({ captura: "/artefactos/c.jpg", pantalla: "X" });

    expect(salida).toMatch(/No pude abrir/);
    expect(salida).not.toContain("/Users/");
  });
});
