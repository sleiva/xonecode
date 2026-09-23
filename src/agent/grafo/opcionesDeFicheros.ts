/**
 * Presupuesto de las herramientas de ficheros.
 *
 * DeepAgents 1.13 incorpora `max_count` y `output_mode` en `grep`. El valor por
 * defecto de la librería (1.000) sigue siendo demasiado generoso para un agente
 * que explora proyectos XOne: 100 resultados bastan para localizar candidatos y
 * el modelo puede subirlo explícitamente en una búsqueda excepcional.
 *
 * A partir de 6k tokens la salida se conserva bajo `/large_tool_results/` y se
 * sustituye por una referencia paginable. Así una lectura o búsqueda accidental
 * no consume toda la ventana antes de que actúe el resumen de conversación.
 *
 * **Esa carpeta se monta FUERA del proyecto** (`core/descargas.ts`,
 * `agent/grafo/proyecto.ts#backendConDescargas`), y hasta el 10-09-2026 no: la escribe la librería
 * llamando al backend directamente, esa ruta no estaba montada en ninguna parte y caía en el
 * `FilesystemBackend` de la raíz. Medido en el AppDemo real del usuario, 26 KB de salida
 * cruda de una tool dentro de la app XOne y commiteados. Bajar este tope no era el arreglo:
 * el desalojo es la función, el fallo era el sitio.
 */
export const OPCIONES_BUSQUEDA_FICHEROS = {
  grepMaxCount: 100,
  toolTokenLimitBeforeEvict: 6_000,
} as const;
