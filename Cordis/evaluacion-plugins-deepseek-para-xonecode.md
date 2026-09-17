# Qué aprovechar de los plugins de DeepSeek Harness en xonecode

**Inventario de diseño · 17 de septiembre de 2026**  
**Alcance:** código local de `/Users/projects/harnees/deepseek-harness` y `/Users/projects/xonecode`. No se han instalado paquetes de DeepSeek en xonecode ni ejecutado pruebas de compatibilidad.

## Criterio de selección

`xonecode` ya construye su orquestador y especialistas con Deep Agents. Sus herramientas de filesystem, la delegación mediante `task`, las skills por especialista, el checkpointer y la aprobación de escrituras tienen dueño actual en [xoneAgent.ts](/Users/projects/xonecode/src/agent/grafo/xoneAgent.ts). La pregunta útil es qué plugin añade una **capacidad ausente o una mejora medible**. La alternativa de montar el bundle `dsh-base` entero duplicaría el loop, las sesiones, las tools de fichero y parte de la política.

La reutilización de un paquete de DeepSeek no es automática: muchos registran tools en `ctx.tools` y requieren otros servicios Cordis. Por ejemplo, `dsh-mcp-client` declara siete servicios pares, y `dsh-tool-skill` requiere los servicios DSH de agente, LLM, skills y tools. El primer paso de cada candidato es elegir entre **adaptar la lógica** o **montar su pequeño subgrafo de servicios** y traducir el resultado a Deep Agents.

Hay además una fuente XOne ya disponible: [xone-plugins-market](/Users/projects/xone-plugins-market/README.md). Sus seis skills aparecen con el mismo contenido en `xonecode/skills`; xonecode añade otras tres (`archify`, `artifacts-builder`, `xone-hotswap`). Un catálogo multifuente debe decidir **qué copia es canónica y cómo actualiza versiones**, no volver a importar las seis como si fueran capacidades nuevas.

## Candidatos prioritarios

| Plugin o grupo | Qué aporta | Estado en xonecode | Decisión recomendada |
|---|---|---|---|
| [skill, skill-filesystem, tool-skill](/Users/projects/harnees/deepseek-harness/packages/skill/skill-filesystem/README.md) | Catálogo desde fuentes globales, de proyecto y personalizadas; observación de cambios; carga diferida. | `SkillsEnDisco` sólo lee el directorio incluido en el paquete; `/skills/` monta esa raíz. Seis skills coinciden con `xone-plugins-market`. | **P1.** Adoptar catálogo compuesto y política de precedencia, usando el mercado XOne como primer caso real. Mantener la carga de Deep Agents; no duplicar la tool `skill`. |
| [mcp-client](/Users/projects/harnees/deepseek-harness/packages/mcp/mcp-client/README.md) | Servidores MCP genéricos, nombres estables, sincronización atómica y reconexión. | Hay cliente MCP específico de CloudStudio, pero no un catálogo abierto de servidores cuyas tools reciba el modelo. | **P1.** Crear adaptador MCP → tools de LangChain por perfil. Reutilizar las reglas de nombres, sincronización y cancelación; no importar el paquete sin estudiar sus servicios pares. |
| [agent-instructions](/Users/projects/harnees/deepseek-harness/packages/context/agent-instructions/README.md) | `AGENTS.md` y `CLAUDE.md` globales/anidados, actualización tras tocar ficheros y presupuesto de contexto. | Las reglas XOne viven en `core/agentes.ts` y las skills; no se observó una carga equivalente de instrucciones del proyecto en el grafo. | **P1/P2.** Dar contexto específico del proyecto al especialista, con límite de bytes y procedencia. No dejar que instrucciones del repo rebajen reglas XOne o permisos. |
| [web-fetch-http y tool-web](/Users/projects/harnees/deepseek-harness/packages/web/web-fetch-http/README.md) | Obtención pública HTTP(S) con validación de destino, límites, redirects restringidos y HTML a texto. | No se encontró tool web general en el grafo actual. | **P2.** Útil para documentación pública XOne y fuentes externas. Adaptar el transporte seguro y ofrecer `web_fetch` sólo a perfiles que lo necesiten. La documentación privada requiere un proveedor autenticado distinto. |
| [tool-ask-user](/Users/projects/harnees/deepseek-harness/packages/interaction/tool-ask-user/README.md) | Pregunta del agente al usuario y respuesta como resultado de tool. | Hay aprobación de escrituras, pero no se observó una tool genérica de aclaración para el modelo. | **P2.** Añadir canal de preguntas al chat web, con destino claro para preguntas de especialistas y cancelación del turno. |
| [timeout-policy y repeat-tool-reminder](/Users/projects/harnees/deepseek-harness/packages/guard/timeout-policy/README.md) | Límites cooperativos por tool y aviso ante llamadas idénticas repetidas. | `turnoReal` cancela turnos, pero no se observó una política uniforme de duración/repetición por tool. | **P2.** Implementar como envoltorios de tools o middleware de Deep Agents. Medir primero bucles y latencias reales. |

