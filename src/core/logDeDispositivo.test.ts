import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hallazgosDeLog, huellaDeHallazgos, ETIQUETA_DE_ARRANQUE } from "./logDeDispositivo.js";

/**
 * El log CRUDO de `adb logcat -d --pid <host>` sobre AppDemo en un `pixel8` real, tras
 * desplegar, arrancar la app y hacer login. 133 líneas tal cual las da el aparato — sin
 * filtrar por nivel antes, que es justo lo que este módulo tiene que decidir.
 */
const oro = (): string =>
  readFileSync(join(import.meta.dirname, "__oro__", "logcat-appdemo.txt"), "utf8");

describe("hallazgosDeLog", () => {
  /**
   * De 133 líneas, UN error de la app. Lo demás son avisos e información — y el error es de
   * verdad: una columna que no existe en la cola de réplica.
   */
  it("del log real saca un error, y no lo entierra", () => {
    const { hallazgos } = hallazgosDeLog(oro());
    const errores = hallazgos.filter((h) => h.severidad === "error");

    expect(errores).toHaveLength(1);
    expect(errores[0]!.mensaje).toContain("no such column: SESSIONID");
    // Y va el PRIMERO: el orden es por severidad, no por cuándo salió.
    expect(hallazgos[0]!.severidad).toBe("error");
  });

  /**
   * **LA regla, y la razón de que exista el módulo.** Se comprobó contra el aparato: dos
   * arranques seguidos con el mismo recorrido dan pids distintos (15169 y 15250) y la misma
   * huella. Sin quitar fecha/pid/tid, la guarda de «no progreso» del bucle de reparación no
   * podría comparar dos vueltas y no cortaría nunca.
   */
  it("la huella NO cambia aunque cambien la fecha, el pid y el tid", () => {
    const original = oro();
    const pid = /^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+(\d+)/m.exec(original)![1]!;
    const otraVez = original
      .replace(/^\d\d-\d\d \d\d:\d\d:\d\d\.\d+/gm, "12-25 09:00:00.000")
      .replaceAll(pid, "31337");

    expect(otraVez).not.toBe(original);
    expect(huellaDeHallazgos(hallazgosDeLog(otraVez).hallazgos)).toBe(
      huellaDeHallazgos(hallazgosDeLog(original).hallazgos),
    );
  });

  /**
   * MEDIDO contra el aparato, y es lo que tumbó la primera versión: dos arranques idénticos
   * dan líneas `I`/`D` distintas (`Choreographer: Skipped 75 frames` contra `Skipped 33`,
   * `Compiler allocated 5250KB`, ciclos del replicador que solo salen a veces). Con ellas en
   * la huella, dos vueltas iguales parecían distintas.
   */
  it("la información que varía sola NO entra en la huella", () => {
    const base = oro();
    const conRuido =
      base +
      "\n09-18 15:00:00.000 15327 15327 I Choreographer: Skipped 75 frames!" +
      "\n09-18 15:00:00.001 15327 15327 D nativeloader: Load libfoo.so: ok\n";

    expect(huellaDeHallazgos(hallazgosDeLog(conRuido).hallazgos)).toBe(
      huellaDeHallazgos(hallazgosDeLog(base).hallazgos),
    );
    // Pero SE VEN: no se ha tirado nada.
    expect(hallazgosDeLog(conRuido).hallazgos.some((h) => h.mensaje.includes("Skipped 75"))).toBe(true);
  });

  it("y la huella SÍ cambia cuando aparece un error nuevo de la app", () => {
    const con = oro() + "\n09-18 15:00:00.000 15327 15327 E XOneJavaScript: ReferenceError: calcTotal is not defined\n";

    expect(huellaDeHallazgos(hallazgosDeLog(con).hallazgos)).not.toBe(
      huellaDeHallazgos(hallazgosDeLog(oro()).hallazgos),
    );
  });

  /**
   * **Nada se DESCARTA** — es la condición que puso él: una lista negra escrita a fuego
   * esconde, el día que el fallo salga por una etiqueta que alguien dio por ruido, la única
   * línea que lo explica, y no hay forma de enterarse. Se ORDENA y se CUENTA.
   */
  it("el ruido de plataforma no se tira: se ordena detrás y se cuenta", () => {
    const { hallazgos, plataforma } = hallazgosDeLog(oro());

    expect(plataforma).toBeGreaterThan(0);
    expect(hallazgos.filter((h) => !h.deLaApp)).toHaveLength(plataforma);
    expect(hallazgos.some((h) => h.mensaje.includes("Accessing hidden method"))).toBe(true);
    expect(hallazgos.some((h) => h.mensaje.includes("FirebaseApp"))).toBe(true);
  });

  /**
   * Un `E` de la plataforma es un error DE ANDROID y nadie lo arregla desde un `.xne`: como
   * error, el bucle se declararía rojo para siempre y no cerraría jamás.
   */
  it("un ERROR de la plataforma se rebaja a aviso, y no entra en la huella", () => {
    const con = oro() + "\n09-18 15:00:00.000 15327 15327 E chromium: [ERROR:variations_seed_loader.cc(37)] Seed missing signature.\n";
    const { hallazgos } = hallazgosDeLog(con);
    const suyo = hallazgos.find((h) => h.mensaje.includes("Seed missing signature"))!;

    expect(suyo.deLaApp).toBe(false);
    expect(suyo.severidad).toBe("warning");
    expect(huellaDeHallazgos(hallazgos)).toBe(huellaDeHallazgos(hallazgosDeLog(oro()).hallazgos));
  });

  /** Una excepción no se parte: su traza arrastra la severidad de la línea que la encabeza. */
  it("el cuerpo de una traza de Java hereda la severidad de su cabecera", () => {
    const { hallazgos } = hallazgosDeLog(
      [
        "09-18 15:00:00.000 1 1 E XOneJavaScript: TypeError: no se puede leer DISPLAY",
        "        at org.mozilla.javascript.Context.call(Context.java:1)",
        "        Caused by: java.lang.NullPointerException",
      ].join("\n"),
    );

    expect(hallazgos).toHaveLength(3);
    expect(hallazgos.every((h) => h.severidad === "error")).toBe(true);
  });

  it("deduplica contando, en vez de repetir el texto", () => {
    const { hallazgos } = hallazgosDeLog(
      Array.from({ length: 10 }, (_, i) => `09-18 15:00:0${i}.000 1 1 E droid.framework: Invalid resource ID 0x60000001.`).join("\n"),
    );

    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]!.veces).toBe(10);
    expect(hallazgos[0]!.mensaje).not.toContain("×");
    // El recuento aparece al traducirlo, no en el mensaje que se compara.
    expect(hallazgosDeLog("09-18 15:00:00.000 1 1 E a: b\n09-18 15:00:01.000 1 1 E a: b").aHallazgosDelTurno()[0]!.mensaje).toContain("(×2)");
  });

  it("la cabecera del PID no es un hallazgo, y un log vacío no inventa ninguno", () => {
    expect(hallazgosDeLog("--- com.xone.android.framework (pid 1) ---").hallazgos).toEqual([]);
    expect(hallazgosDeLog("").hallazgos).toEqual([]);
    expect(hallazgosDeLog("   \n\n  ").hallazgos).toEqual([]);
  });

  /**
   * Sin fichero ni línea, y eso es honestidad: el log no los dice. Un fichero adivinado
   * mandaría al agente a abrir el que no es.
   */
  it("se traduce a la forma que el bucle de reparación ya consume", () => {
    const delTurno = hallazgosDeLog(oro()).aHallazgosDelTurno();

    expect(delTurno[0]!.code).toBe(ETIQUETA_DE_ARRANQUE);
    expect(delTurno[0]!.severidad).toBe("error");
    expect(delTurno[0]).not.toHaveProperty("fichero");
    expect(delTurno[0]).not.toHaveProperty("linea");
  });
});
