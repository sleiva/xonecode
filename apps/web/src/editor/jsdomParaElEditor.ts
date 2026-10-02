/**
 * Lo que jsdom no trae y CodeMirror mide al pintar. Solo lo importan los TESTS (`*.test.tsx`): el
 * navegador lo tiene todo. Se llama en un `beforeAll` y es idempotente: no pisa lo que exista.
 */
export function prepararJsdomParaElEditor(): void {
  const rangos = Range.prototype as unknown as {
    getClientRects?: () => unknown;
    getBoundingClientRect?: () => unknown;
  };
  rangos.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  rangos.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });
  // CodeMirror pregunta `instanceof Window` al medir el scroll; jsdom no siempre lo publica global.
  const global = globalThis as { Window?: unknown };
  if (global.Window === undefined) global.Window = window.constructor;
}
