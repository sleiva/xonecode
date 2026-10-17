# Exportar a PDF

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# Exportar a PDF

`core/exportacion.ts` (puro), `agent/exportarPdf.ts`, comando `/pdf <ruta>`.

- **Lo hace el HARNESS, no el agente.** A un motor externo no se le concede shell, y conceder la
  shell tampoco habría dado el PDF (las skills `pdf`/`docx` asumen un sandbox con dependencias que
  aquí no están). El comando lo escribe el CÓDIGO.
- **Se imprime con un NAVEGADOR**, en una lista CERRADA de rutas conocidas (Chromium con
  `--print-to-pdf`). No haberlo se DICE con el remedio.
- **Que el navegador salga con 0 no significa que haya PDF**: se comprueba el fichero.
- **Lo que impide que imprimir EJECUTE algo es una CSP en el documento, no un flag**: ni
  `--disable-javascript` ni `--blink-settings=scriptEnabled=false` desactivan un `<script>` (y el
  segundo rompe la impresión). La CSP corta también la RED.
- **El destino lo DERIVA el código del origen** (`rutaDePdf`), nunca se recibe. Las guardas de ruta
  son las MISMAS de Ficheros. El HTML intermedio se escribe FUERA del proyecto.
- **La autorización es teclear el comando**: no lo pide el modelo.
