/**
 * Los iconos de los entornos de CloudStudio, del juego de marca de XOne.
 *
 * Son los `.svg` que entregó el usuario (`Circle - v2 - XOneWebStudio`,
 * `Circle - v2 - XOneCLoud`, `XOneBasic`), copiados como trazados: el bloque `<style>` con
 * clases `.cls-N` que trae Illustrator se convirtió en atributos `fill` explícitos, porque
 * esas clases son GLOBALES —los tres ficheros usan los mismos nombres con colores
 * distintos, así que inline en la página se pisarían entre ellos—. Y se les quitó el
 * `<rect>` blanco de fondo: una marca no trae su propio cuadrado, y sobre el azul de la
 * barra se vería.
 *
 * Cuáles se pintan y cuáles no, que es la parte que importa:
 *
 * - **Solo hay icono donde hay DATO detrás.** El entorno se identifica por su id
 *   (`vestibulo.ts#identidadDeEntorno`, que reconoce los dos oficiales por su URL), así que
 *   un WebStudio se pinta como WebStudio y un CloudStudio como CloudStudio. Un on-premise
 *   —cuyo id sale del host— lleva la marca XOne sin glifo: es un servidor de XOne y eso es
 *   todo lo que se puede afirmar de él. Ponerle el de WebStudio sería decir de qué producto
 *   es sin saberlo.
 * - **Los otros iconos del juego se quedan fuera**: `XOne MDM`, `XOneNFC` y `Artboard 42`
 *   son productos de la plataforma que esta consola no modela en ninguna parte, y pintar el
 *   candado del MDM en algún hueco sería decoración con forma de dato. La misma regla por
 *   la que el escritorio no pinta el «Build & Run» del mockup.
 * - **A color, al revés que los logos de proveedor.** Aquí son pocos, van en sitios donde
 *   identifican una cosa concreta (el selector de la barra, la fila de Ajustes, el
 *   escritorio) y el color ES la identidad de la marca; los de proveedor son ocho en una
 *   lista y ahí el color era ruido.
 */

/**
 * Por id de entorno (`ENTORNOS_OFICIALES`, `web/servidor/vestibulo.ts`). Solo está
 * `webstudio`, que es el único cuyo producto tiene marca propia en el juego entregado.
 * `manager` NO lleva la del CloudStudio aunque esté ahí al lado: no consta que XOne Manager
 * sea ese producto, y ponérsela sería afirmarlo con un dibujo. Cuando conste, es una línea.
 */
