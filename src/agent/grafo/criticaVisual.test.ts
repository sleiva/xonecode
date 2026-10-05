import { readFileSync } from "node:fs";
import type { PantallaDescrita } from "../../core/descripcionDePantalla.js";
import { describe, expect, it } from "vitest";
import { crearCriticaVisual } from "./criticaVisual.js";
import { decodificarImagen } from "../dispositivos/decodificarImagen.js";
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


/**
 * **El parámetro `referencia`, y por qué existe.** Medido sobre la calculadora de MyAllXOne:
 * el crítico dio VERDE sobre una pantalla cuyas teclas eran rectángulos donde la maqueta
 * tenía píldoras y cuyo resultado era 1,4 veces la expresión donde la maqueta pedía 2,7. No
 * falló: `PROMPT_VISUAL` le prohíbe opinar de la paleta y de los gustos, y la fidelidad cae
 * entera en ese conjunto. El verde significaba «nada roto» y se leyó como «se parece».
 */
describe("xone_critica_visual con una maqueta delante", () => {
  /**
   * **El caso que lo motivó, y el que habría dejado el parámetro muerto.** Una maqueta llega
   * en un `.zip` y se descomprime, así que vive en `/artefactos/diseno_calculadora/screen.png`
   * — un ÁRBOL, no un fichero suelto. `nombreDeArtefacto` se queda con el último segmento (su
   * trabajo: nombrar para una persona), así que abrir por ahí pedía `<carpeta>/screen.png` y
   * contestaba «no pude abrir» sobre un fichero que estaba ahí y que la foto había anunciado.
   */
  it("abre una imagen en SUBCARPETA por su ruta relativa, no por el basename", async () => {
    const pedidas: string[] = [];
    const espia = crearCriticaVisual({
      leerArtefacto: async (n) => {
        pedidas.push(n);
        return Buffer.from([0xff, 0xd8, 0xff]);
      },
      invocar: invocando('{"veredicto":"verde","hallazgos":[]}'),
    });

    const salida = await espia.invoke({
      captura: "/artefactos/captura-1.jpg",
      pantalla: "EspecialCalculadora",
      referencia: "/artefactos/diseno_calculadora/screen.png",
    });

    expect(pedidas).toContain("diseno_calculadora/screen.png");
    expect(salida).not.toMatch(/No pude abrir/);
  });

  /** La cabecera dice CUÁL de las dos preguntas se ha contestado. */
  it("dice que el veredicto es COMPARADO, y no lo dice cuando no lo es", async () => {
    const con = await tool('{"veredicto":"verde","hallazgos":[]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
      referencia: "/artefactos/maqueta.png",
    });
    expect(con).toMatch(/comparado con la referencia/);

    const sin = await tool('{"veredicto":"verde","hallazgos":[]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
    });
    expect(sin).not.toMatch(/comparado con la referencia/);
  });

  /** El eco ya lo paga `pantalla`; la ruta de la referencia la acaba de escribir quien llama. */
  it("no devuelve la ruta de la referencia", async () => {
    const salida = await tool('{"veredicto":"verde","hallazgos":[]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
      referencia: "/artefactos/diseno_calculadora/screen.png",
    });
    expect(salida).not.toContain("diseno_calculadora");
  });

  /**
   * **Fail-closed, y con el mutante bien elegido**: lo tentador es juzgar sin la maqueta y
   * avisar. Eso devuelve «verde» sobre algo que nadie ha comparado, que es EXACTAMENTE el
   * fallo que este parámetro cierra. Y el paso siguiente no puede ofrecer el modo ciego.
   */
  it("una referencia que no se puede abrir es un NO: no se juzga nada", async () => {
    let juzgado = false;
    const espia = crearCriticaVisual({
      leerArtefacto: async (n) => {
        if (n.includes("maqueta")) throw new Error("ENOENT: open '/Users/alguien/maqueta.png'");
        return Buffer.from([0xff, 0xd8, 0xff]);
      },
      invocar: async () => {
        juzgado = true;
        return '{"veredicto":"verde","hallazgos":[]}';
      },
    });

    const salida = await espia.invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
      referencia: "/artefactos/maqueta.png",
    });

    expect(juzgado).toBe(false);
    expect(salida).toMatch(/NO he juzgado/);
    // No sale NINGÚN veredicto: la cabecera de siempre no está.
    expect(salida).not.toMatch(/Veredicto visual/);
    // Y no se ofrece el modo ciego como alternativa.
    expect(salida).not.toMatch(/llámame sin|sin la referencia|sin maqueta/i);
    // La ruta de la máquina nunca sale.
    expect(salida).not.toContain("/Users/");
  });

  /** La referencia pasa por la MISMA guarda que la captura, y antes de abrir nada. */
  it("una referencia fuera de /artefactos/ no se abre", async () => {
    let abierto = false;
    const espia = crearCriticaVisual({
      leerArtefacto: async () => {
        abierto = true;
        return Buffer.from([]);
      },
      invocar: invocando('{"veredicto":"verde","hallazgos":[]}'),
    });

    for (const ruta of ["/.env", "/artefactos/../secreto.png", "/app.xml"]) {
      const salida = await espia.invoke({
        captura: "/artefactos/c.jpg",
        pantalla: "X",
        referencia: ruta,
      });
      expect(salida, ruta).toMatch(/no es la referencia de esta sesión/);
    }
    /**
     * **Y no se abre NADA, ni siquiera la captura, que es válida.** Las dos rutas se
     * comprueban antes de leer ninguna: si no, una referencia mal escrita se descubriría
     * después de haber metido ya un fichero en memoria.
     */
    expect(abierto).toBe(false);
  });

  /**
   * El diseñador ya solo escribe en `icons/`: lo que se ve mal en una pantalla lo arregla quien escribe su `.xne`,
   * haya maqueta o no. Un rojo mandado a `designer-xone` era un arreglo sin dueño.
   */
  it("un ROJO manda a developer-xone, con maqueta y sin ella", async () => {
    const con = await tool('{"veredicto":"rojo","hallazgos":["las teclas son rectas"]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
      referencia: "/artefactos/m.png",
    });
    expect(con).toContain("developer-xone");
    expect(con).not.toContain("designer-xone");

    const sin = await tool('{"veredicto":"rojo","hallazgos":["texto cortado"]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
    });
    expect(sin).toContain("developer-xone");
  });

  /** Y al volver hay que traer la MISMA maqueta, o la siguiente vuelta mide otra cosa. */
  it("el paso siguiente pide volver CON la referencia", async () => {
    const salida = await tool('{"veredicto":"rojo","hallazgos":["algo"]}').invoke({
      captura: "/artefactos/c.jpg",
      pantalla: "X",
      referencia: "/artefactos/m.png",
    });
    expect(salida).toMatch(/MISMA `referencia`/);
  });
});

