import { describe, expect, it } from "vitest";
import {
  casanConNombre,
  conNombreDelLienzo,
  nombresDelLienzo,
  pantallasElegidasValidas,
  textoDePantallasElegidas,
  TOPE_DE_PANTALLAS_ELEGIDAS,
  designMdDeProyecto, esDeLaMaqueta, leerPantalla, motivoDeDescargaInaceptable, motivoDePantallaInaceptable, proyectoDePantalla, RUTA_DE_DISENO, urlDeImagenCompleta,
} from "./stitch.js";

describe("traer una pantalla de Stitch: las reglas", () => {
  it("la pantalla se da por su `name`; cualquier otra cosa se rechaza con la forma buena", () => {
    expect(motivoDePantallaInaceptable("projects/142/screens/67c6ab")).toBeUndefined();
    expect(motivoDePantallaInaceptable("67c6ab")).toContain("projects/<id>/screens/<id>");
    expect(motivoDePantallaInaceptable("projects/142/screens/../x")).toBeDefined();
    expect(proyectoDePantalla("projects/142/screens/67c6ab")).toBe("projects/142");
  });

  it("solo se baja HTTPS limpio de los dos hosts medidos: una URL de la respuesta también se comprueba", () => {
    expect(motivoDeDescargaInaceptable("https://lh3.googleusercontent.com/aida/x")).toBeUndefined();
    expect(motivoDeDescargaInaceptable("https://contribution.usercontent.google.com/download?c=x")).toBeUndefined();
    expect(motivoDeDescargaInaceptable("http://lh3.googleusercontent.com/x")).toBeDefined();
    expect(motivoDeDescargaInaceptable("https://evil.example/x")).toContain("evil.example");
    expect(motivoDeDescargaInaceptable("https://u:p@lh3.googleusercontent.com/x")).toBeDefined();
    expect(motivoDeDescargaInaceptable("no es url")).toBeDefined();
  });

  it("la imagen de `lh3` se pide a tamaño REAL (`=s0`; sin él, una miniatura), salvo que ya traiga tamaño", () => {
    expect(urlDeImagenCompleta("https://lh3.googleusercontent.com/aida/AB12")).toBe("https://lh3.googleusercontent.com/aida/AB12=s0");
    expect(urlDeImagenCompleta("https://lh3.googleusercontent.com/aida/AB12=w780")).toBe("https://lh3.googleusercontent.com/aida/AB12=w780");
    expect(urlDeImagenCompleta("https://contribution.usercontent.google.com/download?c=x")).toBe("https://contribution.usercontent.google.com/download?c=x");
  });

  it("de `get_screen` se leen título, medidas y los dos enlaces; sin imagen es un motivo", () => {
    const texto = JSON.stringify({
      name: "projects/1/screens/a", title: "Ajustes", width: "780", height: "1768",
      screenshot: { downloadUrl: "https://lh3.googleusercontent.com/i" }, htmlCode: { downloadUrl: "https://contribution.usercontent.google.com/h" },
    });
    expect(leerPantalla(texto)).toEqual({ titulo: "Ajustes", ancho: 780, alto: 1768, imagen: "https://lh3.googleusercontent.com/i", html: "https://contribution.usercontent.google.com/h" });
    expect(leerPantalla(JSON.stringify({ title: "x" }))).toContain("no dio la imagen");
    expect(leerPantalla("no json")).toContain("no es JSON");
  });

  it("el DESIGN.md sale de `designTheme.designMd`, y vacío es que no hay", () => {
    expect(designMdDeProyecto(JSON.stringify({ designTheme: { designMd: "---\nname: X" } }))).toBe("---\nname: X");
    expect(designMdDeProyecto(JSON.stringify({ designTheme: { designMd: "  " } }))).toBeUndefined();
    expect(designMdDeProyecto("{}")).toBeUndefined();
  });

  it("lo de `/artefactos/diseno/` es la maqueta, no una captura", () => {
    expect(esDeLaMaqueta(`${RUTA_DE_DISENO}screen.png`)).toBe(true);
    expect(esDeLaMaqueta("/artefactos/captura-1.png")).toBe(false);
  });
});

