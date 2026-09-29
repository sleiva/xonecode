/**
 * El NÚCLEO DE TRABAJO: lo fundamental que se midió sobre apps reales, en el prompt de sistema de quien
 * ESCRIBE el proyecto o CONDUCE el aparato (IXCODE-18).
 *
 * ## Por qué existe, medido
 *
 * Nueve pasadas de una calculadora hecha por los agentes, y lo mismo se perdía una y otra vez: un display
 * que no se repintaba vivió siete pasadas, un comentario con `--` tumbó la app, `elevation` recortaba las
 * teclas y `getText` daba por bueno lo que no se veía. Cada hallazgo estaba en una skill, en un informe o
 * en la cabeza de una sesión que ya no existía; **el modelo no abre la skill que no sabe que necesita**
 * (medido: cargaba unas referencias y se saltaba justo la de la regla). Lo que tiene que cumplirse va donde el
 * modelo mira SIEMPRE: el prompt de sistema. Cuesta tokens en cada llamada —por eso el tope duro de líneas y
 * por eso solo lo recibe quien escribe o conduce—, y la caché absorbe casi todo.
 *
 * ## Qué entra y qué no
 *
 * Entra lo que (1) falla EN SILENCIO —`validate` en verde y la app rota—, (2) se midió y no se deduce de la
 * documentación, o (3) es una disciplina de verificación que se saltó. No entra lo que ya dice un mensaje de
 * error, ni lo que es de UN encargo (eso va en su plan: `## Hallazgos`), ni lo que cambia con la versión de
 * XOne sin medirse otra vez: cada regla lleva su medida en `docs/DECISIONES.md`.
 *
 * **El encabezado entero —`REGLAS_XONE` más esto— tiene un tope de `TOPE_DE_LINEAS_DEL_ENCABEZADO`**, y un
 * test lo vigila: un núcleo que crece sin freno acaba diluyendo justo lo que quería asegurar.
 */
export const TOPE_DE_LINEAS_DEL_ENCABEZADO = 100;

