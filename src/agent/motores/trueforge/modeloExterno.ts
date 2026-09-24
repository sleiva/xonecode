/**
 * El «modelo» de un hijo EXTERNO de TrueForge: Claude Code, Codex u OpenCode detrás de un
 * `AgentThread` normal.
 *
 * TrueForge exige que su factoría de hijos devuelva un `AgentThread`, y un hilo necesita un
 * `ILLM`; el `Runnable` que deepagents acepta como `CompiledSubAgent` no tiene sitio aquí. Así que
 * el hilo se construye como cualquier otro y lo que cambia es lo que hay detrás de su modelo: una
 * llamada a `SubagenteExternoPort.correr()` —la MISMA integración de deepagents, con sus guardas de
 * ruta, su política de aprobación y su consumo—, cuya respuesta final vuelve como la respuesta del
 * hilo. El bucle agéntico vive dentro del producto, no aquí: el hilo hace UNA llamada y termina.
 *
 * No es un segundo `ILLM`: es un objeto con la forma de un modelo de LangChain —`stream()`— que
 * `modeloParaTrueforge` ya sabe traducir. Un adaptador propio sería un segundo sitio donde
 * componer los trozos que TrueForge espera.
 *
 * **Lo que manda TrueForge al «modelo» se IGNORA** —su identidad, su prompt de sistema, el primer
 * mensaje—: el hijo externo recibe SUS instrucciones y SU encargo, que se capturan al crear el hilo.
 */
import { AIMessageChunk } from "@langchain/core/messages";
import type { MotorExterno, PeticionExterna, SubagenteExternoPort } from "../../../core/ports.js";
import type { ILLM } from "./trueforge.js";
import { modeloParaTrueforge } from "./modeloLangchain.js";
import { textoDeFalloExterno } from "../../subagentes/subagenteExterno.js";

export function modeloExternoParaTrueforge(opciones: {
  puerto: SubagenteExternoPort;
  /** La petición entera menos la señal, compuesta al DELEGAR (instrucciones e inventario frescos). */
  peticion: () => Omit<PeticionExterna, "senal">;
  /** La cancelación del turno: se le pasa al producto para que no quede un proceso vivo. */
  senal?: () => AbortSignal | undefined;
}): ILLM {
  return modeloParaTrueforge({
    nombre: "externo",
    modelo: () => ({
      stream: async () => {
        const peticion = opciones.peticion();
        const senal = opciones.senal?.();
        let texto: string;
        try {
          texto = await opciones.puerto.correr({ ...peticion, ...(senal === undefined ? {} : { senal }) });
        } catch (error) {
          // Cancelado: no hay respuesta que dar, y el turno ya se está cerrando por su lado.
          if (senal?.aborted === true) throw error;
          texto = textoDeFalloExterno(peticion.motor, error);
        }
        return (async function* () {
          yield new AIMessageChunk({ content: texto });
        })();
      },
    }),
  });
}