describe("buscar en Stitch por título", () => {
  it("compara sin tildes, mayúsculas ni espacios de más; igual gana a contener", async () => {
    const { casanConTitulo, tituloComparable } = await import("./stitch.js");
    expect(tituloComparable("  Menú   Principal ")).toBe("menu principal");
    const e = [{ name: "a", title: "Menú" }, { name: "b", title: "Menú principal" }];
    expect(casanConTitulo(e, "menu").map((x) => x.name)).toEqual(["a"]);
    expect(casanConTitulo(e, "princ").map((x) => x.name)).toEqual(["b"]);
    expect(casanConTitulo(e, undefined)).toHaveLength(2);
  });

  it("por PALABRAS cuando no es igual ni lo contiene: «Menu Listado Entregas» encuentra «Listado de Entregas - Maset Logística»", async () => {
    // Medido en Maset: con solo «igual» y «contiene» no la encontraba, y el orquestador construyó con otra pantalla.
    const { casanConTitulo, palabrasQueDistinguen } = await import("./stitch.js");
    const maset = [
      { name: "s1", title: "Albaranes Pendientes - Maset Logística" },
      { name: "s2", title: "Listado de Entregas - Maset Logística" },
      { name: "s3", title: "Liquidaciones - Maset Logística" },
      { name: "s4", title: "Menú Principal - Maset Logística (Rediseño Profesional)" },
    ];
    expect(casanConTitulo(maset, "Menu Listado Entregas").map((x) => x.name)).toEqual(["s2"]);
    // «maset» y «logistica» salen en todos: no distinguen. «menu» es de relleno.
    expect(palabrasQueDistinguen("Menu Listado Entregas Maset", maset)).toEqual(["listado", "entrega"]);
    // Una palabra que no está en ninguna: NO casa ninguna (nada de «la más parecida»).
    expect(casanConTitulo(maset, "Menu Listado Pedidos")).toEqual([]);
    // Singular y plural valen igual.
    expect(casanConTitulo(maset, "albaran pendiente").map((x) => x.name)).toEqual(["s1"]);
  });

  it("lee la lista aunque lleve detrás la nota de recorte del harness, y tira lo que no tiene forma", async () => {
    const { entradasDeStitch } = await import("./stitch.js");
    const texto = JSON.stringify({ projects: [{ name: "projects/1", title: "A" }, { name: 3 }] }) + "\n(recortado por el harness)";
    expect(entradasDeStitch(texto, "projects")).toEqual([{ name: "projects/1", title: "A" }]);
    expect(entradasDeStitch("no es json", "screens")).toEqual([]);
  });
});

describe("el diseño vinculado y la pantalla ELEGIDA", () => {
  it("las pantallas traen su miniatura (medido: `screenshot.downloadUrl`), y una de un host no medido va sin ella", async () => {
    const { pantallasConMiniatura } = await import("./stitch.js");
    const texto = JSON.stringify({
      screens: [
        { name: "projects/9/screens/aa", title: "Listado", screenshot: { downloadUrl: "https://lh3.googleusercontent.com/aida/x" } },
        { name: "projects/9/screens/bb", title: "image.png", screenshot: { downloadUrl: "https://malo.example/x" } },
        { name: "no-es-una-pantalla", title: "fuera" },
      ],
    });
    expect(pantallasConMiniatura(texto)).toEqual([
      { name: "projects/9/screens/aa", title: "Listado", miniatura: "https://lh3.googleusercontent.com/aida/x" },
      { name: "projects/9/screens/bb", title: "image.png" },
    ]);
  });

  it("la elegida solo vale si es del proyecto VINCULADO, y el nombre del proyecto lo pone el vínculo, no el cable", async () => {
    const { pantallaElegidaValida } = await import("./stitch.js");
    const vinculo = { proyecto: "projects/9", nombre: "Maset" };
    expect(pantallaElegidaValida({ name: "projects/9/screens/aa", titulo: " Listado ", proyecto: "Otro" }, vinculo)).toEqual({
      name: "projects/9/screens/aa",
      titulo: "Listado",
      proyecto: "Maset",
    });
    expect(pantallaElegidaValida({ name: "projects/8/screens/aa", titulo: "x" }, vinculo)).toBeUndefined();
    expect(pantallaElegidaValida({ name: "projects/9/screens/aa", titulo: "x" }, undefined)).toBeUndefined();
    expect(pantallaElegidaValida({ name: "../x", titulo: "x" }, vinculo)).toBeUndefined();
  });

  it("la línea del encargo lleva SIEMPRE la pantalla y el proyecto con sus ids (petición suya), traída o no", async () => {
    const { textoDePantallaElegida } = await import("./stitch.js");
    const p = { name: "projects/9/screens/aa", titulo: "Listado de Entregas", proyecto: "Maset" };
    const traida = textoDePantallaElegida(p, { ok: true });
    expect(traida).toContain("«Listado de Entregas», id `projects/9/screens/aa`");
    expect(traida).toContain("«Maset» (id `projects/9`)");
    expect(traida).toContain("/artefactos/diseno/");
    expect(traida).toContain("no busques otra pantalla");
    const sinTraer = textoDePantallaElegida(p, { ok: false, motivo: "sin red" });
    expect(sinTraer).toContain("No se pudo traer antes de empezar (sin red)");
    expect(sinTraer).toContain('pantalla: "projects/9/screens/aa"');
  });
});

