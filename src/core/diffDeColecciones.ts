/**
 * El diff SEMÁNTICO de las colecciones de un fichero: qué campos, referencias, eventos, nodos y
 * conexiones entran, salen o cambian entre el «antes» de Revisión y ahora.
 *
 * **Puro, y sobre el MISMO modelo que el índice** (`ColeccionDeNavegacion`): quien lee el disco
 * —el de ahora y el del «antes», sacado de git— es `agent/`, con el cargador de siempre. Así no
 * hay un segundo sitio que decida qué es un campo o una referencia.
 *
 * **Límite declarado**: el modelo sabe el TIPO de un campo y nada más de sus atributos —ni el
 * tamaño, ni `visible`, ni `class`—, así que un `S(20) → S(50)` o un cambio de estilo NO salen
 * aquí: los enseña el diff de texto de debajo, que es la medida entera. Esto es el resumen de lo
 * que el modelo entiende, no un sustituto del diff.
 *
 * Los nombres se casan SIN distinguir mayúsculas, la misma regla que el índice: en XOne `NOMBRE`
 * y `Nombre` son la misma intención, y contarlo como «uno sale, otro entra» sería inventar un
 * cambio. Se enseña el nombre de AHORA.
 */
import type { ColeccionDeNavegacion } from "./navegacion.js";

export interface CambioDeCampo {
  cambio: "nuevo" | "borrado" | "tipo";
  nombre: string;
  /** El tipo de antes (en `borrado` y `tipo`) y el de ahora (en `nuevo` y `tipo`). Ausente = el `.xne` no lo dice. */
  antes?: string;
  ahora?: string;
}

/** Una referencia que entra o sale: `desde` con qué atributo `hacia` dónde. */
export interface CambioDeReferencia {
  cambio: "nuevo" | "borrado";
  desde: string;
  por: string;
  hacia: string;
}

/** Un nombre suelto (evento, nodo o conexión) que entra o sale. */
export interface CambioDeNombre {
  cambio: "nuevo" | "borrado";
  nombre: string;
}

export interface CambiosDeUnaColeccion {
  nombre: string;
  /** La colección entera: nueva en este fichero, borrada de él, o modificada dentro. */
  estado: "nueva" | "borrada" | "modificada";
  campos: CambioDeCampo[];
  referencias: CambioDeReferencia[];
  eventos: CambioDeNombre[];
  nodos: CambioDeNombre[];
  conexiones: CambioDeNombre[];
}

const clave = (s: string): string => s.toLowerCase();

function cambiosDeNombres(antes: readonly string[], ahora: readonly string[]): CambioDeNombre[] {
  const a = new Set(antes.map(clave));
  const d = new Set(ahora.map(clave));
  return [
    ...ahora.filter((n) => !a.has(clave(n))).map((nombre) => ({ cambio: "nuevo" as const, nombre })),
    ...antes.filter((n) => !d.has(clave(n))).map((nombre) => ({ cambio: "borrado" as const, nombre })),
  ];
}

function cambiosDeCampos(
  antes: ColeccionDeNavegacion["campos"],
  ahora: ColeccionDeNavegacion["campos"]
): CambioDeCampo[] {
  const deAntes = new Map(antes.map((f) => [clave(f.nombre), f]));
  const deAhora = new Map(ahora.map((f) => [clave(f.nombre), f]));
  const salida: CambioDeCampo[] = [];
  for (const f of ahora) {
    const previo = deAntes.get(clave(f.nombre));
    if (previo === undefined) {
      salida.push({ cambio: "nuevo", nombre: f.nombre, ...(f.tipo === undefined ? {} : { ahora: f.tipo }) });
    } else if ((previo.tipo ?? "") !== (f.tipo ?? "")) {
      salida.push({
        cambio: "tipo",
        nombre: f.nombre,
        ...(previo.tipo === undefined ? {} : { antes: previo.tipo }),
        ...(f.tipo === undefined ? {} : { ahora: f.tipo }),
      });
    }
  }
  for (const f of antes) {
    if (!deAhora.has(clave(f.nombre))) {
      salida.push({ cambio: "borrado", nombre: f.nombre, ...(f.tipo === undefined ? {} : { antes: f.tipo }) });
    }
  }
  return salida;
}

function cambiosDeReferencias(
  antes: ColeccionDeNavegacion["referencias"],
  ahora: ColeccionDeNavegacion["referencias"]
): CambioDeReferencia[] {
  const id = (r: { desde: string; por: string; hacia: string }): string => `${clave(r.desde)}|${r.por}|${clave(r.hacia)}`;
  const a = new Set(antes.map(id));
  const d = new Set(ahora.map(id));
  return [
    ...ahora.filter((r) => !a.has(id(r))).map((r) => ({ cambio: "nuevo" as const, desde: r.desde, por: r.por, hacia: r.hacia })),
    ...antes.filter((r) => !d.has(id(r))).map((r) => ({ cambio: "borrado" as const, desde: r.desde, por: r.por, hacia: r.hacia })),
  ];
}

/**
 * Las colecciones que cambiaron entre `antes` y `ahora`, que son las declaradas en UN fichero en
 * cada extremo. Una colección sin ningún cambio que el modelo vea no sale: el fichero cambió en
 * algo que el modelo no entiende, y eso lo dice quien pinta («sin cambios en el modelo»), no una
 * fila vacía.
 */
export function diffDeColecciones(
  antes: readonly ColeccionDeNavegacion[],
  ahora: readonly ColeccionDeNavegacion[]
): CambiosDeUnaColeccion[] {
  const deAntes = new Map(antes.map((c) => [clave(c.nombre), c]));
  const deAhora = new Map(ahora.map((c) => [clave(c.nombre), c]));
  const vacia: Pick<ColeccionDeNavegacion, "campos" | "referencias" | "eventos" | "nodos" | "conexiones"> = {
    campos: [],
    referencias: [],
    eventos: [],
    nodos: [],
    conexiones: [],
  };
  const salida: CambiosDeUnaColeccion[] = [];
  const comparar = (nombre: string, a: typeof vacia, d: typeof vacia, estado: CambiosDeUnaColeccion["estado"]): void => {
    const cambios: CambiosDeUnaColeccion = {
      nombre,
      estado,
      campos: cambiosDeCampos(a.campos, d.campos),
      referencias: cambiosDeReferencias(a.referencias, d.referencias),
      eventos: cambiosDeNombres(a.eventos, d.eventos),
      nodos: cambiosDeNombres(a.nodos, d.nodos),
      conexiones: cambiosDeNombres(a.conexiones, d.conexiones),
    };
    const hay =
      cambios.campos.length + cambios.referencias.length + cambios.eventos.length + cambios.nodos.length + cambios.conexiones.length > 0;
    if (estado !== "modificada" || hay) salida.push(cambios);
  };
  for (const c of ahora) {
    const previa = deAntes.get(clave(c.nombre));
    comparar(c.nombre, previa ?? vacia, c, previa === undefined ? "nueva" : "modificada");
  }
  for (const c of antes) if (!deAhora.has(clave(c.nombre))) comparar(c.nombre, c, vacia, "borrada");
  return salida;
}
