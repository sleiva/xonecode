/**
 * La FOTO de un aparato elegido —el de una sesión, o el de por defecto de las sesiones nuevas
 * (IXCODE-51)— y la regla que la valida. Puro, y sin importar nada: lo leen `dispositivoDeSesion.ts`
 * y `settings.ts`, y desde cualquiera de los dos sería un ciclo.
 */

export interface DispositivoDeLaSesion {
  id: string;
  nombre: string;
  plataforma: "android" | "ios";
  clase: "emulador" | "simulador" | "fisico";
}

/**
 * Validada como la valida `skills/xone-hotswap/lib/dispositivo.mjs` (`dispositivoDeLaSesion`): las
 * dos lecturas tienen que coincidir, o la shell y los scripts creerían en aparatos distintos.
 * Rota o incompleta = no hay elección.
 */
export function dispositivoDeValor(valor: unknown): DispositivoDeLaSesion | undefined {
  const d = valor as Partial<DispositivoDeLaSesion> | null | undefined;
  if (typeof d !== "object" || d === null) return undefined;
  if (typeof d.id !== "string" || d.id === "") return undefined;
  if (d.plataforma !== "android" && d.plataforma !== "ios") return undefined;
  const clase = d.clase === "emulador" || d.clase === "simulador" || d.clase === "fisico" ? d.clase : "fisico";
  return { id: d.id, nombre: typeof d.nombre === "string" ? d.nombre : d.id, plataforma: d.plataforma, clase };
}