const OFICIALES: Record<string, JSX.Element> = {
  webstudio: <><g><path fill="#4cabd5" d="M110.34,31.68Q94.47,14.54,71.66,14.54T33,31.45a63.27,63.27,0,0,0-4.76,5.72L39.8,52.94a41.25,41.25,0,0,1,6.09-8.65Q56.51,32.72,71.74,32.72T97.5,44.44A39.87,39.87,0,0,1,108,72,39.72,39.72,0,0,1,97.42,99.47Q86.8,111.2,71.74,111.2T46,99.64a41.92,41.92,0,0,1-4.77-6.23L29.87,108.89c1,1.22,2,2.42,3.1,3.59q15.89,16.9,39,16.9a50.11,50.11,0,0,0,20.89-4.54,51.51,51.51,0,0,0,17.23-12.52,56.29,56.29,0,0,0,16.11-40.2A57.61,57.61,0,0,0,110.34,31.68Z"/><path fill="#a4c9dd" d="M24.76,89.06,35.45,74.22,24.76,59.55l-4.61-6.28A60.24,60.24,0,0,0,17.25,72a59.41,59.41,0,0,0,4,21.91l.23-.33Z"/><path fill="#a4c9dd" d="M86.22,90.19H57.08A12,12,0,0,1,52,67.35c0-.38-.06-.78-.06-1.16A13.72,13.72,0,0,1,78.34,61a6.63,6.63,0,0,1,4.45-1.66,6.87,6.87,0,0,1,6.85,6.85,6.78,6.78,0,0,1-1.09,3.7,10.28,10.28,0,0,1-2.33,20.3Z"/><path fill="#fff" d="M60.78,76.55a1.6,1.6,0,1,1,1.6-1.6A1.59,1.59,0,0,1,60.78,76.55Zm2.57-5.82a2,2,0,1,1,2-2A2,2,0,0,1,63.35,70.73Zm0,12a1.6,1.6,0,0,1,0-3.2,1.6,1.6,0,0,1,0,3.2Zm6.23-14.23a2.4,2.4,0,1,1,2.4-2.4A2.39,2.39,0,0,1,69.58,68.55Zm0,16.8a1.6,1.6,0,1,1,1.6-1.6A1.59,1.59,0,0,1,69.58,85.35ZM75.8,71.53a2.8,2.8,0,1,1,2.8-2.8A2.8,2.8,0,0,1,75.8,71.53Zm0,11.25a1.6,1.6,0,1,1,1.6-1.6A1.61,1.61,0,0,1,75.8,82.78Zm2.58-6.23A1.6,1.6,0,1,1,80,75,1.59,1.59,0,0,1,78.38,76.55Z"/></g><g><rect fill="none" width="144" height="144"/></g></>,
  cloudstudio: <><g><path fill="#4cabd5" d="M110.34,31.68Q94.47,14.54,71.66,14.54T33,31.45a63.27,63.27,0,0,0-4.76,5.72L39.8,53a41,41,0,0,1,6.09-8.66Q56.51,32.72,71.74,32.72T97.5,44.44A39.87,39.87,0,0,1,108,72,39.72,39.72,0,0,1,97.42,99.47Q86.8,111.2,71.74,111.2T46,99.64a41.48,41.48,0,0,1-4.77-6.24L29.87,108.89c1,1.22,2,2.42,3.1,3.59q15.89,16.9,39,16.9a50.11,50.11,0,0,0,20.89-4.54,51.51,51.51,0,0,0,17.23-12.52,56.29,56.29,0,0,0,16.11-40.2A57.61,57.61,0,0,0,110.34,31.68Z"/><path fill="#cd8040" d="M24.76,89.06,35.45,74.22,24.76,59.55l-4.61-6.28A60.28,60.28,0,0,0,17.25,72a59.41,59.41,0,0,0,4,21.91l.23-.33Z"/><path fill="#cd8040" d="M87.15,88.05H58a12,12,0,0,1-5.09-22.84c0-.4-.05-.78-.05-1.15a13.72,13.72,0,0,1,26.41-5.2,6.77,6.77,0,0,1,4.44-1.66,6.87,6.87,0,0,1,6.86,6.86,6.73,6.73,0,0,1-1.1,3.69,10.28,10.28,0,0,1-2.33,20.3Zm-7.1-18.61L70.63,60a.88.88,0,0,0-.62-.24.91.91,0,0,0-.62.24L60,69.41a1,1,0,0,0-.26.65.84.84,0,0,0,.85.85h6v9.43a.88.88,0,0,0,.86.86h5.14a.88.88,0,0,0,.86-.86V70.91h6a.86.86,0,0,0,.85-.85A.89.89,0,0,0,80.05,69.44Z"/></g><g><rect fill="none" width="144" height="144"/></g></>,
};

/** La marca XOne sin glifo de producto, para un servidor del que solo sabemos el host. */
const GENERICO = <><g><path fill="#4cabd5" d="M120,21.62Q100.15.18,71.64.18T23.29,21.32a78,78,0,0,0-6,7.16L31.82,48.19a50.81,50.81,0,0,1,7.62-10.82Q52.7,22.91,71.74,22.91t32.2,14.66A49.81,49.81,0,0,1,117.1,72a49.65,49.65,0,0,1-13.26,34.39Q90.58,121,71.74,121T39.55,106.56a51.56,51.56,0,0,1-6-7.79L19.41,118.12c1.22,1.52,2.5,3,3.88,4.49Q43.14,143.74,72,143.74a62.81,62.81,0,0,0,26.12-5.68,64.34,64.34,0,0,0,21.54-15.65q20.13-21.14,20.13-50.25A72,72,0,0,0,120,21.62Z"/><path fill="#1f3c6e" d="M13,93.33,26.38,74.79,13,56.44,7.25,48.6A75.47,75.47,0,0,0,3.63,72a74.23,74.23,0,0,0,5,27.38l.29-.4Z"/></g><g><rect fill="none" width="144" height="144"/></g></>;

export function IconoDeEntorno({
  entorno,
  size = 20,
  className,
}: {
  /** El id del entorno (`Entorno.id`), no su nombre: el nombre lo pone el servidor remoto. */
  entorno: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 144 144"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {OFICIALES[entorno] ?? GENERICO}
    </svg>
  );
}
