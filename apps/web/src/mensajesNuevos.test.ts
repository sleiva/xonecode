import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { contarMensajesNuevos, usarMarcaDeLeido } from "./mensajesNuevos.js";
import type { Acto } from "./tipos.js";

const asistente = (texto: string): Acto => ({ tipo: "asistente", texto });
const herramientas: Acto = { tipo: "herramientas", lineas: ["lee x.xne"] };
const soloRespuestas = (acto: Acto): boolean => acto.tipo === "asistente";

describe("contarMensajesNuevos", () => {
  it("cuenta lo que `seVe` acepta, y solo desde la marca", () => {
    const actos = [asistente("viejo"), herramientas, asistente("uno"), herramientas, asistente("dos")];
    expect(contarMensajesNuevos(actos, 1, soloRespuestas)).toBe(2);
    expect(contarMensajesNuevos(actos, actos.length, soloRespuestas)).toBe(0);
    // `seVe` recibe el índice: es como `Chat` mira la pregunta repetida de cada respuesta.
    expect(contarMensajesNuevos(actos, 0, (_a, i) => i === 4)).toBe(1);
  });
});

describe("usarMarcaDeLeido", () => {
  type Props = { longitud: number; alFinal: boolean; sesion?: string };
  const montar = (inicial: Props) =>
    renderHook(({ longitud, alFinal, sesion }: Props) => usarMarcaDeLeido(longitud, alFinal, sesion), { initialProps: inicial });

  it("al final sigue a la lista: no hay nada nuevo", () => {
    const { result, rerender } = montar({ longitud: 3, alFinal: true, sesion: "s1" });
    expect(result.current).toBe(3);
    rerender({ longitud: 5, alFinal: true, sesion: "s1" });
    expect(result.current).toBe(5);
  });

  it("al subir se congela, lo que se AÑADE cuenta, y al volver abajo vuelve a cero", () => {
    const { result, rerender } = montar({ longitud: 3, alFinal: true, sesion: "s1" });
    rerender({ longitud: 3, alFinal: false, sesion: "s1" });
    rerender({ longitud: 6, alFinal: false, sesion: "s1" });
    expect(result.current).toBe(3);
    rerender({ longitud: 6, alFinal: true, sesion: "s1" });
    expect(result.current).toBe(6);
  });

  it("una `sustitucion` del último (la respuesta que sigue llegando) no mueve nada", () => {
    // La longitud no cambia: la marca tampoco, y lo que crece por debajo no es «nuevo».
    const { result, rerender } = montar({ longitud: 4, alFinal: true, sesion: "s1" });
    rerender({ longitud: 4, alFinal: false, sesion: "s1" });
    rerender({ longitud: 4, alFinal: false, sesion: "s1" });
    expect(result.current).toBe(4);
  });

  it("una reconexión de la MISMA sesión conserva la cuenta: los índices son los mismos", () => {
    const { result, rerender } = montar({ longitud: 3, alFinal: true, sesion: "s1" });
    rerender({ longitud: 3, alFinal: false, sesion: "s1" });
    rerender({ longitud: 5, alFinal: false, sesion: "s1" });
    // La `reemision` trae objetos nuevos, pero la marca va por índice y por sesión.
    rerender({ longitud: 5, alFinal: false, sesion: "s1" });
    expect(result.current).toBe(3);
  });

  it("OTRA sesión estando arriba vuelve a cero, también si es más larga", () => {
    const { result, rerender } = montar({ longitud: 3, alFinal: true, sesion: "s1" });
    rerender({ longitud: 3, alFinal: false, sesion: "s1" });
    rerender({ longitud: 40, alFinal: false, sesion: "s2" });
    expect(result.current).toBe(40);
    // Y en la nueva, lo que llega después sí cuenta.
    rerender({ longitud: 42, alFinal: false, sesion: "s2" });
    expect(result.current).toBe(40);
  });

  it("una lista más corta que la marca no la deja fuera de ella", () => {
    const { result, rerender } = montar({ longitud: 5, alFinal: true, sesion: "s1" });
    rerender({ longitud: 5, alFinal: false, sesion: "s1" });
    rerender({ longitud: 2, alFinal: false, sesion: "s1" });
    expect(result.current).toBe(2);
  });
});
