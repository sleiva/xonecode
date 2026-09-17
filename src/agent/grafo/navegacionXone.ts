import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Declaracion, IndiceDeNavegacion, Referencia } from "../../core/navegacion.js";
import type { CargarIndice } from "../navegacion/indiceEnDisco.js";

/**
 * `xone_navegacion`: preguntar por la ESTRUCTURA del proyecto sin leer ficheros.
 *
 * **Por qué existe, medido.** Sobre un proyecto real de 41 `.xne`, contestar «¿qué
 * colecciones tiene el proyecto?» leyendo ficheros cuesta unos 18.000 tokens; contestarla
 * desde el índice cuesta 141. Y una pregunta de capacidad («¿podríamos hacer un CRM?») llegó
 * a gastar 21 pasos de exploración. Lo caro no es abrir un `.xne` —son un par de kilobytes—,
 * es **no saber cuál de los cuarenta y uno abrir**. `grep` y `regex_search` buscan TEXTO;
 * esto contesta sobre el modelo ya resuelto, así que un `mapcol` encuentra su colección
 * aunque el nombre aparezca en otros veinte sitios.
 *
 * **El esquema es deliberadamente pequeño.** El inspector midió que el 87 % de una llamada
 * son los esquemas de las tools y quitarle al orquestador tres que no podía usar valió un
 * −24 % del turno. Una tool con una operación enumerada y un nombre opcional cuesta poco en
 * cada llamada; cuatro tools separadas costarían cuatro veces eso para siempre.
 *
 * **Las rutas que devuelve son VIRTUALES y ya están filtradas.** Quien las traduce y aplica
 * `puedeLeerRuta` y `esVistaAplanada` es el adaptador (`navegacion/modeloDeProyecto.ts`), y
 * lo hace en la FUENTE: lo que el agente no puede abrir no llega ni a estar en el índice. Se
 * filtra ahí y no aquí a propósito — es el único sitio donde una ruta se crea, está probado
 * contra una fuga, y un segundo filtro sobre los mismos datos sería un segundo sitio donde
 * equivocarse sin añadir barrera. Lo que esta tool NO hace nunca es aceptar una ruta del
 * modelo: se pregunta por NOMBRE, así que no hay ruta que validar a la entrada.
 */

/** Topes. Una respuesta que no cabe se recorta DICIENDO cuánto se dejó fuera: una lista
 *  truncada en silencio se lee como la lista entera, y sobre eso se concluye de más. */
export const LIMITES_NAVEGACION = {
  inventario: 200,
  referencias: 60,
  campos: 150,
  definiciones: 20,
} as const;

const ESQUEMA = z.object({
  operacion: z
    .enum(["inventario", "definicion", "referencias", "campos"])
    .describe(
      "inventario: todas las colecciones. definicion: dónde se declara. referencias: quién la usa. campos: los campos de una colección"
    ),
  nombre: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("`Coleccion` o `Coleccion.CAMPO`. No hace falta en `inventario`"),
});

type Entrada = z.infer<typeof ESQUEMA>;

/** Recorta y DICE lo que se dejó fuera. */
function recortar<T>(lista: readonly T[], tope: number, pinta: (x: T) => string): string {
  const cabe = lista.slice(0, tope).map(pinta).join("\n");
  return lista.length > tope ? `${cabe}\n… y ${lista.length - tope} más` : cabe;
}

const pintarDeclaracion = (d: Declaracion): string =>
  d.clase === "coleccion"
    ? `${d.nombre}  ${d.fichero}`
    : `${d.coleccion}.${d.nombre}${d.tipo === undefined ? "" : `:${d.tipo}`}  ${d.fichero}`;

const pintarReferencia = (r: Referencia): string => `${r.desde} --${r.por}--> ${r.hacia}  ${r.fichero}`;

/**
 * La tool. `cargar` entra por parámetro —y con él la raíz ya fijada— para que el modelo no
 * pueda decir sobre QUÉ proyecto pregunta: si pudiera, esto sería una tool que lee cualquier
 * carpeta de la máquina.
 */
export function crearNavegacionXone(cargar: CargarIndice, ficheros: ReadonlySet<string>) {
  return tool(
    async (entrada: Entrada) => {
      let indice: IndiceDeNavegacion;
      try {
        indice = await cargar(ficheros);
      } catch (error) {
        // El motivo de un error de Node lleva la ruta absoluta y esto va al modelo: se dice
        // QUÉ pasó, no dónde. Y se DEVUELVE en vez de lanzarse, para que el agente pueda
        // seguir con `read_file` en vez de llevarse el turno por delante.
        return `No se pudo leer la estructura del proyecto (${error instanceof Error ? error.name : "error"}). Usa read_file o grep.`;
      }

      if (entrada.operacion === "inventario") {
        const todas = indice.inventario();
        if (todas.length === 0) return "El proyecto no declara ninguna colección.";
        return `${todas.length} colecciones:\n${recortar(todas, LIMITES_NAVEGACION.inventario, pintarDeclaracion)}`;
      }

      const nombre = entrada.nombre?.trim();
      if (nombre === undefined || nombre === "") {
        return "Falta `nombre`: di la colección (`Clientes`) o el campo (`Clientes.NOMBRE`).";
      }

      if (entrada.operacion === "definicion") {
        const donde = indice.definicion(nombre);
        // Vacío no es un fallo: es que no está. Y se dice CÓMO seguir, que es lo que evita
        // que el modelo pruebe seis rutas inventadas — la misma postura que `porQueNo`.
        if (donde.length === 0) {
          return `No hay ninguna declaración de «${nombre}». Prueba \`inventario\` para ver las colecciones que sí existen.`;
        }
        return recortar(donde, LIMITES_NAVEGACION.definiciones, pintarDeclaracion);
      }

      if (entrada.operacion === "campos") {
        const campos = indice.campos(nombre);
        if (campos.length === 0) {
          return `«${nombre}» no declara campos, o no existe. Prueba \`definicion\` para saber cuál de las dos.`;
        }
        return recortar(campos, LIMITES_NAVEGACION.campos, pintarDeclaracion);
      }

      const usos = indice.referencias(nombre);
      if (usos.length === 0) return `Nadie referencia «${nombre}» por mapcol, mapfld, linkedfield, contents ni inherits.`;
      return recortar(usos, LIMITES_NAVEGACION.referencias, pintarReferencia);
    },
    {
      name: "xone_navegacion",
      description:
        "Estructura del proyecto XOne resuelta: qué colecciones hay, dónde se declara una colección o un campo, " +
        "quién la referencia (mapcol, mapfld, linkedfield, contents, inherits) y qué campos tiene. " +
        "Úsala ANTES de leer ficheros para saber CUÁL leer. No busca texto: para eso están grep y regex_search. " +
        "No ve referencias calculadas en JavaScript.",
      schema: ESQUEMA,
    }
  );
}
