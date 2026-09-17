import { aplicarAuth, cargar } from "../agent/config/configEnDisco.js";
import type { FuentesDeEleccion } from "../core/modelos.js";

/**
 * Lo que hay que leer del disco ANTES de elegir un modelo: la configuración —del proyecto y
 * la global— y las credenciales, que se aplican al proceso.
 *
 * **Existe porque había DOS puertas y solo una lo hacía.** La consola hidrataba sus fuentes
 * con `cargar()` y llamaba a `aplicarAuth`; `run --real` recibía únicamente lo que venía por
 * bandera, así que corría con el modelo POR OMISIÓN aunque hubiera uno configurado —medido:
 * el `config.json` global decía un modelo y el turno dijo otro, con su origen «(omision)» al
 * lado— y, peor, sin `aplicarAuth` la clave nunca llegaba a `process.env`: un proveedor con
 * credencial no se podía alcanzar desde `run` de ninguna forma. Para un comando cuyo trabajo
 * es MEDIR lo que cuesta un turno, medir otro modelo del que se usa lo deja sin sentido.
 *
 * Un solo cuerpo de función y dos llamadores, que es la regla de siempre en este repo: dos
 * copias de esto son dos sitios donde una de las dos se queda sin la mitad.
 *
 * **Lo que viene por bandera se conserva tal cual**: aquí no se decide ninguna precedencia
 * —de eso va `core/modelos.ts#resolver`, que además recuerda el origen de cada valor—, esto
 * solo rellena las dos fuentes que viven en disco.
 */
export function hidratarFuentesDeDisco(
  raiz: string,
  fuentes: FuentesDeEleccion
): { fuentes: FuentesDeEleccion; cargado: ReturnType<typeof cargar> } {
  const cargado = cargar(raiz);
  aplicarAuth(cargado.auth);
  return {
    fuentes: { ...fuentes, proyecto: cargado.config.proyecto, global: cargado.config.global },
    cargado,
  };
}