## Integración con agentes de otros productos: familia `subagent/`

La [familia subagent de DeepSeek](/Users/projects/harnees/deepseek-harness/packages/subagent/README.md) separa un servicio común de delegación (`ctx.subagents`), sus proveedores —spawn/fork internos, ACP, Codex, Claude Code y otro Harness por SDK— y las tools que el modelo usa para delegar o controlar hijos. Una llamada puede esperar una respuesta final o, con proveedores compatibles, dejar un hijo continuable con identificador, mensajes posteriores, interrupción y listado.

**Estado real de xonecode:** `createDeepAgent` ya aporta `task` y acepta tanto especialistas internos como `CompiledSubAgent`. El puerto `SubagenteExternoPort` implementa Claude Code por SDK, Codex por app-server y OpenCode por ACP. Los perfiles de agente son ficheros `.md` y el `motor` es hoy una unión cerrada (`modelo`, `claude-code`, `codex`, `opencode`). Cada ejecución externa recibe una tarea autocontenida y devuelve una respuesta final, sin continuación. [Grafo](/Users/projects/xonecode/src/agent/grafo/xoneAgent.ts), [puerto](/Users/projects/xonecode/src/core/ports.ts), [OpenCode ACP](/Users/projects/xonecode/src/agent/subagentes/subagenteOpencode.ts).

| Posibilidad | Valor para xonecode | Decisión |
|---|---|---|
| Proveedor **ACP genérico** | Añadir agentes de otros productos que hablen ACP, sin escribir otro adaptador completo por producto. | **P1/P2.** Extraer del adaptador OpenCode un cliente ACP reutilizable y dejar políticas, configuración y peculiaridades en proveedores por producto. Mantener `task` de Deep Agents como puerta del orquestador. |
| Registro de proveedores y capacidades | Catálogo dinámico de motores disponibles, permisos y modos de ejecución; evita que el modelo vea agentes instalados pero inutilizables. | **P2.** Evolucionar la unión cerrada `MotorExterno` y el puerto actual cuando exista un segundo agente ACP; preservar la detección de disponibilidad previa a publicar el especialista. |
| Hijos continuables y trabajo en segundo plano | Reanudar un agente externo, enviarle seguimiento y mostrar su estado en el chat web. | **P3.** Requiere identidad persistente, buzón, cancelación y representación web; los proveedores externos de DSH citados son principalmente de una ejecución y ACP DSH no ofrece continuación. Diseñar solo si aparece un caso claro. |
| Fork de historial del padre | Hijo interno que recibe turnos completos previos. | Sin prioridad. Los especialistas de xonecode reciben un encargo y un handoff explícitos; copiar la conversación eleva coste y puede cruzar datos entre papeles. |

**Límite de reutilización directa:** [`dsh-subagent-acp`](/Users/projects/harnees/deepseek-harness/packages/subagent/subagent-acp/README.md) ejecuta un agente ACP genérico, pero contesta las peticiones de permiso con una política fija `allow`/`reject` y entrega al padre solo la salida final. Eso no reproduce el flujo de xonecode, que valida ruta y diff y solicita aprobación humana por escritura desde la web. El cliente ACP común puede inspirarse en su transporte, ciclo de vida y diagnósticos; el control de permisos debe seguir siendo de xonecode. Tampoco hace falta importar el `ctx.subagents` de Cordis para conservar el `task` de Deep Agents.

