# La sesión de MyAllXOne, medida

Sesión `65ba7357` (22-09-2026), proyecto `MyAllXOne`, modo **autónomo**, los tres papeles en
`deepseek/deepseek-flash`. Esto no es un relato: son las cifras del `.jsonl` y del
`conversation_history`, y lo que NO se midió se dice.

## 1. Qué se pidió, y qué costó

| # | Encargo | Entrada | Salida | Tiempo |
|---|---|---|---|---|
| 1 | «Hola» | 5,6 k | 528 | 6 s |
| 2 | «tengo un error lanzando la app, puedes probar» | 289 k | 22,5 k | 5 min |
| 3 | «calculadora con este diseño (zip de Stitch) + drawer en Utilidades, label "Demo Calculator"» | 841 k | 63 k | 3,8 min |
| 4 | **«te dejo que decidas»** | **8,61 M** | **436 k** | **37 min** |
| | total | 9,74 M | 522 k | 46 min |

(`entrada` excluye la caché; además hubo 9,07 M de lectura de caché.)

**El turno 4 es el 88 % de la entrada, el 83 % de la SALIDA y el 72 % del tiempo.** Y la salida
es donde está el dinero: 436 k de tokens generados son 128 subagentes razonando y escribiendo.

### El turno 4 por dentro — 1.065 llamadas a tool

Contadas pesando las líneas colapsadas (`×2`, `×3`…), que es donde el primer recuento se quedó
corto. Incluye lo que hacen los subagentes, no solo el orquestador.

| tool | n |
|---|---|
| `read_file` | 337 |
| `grep` / `glob` | 326 |
| **`task` (delegar)** | **130** |
| `execute` (shell) | 104 |
| `ls` | 69 |
| `regex_search` | 40 |
| `xone_critica_visual` | 33 |
| `xone_navegacion` | 26 |

128 delegaciones con destino nombrado: `designer-xone` 38, `developer-xone` 36,
`device-controller` 33, `analyst-xone` 14, `consultant-xone` 7.

**Sobre el tope**: `TOPE_DE_TOOLS_DEL_ORQUESTADOR` es 60 con `runLimit` **por run**. Con ~130
delegaciones el turno hizo varios runs, así que es probable que mordiera — pero **en el `.jsonl`
no hay ninguna marca de que lo hiciera**. Eso ya es un hallazgo: un tope que corta sin dejar
rastro legible no se puede auditar después.

337 lecturas sobre **35 ficheros distintos**. Los cuatro de siempre: `calculadora.js`,
`EspecialCalculadora.xne`, `funciones.js`, `calculadora.css`. No es un modelo olvidadizo: cada
delegación arranca en frío y redescubre lo mismo — medido por las relecturas, no leído del código.

## 2. La calidad

**Lo que salió bien, y no es poco.**

- El turno 2 encontró una causa real y no adivinada: `funciones.js:3367`, `coll.unlock()` sin
  `;`, que tumbaba el arranque antes de pintar nada. Error literal del aparato, no deducción.
- La aritmética está **medida en el emulador**, no razonada: `2+3*4=14`, `(2+3)*4=20`,
  `0.1+0.2=0.3`, `8/0→Error` y `AC` recupera. Precedencia y paréntesis correctos.
- El drawer se cableó bien: `Menu.xne:125`, `title="DEMO CALCULATOR"` — **mayúsculas que son la
  convención del fichero** (BÁSICOS, FRAMES, CALENDARIO…), no un descuido.
- Y desmontó un bug fantasma: el `0.1+0.` no era del motor, era una **lectura una pulsación por
  detrás** del conductor. Lo demostró midiendo. Se ahorró un arreglo sobre código sano.
- Al cerrar distingue lo que arregló de lo que decide no tocar, con el motivo. Eso es honesto.

**Lo que salió mal: la FIDELIDAD al diseño.** Y es justo lo que el usuario vio de un vistazo.

