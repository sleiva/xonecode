/**
 * El diseño vinculado que llega por el cable (`{clase:"diseno"}`), copiado campo a campo (la lista blanca del store) y
 * FUNDIDO con lo que ya había del MISMO proyecto: cada mensaje trae solo lo que se pidió (el vínculo, los proyectos de
 * Stitch o las pantallas). Otro proyecto empieza de cero. `vinculo: null` es «sin vínculo», que es un dato.
 */
export interface EstadoDeDiseno {
  proyecto?: string;
  vinculo?: { proyecto: string; nombre: string } | null;
  proyectos?: { name: string; title: string }[];
  pantallas?: { name: string; title: string; miniatura?: string }[];
  error?: string;
}

export function fundirDiseno(antes: EstadoDeDiseno | undefined, mensaje: unknown): EstadoDeDiseno | undefined {
  if (typeof mensaje !== "object" || mensaje === null) return antes;
  const m = mensaje as Record<string, unknown>;
  const proyecto = typeof m["proyecto"] === "string" ? m["proyecto"] : undefined;
  const base: EstadoDeDiseno = antes !== undefined && antes.proyecto === proyecto ? { ...antes } : proyecto === undefined ? {} : { proyecto };
  // Un error de AHORA sustituye al anterior; sin error, se retira.
  delete base.error;
  if (typeof m["error"] === "string") base.error = m["error"];
  const v = m["vinculo"];
  if (v === null) base.vinculo = null;
  else if (typeof v === "object" && v !== undefined) {
    const r = v as Record<string, unknown>;
    if (typeof r["proyecto"] === "string" && typeof r["nombre"] === "string") base.vinculo = { proyecto: r["proyecto"], nombre: r["nombre"] };
  }
  if (Array.isArray(m["proyectos"])) {
    base.proyectos = m["proyectos"].flatMap((p) => {
      const r = p as Record<string, unknown>;
      return typeof r?.["name"] === "string" && typeof r["title"] === "string" ? [{ name: r["name"], title: r["title"] }] : [];
    });
  }
  if (Array.isArray(m["pantallas"])) {
    base.pantallas = m["pantallas"].flatMap((p) => {
      const r = p as Record<string, unknown>;
      if (typeof r?.["name"] !== "string" || typeof r["title"] !== "string") return [];
      // Solo https: una miniatura es un <img> en la página.
      const miniatura = typeof r["miniatura"] === "string" && r["miniatura"].startsWith("https://") ? r["miniatura"] : undefined;
      return [{ name: r["name"], title: r["title"], ...(miniatura === undefined ? {} : { miniatura }) }];
    });
  }
  return base;
}
