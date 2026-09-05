import { useEffect, useRef, useState } from "react";
import type { ProveedorDeModelos } from "../tipos.js";
import estilos from "./PastillaDeModelo.module.css";

/**
 * El modelo en vigor, y el menú para cambiarlo — la pastilla que faltaba en la fila de
 * controles del compositor.
 *
 * Hasta ahora `Compositor.tsx` decía, con razón, que no se copiaba de la referencia
 * «porque no hay nada que abran aquí: el cable no manda modelo ni permisos por sesión».
 * Ahora sí lo manda (`clase: "modelos"`), así que la pastilla tiene un dato detrás.
 *
 * Cuatro reglas, y las cuatro salen de leer cómo lo hace el harness de DeepSeek
 * (`@deepseek-ai/dsh-client-ui-model-selection`), no de inventarlas aquí:
 *
 * - **El modelo en vigor lo dice el servidor.** Este componente lo pinta y no lo deduce
 *   de nada — ni del último turno, ni de una frase del transcript. Sin `actual` pone
 *   «Elige modelo»: «no stale row is synthesized».
 * - **Elegir no tiene camino propio**: manda `/modelo <proveedor>/<id>`, el mismo comando
 *   que se teclea en el compositor. Dos entradas, un solo camino de envío.
 * - **El catálogo se pide al abrir el proveedor**, porque cada uno es una llamada de red.
 *   Mientras llega se dice que se está pidiendo; no se finge una lista.
 * - **El proveedor que falla se lista inservible y los demás siguen elegibles.** Su error
 *   se enseña donde está mirando el usuario, no en otra pestaña.
 *
 * El punto de la credencial es literal: verde solo si está CONFIRMADA, rojo solo si se
 * sabe que falta, y nada para quien no necesita ninguna (Ollama local) — pintarle un punto
 * a ese sería concederle un permiso o inventarle un problema.
 */
export function PastillaDeModelo({
  actual,
  proveedores,
  alPedirCatalogo,
  alElegir,
}: {
  /** «proveedor/modelo» en vigor. Ausente = no se sabe, y entonces no se afirma. */
  actual?: string;
  proveedores: readonly ProveedorDeModelos[];
  /** Pide el catálogo de un proveedor: una llamada de red, y por eso bajo demanda. */
  alPedirCatalogo: (proveedor: string) => void;
  /** El id completo «proveedor/modelo». Quien monte esto lo manda como `/modelo <id>`. */
  alElegir: (id: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const envoltura = useRef<HTMLDivElement>(null);
  const [desplegado, setDesplegado] = useState<string | undefined>(undefined);
  /** Los que ya se han pedido en ESTA pastilla: para decir «consultando…» sin fingir. */
  const [pedidos, setPedidos] = useState<readonly string[]>([]);

  /**
   * Pinchar fuera cierra, y Escape también.
   *
   * Un menú que solo se cierra volviendo a pulsar su disparador tapa la interfaz de debajo
   * —está en la fila del compositor, justo encima de lo que se escribe— y no es lo que
   * hace ningún menú: se pulsa en otro sitio y se va. El listener va en `document` con
   * `mousedown` y no `click`: con `click` se cierra DESPUÉS de que el navegador haya
   * decidido dónde cayó la pulsación, y un clic sobre otro botón acababa haciendo las dos
   * cosas. Solo se registra con el menú abierto: escuchar el documento entero mientras está
   * cerrado es trabajo por nada en cada pulsación de la aplicación.
   */
  useEffect(() => {
    if (!abierta) return;
    const fuera = (evento: MouseEvent): void => {
      const nodo = envoltura.current;
      if (nodo !== null && evento.target instanceof Node && !nodo.contains(evento.target)) {
        setAbierta(false);
      }
    };
    const escape = (evento: KeyboardEvent): void => {
      if (evento.key === "Escape") setAbierta(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierta]);

  const abrirProveedor = (id: string): void => {
    if (desplegado === id) {
      setDesplegado(undefined);
      return;
    }
    setDesplegado(id);
    const proveedor = proveedores.find((p) => p.id === id);
    // Ni si ya está contestado ni si ya está pedido: abrir y cerrar el menú no puede
    // disparar una llamada de red por cada clic. Lo segundo hace falta además de lo
    // primero porque entre la petición y la respuesta el proveedor sigue sin `modelos`.
    if (proveedor?.modelos === undefined && proveedor?.error === undefined && !pedidos.includes(id)) {
      setPedidos((previos) => [...previos, id]);
      alPedirCatalogo(id);
    }
  };

  return (
    <div className={estilos.envoltura} ref={envoltura}>
      <button
        type="button"
        className={estilos.pastilla}
        aria-expanded={abierta}
        aria-haspopup="menu"
        onClick={() => setAbierta((v) => !v)}
      >
        {actual ?? "Elige modelo"}
      </button>
      {abierta ? (
        <div className={estilos.menu} role="menu">
          {proveedores.map((p) => {
            const esperando = p.modelos === undefined && p.error === undefined && pedidos.includes(p.id);
            return (
              <div key={p.id} className={estilos.grupo}>
                <button
                  type="button"
                  className={estilos.proveedor}
                  aria-expanded={desplegado === p.id}
                  onClick={() => abrirProveedor(p.id)}
                >
                  {/* Sin punto para «nativa»: no hay credencial de la que hablar. */}
                  {p.credencial === "nativa" ? null : (
                    <span
                      className={estilos.punto}
                      data-credencial={p.credencial}
                      aria-label={p.credencial === "puesta" ? "con credencial" : "sin credencial"}
                    />
                  )}
                  <span>{p.id}</span>
                </button>
                {desplegado === p.id ? (
                  <div className={estilos.modelos}>
                    {p.error !== undefined ? (
                      // Un desvío, no un callejón: el resto del menú sigue elegible.
                      <p className={estilos.error} role="alert">
                        {p.error}
                      </p>
                    ) : p.modelos === undefined ? (
                      <p className={estilos.espera}>{esperando ? "consultando…" : "sin consultar"}</p>
                    ) : p.modelos.length === 0 ? (
                      <p className={estilos.espera}>no ofrece ningún modelo de conversación</p>
                    ) : (
                      p.modelos.map((m) => {
                        const id = `${p.id}/${m.id}`;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={estilos.modelo}
                            data-actual={id === actual ? "" : undefined}
                            onClick={() => {
                              setAbierta(false);
                              alElegir(id);
                            }}
                          >
                            {m.nombre ?? m.id}
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
