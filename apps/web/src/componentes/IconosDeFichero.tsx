import { Trazo } from "./IconosDeProyecto.js";
import estilos from "./IconosDeFichero.module.css";

/**
 * Los iconos del árbol en modo EXPLORADOR (el diálogo de la subida, Revisión y Ficheros): una
 * carpeta que se abre y se cierra, y un fichero cuyo DIBUJO dice de qué es — un `.xne`, un
 * script, una imagen, una fuente…
 *
 * **El mismo estilo que la barra de proyectos**: contorno de trazo 2 sobre una caja de 24, sin
 * relleno, extremos redondeados y MONOCROMOS, sobre el molde compartido
 * (`IconosDeProyecto.tsx#Trazo`). La primera versión iba rellena y con un color por tipo, y no
 * casaba con el resto de la consola; el tipo lo distingue el dibujo, no el color. El tono lo pone
 * la hoja (`.icono`) desde los alias del tema.
 *
 * Dibujados aquí, no traídos de un CDN (modo offline de primera clase).
 */

/** La familia de un fichero por su extensión. Lo que no se reconoce es `otro`, nunca un error. */
export type TipoDeFichero = "xone" | "codigo" | "estilo" | "imagen" | "fuente" | "datos" | "texto" | "otro";

const POR_EXTENSION: Record<string, TipoDeFichero> = {
  xne: "xone",
  xml: "xone",
  js: "codigo",
  ts: "codigo",
  json: "codigo",
  css: "estilo",
  png: "imagen",
  jpg: "imagen",
  jpeg: "imagen",
  gif: "imagen",
  svg: "imagen",
  webp: "imagen",
  ico: "imagen",
  bmp: "imagen",
  ttf: "fuente",
  otf: "fuente",
  woff: "fuente",
  woff2: "fuente",
  db: "datos",
  sqlite: "datos",
  sql: "datos",
  md: "texto",
  txt: "texto",
  html: "texto",
  pdf: "texto",
  ini: "texto",
};

export function tipoDeFichero(nombre: string): TipoDeFichero {
  const punto = nombre.lastIndexOf(".");
  if (punto <= 0) return "otro";
  return POR_EXTENSION[nombre.slice(punto + 1).toLowerCase()] ?? "otro";
}

/** El lado al que se pintan: el de los glifos de la barra, que encaja en una fila de 28 px. */
const LADO = 16;

export function IconoDeCarpeta({ abierta }: { abierta: boolean }) {
  return (
    <Trazo lado={LADO} className={estilos.icono} familia="carpeta">
      {abierta ? (
        <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
      ) : (
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      )}
    </Trazo>
  );
}

/** La marca DENTRO de la hoja, por familia. `otro` es la hoja vacía. */
function Marca({ tipo }: { tipo: TipoDeFichero }) {
  switch (tipo) {
    case "xone":
      // `</>`: el marcado de un `.xne`/`.xml`.
      return (
        <>
          <path d="m10 13-2 2 2 2" />
          <path d="m14 17 2-2-2-2" />
        </>
      );
    case "codigo":
      // `{ }`: un script.
      return (
        <>
          <path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1" />
          <path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1" />
        </>
      );
    case "estilo":
      // `#`: una hoja de estilo.
      return <path d="m10.5 12-1 6M14.5 12l-1 6M8.5 14h7M8 16.5h7" />;
    case "imagen":
      return (
        <>
          <circle cx="10" cy="12" r="2" />
          <path d="m20 17-1.3-1.3a2.4 2.4 0 0 0-3.4 0L9 22" />
        </>
      );
    case "fuente":
      // «A»: una tipografía.
      return <path d="m9 18 3-7 3 7M10.1 15.5h3.8" />;
    case "datos":
      // Un cilindro: una base de datos.
      return (
        <>
          <ellipse cx="12" cy="12.3" rx="3.5" ry="1.3" />
          <path d="M8.5 12.3v4.4c0 .7 1.6 1.3 3.5 1.3s3.5-.6 3.5-1.3v-4.4" />
        </>
      );
    case "texto":
      return <path d="M16 13H8M16 17H8M10 9H8" />;
    default:
      return null;
  }
}

export function IconoDeFichero({ nombre }: { nombre: string }) {
  const tipo = tipoDeFichero(nombre);
  return (
    <Trazo lado={LADO} className={estilos.icono} familia={tipo}>
      {/* La hoja con la esquina doblada, la misma para todas las familias. */}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <Marca tipo={tipo} />
    </Trazo>
  );
}
