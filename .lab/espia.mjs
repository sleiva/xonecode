// Envuelve fetch para ver el cuerpo REAL que sale hacia deepseek. No toca el código del harness.
const real = globalThis.fetch;
let n = 0;
globalThis.fetch = async (u, i) => {
  const url = typeof u === "string" ? u : (u?.url ?? "");
  if (typeof i?.body === "string" && url.includes("deepseek")) {
    n += 1;
    try {
      const c = JSON.parse(i.body);
      const ct = (c.messages ?? []).filter((m) => m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length);
      const eco = ct.filter((m) => typeof m.reasoning_content === "string");
      const ids = ct.map((m) => m.tool_calls.map((t) => t.id).join("+")).join(" | ");
      console.error(`[espia ${n}] stream=${c.stream === true} msgs=${(c.messages ?? []).length} asis-con-tools=${ct.length} con-eco=${eco.length}`
        + (ct.length > eco.length ? "  <<< FALTA ECO" : "") + (ids ? `\n          ids: ${ids}` : ""));
    } catch { /* */ }
  }
  const r = await real(u, i);
  if (!r.ok && url.includes("deepseek")) console.error(`[espia] respuesta ${r.status}`);
  return r;
};
