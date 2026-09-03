# Rendimiento y contexto de DeepAgents

Este documento recoge las decisiones de xonecode para que un agente DeepAgents explore un proyecto XOne sin reenviar contenido innecesario al modelo.

## Principio operativo

La búsqueda debe ir de menor a mayor coste:

1. `glob` delimita ficheros candidatos.
2. `grep` localiza texto literal con `path` y `glob` acotados.
3. `regex_search` se usa solo para patrones estructurales que no se pueden expresar literalmente.
4. `read_file` abre únicamente el fragmento necesario mediante `offset` y `limit`.

Por ejemplo, para inspeccionar funciones XOne se busca primero `function MTLogin` con `grep`; si se necesitan todas las funciones `MT*`, se usa `regex_search` con `function\\s+(MT\\w+)` sobre `**/*.js`, y después se lee alrededor de la línea encontrada.

## Mejoras aplicadas

| Medida | Decisión en xonecode | Efecto |
| --- | --- | --- |
| DeepAgents | `1.13.2` | `grep` incorpora `max_count` y modos de salida. |
| `grep` | 100 coincidencias por defecto | Una búsqueda amplia no llena la conversación; el agente puede elevar `max_count` si está justificado. |
| Modos de `grep` | `files_with_matches`, `count`, `content` | Se pueden localizar candidatos antes de traer líneas. |
| Salidas grandes | Evacuación desde 6k tokens | El resultado queda referenciado en `/large_tool_results/` en lugar de consumir el contexto activo. |
| Resumen de conversación | activa a 32k tokens y conserva 8k | Evita reenviar herramientas y lecturas antiguas. |
| Regex | `regex_search` por línea | Cubre funciones, props y eventos sin abrir una shell. |

## Límites de `regex_search`

La herramienta no es un sustituto de `grep`: el patrón se evalúa por línea y no permite coincidencias multilínea. Solo lee hasta 50 ficheros de hasta 256 KiB, devuelve como máximo 100 líneas y recorta cada línea a 1.000 caracteres. No puede leer `/.env`, `/.git` ni `/.xonecode`.

Estos límites evitan que una regex genérica se convierta en una lectura masiva. Cuando aparezca una nota de truncado, hay que hacer el patrón, el `path` o el `glob` más específicos.

## Seguridad y permisos

`regex_search` no ejecuta comandos ni usa `LocalShellBackend`. Lee únicamente a través del backend virtual confinado del proyecto (`virtualMode: true`) y replica las denegaciones de lectura de las herramientas de fichero. Las escrituras siguen pasando por la aprobación humana; esta mejora es estrictamente de lectura.

## Cómo validar cambios futuros

```sh
npm run typecheck
npm test
npm run build
```

Las pruebas deben mantenerse sin red, credenciales ni simulador. Si se cambia un límite, añadir una prueba que compruebe tanto el resultado visible como la ruta de truncado.

## Traza de diagnóstico

Para analizar una sesión real sin guardar el contenido de ficheros, se puede activar una traza local:

```sh
XONECODE_TRACE_TOOLS=1 /Users/projects/xonecode/bin/xonecode
```

Se crea o amplía `.xonecode/traza-tools.jsonl` dentro del proyecto abierto. Cada línea registra una llamada al modelo (`input`, `output`, caché, especialista y acumulados) o una tool (nombre y el único detalle seguro que ya mostraría la consola: ruta o patrón). Nunca guarda argumentos completos, respuestas de tools, contenido de ficheros ni credenciales.