/** IXCODE-63: varias pantallas por tarea, cada una una pantalla a construir. */
describe("varias pantallas elegidas", () => {
  const vinculo = { proyecto: "projects/9", nombre: "Maset" };
  const una = (id: string, titulo = id) => ({ name: `projects/9/screens/${id}`, titulo });

  it("valen si TODAS valen, sin repetir y como mucho el tope; un objeto suelto cuenta como una", () => {
    expect(pantallasElegidasValidas([una("aa"), una("bb")], vinculo)?.map((p) => p.name)).toEqual(["projects/9/screens/aa", "projects/9/screens/bb"]);
    expect(pantallasElegidasValidas(una("aa"), vinculo)).toHaveLength(1);
    expect(pantallasElegidasValidas([], vinculo)).toBeUndefined();
    expect(pantallasElegidasValidas([una("aa"), una("aa")], vinculo)).toBeUndefined();
    expect(pantallasElegidasValidas([una("aa"), { name: "projects/8/screens/bb", titulo: "ajena" }], vinculo)).toBeUndefined();
    const demasiadas = Array.from({ length: TOPE_DE_PANTALLAS_ELEGIDAS + 1 }, (_, i) => una(`a${i}`));
    expect(pantallasElegidasValidas(demasiadas, vinculo)).toBeUndefined();
    expect(pantallasElegidasValidas(demasiadas.slice(0, TOPE_DE_PANTALLAS_ELEGIDAS), vinculo)).toHaveLength(TOPE_DE_PANTALLAS_ELEGIDAS);
  });

  it("el texto de varias dice que cada una es una pantalla a construir, con su id y su carpeta", () => {
    const texto = textoDePantallasElegidas([
      { pantalla: { ...una("aa", "Listado"), proyecto: "Maset" }, traida: { ok: true } },
      { pantalla: { ...una("bb", "Detalle"), proyecto: "Maset" }, traida: { ok: true } },
    ]);
    expect(texto).toContain("MAQUETAS ELEGIDAS (2), del proyecto de Stitch «Maset» (id `projects/9`)");
    expect(texto).toContain("cada una es una PANTALLA distinta");
    expect(texto).toContain("1. «Listado», id `projects/9/screens/aa`: ya traída en /artefactos/diseno/");
    expect(texto).toContain("2. «Detalle», id `projects/9/screens/bb`: ya traída en /artefactos/diseno/2/");
    // Con una sola, el texto de siempre.
    expect(textoDePantallasElegidas([{ pantalla: una("aa", "Listado"), traida: { ok: true } }])).toContain("MAQUETA ELEGIDA: la pantalla «Listado»");
  });
});

/** El nombre del LIENZO de Stitch (`screenInstances[].label`), medido en Maset: no es el `title` de la API. */
describe("nombres del lienzo", () => {
  const proyecto = JSON.stringify({
    title: "Maset",
    screenInstances: [
      { id: "a", label: "Entregas viejas", sourceScreen: "projects/9/screens/aa", hidden: true },
      { id: "b", label: "Entrega Albaran 1", sourceScreen: "projects/9/screens/aa" },
      { id: "c", label: "Menu Listado Entregas", sourceScreen: "projects/9/screens/bb" },
      { id: "d", label: "  ", sourceScreen: "projects/9/screens/cc" },
    ],
  });
  const pantallas = [
    { name: "projects/9/screens/aa", title: "Entrega - Datos Cliente (Maset)" },
    { name: "projects/9/screens/bb", title: "Liquidaciones - Maset Logística" },
    { name: "projects/9/screens/cc", title: "Login" },
  ];

  it("lee las instancias VISIBLES por pantalla; una oculta o sin nombre no cuenta", () => {
    const nombres = nombresDelLienzo(proyecto);
    expect([...nombres]).toEqual([
      ["projects/9/screens/aa", "Entrega Albaran 1"],
      ["projects/9/screens/bb", "Menu Listado Entregas"],
    ]);
    expect(nombresDelLienzo("no es json").size).toBe(0);
  });

  it("pone el nombre del lienzo como título y guarda el de la API; busca primero por el del lienzo y luego por el otro", () => {
    const con = conNombreDelLienzo(pantallas, nombresDelLienzo(proyecto));
    expect(con[0]).toEqual({ name: "projects/9/screens/aa", title: "Entrega Albaran 1", tituloEnStitch: "Entrega - Datos Cliente (Maset)" });
    expect(con[2]).toEqual({ name: "projects/9/screens/cc", title: "Login" });
    expect(casanConNombre(con, "Entrega Albaran 1").map((p) => p.name)).toEqual(["projects/9/screens/aa"]);
    expect(casanConNombre(con, "Menu Listado Entregas").map((p) => p.name)).toEqual(["projects/9/screens/bb"]);
    // Por el título de la API, si el del lienzo no casa.
    expect(casanConNombre(con, "Liquidaciones - Maset Logística").map((p) => p.name)).toEqual(["projects/9/screens/bb"]);
    expect(casanConNombre(con, "Entrega Albaran 7")).toEqual([]);
  });
});

