import type { ReactNode } from "react";
import type { Acto } from "../tipos.js";
import { Pestanas, type Pestana } from "./Pestanas.js";
import { Trazas } from "./Trazas.js";
import conversacion from "../../estilos/ConversationRoot.module.css";

/**
 * El panel de vistas: su tira de pestañas arriba y, debajo, la que esté elegida.
 *
 * **Es la mitad de la mudanza que partió esta pantalla en dos.** Antes esto vivía dentro de
 * `Transcript`, que despachaba entre el chat y las demás vistas: elegir «Ficheros» era dejar
 * de ver la conversación. Ahora el chat es la columna del centro y esto es lo que se abre AL
 * LADO (`repartoDeColumnas.ts`), así que las dos cosas se ven a la vez — que es lo que se
 * pidió: mirar un artefacto sin perder de vista lo que el agente está escribiendo.
 *
 * **Y el mismo componente tiene DOS casas, sin enterarse de en cuál está.** En una ventana
 * ancha es la columna derecha; en una estrecha ocupa el centro, que es exactamente cómo se
 * comportaba esta consola antes de que hubiera tercera columna. Quién decide eso es `App` con
 * la regla de `repartoDeColumnas`; aquí no hay ni una consulta de ancho, y por eso no hay dos
 * versiones de esto que mantener sincronizadas.
 *
 * Las vistas entran como RANURAS ya montadas por `App`, no como props de datos, y eso no es
 * organización: **montarse es lo que las hace MEDIR**. Ficheros pide el árbol, Revisión pide
 * la lista, Ejecutar pregunta por el aparato y CloudStudio mide lo que queda por subir — todas
 * al montarse. Como una ranura solo se monta cuando se pinta, abrir la pestaña ES entrar a
 * mirarlo, y ninguna de esas peticiones sale hasta entonces.
 */
export function Panel({
  pestana,
  alElegirPestana,
  alCerrar,
  hayArtefactos,
  actos,
  ficheros,
  revision,
  artefactos,
  tareas,
  ejecutar,
}: {
  pestana: Pestana;
  alElegirPestana: (pestana: Pestana) => void;
  /** Cerrar el panel entero. Ver `Pestanas`, que es quien pinta la salida. */
  alCerrar: () => void;
  hayArtefactos?: boolean;
  /** Solo para las Trazas, que se calculan de los actos y no llegan por ranura: es la única
   *  vista que no habla con el servidor, así que no tiene nada que medir al montarse. */
  actos: readonly Acto[];
  ficheros?: ReactNode;
  /** Lleva DENTRO la banda de CloudStudio, que ya no tiene pestaña propia (`Pestanas.tsx`
   *  dice por qué): aquí no se nota, es una ranura como las demás. */
  revision?: ReactNode;
  /** Lo que el agente DIBUJÓ en esta sesión. Su pestaña solo existe si hay alguno, y de eso
   *  se encarga `Pestanas`: aquí es una ranura más. */
  artefactos?: ReactNode;
  /** Las tareas en background del proyecto ABIERTO. Su pestaña existe SIEMPRE —es de acción,
   *  no de registro como `artefactos` (`Pestanas.tsx`)—; aquí sigue siendo una ranura más. */
  tareas?: ReactNode;
  /**
   * Ejecutar la app de este proyecto en un aparato. Como `tareas`, su pestaña existe SIEMPRE
   * —es de ACCIÓN, no de registro— y aquí es una ranura más.
   *
   * **Su rama del despacho es EXPLÍCITA y tiene que seguir siéndolo**: la última de abajo es
   * un `else` INCONDICIONAL que pinta Ficheros, así que una pestaña sin rama propia no deja
   * un hueco vacío ni da un error — pinta la vista de al lado EN SILENCIO. Toda pestaña nueva
   * se añade aquí ANTES de ese `else`.
   */
  ejecutar?: ReactNode;
}) {
  return (
    // `region` con nombre y no un `div` pelado: en la ventana ancha esto es una columna
    // entera de la pantalla, y sin landmark quien navega con teclado o lector solo puede
    // llegar a ella tabulando por todo el chat que tiene delante.
    <section className={conversacion.body} aria-label="Panel">
      <Pestanas
        pestana={pestana}
        alElegirPestana={alElegirPestana}
        alCerrar={alCerrar}
        {...(hayArtefactos === undefined ? {} : { hayArtefactos })}
      />
      <div className={conversacion.viewArea}>
        {pestana === "trazas" ? (
          <Trazas actos={actos} />
        ) : pestana === "revision" ? (
          revision
        ) : pestana === "artefactos" ? (
          artefactos
        ) : pestana === "tareas" ? (
          tareas
        ) : pestana === "ejecutar" ? (
          ejecutar
        ) : (
          ficheros
        )}
      </div>
    </section>
  );
}
