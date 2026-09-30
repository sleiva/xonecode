# Calc: análisis de latencia entre iteraciones

Fecha: 30-09-2026. Análisis de copias de las trazas y logs del scratchpad, sin modificar las ejecuciones. Calc9 se congeló para este informe en 32,86 minutos de actividad registrada, 271 llamadas al modelo y 509 herramientas. No es un resultado final.

## Método y límites

- Tiempo: intervalo entre el primer y último evento de cada sesión. No es necesariamente la duración del proceso ni tiempo puro de inferencia.
- Primera escritura: petición de write_file/edit_file fuera de /planes/ y /artefactos/. No acredita por sí sola la aplicación; puede ser un recurso SVG.
- Primera prueba: primera delegación registrada a device-controller. No equivale al inicio exacto de la ejecución ni a prueba satisfactoria.
- Las trazas históricas no comparten todos los campos. Razonamiento no declarado no significa cero; una delegación no registrada no significa que no ocurriera.
- Las variantes no son un A/B controlado: cambiaron código, prompts y condiciones. No hay base para atribuir todo el cambio de tiempo a una sola mejora.
- calc3, calc4, calc5, calc6, calc7 y calc8 terminan sus logs con interrupción manual. calc8 además declara atasco de la espera. No son entregas terminadas.
- No confundir calc9.log (una pasada anterior de la carpeta calculadora) con c9_1.log (la ejecución actual de calc9).

## Comparación

| Ejecución | Intervalo de traza (min) | Llamadas modelo | Tools | Delegaciones registradas | Primera escritura (min) | Primera delegación a pruebas (min) | Estado del log |
|---|---:|---:|---:|---:|---:|---:|---|
| calc3 | 41,62 | 226 | 456 | 8 | 7,92 | 19,54 | Interrumpida |
| calc4 | 42,15 | 391 | 713 | 16 | 6,76 | 13,46 | Interrumpida |
| calc5 | 29,87 | 259 | 411 | 11 | 6,84 | 10,04 | Interrumpida |
| calc6 | 2,10 | 30 | 134 | 2 | — | — | Interrumpida antes de implementar |
| calc7 | 14,66 | 139 | 336 | 6 | 6,53 | 8,97 | Interrumpida |
| calc8 | 5,06 | 32 | 128 | 4 | 5,06 | — | Interrumpida por atasco; el silencio posterior no se mide aquí |
| calc9 | 32,86 | 271 | 509 | 11 | 6,34 | 16,37 | Parcial |

El objetivo de 15–20 minutos es un presupuesto deseado, no un rendimiento validado por estas ejecuciones. Calc7 no demuestra una entrega correcta en 15 minutos.

## Camino crítico observado en calc9

| Tramo | Minutos desde inicio | Duración aproximada |
|---|---|---:|
| Orientación, análisis/consulta en paralelo y preparación de diseño | 0–2,68 | 2,68 min |
| Primera delegación de diseño | 2,68–9,01 | 6,34 min |
| Traspaso a desarrollo | 9,01–9,38 | 0,37 min |
| Desarrollo hasta solicitar la primera prueba | 9,38–16,37 | 6,99 min |
| Correcciones y comprobaciones funcionales hasta lanzar otra pasada visual | 16,37–30,80 | 14,43 min |
| Nueva pasada visual y comprobación adicional | desde 30,80 | Abierto en esta foto |

Estos intervalos incluyen toda la actividad interna de cada tramo; no son tiempos exclusivos de modelo. Primera escritura de MenuPrincipal.xne a 14,06 min aproximadamente (843,9 s); primera petición de CSS a 7,40 min.

## Hallazgos

### 1. Conocimiento confirmado en una iteración no evita el mismo fallo en la siguiente

c5_1.log:925–929 registra una escritura aprobada de memoria: getControl durante create falla porque los controles todavía no existen; el texto también advierte que el try/catch no detuvo la excepción observada. Calc9 vuelve a registrar esa causa en la segunda delegación al conductor (19,24 min). El patrón ya aparece también en las delegaciones de calc4.

Esto prueba recurrencia, no que calc9 tuviera esa memoria cargada y la ignorase. Las carpetas son proyectos separados. El hueco es la transferencia de hechos experimentales de la plataforma a las siguientes ejecuciones. La memoria por especialista de una sesión no cubre esa transferencia. La búsqueda en nucleoXone.ts, agentes.ts y subagentes no encontró esa regla explícita.

### 2. La primera comprobación llega demasiado tarde para un presupuesto de 20 minutos

Calc9 solicita la primera prueba al minuto 16,37. Quedan 3,63 minutos para depurar, verificar comportamiento y validar aspecto si el objetivo es 20. Para 15 ya se agotó el presupuesto antes de comprobar.

La primera fase del diseñador hace 142 llamadas a herramientas: 30 búsquedas de iconos, 22 generaciones de fondos y 44 write_file, además de consultas y ediciones. No todas esas escrituras son recursos del proyecto. Aun siendo trabajo solicitado, se ejecuta antes de tener probado el arranque y el repintado básicos.

La secuencia diseñador → desarrollador resolvió una dependencia real de recursos. La alternativa a evaluar no es volver a paralelizar ciegamente, sino establecer un contrato mínimo de recursos y probar una sección funcional pequeña antes de terminar toda la pantalla.

### 3. La reparación es local y repetida sobre una misma familia de fallos

Las delegaciones de calc9 documentan: acceso prematuro a MAP_EXPRESION; acceso a controles del cajón oculto; calcToggleDeg ausente; acceso a MAP_ITEMSTXT; tarjetas ocultas; MAP_NUM no actualizado mientras el cajón estaba cerrado. La quinta comprobación sigue dedicada al cajón y la sexta prueba otra estrategia de acceso a la vista y refresco diferido.