## Útiles sólo si aparece el caso de uso

| Plugin | Condición para usarlo | Observación |
|---|---|---|
| [lsp + lsp-stdio + tool-lsp](/Users/projects/harnees/deepseek-harness/packages/lsp/tool-lsp/README.md) | Navegación precisa cuando existe un servidor de lenguaje. | Para `.xne`, construir primero un índice semántico XOne determinista y una tool directa para Deep Agents; servidor LSP como adaptador posterior. Véase el [diseño específico](./navegacion-xone-lsp-y-referencias.md). |
| [file-reference y file-reference-local](/Users/projects/harnees/deepseek-harness/packages/context/file-reference/README.md) | Autocompletado `@archivo` en el chat web. | Implementarlo en el compositor web con rutas del proyecto legibles por el agente. La CLI/TUI actual se retirará y no es una dependencia del diseño. Seleccionar una ruta no lee ni adjunta el fichero. Véase el [diseño específico](./navegacion-xone-lsp-y-referencias.md). |
| [goal](/Users/projects/harnees/deepseek-harness/packages/goal/goal/README.md) | Objetivos automáticos que duren varios turnos y sobrevivan reinicios. | xonecode ya tiene tareas; habría que demostrar un hueco concreto antes de introducir otro estado de objetivo. |
| [runtime invariants](/Users/projects/harnees/deepseek-harness/packages/runtime-diagnostics/invariants/README.md) | Comprobar relaciones observables entre aprobación, escritura, evento y sesión. | Adoptar el patrón y tests concretos, no montar un registro genérico por principio. |

## Componentes que no incorporaría al piloto

- **Filesystem, editor y búsqueda genéricos** (`dsh-tool-fs`, `dsh-tool-fs-search`, `dsh-tool-str-replace-editor`): Deep Agents ya suministra esas operaciones y xonecode ya las confina y autoriza. Una tool duplicada produciría rutas de política distintas.
- **Agent Loop, sesiones, compaction, todo y subagentes DSH**: solapan Deep Agents y el checkpointer, tracker y especialistas actuales. Sí merece estudiar técnicas específicas, como límites de resultados, pero xonecode ya monta `large_tool_results` fuera del proyecto.
- **`dsh-tool-cordis` y los runners dinámicos**: permiten al modelo escribir y ejecutar plugins en vivo. Requieren muchos servicios y su propio README advierte que su aislamiento no es una barrera de seguridad. No son el mecanismo inicial para abrir paquetes de XOne.
- **Shell y workflow de JavaScript escrito por el modelo**: aumentan mucho la superficie de ejecución. La necesidad XOne que se ha identificado es abrir capacidades seleccionadas por perfil; estas tools no la resuelven primero.

## Tres pruebas que decidirían la arquitectura

1. **Skills abiertas.** Montar `xone-plugins-market` como fuente de prueba, comprobar que las seis coincidencias no aparecen duplicadas y que una skill nueva instalada por el usuario llega al catálogo de un especialista y se carga desde `/skills/` sin dar escritura al modelo. Comparar una adaptación de `skill-filesystem` con una implementación pequeña sobre `SkillsPort`.
2. **MCP general.** Conectar un servidor de prueba con dos tools, publicar una sólo en `docs` y ninguna en el orquestador; verificar nombre estable, cambio de catálogo entre turnos, timeout, cancelación y ausencia de argumentos crudos en eventos. El cliente de CloudStudio sigue separado como integración de negocio.
3. **Contexto de proyecto.** Cargar un `AGENTS.md` de prueba y un fichero anidado con presupuesto; comprobar que las reglas XOne permanecen, que la procedencia es visible y que el contexto cambia sólo en un límite seguro de turno.

**Conclusión:** empezaría por los patrones de **skills multifuente, MCP genérico e instrucciones de proyecto**. Luego web seguro y pregunta al usuario. Probaría paquetes DeepSeek concretos sólo después de medir cuántos servicios DSH exige cada uno; la selección de funcionalidades no obliga a ejecutar el Agent Loop de DeepSeek ni a instalar Cordis en la primera fase.
