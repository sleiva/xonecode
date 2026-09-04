import { useState, type FormEvent } from "react";
import { Input, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./Wizard.module.css";

/**
 * El alta, ahora de DOS pasos: cuenta y entorno. El de proyecto salió — cambio de rumbo
 * del usuario: con cuenta y entorno resueltos se entra directo al dashboard, y el
 * proyecto se elige en la barra lateral (`Barra.tsx`, entorno → proyectos → sesiones),
 * no aquí. `PasoDelWizard` (`tipos.ts`) conserva «proyecto» como valor porque el mismo
 * tipo sirve también para la ACCIÓN de abrir uno desde la barra (`MensajeDelCliente`),
 * pero `pasos` —lo PENDIENTE— nunca lo trae ya: este componente no vuelve a pintarlo.
 *
 * Los pasos que quedan siguen la misma regla del alta de terminal: **cada uno solo
 * aparece si falta lo que decide** (`vestibulo.ts#pasosPendientes`, que lo calcula
 * preguntándole al sistema —el papel `trabajo` resolviendo por `omision`, la lista de
 * entornos vacía— y nunca a una marca de «primer arranque»). Aquí llegan ya calculados,
 * en `pasos`, y se enseñan de uno en uno.
 *
 * **La clave de API no entra en el estado del cliente.** Vive en el `useState` de este
 * paso y sale por `alGuardarCredencial`, que quien monte el wizard traduce a
 * `enviar({clase:"secreto", valor})` — el único mensaje del cable que la lleva. Ni al
 * store, ni a un acto, ni al transcript: `consolaWeb.ts#leerSecreto` solo anota la
 * PREGUNTA, y este componente es el otro extremo de ese trato. El campo es `password` y
 * `autocomplete="off"` para que tampoco se quede en el gestor del navegador.
 *
 * **Tras guardar la credencial se dice DÓNDE quedó, y solo entonces se sigue.** Si el
 * usuario abandona en el paso siguiente, un «cancelado» a secas daría a entender que no se
 * tocó nada, y la clave ya está escrita en disco (`vestibulo.ts#guardarCredencialDe` dice
 * lo mismo por consola, en el mismo momento y por el mismo motivo).
 *
 * De `@deepseek-ai/dsh-client-ui-primitives` se usan `Input` y `Button`: aportan el
 * elemento nativo con los atributos pasando tal cual —que es lo que hace que `type`,
 * `autoComplete` e `id` lleguen de verdad al `<input>`— y nada más, porque sus CSS Modules
 * son stubs vacíos en este release candidate. `FishLogo` y `BrandWordmark` no se tocan: son
 * marca de DeepSeek y este producto es XOne.
 */

/**
 * Los mismos tres de `vestibulo.ts#PasoDelVestibulo`. Se importan de `tipos.ts` —donde el
 * mensaje del cable los necesita— y se reexportan para no romper a quien ya los pedía
 * aquí: una segunda declaración en este fichero sería la copia que diverge.
 */
import type { PasoDelWizard } from "../tipos.js";
export type { PasoDelWizard };

export interface OpcionDeProveedor {
  id: string;
  nombre: string;
}

/** Lo que devuelve `vestibulo.ts#opcionesDeEntorno`. `url` vacía = el usuario la teclea. */
export interface OpcionDeEntorno {
  id: string;
  nombre: string;
  url: string;
}

/**
 * Los hosts que hacen de `http://` algo aceptable, y es una lista CERRADA por el mismo
 * motivo que la de basura del sistema operativo en `arbolLimpio`: «lo que parezca local»
 * deja pasar `mcp.localhost.ejemplo.com`, que es una máquina de otro. La excepción existe
 * solo para un CloudStudio on-premise levantado en desarrollo.
 *
 * Ya NO hay divergencia con el servidor: `agent/cloudstudioMcp.ts#urlDeMcpAceptable` aplica
 * esta misma regla, y de ella tiran el registro del entorno (`vestibulo.ts`) y quien conecta
 * de verdad. Antes eran dos criterios y dos mensajes que se contradecían — el loopback que
 * este formulario aceptaba lo rechazaba el servidor al registrarlo. La copia sigue aquí y no
 * importada porque `src/web/frontera.test.ts` prohíbe compartir módulo con `src/`; las dos
 * están probadas por separado.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const AVISO_DE_URL =
  "La URL del MCP debe ser https:// — solo se admite http:// en 127.0.0.1 o localhost, para un on-premise en desarrollo.";

export function urlDeEntornoAceptable(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  // Sin credenciales dentro, como en `agent/cloudstudioMcp.ts`: un `https://u:p@…` mete la
  // contraseña en `settings.json` y en cada traza que enseñe la URL.
  if (url.username !== "" || url.password !== "") return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}

export function Wizard({
  pasos,
  proveedores,
  entornos,
  rutaDeCredencial,
  aviso,
  alGuardarCredencial,
  alRegistrarEntorno,
}: {
  /** Los pasos que FALTAN, en orden. Vacío = no hay alta que hacer y no se pinta nada. */
  pasos: readonly PasoDelWizard[];
  proveedores: readonly OpcionDeProveedor[];
  entornos: readonly OpcionDeEntorno[];
  /** Dónde queda escrita la credencial. Ausente = no se sabe, y entonces no se afirma. */
  rutaDeCredencial?: string;
  /**
   * Lo que falló en el paso anterior, dicho por el servidor. Se pinta EN el paso porque ahí
   * es donde el usuario está mirando: el mismo texto llega también como acto, pero ese acaba
   * en la Trayectoria —la otra pestaña—, y un paso que se repinta igual sin decir nada es un
   * fallo mudo.
   */
  aviso?: string;
  alGuardarCredencial: (proveedor: string, clave: string) => void;
  alRegistrarEntorno: (entorno: OpcionDeEntorno) => void;
}) {
  const [indice, setIndice] = useState(0);

  const [proveedor, setProveedor] = useState(proveedores[0]?.id ?? "");
  // La clave vive AQUÍ y en ningún otro sitio: no hay store, ni acto, ni prop que la
  // devuelva hacia arriba salvo el manejador que la manda por el cable.
  const [clave, setClave] = useState("");
  const [credencialGuardada, setCredencialGuardada] = useState(false);

  const [entornoElegido, setEntornoElegido] = useState(entornos[0]?.id ?? "");
  const [nombreDelEntorno, setNombreDelEntorno] = useState("");
  const [url, setUrl] = useState(entornos[0]?.url ?? "");
  const [avisoDeUrl, setAvisoDeUrl] = useState<string | undefined>(undefined);

  const paso = pasos[indice];
  if (paso === undefined) return null;

  /** El aviso del servidor, si lo hay. `role="alert"` para que un lector de pantalla lo lea
   *  sin tener que ir a buscarlo. */
  const avisoDelServidor =
    aviso === undefined ? null : (
      <p className={estilos.aviso} role="alert">
        {aviso}
      </p>
    );

  const avanzar = (): void => setIndice((i) => i + 1);
  const hayMasPasos = indice + 1 < pasos.length;

  if (paso === "cuenta") {
    const guardar = (evento: FormEvent): void => {
      evento.preventDefault();
      alGuardarCredencial(proveedor, clave);
      // Se vacía en cuanto sale: lo que ya no está en el estado no lo puede pintar nadie
      // por descuido en el render siguiente.
      setClave("");
      setCredencialGuardada(true);
    };
    return (
      <form className={estilos.wizard} onSubmit={guardar}>
        <h2 className={estilos.titulo}>Cuenta</h2>
        <label className={estilos.etiqueta} htmlFor="wizard-proveedor">
          Proveedor
        </label>
        <select
          id="wizard-proveedor"
          className={estilos.campo}
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
        >
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <label className={estilos.etiqueta} htmlFor="wizard-clave">
          Clave de API
        </label>
        <Input
          id="wizard-clave"
          className={estilos.envoltorio}
          type="password"
          autoComplete="off"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
        <p className={estilos.nota}>
          La clave no se guarda en el navegador: viaja a xonecode y se escribe en el fichero de
          credenciales, con permisos 0600.
        </p>
        {avisoDelServidor}
        {credencialGuardada ? (
          <p className={estilos.estado} role="status">
            {rutaDeCredencial !== undefined
              ? `Credencial guardada en ${rutaDeCredencial}. Queda escrita aunque canceles lo que viene después.`
              : "Credencial enviada a xonecode; el servidor dirá dónde queda escrita."}
          </p>
        ) : null}
        <div className={estilos.acciones}>
          {credencialGuardada ? null : (
            <Button type="submit" variant="primary" className={estilos.accion}>
              Guardar
            </Button>
          )}
          {credencialGuardada && hayMasPasos ? (
            <Button type="button" variant="primary" className={estilos.accion} onClick={avanzar}>
              Continuar
            </Button>
          ) : null}
        </div>
      </form>
    );
  }

  if (paso === "entorno") {
    const opcion = entornos.find((e) => e.id === entornoElegido);
    // El «otro» es el de URL vacía, tal y como lo declara `ENTORNO_OTRO`: es lo que evita
    // un `id === "otro"` escrito a mano aquí, que sería una segunda definición del mismo.
    const esOtro = opcion !== undefined && opcion.url === "";
    const elegir = (id: string): void => {
      setEntornoElegido(id);
      setUrl(entornos.find((e) => e.id === id)?.url ?? "");
      setAvisoDeUrl(undefined);
    };
    const registrar = (evento: FormEvent): void => {
      evento.preventDefault();
      if (!urlDeEntornoAceptable(url)) {
        setAvisoDeUrl(AVISO_DE_URL);
        return;
      }
      setAvisoDeUrl(undefined);
      alRegistrarEntorno({
        id: entornoElegido,
        nombre: esOtro ? nombreDelEntorno : (opcion?.nombre ?? entornoElegido),
        url,
      });
      // NO se avanza aquí, y ya no hace falta un efecto que lo haga por su cuenta: el
      // proyecto salió del alta, así que «entorno» es hoy el ÚLTIMO paso que este
      // componente puede pintar. Si el registro sale bien, es el SERVIDOR quien lo dice
      // —recalcula `pasosPendientes()` y manda un `alta` nuevo con `pasos: []`—, y ese
      // mensaje es lo que hace que `App.tsx` deje de montar este wizard entero. Si falla
      // (una URL que no resuelve, un «fetch failed»), `aviso` llega por el mismo mensaje
      // y este paso se repinta con el error debajo, sin haber avanzado a ningún sitio del
      // que volver.
    };
    return (
      <form className={estilos.wizard} onSubmit={registrar}>
        <h2 className={estilos.titulo}>Entorno</h2>
        <label className={estilos.etiqueta} htmlFor="wizard-entorno">
          Entorno
        </label>
        <select
          id="wizard-entorno"
          className={estilos.campo}
          value={entornoElegido}
          onChange={(e) => elegir(e.target.value)}
        >
          {entornos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        {esOtro ? (
          <>
            <label className={estilos.etiqueta} htmlFor="wizard-nombre">
              Nombre
            </label>
            <Input
              id="wizard-nombre"
              className={estilos.campo}
              value={nombreDelEntorno}
              onChange={(e) => setNombreDelEntorno(e.target.value)}
            />
          </>
        ) : null}
        <label className={estilos.etiqueta} htmlFor="wizard-url">
          URL del MCP
        </label>
        <Input
          id="wizard-url"
          className={estilos.envoltorio}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        {avisoDeUrl !== undefined ? (
          <p className={estilos.aviso} role="alert">
            {avisoDeUrl}
          </p>
        ) : null}
        {avisoDelServidor}
        <div className={estilos.acciones}>
          <Button type="submit" variant="primary" className={estilos.accion}>
            Registrar
          </Button>
        </div>
      </form>
    );
  }

  // `paso === "proyecto"` no debería llegar nunca aquí (`pasosPendientes()` no lo
  // devuelve desde que el proyecto salió del alta — ver la cabecera del fichero), pero
  // `PasoDelWizard` conserva el valor porque el mismo tipo nombra la ACCIÓN de abrir un
  // proyecto desde la barra. Si algún día otra piel lo anunciara como pendiente de
  // verdad, mejor no pintar nada que fingir un paso que este componente ya no sabe
  // construir (no tiene `proyectos`/`ramas` que pintar: esos dos ya no son prop suya).
  return null;
}
