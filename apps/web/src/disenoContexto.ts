import { createContext } from "react";
import type { EstadoDeDiseno } from "./disenoDelCable.js";

/**
 * El diseño vinculado (Stitch) para los diálogos de TAREA que no cuelgan de `App` en línea recta —«Editar la tarea» sale
 * en la lista, en el kanban y en la tarjeta del chat—: el estado del cable y la intención de pedir las pantallas de un
 * proyecto. Lo pone `App`; ausente = no hay selector de pantalla.
 */
export const DisenoDeTareasContexto = createContext<{ diseno?: EstadoDeDiseno; pedirPantallas: (proyecto: string) => void } | undefined>(undefined);