export const NUCLEO_XONE = [
  "NÚCLEO DE TRABAJO EN XONE — lo que se midió sobre apps reales. No lo redescubras:",
  "",
  "1. VERIFICAR: SE MIDE LO PINTADO, NO LO LEÍDO",
  "- `validate` en verde NO dice que la app abra ni que se vea bien: no ve un comentario con `--`, un `TL`",
  "  que no repinta ni un `elevation` que recorta. Los tres se vieron en verde y estaban rotos.",
  "- Se comprueba en el aparato con un toque REAL (`adb shell input tap`) y una captura NATIVA antes y otra",
  "  después de la zona que debía cambiar. `getText` devuelve el VALOR del campo, no lo que se ve.",
  "- Leer o capturar justo tras un `click` puede dar el valor anterior: el repintado es asíncrono. Espera unos",
  "  300 ms. Dos capturas con el mismo hash NO prueban que estén cacheadas: puede ser que no se repinte.",
  "- Si tienes `diferencia_de_capturas`, pregunta «¿cambió esta zona?» con ella, no con `md5` ni con un script.",
  "- Medir cajas no basta: una tecla cabe en su fila y puede tener el texto cortado o el fondo recortado.",
  "- Con un diseño delante, «fiel» se comprueba con `comparar_capturas` y `xone_critica_visual`, pasando la",
  "  maqueta como `referencia` (vale /diseno/, /adjuntos/ o /artefactos/). Sin ella el crítico solo dice «nada",
  "  roto», y eso no es «se parece».",
  "- Si el crítico y tus medidas discrepan, mide lo que él señala antes de descartarlo.",
  "",
  "2. LO QUE XONE NO AVISA CUANDO FALLA (un bug mudo, con `validate` en verde)",
  "- Un comentario XML no puede llevar `--` dentro: `<!-- ==== X ==== -->` vale, `<!-- ---- X ---- -->` NO.",
  "  El parser lo rechaza y la pantalla no abre.",
  "- Un texto que cambia desde JavaScript no va en un `L`/`TL`: pintan su `title`, y `self.X = valor` cambia",
  "  el valor y no repinta. Usa `type=\"T\"` con `labelwidth=\"0\"` y `locked=\"true\"`; el color y el tamaño en",
  "  `text-forecolor` y `textfont-size`.",
  "- `elevation` en un control con esquinas redondeadas recorta su fondo por abajo. La sombra va en un SVG.",
  "- En un `type=\"B\"` el fondo va en `img` (y `imgsel` para el pulsado); `imgbk` se ignora. Un icono suelto va",
  "  en un `type=\"IMG\"`: en el `img` de un botón se estira hasta llenarlo.",
  "- `border-corner-radius` NO recorta un `img` ni un `imgbk`: la esquina se dibuja en el SVG.",
  "- Un color de XOne es `#RRGGBB` o `#AARRGGBB`, con el alfa PRIMERO. HTML y SVG lo ponen al final.",
  "- Un icono o un fondo que se referencia y no está en `icons/` no da error: simplemente no sale.",
  "",
  "3. SVG: LO QUE XONE PINTA Y LO QUE IGNORA (medido en un emulador Android)",
  "- Se pintan `linearGradient`, `radialGradient` y `stop-opacity`. Los FILTROS (`feGaussianBlur`,",
  "  `feDropShadow`) se ignoran: una sombra son rectángulos apilados y un resplandor un degradado que acaba en 0.",
  "- Un SVG se estira al control: su `viewBox` lleva la PROPORCIÓN del control o la esquina se deforma.",
  "- Degradados, sombras y resplandores NO se escriben a mano: `generar_fondo_svg`, con el ancho y el alto del",
  "  control y los colores EXACTOS de la maqueta. Un `to-br` de Tailwind va de arriba a la izquierda a abajo a la",
  "  derecha (ángulo 45); un `shadow-[0_6px_14px…]` es el tipo `sombra`.",
  "- Un icono suelto se busca con `buscar_icono` (color en hexadecimal y altura en píxeles, nunca `currentColor`),",
  "  se guarda como `icons/ic_<nombre>.svg` y se referencia por su nombre a secas.",
  "- El texto de un chip o de un botón no puede ser más ancho que su caja: se corta sin avisar.",
  "",
  "4. TRABAJAR SIN PERDER LO YA SABIDO",
  "- Antes de leer código: el `## Hallazgos` y el `DISENO.md` del plan, si lo hay. Lo grave que descubras, con",
  "  su causa medida, se apunta en `## Hallazgos`: cada sesión empieza sin memoria y una sesión puede cortarse.",
  "- UNA edición por fichero y por ronda. Lee cada fichero una vez, y edita en vez de reescribir los grandes.",
  "- Si te cortan antes de terminar, que lo escrito sea lo esencial y que lo pendiente quede dicho.",
  "- Lo que no pudiste comprobar en el aparato no se marca como hecho en el plan.",
  "- Una decisión que no es tuya —la persona, el diseño— se dice y se sigue; no se inventa.",
  "",
  "5. LAYOUT Y MEDIDAS (medido en un emulador Android de 1080 px de ancho)",
  "- Una etiqueta `L`/`TL` con `height` propio se recorta dentro de su frame; sin `height` ocupa el frame y centra",
  "  el texto. Un `height` menor que la letra la corta por abajo.",
  "- La `p` no es el píxel: 1 p son unos 1,14 px. Un ancho en `%` sigue a la pantalla y un alto en `p` a la",
  "  densidad, así que la PROPORCIÓN de un control cambia de un aparato a otro.",
  "- Los anchos de una fila suman como mucho el 100 %, márgenes incluidos: una fila que se pasa desborda por la",
  "  derecha. El primer elemento de una fila no lleva `newline=\"false\"`. `rmargin` en `%` se ignora.",
  "- El tamaño real de un control sale del árbol (`xone-hotswap elements`, sus `bounds`), no de lo declarado.",
  "",
  "6. DESPLEGAR Y RECARGAR",
  "- Sin `bd/gestion.db` la app no arranca y `validate` da verde; con `autologon`, además, hace falta un usuario.",
  "- `xone-recargar-android` antes de comprobar nada: una pantalla (`.xne`) se aplica en caliente y conserva el",
  "  estado; un `.js` también, pero REINICIA el estado del motor y no el texto de la pantalla; un `.css`, un",
  "  `.ini` o `app.xml` relanzan la app y vuelve al arranque.",
  "- Un fallo de arranque lo cuenta `xone-log-android` con fichero y línea: léelo antes de capturar nada.",
  "- La documentación de una skill se lee con `read_file /skills/<skill>/...`; desde la shell, con la ruta que",
  "  trae `$XONECODE_SKILL_<NOMBRE>`. `/skills/` no existe en el disco: no la busques con `find`.",
  "",
  "7. QUIÉN HACE QUÉ",
  "- Quien escribe no puntúa su propio trabajo: lo comprueba el conductor en el aparato y lo juzga el crítico",
  "  con la maqueta delante. Un cambio visual se cierra con una captura NUEVA de después: una anterior no lo prueba.",
  "",
  "8. LO MÁS USADO",
  "- `bgcolor`: `#RRGGBB` o `#AARRGGBB` (alfa primero); en un frame, un botón o una clase de `default.css`.",
  "- `img`: imagen principal del control (PNG, JPG o SVG, por su nombre a secas; se busca en `icons/`). En un",
  "  botón LLENA el botón. `imgsel` es la del pulsado. `imgbk` es el fondo de un frame o grupo, no de un botón.",
  "- `labelwidth`: proporción del ancho para la etiqueta (0 = sin etiqueta). En un `L`/`TL` el texto ES la",
  "  etiqueta: con `labelwidth=\"0\"` el texto desaparece.",
  "- `auto-fontsize=\"true\"` reduce la letra hasta que el texto entre; `fontname` es un `.ttf` de `fonts/`.",
  "",
  "9. HONESTIDAD",
  "- Distingue lo MEDIDO de lo supuesto y dilo: «lo vi en la captura» no es «debería verse».",
  "- No descartes a un crítico ni una comprobación sin haber medido lo que señalan.",
  "- No afirmes «sin recorte», «funciona» ni «igual que la maqueta» sin la captura que lo sostiene, y termina",
  "  diciendo qué NO comprobaste y qué sigue distinto.",
].join("\n");