| | Maqueta (`DESIGN.md` / `code.html`) | Implementado (`calculadora.css`) |
|---|---|---|
| Teclas | `rounded-full` (39 usos) → **círculo/píldora** | `border-corner-radius: 48` → esquina suave |
| Resultado | 64 px | `fontsize: 10` |
| Expresión | 24 px | `fontsize: 7` |
| **Ratio resultado : expresión** | **2,7×** | **1,43×** |
| Teclas | 28 px | `fontsize: 8` |
| Símbolos | `√ x² π ÷ × ±` | `sqrt x^2 pi / * +/-` |

Las dos quejas del usuario están ahí, y son ciertas.

- **El font no concuerda** porque la escala se comprimió. El propio agente documentó que
  `fontsize` es una **escala 1–12**; en esa escala el ratio del diseño (2,7×) era alcanzable
  —12 contra 5, o 12 contra 4—. Eligió 10 contra 7. El resultado grande no es grande.
- **Las teclas no son redondas** porque `rounded-full` significa «radio = la mitad del lado menor», y
  48 no es la mitad de nada aquí. La unidad real de `border-corner-radius` **no está medida**;
  lo que sí consta es de dónde salió el 48: de extrapolar el `8` de `default.css`, no de una
  medida. En la captura las teclas son rectángulos de esquina suave; en la maqueta, píldoras.
- **Los símbolos**: `√` y `π` son IMPOSIBLES en `iso-8859-15` (el encoding del `.xne`), así que
  `sqrt` y `pi` están forzados y no son error. Pero **`x²`, `±`, `×` y `÷` SÍ caben** (0xB2,
  0xB1, 0xD7, 0xF7 — verificado). Cuatro de seis se dejaron en ASCII sin necesidad. Y el
  comentario de cabecera de `calculadora.css` dice que la cinta es `( ) √ x² π`, que es lo que
  el fichero NO hace: el comentario y el código ya divergen.

## 3. Por qué no convergió — tres huecos del harness

### a) El crítico visual no puede ver el OBJETIVO. Es el hueco principal.

No es un problema de capacidad: **el modelo ve imágenes perfectamente** — identificó que una
captura era el login y no la calculadora, y leyó los rótulos `AP_EXPRESION`/`AP_RESULTADO`
cortados contra el borde. Lo que decide qué ve es **qué se le pide que describa**. Y ahí están
los dos huecos:

1. **`xone_critica_visual` toma UNA captura.** No hay parámetro de referencia, así que
   comparar con `screen.png` no es que salga mal: no es expresable.
2. **Su prompt le prohíbe explícitamente mirar lo que el usuario miró.**
   `juezVisual.ts#PROMPT_VISUAL` dice literal:

   > «Busca defectos OBJETIVOS: texto cortado… **NO opines de gustos, de la paleta ni de la marca.**»

**Las dos quejas del usuario caen exactamente en el conjunto excluido.** El crítico hizo bien su
trabajo, encontró lo que se le pidió, y dio **verde**. Verde significaba «nada roto». El
orquestador lo leyó como «la pantalla está bien» — y no porque se lo inventara: se lo dice el
propio harness, en el texto que la tool devuelve —

> «**No des la pantalla por buena hasta que yo la vea en verde.**»

— y la `description` de la tool tampoco avisa de que no compara con ningún diseño. Esto es
doc-contra-código en el vocabulario de este repo: **el bucle tiene una condición de parada que
no puede medir el objetivo del encargo.**

Hay una prueba de que no era falta de vista sino falta de pregunta: el orquestador llegó a
escribirle al crítico «las teclas llevan esquinas redondeadas (**radio alto**)» y el crítico no
dijo que no lo fueran. No se le pidió comparar, se le pidió buscar roturas.

**HECHO** (22-09-2026): `xone_critica_visual` tiene ya un parámetro opcional `referencia`, y
con él corre `PROMPT_VISUAL_CON_REFERENCIA`, que NOMBRA qué comparar —forma, jerarquía de
tamaños, color contra la maqueta, colocación— en vez de preguntar «¿se parecen?». Sin
referencia todo se queda byte a byte como estaba. Cinco cosas que no son de forma:

- **Cada imagen va detrás de la línea que dice cuál es.** Con dos adjuntas, cuál es la maqueta
  dependería del orden en que el proveedor las numere, y eso es una suposición: invertidas, el
  crítico contaría las diferencias al revés y se leerían igual de bien.
- **Fail-closed**: una referencia que se pidió y no se pudo abrir NO se juzga. Un veredicto sin
  maqueta vuelve como «verde» y se lee como «se parece», que es el fallo que esto cierra. Y el
  paso siguiente escrito es *arreglar la ruta*, nunca «o llámame sin ella».
- **La cabecera dice si se comparó** (`(comparado con la referencia)`): «verde» contesta dos
  preguntas distintas según el modo, y quien lo lea tiene que saber cuál le contestaron.
- **Un rojo comparado va a `designer-xone`**, no a `developer-xone`: una diferencia contra una
  maqueta es visual por definición. Sin referencia esa rama se queda como estaba.
- **Las dos rutas se comprueban antes de abrir ninguna**, o una referencia mal escrita se
  descubriría con la captura ya en memoria.

**Y de paso, un botón muerto que llevaba ahí desde el principio**: `nombreDeArtefacto` se queda
con el último segmento —su trabajo, nombrar para una persona— y el lector abría por ahí. Una
maqueta llega en `.zip` y se descomprime, así que vive en `/artefactos/diseno/screen.png`: el
`join` apuntaba a `<carpeta>/screen.png` y contestaba «no pude abrir» sobre un fichero que
estaba ahí y que la propia foto había anunciado. **El crítico no podía abrir NINGUNA captura en
subcarpeta.** Ahora se abre por `rutaRelativaDeArtefacto` (pura, en `core/`, con test) y se
sigue nombrando por el último segmento.

### b) Nadie acota el ciclo aparato↔crítico

21 delegaciones a `device-controller` = 21 despliegues + navegación + captura, para una pantalla
con ~8 cambios de CSS. No hay agrupación: cada retoque paga el viaje entero. `TOPE_DE_PETICIONES`
acota lo que el crítico pide (3), pero nada acota lo que el orquestador encarga.

### c) Cada delegación arranca en frío

La precarga de hechos (`hechos-del-proyecto-delante`) alimenta al ORQUESTADOR. Los 63 subagentes
no la heredan: vuelven a hacer `ls`, `grep` y `read_file` sobre los mismos cuatro ficheros. Los
encargos que el orquestador escribe promedian **4.260 caracteres** — ya intenta compensarlo a
mano, escribiendo el contexto en prosa dentro de cada `task`.

### d) La lección que se aprendió y NO se guardó

El bucle del `0.1+0.` —el bug fantasma del motor— va de la línea 130 a la 201 del hilo:
**54 delegaciones** (18 `designer-xone`, 14 `device-controller`, 14 `developer-xone`,
4 `analyst-xone`, 2 `consultant-xone`) para acabar concluyendo que el motor estaba sano y que
el conductor leía **una pulsación por detrás**.

El remedio cabe en una línea —«lee cada campo dos veces»— y hoy vive **solo en el chat**:
`skills/xone-hotswap/` no lo menciona. La próxima sesión vuelve a pagar las 54.

### e) Menor, pero gratis: el eco del crítico

`xone_critica_visual` devuelve el argumento `pantalla` ENTERO dentro de su respuesta («Veredicto
visual de «…1.577 caracteres…»»). El orquestador acaba de escribirlo. En la parte del hilo que
se conserva son 5.510 caracteres ecoados en 5 llamadas; hubo 22. Basta con un identificador.

## 4. Lo que NO se ha hecho aquí

No se ha tocado la calculadora. La petición era analizar, y el font y el radio son el EJEMPLO
del hueco, no el encargo.