describe("xone_critica_visual con la GEOMETRÍA medida (MyAllXOne, la calculadora)", () => {
  const geo = JSON.parse(readFileSync(new URL("../../core/__oro__/geometria/calculadora.geometria.json", import.meta.url), "utf8"));
  const maqueta = JSON.parse(readFileSync(new URL("../../core/__oro__/geometria/calculadora.maqueta.json", import.meta.url), "utf8"));
  const png = async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0x86, 0, 0, 2, 0xea]);

  const conGeometria = (
    respuesta: string,
    vista: { prompt?: string; existen?: readonly string[]; informe?: string } = {},
    opciones: { sinHtml?: true; sinArbol?: true; descrita?: PantallaDescrita; captura?: PantallaDescrita } = {}
  ) => {
    let descripciones = 0;
    return crearCriticaVisual({
      leerArtefacto: unosBytes,
      invocar: async (_papel, prompt) => {
        vista.prompt = prompt;
        return respuesta;
      },
      leerReferencia: png,
      leerGeometria: async () => (opciones.sinArbol ? undefined : geo),
      cajasDeMaqueta: async () => (opciones.sinHtml ? undefined : maqueta),
      guardarInforme: async (nombre, informe) => {
        vista.informe = `${nombre}\n${informe}`;
      },
      ...(opciones.descrita === undefined
        ? {}
        : {
            // La primera llamada es la maqueta (sin estructura); la segunda, la captura (con la del árbol, si la hay).
            describirPantalla: async (_imagen: unknown, existen?: readonly string[]) => {
              descripciones += 1;
              if (descripciones === 1) return opciones.descrita;
              vista.existen = existen ?? [];
              return opciones.captura ?? opciones.descrita;
            },
          }),
    });
  };

  /** Lo que un modelo cuenta de `screen.png` mirándola sola. */
  const tecla = (texto: string) => ({ texto, unidades: 1, forma: "pildora" as const, borde: false, recortado: false });
  const fila = (...textos: string[]) => ({ controles: textos.map(tecla) });
  const descrita: PantallaDescrita = {
    filas: [fila("AC", "±", "%", "÷"), fila("7", "8", "9", "×"), fila("4", "5", "6", "−"), fila("1", "2", "3", "+"), fila("0", ".", "[borrar]", "=")],
    extras: [],
  };
  /** La captura, descrita con el mismo esquema: teclas en círculo y el «0» recortado. */
  const vistaDeLaCaptura: PantallaDescrita = {
    filas: descrita.filas.map((f) => ({ controles: f.controles.map((c) => ({ ...c, forma: "circulo" as const, recortado: c.texto === "0" })) })),
    extras: [],
  };

  it("SOLO un PNG: la estructura de la maqueta DESCRITA contra el árbol, aparte y sin decidir el rojo; el informe se guarda", async () => {
    const vista: { prompt?: string; existen?: readonly string[]; informe?: string } = {};
    const salida = await conGeometria('{"veredicto":"verde","hallazgos":[]}', vista, { sinHtml: true, descrita, captura: vistaDeLaCaptura }).invoke({
      captura: "/artefactos/calc_ronda9.jpg",
      pantalla: "DemoCalculadora",
      referencia: "/adjuntos/diseno.png",
    });
    expect(salida).toContain("ESTRUCTURA CONTRA LA MAQUETA DESCRITA");
    expect(salida).toContain("en el aparato «=» va en otra");
    // La captura NO se describe con el modelo (medido: ruidoso y ciego al recorte): no hay comparación control a control.
    expect(vista.existen).toBeUndefined();
    expect(salida).not.toContain("COMPARACIÓN CONTROL A CONTROL");
    // Y el informe se guarda junto a la captura, para auditar qué se dijo.
    expect(vista.informe?.split("\n")[0]).toBe("calc_ronda9.jpg");
    expect(vista.informe).toContain("ESTRUCTURA CONTRA LA MAQUETA DESCRITA");
  });

  it("con code.html, la descripción de la maqueta solo vigila que la imagen y el HTML cuenten lo mismo", async () => {
    const igual = await conGeometria('{"veredicto":"verde","hallazgos":[]}', {}, { descrita }).invoke({
      captura: "/artefactos/calc_ronda9.jpg",
      pantalla: "DemoCalculadora",
      referencia: "/adjuntos/stitch/screen.png",
    });
    expect(igual).not.toContain("NO CUENTAN LO MISMO");
    expect(igual).not.toContain("ESTRUCTURA CONTRA LA MAQUETA DESCRITA");

    const distinta: PantallaDescrita = { ...descrita, filas: [...descrita.filas.slice(0, -2), fila("1", "2", "3", "+", "="), fila("0", ".")] };
    const salida = await conGeometria('{"veredicto":"verde","hallazgos":[]}', {}, { descrita: distinta }).invoke({
      captura: "/artefactos/calc_ronda9.jpg",
      pantalla: "DemoCalculadora",
      referencia: "/adjuntos/stitch/screen.png",
    });
    expect(salida).toContain("LA IMAGEN DE LA MAQUETA Y SU code.html NO CUENTAN LO MISMO");
    expect(salida).toContain("en su code.html «=» va en otra");
  });

  it("lo MEDIDO decide: con la «=» tapada es ROJO aunque el modelo diga verde, y lo dice", async () => {
    const vista: { prompt?: string } = {};
    const salida = await conGeometria('{"veredicto":"verde","hallazgos":[]}', vista).invoke({
      captura: "/artefactos/calc_ronda9.jpg",
      pantalla: "DemoCalculadora",
      referencia: "/adjuntos/stitch/screen.png",
    });
    expect(salida).toMatch(/: rojo \(lo decide lo medido\)/);
    expect(salida).toContain("GEOMETRÍA, MEDIDA");
    expect(salida).toContain("«=» (MAP_T_IGUAL) queda TAPADO por la barra de navegación");
    expect(salida).toContain("«0» mide 1,9 veces el ancho de las de su fila");
    // Y el modelo los recibió como hechos.
    expect(vista.prompt).toContain("HECHOS YA MEDIDOS");
    expect(vista.prompt).toContain("queda TAPADO por la barra de navegación");
  });

  it("separa lo medido de la OPINIÓN del modelo sobre el estilo", async () => {
    const salida = await conGeometria('{"veredicto":"rojo","hallazgos":["el número grande es gris donde la maqueta lo pone blanco"]}').invoke({
      captura: "/artefactos/calc_ronda9.jpg",
      pantalla: "DemoCalculadora",
      referencia: "/adjuntos/stitch/screen.png",
    });
    expect(salida.indexOf("GEOMETRÍA, MEDIDA")).toBeLessThan(salida.indexOf("ESTILO, lo que dice el modelo"));
  });

  it("una maqueta que es SOLO un PNG: comprueba lo del aparato y lo dice", async () => {
    const salida = await conGeometria('{"veredicto":"verde","hallazgos":[]}', {}, { sinHtml: true }).invoke({
      captura: "/artefactos/calc_ronda9.jpg",
      pantalla: "DemoCalculadora",
      referencia: "/adjuntos/diseno.png",
    });
    expect(salida).toContain("la maqueta es solo una imagen");
    expect(salida).toContain("queda TAPADO por la barra de navegación");
    expect(salida).not.toContain("veces el ancho");
  });

  it("una captura SIN su árbol lo dice, y el crítico sigue con su opinión", async () => {
    const salida = await conGeometria('{"veredicto":"verde","hallazgos":[]}', {}, { sinArbol: true }).invoke({
      captura: "/artefactos/otra.jpg",
      pantalla: "X",
    });
    expect(salida).toContain("no trae su árbol de controles");
    expect(salida).toMatch(/: verde\./);
  });
});

