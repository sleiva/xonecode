import { useCallback, useRef, useState } from "react";
import { useCerrarAlPulsarFuera } from "../cerrarAlPulsarFuera.js";
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
 * El punto de la credencial es literal: verde solo si está CONFIRMADA, hueco solo si se
 * sabe que falta (era rojo, y se leía como error), y nada para quien no necesita ninguna
 * (Ollama local) — pintarle un punto a ese sería concederle un permiso o inventarle un
 * problema.
 *
 * Desde la revisión de interfaz: el menú lleva título, sus entradas son `menuitem` (las
 * flechas del teclado no navegaban una lista de `button` dentro de un `role="menu"`), el
 * proveedor en vigor va marcado, y la lista de modelos tiene su propio alto con
 * desplazamiento — medido: desplegar «gemini» empujaba a los demás proveedores fuera del
 * alto del menú y parecía que habían desaparecido sin camino de vuelta.
 */
/** A partir de cuántos modelos se ofrece el filtro. */
const MODELOS_SIN_FILTRO = 8;

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
  const cerrarMenu = useCallback(() => setAbierta(false), []);
  const [desplegado, setDesplegado] = useState<string | undefined>(undefined);
  /** Los que ya se han pedido en ESTA pastilla: para decir «consultando…» sin fingir. */
  const [pedidos, setPedidos] = useState<readonly string[]>([]);
  /** El filtro de la lista desplegada. Se vacía al cambiar de proveedor. */
  const [filtro, setFiltro] = useState("");

  // Pinchar fuera cierra, y Escape también. El lazo vive en `cerrarAlPulsarFuera.ts` desde
  // que el «…» de la barra necesitó lo mismo; allí está el porqué de `mousedown`.
  useCerrarAlPulsarFuera(abierta, envoltura, cerrarMenu);

  const abrirProveedor = (id: string): void => {
    setFiltro("");
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
        <div className={estilos.menu} role="menu" aria-label="modelo de trabajo">
          <div className={estilos.titulo} role="presentation">
            Modelo de trabajo
          </div>
          {proveedores.map((p) => {
            const enVigor = actual !== undefined && actual.startsWith(`${p.id}/`);
            const esperando = p.modelos === undefined && p.error === undefined && pedidos.includes(p.id);
            /**
             * Qué dice el punto de ESTE proveedor.
             *
             * Para los que llevan clave, la credencial, como siempre. Para los que no la
             * llevan —Ollama local— la pregunta «¿puedo usarlo?» no la contesta ninguna
             * credencial: la contesta si el servidor responde. Y eso ya se sabe sin pedir
             * nada nuevo, porque el catálogo de ese proveedor ES la prueba de conexión: si
             * trajo modelos, contestó; si trajo error, no.
             *
             * `undefined` mientras no se le haya preguntado, y entonces no se pinta punto.
             * Es la misma disciplina de los otros tres estados: verde solo si consta que
             * conecta, rojo solo si consta que no, y nada mientras no conste ninguna de las
             * dos. Un punto verde antes de haber hablado con el demonio sería afirmar una
             * conexión que nadie ha comprobado.
             */
            const punto =
              p.credencial !== "nativa"
                ? p.credencial
                : p.error !== undefined
                  ? "sin-conexion"
                  : p.modelos !== undefined
                    ? "conecta"
                    : undefined;
            return (
              <div key={p.id} className={estilos.grupo}>
                <button
                  type="button"
                  role="menuitem"
                  className={estilos.proveedor}
                  aria-expanded={desplegado === p.id}
                  data-actual={enVigor ? "" : undefined}
                  {...(enVigor ? { "aria-current": "true" as const } : {})}
                  onClick={() => abrirProveedor(p.id)}
                >
                  {punto === undefined ? null : (
                    /*
                      `title` y `aria-hidden`, NO `aria-label`. Un `aria-label` dentro del
                      botón se suma al nombre accesible del botón, y este se llamaba
                      «conectado ollama» o «con credencial anthropic» — medido: dos tests
                      que buscaban el proveedor por su nombre dejaron de encontrarlo, y con
                      ellos cualquiera que navegue por voz diciendo «pulsa ollama». El
                      estado es una DESCRIPCIÓN de la fila, no su nombre. Con el `title` lo
                      lee quien pasa el ratón y lo anuncian los lectores como descripción, y
                      al desplegar la fila el estado se dice además con todas las letras (el
                      error en un `role="alert"`, o la lista de modelos).
                    */
                    <span
                      className={estilos.punto}
                      data-credencial={punto}
                      aria-hidden="true"
                      title={
                        {
                          puesta: "con credencial",
                          falta: "sin credencial",
                          conecta: "conectado",
                          "sin-conexion": "sin conexión",
                        }[punto]
                      }
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
                      <>
                      {/* Con más de ocho, un filtro: Ollama trae veintiséis y la lista en
                          el orden crudo de la API era desplazarse a ciegas. */}
                      {p.modelos.length > MODELOS_SIN_FILTRO ? (
                        <input
                          type="search"
                          className={estilos.filtro}
                          value={filtro}
                          onChange={(e) => setFiltro(e.target.value)}
                          placeholder="filtrar…"
                          aria-label={`filtrar los modelos de ${p.id}`}
                        />
                      ) : null}
                      {p.modelos
                        .filter((m) => {
                          const aguja = filtro.trim().toLowerCase();
                          return aguja === "" || m.id.toLowerCase().includes(aguja) || (m.nombre ?? "").toLowerCase().includes(aguja);
                        })
                        .map((m) => {
                        const id = `${p.id}/${m.id}`;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={id === actual}
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
                      })}
                      </>
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
