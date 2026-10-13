/**
 * La ENTRADA del contrato del panorama con la web móvil de `xonecode-server`.
 * `panorama-contrato.json` es lo que sale de componerPanorama → filtrarSalida → ajustarATope con ella, y hay
 * OTRA COPIA idéntica en `xonecode-server/packages/remoto/test/panorama-contrato.json`, que su validador debe
 * aceptar. Las dos copias se actualizan JUNTAS: si cambia el panorama aquí, se regenera y se copia allí.
 */
import type { EntradaDePanorama } from "../panorama.js";

const lineas = (n: number) => Array.from({ length: n }, (_, i) => ({ tipo: i % 2 === 0 ? ("anadido" as const) : ("igual" as const), texto: `línea ${i}` }));
const pendiente = (id: string, descripcion: string) => ({ id, origen: "developer-xone", descripcion, decisionesPermitidas: ["approve", "reject"] });

export const ENTRADA_DEL_CONTRATO: EntradaDePanorama = {
  consolas: [
    {
      id: "c1", proyecto: "AppDemo", sesion: "Prueba", foco: true, turnoEnVuelo: true, preguntaPendiente: false,
      ultimaActividad: "2026-10-13T11:55:00Z",
      aprobacion: {
        pendientes: [pendiente("q1", "edit_file /a.xne")],
        ficheros: { q1: "/a.xne" },
        diffs: { q1: [{ tipo: "quitado", texto: "<viejo/>" }, { tipo: "anadido", texto: "<nuevo/>" }, { tipo: "igual", texto: "</x>" }] },
      },
    },
    {
      id: "c2", proyecto: "Otra", foco: false, turnoEnVuelo: false, preguntaPendiente: false,
      aprobacion: { pendientes: [pendiente("q2", "write_file /grande.js"), { ...pendiente("q3", "incorporar_adjunto /i.png"), remota: true as const }], ficheros: { q2: "/grande.js" }, diffs: { q2: lineas(250) } },
    },
    { id: "c3", proyecto: "Tercera", sesion: "Menú", foco: false, turnoEnVuelo: false, preguntaPendiente: true },
    { id: "c4", proyecto: "Cuarta", foco: false, turnoEnVuelo: false, preguntaPendiente: false },
  ],
  tareas: [
    { id: "t1", titulo: "Rehacer login", proyecto: "AppDemo", estado: "requiere-atencion", motivo: "no encuentro el campo", creada: "2026-10-13T10:00:00Z" },
    { id: "t2", titulo: "Pulir iconos", proyecto: "AppDemo", estado: "nuevo", tras: "t1", creada: "2026-10-13T10:05:00Z" },
    { id: "t3", titulo: "Migrar datos", proyecto: "AppDemo", estado: "en-proceso", creada: "2026-10-13T10:06:00Z" },
    { id: "t4", titulo: "Hecha ayer", proyecto: "AppDemo", estado: "terminada", creada: "2026-10-12T10:00:00Z", acabada: "2026-10-13T09:00:00Z" },
    { id: "t5", titulo: "Hecha sin fecha", proyecto: "Otra", estado: "terminada", creada: "2026-10-11T10:00:00Z" },
  ],
};

export interface ContratoDelPanorama {
  /** Lo que sale por el cable cuando todo cabe. */
  cabe: unknown;
  /** El tope con que se generó `sinDiffs`: lo justo para que quepa quitando los diffs. */
  tope: number;
  /** Lo que sale cuando no cabe y se quitan los diffs (`recortada` en todas las aprobaciones). */
  sinDiffs: unknown;
}
