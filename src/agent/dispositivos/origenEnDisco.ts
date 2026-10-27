/**
 * El origen EN VIGOR de los aparatos de un proyecto, leído del disco AHORA (`core/dispositivoElegido.ts#origenEnVigor`):
 * el de su `config.json` si lo dice, y si no el global (la granja como aparato por omisión de `settings.json`). Lo usan
 * el vestíbulo (aparato con que nace una sesión) y TrueForge (qué skill del aparato ve cada especialista).
 */
import { origenEnVigor } from "../../core/dispositivoElegido.js";
import type { OrigenDeDispositivos } from "../../core/granja.js";
import { origenDeDispositivosDelProyecto } from "../config/configEnDisco.js";
import { cargarSettings } from "../config/settingsEnDisco.js";

export function origenDeDispositivosEnVigor(raiz: string, casa?: string): OrigenDeDispositivos {
  return origenEnVigor(origenDeDispositivosDelProyecto(raiz), cargarSettings(casa).settings.dispositivoPorDefecto);
}
