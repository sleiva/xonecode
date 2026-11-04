import { describe, expect, it } from "vitest";
import { decidirEncargo, INTENTOS_POR_TAREA, planesNombrados, planesPorSuNombre } from "./encargoDeTarea.js";

const TASKS = `# Calculadora

## 01 — La pantalla
**Estado:** hecha
- [x] se ve

## 02 — El teclado
**Estado:** pendiente
- [ ] las teclas
- [ ] el «=»

## 03 — La lógica
**Estado:** pendiente
- [ ] suma
`;
const leer = (plan: string) => (plan === "calculadora" ? TASKS : undefined);

describe("un encargo de un plan es UNA tarea", () => {
  it("sin plan con tareas, no se toca: es trabajo libre", () => {
    expect(decidirEncargo("developer-xone", "Arregla el login", leer)).toEqual({ tipo: "libre" });
    expect(decidirEncargo("developer-xone", "Mira /planes/otro/PLAN.md", leer)).toEqual({ tipo: "libre" });
  });

  it("el plan nombrado SIN su ruta también cuenta: «plan `calculadora`» sin TAREA no arranca", () => {
    expect(planesPorSuNombre("Un ajuste (plan `calculadora`, T1) y el plan otro")).toEqual(["calculadora", "otro"]);
    const d = decidirEncargo("developer-xone", "Vuelta de ajuste visual (plan `calculadora`)", leer);
    expect(d.tipo).toBe("rechazo");
    expect(decidirEncargo("developer-xone", "TAREA: 3\nDel plan calculadora: la lógica", leer).tipo).toBe("tarea");
    expect(decidirEncargo("developer-xone", "Haz un plan sencillo", leer)).toEqual({ tipo: "libre" });
  });

  it("con UNA tarea, arranca con su ficha delante, y `T2`, `2` y `02` son la misma", () => {
    for (const linea of ["TAREA: 02", "TAREA: T2", "  TAREA: 2"]) {
      const d = decidirEncargo("developer-xone", `${linea}\nPlan /planes/calculadora/. Haz el teclado.`, leer);
      expect(d.tipo).toBe("tarea");
      if (d.tipo !== "tarea") return;
      expect(d.tarea.numero).toBe("02");
      expect(d.encargo).toContain("Haz el teclado.");
      expect(d.encargo).toContain("LA TAREA DE ESTE ENCARGO, de /planes/calculadora/TASKS.md (líneas 7–11");
      expect(d.encargo).toContain("## 02 — El teclado\n**Estado:** pendiente\n- [ ] las teclas");
      expect(d.encargo).not.toContain("La lógica");
    }
  });

  it("la prosa puede nombrar otras tareas: solo cuenta la línea", () => {
    const d = decidirEncargo("developer-xone", "TAREA: 03\nEn /planes/calculadora/ la T1 y la T2 ya están; ahora la lógica.", leer);
    expect(d.tipo).toBe("tarea");
  });

  it("sin la línea, no arranca y se le dice cómo, con las pendientes", () => {
    const d = decidirEncargo("developer-xone", "Haz T1, T2 y T3 del plan /planes/calculadora/.", leer);
    expect(d).toEqual({ tipo: "rechazo", motivo: expect.stringContaining("developer-xone NO HA ARRANCADO: el encargo es trabajo del plan /planes/calculadora/ y no dice qué tarea") });
    if (d.tipo === "rechazo") expect(d.motivo).toContain("Pendientes: 02 (El teclado), 03 (La lógica).");
  });

  it("con VARIAS, no arranca y le dice cuál mandar primero (la primera sin hacer)", () => {
    const d = decidirEncargo("developer-xone", "TAREA: 01, 02 y 03\n/planes/calculadora/", leer);
    expect(d.tipo).toBe("rechazo");
    if (d.tipo !== "rechazo") return;
    expect(d.motivo).toContain("nombra 3 tareas (01, 02, 03)");
    expect(d.motivo).toContain("Manda ahora la 02 con `TAREA: 02`");
    expect(d.motivo).toContain("al mismo developer-xone: conserva lo que ya hizo");
  });

  it("una tarea que no existe no arranca", () => {
    const d = decidirEncargo("designer-xone", "TAREA: 9\n/planes/calculadora/", leer);
    expect(d).toEqual({ tipo: "rechazo", motivo: expect.stringContaining("«TAREA: 9» no es una tarea de /planes/calculadora/TASKS.md") });
  });

  it("dos planes con tareas a la vez no se adivinan", () => {
    const dos = decidirEncargo("developer-xone", "/planes/a/ y /planes/b/", () => TASKS);
    expect(dos).toEqual({ tipo: "libre" });
    expect(planesNombrados("/planes/a/TASKS.md y /planes/a/PLAN.md, /planes/b/")).toEqual(["a", "b"]);
  });
});

