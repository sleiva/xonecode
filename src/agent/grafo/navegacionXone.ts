import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Declaracion, IndiceDeNavegacion, Referencia } from "../../core/navegacion.js";
import type { CargarIndice } from "../navegacion/indiceEnDisco.js";
import { llamadaDeBusqueda } from "./busquedaRegex.js";

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
  problemas: 40,
} as const;

const ESQUEMA = z.object({
  operacion: z
    .enum(["inventario", "definicion", "referencias", "campos", "detalle", "app", "problemas"])
    .describe(
      "inventario: todas las colecciones. definicion: dónde se declara. referencias: quién la usa. " +
        "campos: los campos de una colección. detalle: todo de una (campos, eventos, nodos, conexiones). " +
        "app: por dónde arranca la aplicación, login y estilos. problemas: referencias rotas y colecciones que no usa nadie"
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
        return (
          `No se pudo leer la estructura del proyecto (${error instanceof Error ? error.name : "error"}). ` +
          `Sigue por texto:\n${llamadaDeBusqueda("coll name=")}`
        );
      }

      if (entrada.operacion === "inventario") {
        const todas = indice.inventario();
        if (todas.length === 0) {
          return (
            "El proyecto no declara ninguna colección. Si esperabas alguna, puede que el `.xne` no la " +
            `declare como espera el parser:\n${llamadaDeBusqueda("coll name=")}`
          );
        }
        return `${todas.length} colecciones:\n${recortar(todas, LIMITES_NAVEGACION.inventario, pintarDeclaracion)}`;
      }

      if (entrada.operacion === "app") {
        const app = indice.app();
        const filas: string[] = [];
        // Vacío es «no consta», no «no hay», y por eso se dice con palabras en vez de
        // devolver una fila en blanco que se leería como una afirmación.
        filas.push(
          app.entrada.length > 0
            ? `arranca por: ${app.entrada.join(", ")}`
            : "arranca por: no consta en app.xml"
        );
        if (app.login.length > 0) filas.push(`login: ${app.login.join(", ")}`);
        if (app.estilos.length > 0) filas.push(`estilos: ${app.estilos.join(" ")}`);
        if (app.conexiones.length > 0) filas.push(`conexiones: ${app.conexiones.join(" ")}`);
        return filas.join("\n");
      }

      if (entrada.operacion === "problemas") {
        const { rotas } = indice.problemas();
        if (rotas.length === 0) {
          return "Ninguna referencia apunta a una colección que no exista.";
        }
        return `${rotas.length} referencia(s) a una colección que no existe:\n${recortar(
          rotas,
          LIMITES_NAVEGACION.problemas,
          pintarReferencia
        )}`;
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
          return (
            `No hay ninguna declaración de «${nombre}». Prueba \`inventario\` para ver las que sí existen, ` +
            `o búscalo como texto:\n${llamadaDeBusqueda(nombre)}`
          );
        }
        return recortar(donde, LIMITES_NAVEGACION.definiciones, pintarDeclaracion);
      }

      if (entrada.operacion === "campos") {
        const campos = indice.campos(nombre);
        if (campos.length === 0) {
          return (
            `«${nombre}» no declara campos, o no existe. Prueba \`definicion\` para saber cuál de las dos, ` +
            `o búscalo como texto:\n${llamadaDeBusqueda(nombre)}`
          );
        }
        return recortar(campos, LIMITES_NAVEGACION.campos, pintarDeclaracion);
      }

      if (entrada.operacion === "detalle") {
        const d = indice.detalle(nombre);
        // `undefined` y no un detalle vacío: «no existe» y «existe y está vacía» son dos
        // cosas, y contestar la segunda sobre la primera hace que el agente deje de buscar.
        if (d === undefined) {
          return (
            `No hay ninguna colección «${nombre}». Prueba \`inventario\`, o búscala como texto:\n` +
            llamadaDeBusqueda(nombre)
          );
        }
        const partes = [
          `${d.nombre}  ${d.fichero}`,
          d.campos.length === 0
            ? "campos: (ninguno)"
            : `campos: ${d.campos.map((c) => `${c.nombre}${c.tipo === undefined ? "" : ":" + c.tipo}`).join(" ")}`,
        ];
        // Lo que está VACÍO no se pinta: una fila «eventos: (ninguno)» por cada cosa que la
        // colección no tiene convierte la respuesta en una plantilla y cuesta tokens en cada
        // llamada. Lo único que se afirma vacío son los campos, porque una colección sin
        // ellos es rara y merece decirse.
        if (d.eventos.length > 0) partes.push(`eventos: ${d.eventos.join(" ")}`);
        if (d.nodos.length > 0) partes.push(`nodos: ${d.nodos.join(" ")}`);
        if (d.conexiones.length > 0) partes.push(`conexiones: ${d.conexiones.join(" ")}`);
        if (d.apuntaA.length > 0) {
          partes.push(`apunta a:\n${recortar(d.apuntaA, LIMITES_NAVEGACION.referencias, pintarReferencia)}`);
        }
        return partes.join("\n");
      }

      const usos = indice.referencias(nombre);
      if (usos.length === 0) {
        /**
         * **El caso que más importa, y por eso la salida es una llamada y no un consejo.**
         *
         * «Nadie la referencia» es una afirmación fuerte y este índice no puede sostenerla:
         * tiene un límite declarado —no ve un nombre calculado en JavaScript, ni un
         * `getCollection(variable)`— así que un vacío aquí puede ser «no se usa» o «se usa por
         * un camino que no modelo». Devolver el vacío a secas invita a concluir lo primero, y
         * sobre esa conclusión se borra código vivo. Se dice la duda Y se da el siguiente paso
         * hecho: un modelo al que se le dice qué hacer sin decirle cómo se inventa los
         * argumentos, y eso cuesta un viaje y un error de esquema.
         */
        return (
          `Ninguna referencia declarada a «${nombre}» (mapcol, mapfld, linkedfield, contents, inherits ni ` +
          `getCollection con literal). Puede usarse por un camino que esto no ve —un nombre calculado en ` +
          `JavaScript—, así que NO concluyas que no se usa sin comprobarlo:\n${llamadaDeBusqueda(nombre)}`
        );
      }
      /**
       * **Se DICE cuál es floja.** `mencion` es un literal que coincide con el nombre de una
       * colección, no una llamada resuelta: la cadena real puede tener tres saltos
       * (`ExecuteNode(abrirColl('X'))` → nodo → `irColl(coll)` → `getCollection`). Sin esta
       * línea, el modelo leería las dos con la misma autoridad y afirmaría un uso que solo es
       * probable.
       */
      const hayMenciones = usos.some((r) => r.por === "mencion");
      const lista = recortar(usos, LIMITES_NAVEGACION.referencias, pintarReferencia);
      return hayMenciones
        ? `${lista}\n(«mencion» = el nombre aparece como literal en un script; es probable, no seguro)`
        : lista;
    },
    {
      name: "xone_navegacion",
      description:
        "Estructura del proyecto XOne resuelta: qué colecciones hay, dónde se declara una colección o un campo, " +
        "quién la referencia (mapcol, mapfld, linkedfield, contents, inherits y desde scripts), qué campos, eventos y nodos tiene, " +
        "por dónde arranca la aplicación y qué referencias están rotas. " +
        "Úsala ANTES de leer ficheros para saber CUÁL leer. No busca texto: para eso están grep y regex_search. " +
        "No ve referencias calculadas en JavaScript.",
      schema: ESQUEMA,
    }
  );
}