describe("xone_critica_visual MIDE el estilo en los píxeles (la calculadora real)", () => {
  const oro = (n: string) => readFileSync(new URL(`../../core/__oro__/geometria/${n}`, import.meta.url));
  const crear = (llamadas: string[], conHtml = true) =>
    crearCriticaVisual({
      leerArtefacto: async () => oro("calculadora.captura-final.png"),
      invocar: async (_papel, prompt) => {
        llamadas.push(prompt);
        return '{"veredicto":"verde","hallazgos":[]}';
      },
      leerReferencia: async () => oro("calculadora.maqueta.png"),
      leerGeometria: async () => JSON.parse(oro("calculadora.captura-final.geometria.json").toString("utf8")),
      cajasDeMaqueta: async () => (conHtml ? JSON.parse(oro("calculadora.maqueta.json").toString("utf8")) : undefined),
      decodificar: decodificarImagen,
    });

  it("con code.html: la comparación MEDIDA decide, control a control, y no se le pregunta al modelo", async () => {
    const llamadas: string[] = [];
    const salida = await crear(llamadas).invoke({ captura: "/artefactos/calc_final.png", pantalla: "DemoCalculadora", referencia: "/adjuntos/stitch/screen.png" });
    expect(salida).toMatch(/: rojo/);
    expect(salida).toContain("COMPARACIÓN CONTROL A CONTROL, MEDIDA en los píxeles");
    expect(salida).toContain("«12 + 3» se ve RECORTADO");
    expect(salida).toMatch(/forma redondeada \(1,2:1\) → círculo \(1,0:1\)/);
    expect(llamadas).toEqual([]);
  });

  it("solo un PNG: mide los recortes del aparato, el modelo opina con ellos delante, y lo medido manda en el rojo", async () => {
    const llamadas: string[] = [];
    const salida = await crear(llamadas, false).invoke({ captura: "/artefactos/calc_final.png", pantalla: "DemoCalculadora", referencia: "/adjuntos/diseno.png" });
    expect(salida).toContain("MEDIDO en los píxeles de la captura");
    expect(salida).toContain("«RAD» se ve RECORTADO");
    expect(salida).toMatch(/: rojo \(lo decide lo medido\)/);
    expect(llamadas[0]).toContain("«12 + 3» se ve RECORTADO");
  });
});

describe("xone_critica_visual con la captura de UN CONTROL", () => {
  it("no mide con la geometría de la pantalla entera: lo dice y manda a capturar la pantalla", async () => {
    const geo = JSON.parse(readFileSync(new URL("../../core/__oro__/geometria/calculadora.captura-final.geometria.json", import.meta.url), "utf8"));
    const salida = await crearCriticaVisual({
      leerArtefacto: unosBytes,
      invocar: async () => '{"veredicto":"verde","hallazgos":[]}',
      leerGeometria: async () => ({ ...geo, pantalla: { ancho: 993, alto: 110 } }),
      decodificar: () => {
        throw new Error("no debería medir píxeles de un control con cajas de la pantalla");
      },
    }).invoke({ captura: "/artefactos/visor.jpg", pantalla: "X" });
    expect(salida).toContain("es de una PARTE de la pantalla");
    expect(salida).not.toContain("RECORTADO");
  });
});