describe("no se pasa de una tarea ABIERTA a otra (pasada 21: la 02 volvió en rojo y se mandó la 03)", () => {
  const abierta = { plan: "calculadora", numero: "02", intentos: 1 };

  it("con la anterior sin todas sus casillas, la siguiente no arranca y se pide volver a la abierta", () => {
    const d = decidirEncargo("developer-xone", "TAREA: 03\n/planes/calculadora/", leer, abierta);
    expect(d.tipo).toBe("rechazo");
    if (d.tipo === "rechazo") {
      expect(d.motivo).toContain("02 (El teclado) volvió SIN CERRAR (0 de 2 criterios comprobados)");
      expect(d.motivo).toContain("`TAREA: 02`");
    }
  });

  it("volver a encargar la abierta SÍ arranca, hasta el tope de intentos", () => {
    expect(decidirEncargo("developer-xone", "TAREA: 2\n/planes/calculadora/", leer, abierta).tipo).toBe("tarea");
  });

  it("con el tope agotado, ni la siguiente ni otra vez la misma: se termina el turno diciéndolo", () => {
    const agotada = { ...abierta, intentos: INTENTOS_POR_TAREA };
    for (const linea of ["TAREA: 03", "TAREA: 02"]) {
      const d = decidirEncargo("developer-xone", `${linea}\n/planes/calculadora/`, leer, agotada);
      expect(d.tipo).toBe("rechazo");
      if (d.tipo === "rechazo") expect(d.motivo).toContain("Termina el turno");
    }
  });

  it("con la anterior FINALIZADA, u otro plan, la siguiente arranca", () => {
    expect(decidirEncargo("developer-xone", "TAREA: 02\n/planes/calculadora/", leer, { plan: "calculadora", numero: "01", intentos: 1 }).tipo).toBe("tarea");
    expect(decidirEncargo("developer-xone", "TAREA: 03\n/planes/calculadora/", leer, { plan: "otro", numero: "02", intentos: 1 }).tipo).toBe("tarea");
  });
});

describe("un encargo con `TAREA:` que no nombra el plan es del plan de la última tarea (Maset: el tercer intento se coló)", () => {
  const abierta = { plan: "calculadora", numero: "02", intentos: INTENTOS_POR_TAREA };

  it("cuenta como intento: con el tope agotado, no arranca", () => {
    const d = decidirEncargo("developer-xone", "TAREA: 02\nVuelta de ajuste visual: solo falta un criterio.", leer, abierta);
    expect(d.tipo).toBe("rechazo");
    if (d.tipo === "rechazo") expect(d.motivo).toContain("Termina el turno");
  });

  it("y lleva su ficha delante, como uno que sí lo nombra", () => {
    const d = decidirEncargo("developer-xone", "TAREA: 02\nOtra vuelta.", leer, { ...abierta, intentos: 1 });
    expect(d.tipo).toBe("tarea");
    if (d.tipo === "tarea") expect(d.encargo).toContain("## 02 — El teclado");
  });

  it("sin `TAREA:` ni plan nombrado sigue siendo trabajo libre", () => {
    expect(decidirEncargo("developer-xone", "Mira por qué falla el login", leer, abierta)).toEqual({ tipo: "libre" });
  });
});
