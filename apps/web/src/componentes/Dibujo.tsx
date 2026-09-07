import estilos from "./Dibujo.module.css";

/**
 * Una imagen que trajo el servidor, con su tamaño debajo.
 *
 * **Una URL de datos y un `<img>`, nunca el marcado metido en el DOM**: un `.svg` puede
 * traer un `<script>` dentro, y dentro de un `<img>` el navegador no lo ejecuta. El `alt`
 * es la ruta o el nombre — lo único cierto que se puede decir de la imagen sin mirarla.
 *
 * Vive en su propio módulo desde que hubo un segundo consumidor: lo pintan el visor de
 * Ficheros y el de Artefactos, y su parte no evidente —el damero que revela la
 * transparencia— no puede existir en dos hojas, porque entonces solo una se arregla.
 */
export function Dibujo({ mime, base64, alt, bytes }: { mime: string; base64: string; alt: string; bytes: number }) {
  return (
    <div className={estilos.imagen}>
      <img src={`data:${mime};base64,${base64}`} alt={alt} />
      <p className={estilos.nota}>{kb(bytes)} KB</p>
    </div>
  );
}

/** Kilobytes redondeados, para leer: «2 KB», no «2048 bytes». */
export function kb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}
