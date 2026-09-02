# Catálogo vivo de modelos por proveedor

## Objetivo

Permitir que una persona consulte, desde la consola de `xonecode`, los modelos de conversación que realmente tiene disponibles en cada proveedor y asigne uno a los papeles `rapido`, `trabajo` o `afilado`.

La asignación se guarda en la configuración global `~/.xonecode/config.json`. Las credenciales siguen viviendo únicamente en `~/.xonecode/auth.json`; ningún listado ni error puede revelar una clave.

## Alcance

Se añadirá el comando interactivo:

```
/modelos <gemini|openai|anthropic|ollama>
```

El comando consulta el proveedor real, muestra únicamente modelos adecuados para conversación con el agente, permite filtrar el resultado, seleccionar uno por número y elegir el papel al que asignarlo. El modelo seleccionado se guarda como `modelos.<papel>` en la configuración global.

`/provider` conserva una sola responsabilidad: mostrar el estado de credenciales y guardar una nueva credencial. No lista modelos ni mezcla la gestión de secretos con una operación de red.

No se crea una pantalla de configuración nueva en la TUI en esta iteración. La TUI y stdio reutilizan la misma pregunta/entrada que ya usan `/provider` y el asistente de creación de proyectos.

## Arquitectura

### Frontera de puertos

`src/core/ports.ts` declarará `CatalogoModelosPort`, sin HTTP ni dependencias de proveedores. Su resultado normalizado será una lista de modelos con:

- `proveedor`
- `id` (el identificador que acepta `/modelo`)
- `nombre` legible cuando la API lo suministre
- `contexto` opcional

El puerto tendrá un doble determinista marcado con `ES_DOBLE`. Así `npm test` no necesita red, credenciales, Ollama ni simulador.

El adaptador real vivirá en `src/agent/`, donde se concentran I/O y credenciales. Hará HTTP, seguirá paginación cuando aplique y traducirá cada respuesta a la forma del puerto. La consola recibirá el puerto por inyección, como los demás servicios caros; nunca importará un cliente de proveedor desde `core`.

### APIs que se consultarán

| Proveedor | Consulta | Autenticación | Criterio de conversación |
| --- | --- | --- | --- |
| OpenAI | `GET https://api.openai.com/v1/models` | `Authorization: Bearer` | Solo familias de generación/chat soportadas por el adaptador de LangChain; se excluyen embedding, audio, imagen, moderación, transcripción y realtime. |
| Anthropic | `GET https://api.anthropic.com/v1/models` | `x-api-key` y `anthropic-version: 2023-06-01` | Modelos devueltos por su Models API, con su metadata de capacidades. |
| Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models` | `GOOGLE_API_KEY` | Únicamente entradas con `generateContent`; se excluyen embedding, imagen, audio, vídeo y voz. |
| Ollama | `GET <baseUrl>/api/tags`, seguido de comprobación de capacidad por modelo | No necesita clave | Solo modelos locales que declaren generación/completion compatible. |

El `baseUrl` de Ollama se resolverá mediante una única función compartida por `Modelos` y el catálogo: `OLLAMA_BASE_URL ?? http://localhost:11434`. El catálogo nunca tendrá una URL por omisión distinta de la que usa el modelo real.

Las APIs de OpenAI y Anthropic pueden listar recursos sin expresar toda su capacidad de conversación. La normalización mantendrá una lista mínima y explícita de exclusiones/familias admitidas, cubierta por tests; no se presentará una opción que el constructor `Modelos` no pueda usar. Gemini y Ollama se filtrarán por la capacidad que comunican sus APIs.

## Flujo de usuario

1. La persona escribe `/modelos openai` (o cualquier proveedor válido).
2. Si falta la credencial necesaria, el comando termina sin hacer una llamada y explica cómo usar `/provider openai`. Para Ollama caído, explica que debe arrancarlo o revisar la URL configurada.
3. Se consulta el catálogo vivo con timeout corto y paginación. Se muestran los modelos compatibles numerados, con nombre e información de contexto cuando exista.
4. La persona puede escribir un filtro y recibe la lista resultante; elige un número o deja vacío para cancelar.
5. Escoge `rapido`, `trabajo` o `afilado`.
6. Se escribe `proveedor/id` en `modelos.<papel>` de `~/.xonecode/config.json`, se confirma la ruta y se emite el mismo acuse que entiende `/modelo`.

Al no existir una fuente de mayor prioridad (bandera, entorno o configuración de proyecto), la sesión se actualizará inmediatamente. Si existe una, se guardará el ajuste global pero se explicará que esa fuente lo está eclipsando; no se mentirá mostrando como activo un modelo que la precedencia no puede resolver.

## Persistencia y seguridad

Se añadirá un escritor específico para la configuración global. Leerá el JSON crudo, verificará que su raíz sea un objeto, fusionará únicamente `modelos.<papel>` y conservará todos los demás campos, incluso los no reconocidos. Si el JSON existente no se puede fusionar, abortará y no lo sobrescribirá.

La escritura se hará atómicamente en el mismo directorio (temporal privado y `rename`), de modo que no deja una configuración a medio escribir. Antes de cambiar disco se validará el identificador con `parsear`; si falla la consulta, el filtro, la selección o la escritura, la sesión conserva exactamente su modelo previo.

Las claves no se incluirán en URLs visibles, mensajes, transcript ni excepciones impresas. Los errores remotos se clasifican como: credencial ausente/no autorizada, proveedor inaccesible/timeout o respuesta no compatible. No se imprime el cuerpo de respuesta del servidor.

## Errores y límites

- Cada petición tendrá un timeout acotado y devolverá una explicación accionable.
- Se sigue la paginación de Anthropic y Gemini hasta completar el catálogo compatible, con una protección de número máximo de páginas para no quedar bloqueado por un cursor defectuoso.
- El catálogo solo vive durante la ejecución del comando: cada invocación vuelve a la API real, sin caché presentada como actual.
- Una lista vacía es un resultado válido y explica que no hay modelos de conversación disponibles para esa cuenta o instalación.
- El texto introducido para filtrar nunca se trata como comando ni se envía a un modelo.

## Pruebas

Las pruebas unitarias cubrirán el contrato normalizado del puerto, el doble, los filtros por proveedor, paginación, timeout y errores de protocolo a partir de respuestas simuladas. No habrá peticiones de red reales en la suite.

Las pruebas de consola/TUI cubrirán:

- ayuda, completado y menú de `/modelos` desde el registro único `COMANDOS`;
- proveedor inválido, credencial ausente, Ollama inaccesible y lista vacía;
- filtro, selección por número, cancelación y elección de los tres papeles;
- persistencia global que preserva contenido previo y fallo atómico ante JSON inválido;
- actualización inmediata cuando la precedencia lo permite, y aviso correcto cuando una fuente de mayor prioridad lo eclipsa.

Se mantendrán `npm test`, `npm run typecheck` y `npm run build` como verificación de cierre.

## Fuentes de las APIs

- [OpenAI Models API](https://platform.openai.com/docs/api-reference/models)
- [Anthropic Models API](https://platform.claude.com/docs/en/api/models/list)
- [Gemini Models API](https://ai.google.dev/api/models)
- [Ollama List models API](https://docs.ollama.com/api/tags)
