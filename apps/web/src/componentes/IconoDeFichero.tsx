import type { ReactNode } from "react";
import { tipoDeFichero, type TipoDeFichero } from "../tipoDeFichero.js";
import { Trazo } from "./IconosDeProyecto.js";
import estilos from "./IconoDeFichero.module.css";

/**
 * El icono de un fichero por su TIPO (`tipoDeFichero.ts`), o el de una carpeta abierta/cerrada: el
 * ÚNICO juego de iconos de fichero de la consola. Lo usan el árbol que comparten Ficheros, Revisión
 * y el diálogo de la subida, la cabecera de cada bloque de Revisión y la del fichero abierto.
 *
 * **Dos decisiones de dos sitios, juntas en uno.** El DIBUJO es el del molde de contorno de la
 * barra de proyectos (`IconosDeProyecto.tsx#Trazo`: trazo 2 sobre caja de 24, sin relleno,
 * extremos redondeados): una hoja con la esquina doblada y, dentro, la marca de su familia. La
 * CLASIFICACIÓN es la de `tipoDeFichero.ts` —el `.xml` de Studio aparte del `.xne`, la
 * configuración, la base de datos…— y cada tipo pinta con su COLOR, que no está en este fichero:
 * el trazo es `currentColor` y la clase del tipo lo fija desde un token (`--xonecode-icono-*`,
 * `estilos/marca.css`), porque la regla de «ningún color literal» la vigilan las hojas CSS y un
 * `stroke="#…"` aquí se la saltaría sin que ningún test lo viera.
 *
 * Dibujados aquí, no traídos de un CDN (modo offline de primera clase). Siempre `aria-hidden` (lo
 * pone el molde): es decoración del nombre que va al lado.
 */
export function IconoDeFichero({
  ruta,
  carpeta = false,
  abierta = false,
  tamano = 16,
}: {
  ruta: string;
  carpeta?: boolean;
  abierta?: boolean;
  tamano?: number;
}) {
  if (carpeta) {
    return (
      <Trazo lado={tamano} className={`${estilos.icono} ${estilos.carpeta}`} icono={abierta ? "carpeta-abierta" : "carpeta"}>
        {abierta ? (
          <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
        ) : (
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        )}
      </Trazo>
    );
  }
  const tipo = tipoDeFichero(ruta);
  return (
    <Trazo lado={tamano} className={`${estilos.icono} ${estilos[tipo] ?? ""}`} icono={tipo}>
      {/* La hoja con la esquina doblada, la misma para todos los tipos. */}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      {MARCAS[tipo]}
    </Trazo>
  );
}

/** La marca DENTRO de la hoja, por tipo. `otro` es la hoja vacía: «un documento» sin decir de qué. */
const MARCAS: Record<TipoDeFichero, ReactNode> = {
  // `< >`: el marcado de un `.xne`, la fuente de una colección.
  xne: (
    <>
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </>
  ),
  // `</>`: el `.xml` que genera Studio. Mismo marcado con la barra, y en gris por su clase.
  xml: (
    <>
      <path d="m9.5 13-2 2 2 2" />
      <path d="m14.5 17 2-2-2-2" />
      <path d="m12.8 12.5-1.6 5" />
    </>
  ),
  // `{ }`: un script.
  js: (
    <>
      <path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1" />
      <path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1" />
    </>
  ),
  // `#`: una hoja de estilo.
  css: <path d="m10.5 12-1 6M14.5 12l-1 6M8.5 14h7M8 16.5h7" />,
  // Dos mandos deslizantes: configuración (`app.ini`, un `.json`).
  config: (
    <>
      <path d="M8 13h.5M11.5 13H16M8 17h4.5M15.5 17H16" />
      <circle cx="10" cy="13" r="1.5" />
      <circle cx="14" cy="17" r="1.5" />
    </>
  ),
  imagen: (
    <>
      <circle cx="10" cy="12" r="2" />
      <path d="m20 17-1.3-1.3a2.4 2.4 0 0 0-3.4 0L9 22" />
    </>
  ),
  // Un cilindro: una base de datos.
  bd: (
    <>
      <ellipse cx="12" cy="12.3" rx="3.5" ry="1.3" />
      <path d="M8.5 12.3v4.4c0 .7 1.6 1.3 3.5 1.3s3.5-.6 3.5-1.3v-4.4" />
    </>
  ),
  // «M↓»: un markdown.
  markdown: (
    <>
      <path d="M7.5 18v-6l2 2.5 2-2.5v6" />
      <path d="M15.5 12v6M13.8 16.3l1.7 1.7 1.7-1.7" />
    </>
  ),
  // «A»: una tipografía.
  fuente: <path d="m9 18 3-7 3 7M10.1 15.5h3.8" />,
  otro: null,
};