Se observa una sucesión de cambios de implementación y validación completa. La hipótesis es que faltó aislar el contrato de estado/visibilidad/montaje en un experimento mínimo, y luego aplicar el patrón confirmado a todos los campos. Los encargos describen diagnósticos del agente; no reemplazan la lectura del resultado bruto del aparato.

### 4. La regla de tres vueltas no es un contador operativo del bucle delegado

sesionTrueforge.ts expresa TRES vueltas en el prompt del desarrollador. Calc9 registra seis delegaciones al conductor, con correcciones entre ellas, antes de 31 minutos. Una comprobación no siempre equivale a una vuelta completa, pero la secuencia demuestra que el prompt no establece una cota fiable del trabajo. TOPE_REPARACIONES gobierna otro lazo: el del verificador al cierre.

Un contador no debería simplemente abandonar en la tercera vuelta: al repetirse la misma causa debe cambiar el procedimiento, exigiendo diagnóstico aislado y evidencia antes de otra reescritura.

### 5. Mucha generación y contexto creciente dentro de una única delegación

En esta foto, developer-xone lleva 66 llamadas, 202.524 tokens de salida y 141.356 de razonamiento (69,8 %); su mayor entrada registrada es 292.075 tokens. Designer-xone lleva 43 llamadas y 117.606 tokens de salida, 83.201 de razonamiento (70,7 %). El conductor lleva 132 llamadas y 39.951 de salida.

El desarrollador sigue dentro del mismo encargo largo: la reducción de memoria al cerrar un hijo no reduce su contexto durante esa ejecución. TrueForge en xonecode no compacta hijos por una decisión basada en un caso anterior; aquel ahorro de compactación no demuestra que convenga mantener sin compactar un encargo de esta longitud.

Una llamada anterior del desarrollador produjo 20.573 tokens de salida, 20.487 de razonamiento; hay 76,5 s entre eventos vecinos. No hay spans suficientes para imputar exactamente el tiempo a generación, red o procesamiento.

### 6. Las mejoras sí operan, pero no eliminan la causa restante

El desarrollador coordina directamente pruebas; el conductor vuelve con memoria; el diseñador también conserva memoria al ser retomado. El orquestador solo lleva 10 llamadas. No sería correcto atribuir esta ejecución principalmente a falta del bucle, falta total de memoria o actividad excesiva del orquestador.

## Experimentos priorizados

1. Regla comprobada y ejemplo mínimo de ciclo de vida, compartidos entre ejecuciones. Medir si desaparecen las reincidencias de OnCreate y controles ocultos; no trasladar automáticamente todos los diagnósticos sin validar.
2. Primera prueba pequeña de arranque, display y un botón antes del diseño completo. Medir tiempo hasta la primera interacción válida y cantidad de fallos detectados antes del montaje completo.
3. Dos fallos de la misma familia activan diagnóstico aislado: hipótesis, prueba mínima, resultado y cambio aplicable al conjunto. No otra reescritura completa por defecto.
4. Pruebas del aparato reutilizables con resultados estructurados, conservando las capturas y toques necesarios. Comparar llamadas del conductor por caso comprobado y cobertura, no solo duración.
5. Evaluar compactación o fases explícitas dentro de encargos largos y esfuerzo de razonamiento según etapa. Comparar tiempo y regresiones con igual modelo, proyecto inicial y aceptación.

No se han aplicado cambios al harness ni a las calculadoras. Los artefactos de este informe son copias y análisis en /private/tmp/analisis-calc-20260930.

## Estado del harness tras el análisis

El commit `a9baee5` (30-09-2026, después de la foto de calc9 usada arriba) aborda tres hallazgos. Este apartado registra el estado del código; las métricas de calc9 no miden el efecto del commit.

| Hallazgo del informe | Cambio implementado | Lo que queda por demostrar |
|---|---|---|
| `getControl` en `<create>` o sobre hijos ocultos | Regla en `src/core/nucleoXone.ts` y en la referencia de errores XOne; incluye la sonda `ui.getView(self)["X"]` | Que el siguiente encargo no reproduzca el fallo y que use la regla correctamente |
| Primera comprobación al minuto 16,37 | `textoDelBucle` pide construir primero arranque, display y un botón, y probarlos antes de ampliar la pantalla | Que el agente siga la secuencia y que la primera prueba se adelante; es una instrucción, no una barrera del ejecutor |
| Seis comprobaciones en un lazo con «tres vueltas» en el prompt | Un contador por hilo añade avisos al llegar a 3 y 5 delegaciones al especialista que ejecuta | Que el agente cambie de procedimiento; el contador es acumulado por hilo y los avisos no detienen ni clasifican familias de fallo |

El código mantiene otros dos costes observados: la fase completa del diseñador puede preceder a la primera prueba, y un encargo largo del desarrollador acumula contexto y razonamiento dentro del mismo hilo. La memoria al cerrar una delegación no reduce ese coste interno.

Verificación del commit en este repositorio: `npx vitest run src/core/nucleoXone.test.ts src/agent/motores/trueforge/sesionTrueforge.test.ts --exclude '**/.worktrees/**'` — 158 tests en verde; `npm run typecheck` — en verde. Estas pruebas confirman el cableado y los textos, no una reducción medida de minutos. El siguiente experimento válido es repetir calc desde el mismo estado inicial, con el mismo modelo y el mismo criterio de aceptación, y comparar tiempo hasta la primera prueba, vueltas por fallo y tiempo total hasta una entrega comprobada.
