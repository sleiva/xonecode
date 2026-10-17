# El agente y lo que puede escribir

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# El agente, y lo único que puede escribir

`agent/grafo/xoneAgent.ts`: un orquestador que delega en los especialistas de `core/agentes.ts`.
Cinco cosas no son negociables:

- **El orquestador va de SOLO LECTURA por PERMISOS, no por falta de tools**
  (`PERFIL_DEL_ORQUESTADOR`); `xoneAgent.orquestador.test.ts` lo exige.
- **`FilesystemBackend` con `virtualMode: true`.** Backend con shell, exactamente UNO, declarado
  en su `.md` (`ejecucion`): `virtualMode` confina las tools de FICHERO, no los comandos, y
  deepagents LANZA si le pasas `permissions` junto a un backend ejecutable.
- **Los permisos se construyen con `permisosDe(perfil)`, NUNCA a mano**: `SubAgent.permissions`
  reemplaza los del padre en vez de fusionarlos, así que un perfil que los escriba a mano pierde
  la denegación de `/.env`, `/.git` y `/.xonecode`.
- **`SubAgent.tools` lleva SOLO tools propias**, nunca los nombres de las de fichero: las monta
  `createFilesystemMiddleware`; quien las acota es `permissions`.
- **El HITL va en `write_file`, `edit_file` e `incorporar_adjunto`**: las tres escriben. La
  tercera copia un adjunto del chat dentro del proyecto (IXCODE-7) y entra en la MISMA aprobación
  por NOMBRE de tool, en los dos motores — la tarjeta lo muestra con la línea `[fichero binario]`
  en vez de un diff, porque no hay texto que comparar. En TrueForge hay una cuarta, `traer_fuente`, por la misma
  puerta (`PROPIAS_QUE_ESCRIBEN`) y con la misma línea.

Y las guardas del proyecto:

- **Las vistas aplanadas** (`X.xml` con un `X.xne` al lado) se retiran del backend con un Proxy
  (`agent/grafo/proyecto.ts`): la regla es propiedad del proyecto, no de un prompt.
- **El agente lee y escribe un texto del proyecto en la codificación que YA tenía, o en la que
  DECLARA** (`agent/grafo/codificacionDelProyecto.ts`, el envoltorio MÁS interno de
  `backendDeAgente`): `FilesystemBackend` lee y escribe siempre en UTF-8, y sobre un `.xne` Latin-1 un
  `edit` de una línea reescribía el fichero entero con «�» en cada tilde contestando que bien. La
  regla es UNA, la misma del editor (`core/codificacion.ts#codificacionParaEscribir`): lo que no es
  UTF-8 sigue en su tabla de 8 bits; un UTF-8 con tildes sigue en UTF-8; un ASCII puro o un fichero
  NUEVO siguen el `encoding=` del prólogo de lo que se escribe —toda colección nueva de la plantilla
  declara `iso-8859-15`—. **La tabla va por declaración y en las DOS direcciones**: ISO-8859-15 si el
  prólogo la declara (su € en 0xA4), si no windows-1252, en todo sitio que decodifica o codifica
  (Ficheros, el guardado, el agente, `readRaw` de `regex_search`, la base de marcas). Un carácter que
  no cabe se DEVUELVE como error, y llega DESPUÉS de la aprobación (la tarjeta la pone la librería
  antes de correr la tool, como el rechazo de una reescritura). Va por dentro de
  `sinContenidoInvalido` (valida el texto bien decodificado) y de `enSerie`. **El ANTES de la tarjeta
  de aprobación se lee IGUAL** (`decodificarComoTexto`, en los dos motores y en la de los motores
  externos): leído en UTF-8, el ancla con tilde no calzaba y la tarjeta enseñaba un diff que no era.
  **Límites declarados**: `grep`/`glob` y `xone_navegacion` siguen en UTF-8, y los motores externos
  ESCRIBEN con sus propias tools, sin esta regla. **Claude Code, en concreto, solo escribe UTF-8**: las versiones
  viejas metían UTF-8 en un `.xne` que declara ISO-8859-15 (rompiendo cada tilde, sin aviso) y la actual se niega
  ANTES del hook y de `canUseTool`, así que xonecode no puede escribir por él. Decisión suya: lo convierte el HIJO,
  con el script `xone-a-utf8` de `xone-development` (prólogo incluido, sin perder un carácter), y se le dice cuándo
  en su prompt (`comandoExterno.ts#TEXTO_DE_A_UTF8`, solo si el script es suyo). Un `.xne` así queda en UTF-8.
- **Un rechazo de guarda se DEVUELVE como `{error}`, nunca se lanza**: una excepción se lleva el
  turno por delante y el agente no reintenta. Vale para `sinVistasAplanadas`,
  `sinArtefactosEnElProyecto` y `sinDescargasEnElProyecto`. `proyecto.test.ts` lo ata contra la
  librería real.
- **Dos escrituras sobre el MISMO fichero no se solapan** (`core/serieDeEscrituras.ts` puro,
  `agent/grafo/escriturasEnSerie.ts`). `write`/`edit` son leer-modificar-escribir sobre el
  fichero entero: dos a la vez se pisan y las dos contestan que bien, sin avisar. **Serializar
  BASTA**: el envoltorio va por FUERA de quien edita — al llegarle el turno se relee el fichero y
  se rebusca el ancla; si no encaja, el backend contesta que no lo encuentra y el modelo
  reintenta. **Va UNA vez, por fuera de TODO lo montado** (`backendDeAgente#enSerie`): vivía
  dentro de la pila del proyecto y `/artefactos/`/`/planes/` no la heredaban. Va por FUERA de
  `sinContenidoInvalido` para que leer, validar y escribir sean un solo turno. Solo `write` y
  `edit`. Probado por `backendDeAgente` y contra el backend REAL, para comprobar que está
  CABLEADA. **Excepción declarada: `incorporar_adjunto`** escribe directo al disco, sin la cola:
  un `write_file` y un `incorporar_adjunto` sobre la MISMA ruta a la vez no se ordenan.
- **`/artefactos/` → `.xonecode/sesiones/<id>/artefactos/`**: escribible y **sin aprobación**, se
  ANUNCIA con el evento `artefacto` (nombre, tamaño, ruta virtual — nunca contenido).
  `esRutaDeArtefacto` es una lista BLANCA de forma, no un `startsWith`. No se crea al montar. Tope
  propio de rondas.
- **La carpeta de artefactos SE CREA antes de correr un comando**
  (`proyecto.ts#anunciarArtefactosDeLaShell`), única excepción a «no se crea al montar»: la crea
  `FilesystemBackend.write` al primer `write` por TOOL, y una shell no pasa por ahí. Va en el
  harness y no en el script (solo con `ejecucion`, así que los otros cuatro especialistas siguen
  sin carpeta vacía). **Y los scripts que el prompt NOMBRA se comprueban contra el catálogo real**,
  en las dos direcciones y con el bit de ejecución.
- **Un artefacto no puede acabar dentro del proyecto, y eso es código**: `artefactoFueraDeSitio`
  (`core/artefactos.ts`) deniega `artifacts`/`artifact` como primer segmento y `/artifact.html` en
  `write`/`edit`. El `when` de `seDetieneEn` (`agent/grafo/perfiles.ts`) usa la MISMA función;
  `perfiles.test.ts` exige que no preguntar implique que la guarda rechaza.
- **Lo que deepagents desaloja del contexto tampoco es del proyecto**: `/large_tool_results/` y
  `/conversation_history/` los escribe la librería llamando al backend directo —sin HITL ni
  `permissions`—, montados al lado de los artefactos (`backendConDescargas`); la guarda del
  backend del proyecto falla CERRADO si el montaje falta.
- **Lo que una SHELL saca del contexto tiene su propia carpeta, `/hotswap/`** (`core/hotswap.ts`,
  `backendConHotswap`, variable `XONECODE_HOTSWAP`): misma razón que las descargas, cambia solo
  quién descarga (el script `xone-hotswap`, que guarda en vez de imprimir). El reparto lo decide
  un LECTOR: una captura la coge `capturasDelTurno` para el crítico de pantalla; un árbol de
  controles no tiene lector, así que la imagen se queda en `/artefactos/` y el texto se muda. La
  carpeta es HERMANA de la de artefactos, no subcarpeta suya (la foto de
  `anunciarArtefactosDeLaShell` es recursiva). El script NOMBRA la ruta virtual en su salida.
- **`/skills/` con barra final obligatoria** (`CompositeBackend` la retira antes de delegar) y
  `permisosDe` deniega `write` ahí: son instrucciones, no ficheros editables.
- **Bajo esa MISMA ruta cuelgan las skills del USUARIO, una a una**
  (`agent/grafo/proyecto.ts#backendConSkills`, `agent/grafo/skills.ts`). Tres raíces —la del
  paquete, `~/.xonecode/skills/` y la del proyecto, con la del proyecto ganando—, vistas por el
  agente como una sola: un subagente declara `skills: [mi-skill]` y se traduce a
  `/skills/mi-skill/`. Se apoya en que `CompositeBackend` ordena sus rutas por LONGITUD
  descendente (atado contra la librería real, `proyecto.test.ts`). **Límite declarado**: `ls
  /skills` enseña solo las de serie (resuelve a UNA ruta), da igual porque `SkillsMiddleware`
  recibe las rutas ya resueltas una a una. **`SkillsEnDisco` no cachea**; `skillsMontables` se lee
  en cada construcción del agente (`construir()` en `agent/turno/turnoReal.ts`, con DOS
  llamadores: al abrir la sesión y en `/modelo`) — una skill guardada desde Ajustes no alcanza a
  la sesión abierta hasta reconstruirla. Agujero HEREDADO sin test posible.
- **Una skill de serie no se edita ni se borra: se COPIA** (`web/servidor/arranque.ts
  #atenderSkill`, `core/skills.ts`). Vive dentro del paquete instalado (una edición se la
  llevaría el siguiente `npm install`), así que aquí NO hay `.semilla.json` ni `restaurar`, a
  diferencia de los subagentes. La barrera vive en el SERVIDOR. El nombre es un SLUG
  (`motivoDeNombreInaceptable`), validado al GUARDAR; un destino que existe es un NO. Renombrar es
  `renameSync` y LUEGO escribir. El `cuerpo` de una de serie no viaja en la ráfaga de bienvenida:
  se pide a mano (`cuerpoDeSkill`).
- **Y se INSTALAN desde un `.zip`** (`core/zipDeSkill.ts`,
  `agent/grafo/skills.ts#instalarSkillDesdeZip`, `POST /skill`): una skill es una CARPETA, no un
  `SKILL.md` suelto. Los BYTES van por HTTP y no por el cable (el molde de `POST /adjunto`). La
  REGLA de qué se acepta es PURA, en `core/`: **lista BLANCA de forma** para cada ruta del zip
  (segmentos llanos separados por `/`; el «zip slip» no se para con `includes("..")` — también hay
  `\`, absolutas, unidad `C:`, byte nulo), **tres topes contra un zip BOMBA** (lo DESCOMPRIMIDO,
  cuántas entradas, tamaño de la mayor), y un `SKILL.md` obligatorio. Se descomprime entero y se
  decide ANTES de escribir nada; una entrada mala se lleva el zip ENTERO. El nombre se DEDUCE y
  pasa por la regla del slug.
- **A un motor EXTERNO las skills llegan por SU palanca, nunca por `/skills/`**: esa ruta es
  virtual de nuestro backend y un hijo lee el disco de verdad, confinado al proyecto
  (`veredictoDeLectura`). Claude Code por `plugins` (`agent/subagentes/pluginDeSkills.ts`, un
  plugin local con enlaces a las tres raíces — `additionalDirectories` NO vale), OpenCode por
  `skills.paths` de la configuración que ya reescribimos en cada arranque. Ninguna de las dos
  escribe dentro del PROYECTO. **Codex se queda fuera**: sus skills vienen de su propio sistema de
  plugins.
- **La tool `Skill` está en la lista de LECTURA de los motores externos**: entra como lectura porque mete
  instrucciones en el contexto, y lo que MANDE hacer vuelve a pasar por el mismo hook. **Y el hijo de Claude Code ve
  SOLO las skills de su `.md`, y ningún MCP** (`skills` del SDK con `skillsVisiblesDelHijo`, `xonecode:<nombre>`;
  `strictMcpConfig`): omitir `skills` no es «skills off» —medido, el hijo veía y nombraba las del usuario y las de sus
  plugins—, y con sus ajustes cargados arrancaba sus MCP (en Maset, un Playwright y el de XOne). Es un filtro de
  contexto: los ficheros de las demás los cierra `veredictoDeLectura`. **Y el hijo de Claude Code LEE la carpeta entera
  de cada skill montada** (sus `references/`), no solo el `SKILL.md` (`pluginDeSkills.ts#carpetasDeLecturaDeSkills`,
  sumadas a las lecturas de las DOS llaves por `lecturasDelHijo`): por el enlace del plugin y por la ruta real,
  comprobado por texto y por camino real, y nada más de fuera. Antes se negaba a propósito y salió caro: medido en
  Maset, el developer y el consultor escribieron atributos de XOne a ciegas (`img=` donde la referencia dice `path=`).
  **Límites declarados**: un `Bash` que pida una skill se sigue denegando (salvo uno de SUS scripts con la shell
  estrecha), y en OpenCode leer la carpeta de una skill sigue cerrado por su `external_directory: "deny"` (sin medir
  si admite excepciones por carpeta). El nombre le llega PREFIJADO (`xonecode:<nombre>`), como Claude Code
  nombra un plugin; `promptDeAgente` lo nombra a secas.
- **Las skills de un subagente se MARCAN de una lista, no se teclean**
  (`componentes/Agentes.tsx#SkillsDelAgente`): `repartirSkills` mete un nombre mal escrito en
  `faltan` en vez de dar error silencioso. Una skill declarada que ya no está en el catálogo se
  sigue pintando, marcada y señalada; sin catálogo NO se pinta una lista vacía (se cae al campo de
  texto).
- **Lo que se COMPRUEBA en el aparato se marca en el plan** (`agent/grafo/marcarCriteriosDelPlan.ts`,
  `core/tareasDelPlan.ts#marcarCriterios`): quien ejecuta no tiene `write_file` ni `edit_file` y el
  orquestador es de solo lectura, así que lo verificado no volvía nunca al `TASKS.md`. La tool
  cambia SOLO `- [ ]` a `- [x]` en UNA tarea, va a quien TRABAJA las tareas en los dos motores
  (`recibeMarcarCriterios`: quien ejecuta, el desarrollador y el diseñador), y reaplica la guarda de
  slug y de enlace a mano. **Se marca TAREA A TAREA, no al final** (`TRABAJAR_CON_PLAN`): medido, el
  conductor no marcaba porque el desarrollador no le nombraba el plan, y el desarrollador reescribía el
  `TASKS.md` entero al acabar. Un `TASKS.md` existente no se reescribe entero (lo dice el prompt).
  Una tarea con ALGUNA casilla marcada va a medias (`implementada`) aunque no tenga `**Estado:**`. **Límite declarado**: escribe sin la cola de
  `escriturasEnSerie`. Una tarea está FINALIZADA con todas sus casillas marcadas
  (`progresoDeTarea`, que viaja con cada tarea a la pestaña Planes); el estado se reconoce por su
  PRIMERA palabra (`pendiente`, `en curso`, `implementada`, `hecha`).
- **`/adjuntos/` es de solo lectura y su fila en `permisosDe` es INCONDICIONAL**: sin ella, un
  `write_file` con la carpeta sin montar escribe un fichero DEL PROYECTO con el nombre de algo
  «adjuntado».
- **Las tools propias son DOS, y contestan preguntas distintas.** La búsqueda regex
  (`agent/grafo/busquedaRegex.ts`, acotada por `LIMITES_REGEX`) busca TEXTO; `xone_navegacion`
  (`agent/grafo/navegacionXone.ts`) contesta sobre el MODELO ya resuelto: qué colecciones hay,
  dónde se declara una o un campo, quién la referencia (`mapcol`, `mapfld`, `linkedfield`,
  `contents`, `inherits`), qué campos tiene. Las dos **re-aplican `puedeLeerRuta` a mano**: una
  tool de LangChain añadida por xonecode **no pasa por el middleware de permisos**.
- **Y una tercera, de red y de LECTURA, para quien no tiene los assets: `buscar_icono`**
  (`agent/grafo/buscarIcono.ts`, IXCODE-18). Busca en Iconify y devuelve el SVG; **no escribe**: un
  SVG es texto y lo escribe `write_file` con su aprobación de siempre, así que no hay una segunda
  puerta al proyecto. La red entra por `IconosPort` (`core/ports.ts`, doble `IconosEnMemoria`) y
  sin puerto no se monta. Va a quien escribe el proyecto entero (`recibeBuscarIcono`, regla de
  dato: `designer-xone` y `developer-xone`) y solo a `motor: "modelo"`. **El color es un
  hexadecimal EXPLÍCITO y la altura en píxeles, siempre** (`core/iconos.ts`): sin ellos Iconify
  devuelve `currentColor` y `1em`, que XOne no documenta, y un icono mal tintado no da error. **Sin
  red la tool lo dice y no devuelve un SVG**; el rechazo se DEVUELVE, nunca se lanza. Límite
  declarado: el modelo reteclea el `path` al escribirlo.
- **Y las FUENTES de la maqueta, de Google Fonts y sin clave: `buscar_fuente` y `traer_fuente`**
  (`agent/grafo/fuentesDeGoogle.ts`, `core/fuentes.ts`, `FuentesPort` con su doble `FuentesEnMemoria`), solo en TrueForge
  y a quien puede dejar el `.ttf` en `fonts/` (`recibeFuentes`: el desarrollador y el diseñador; la ficha se la encarga al
  diseñador, que hace los recursos). La primera LEE el catálogo, pedido una vez por puerto (es AJENO; «no cachear» habla del
  modelo del proyecto). La segunda **ESCRIBE un binario y pasa por la aprobación por NOMBRE** (`PROPIAS_QUE_ESCRIBEN`), con
  la tarjeta de `[fichero binario]`, como `incorporar_adjunto`, cuyas guardas de disco reutiliza (`motivoDeDestinoEnDisco`).
  **El destino lo decide el CÓDIGO**: `file_path` va en la entrada porque es la clave de la tarjeta y del modo autónomo,
  pero solo vale `rutaDeFuente(familia, peso, cursiva)`, la convención de los estáticos de Google (`Inter-Bold.ttf`).
  El fichero es el `.ttf` ESTÁTICO de un peso que da la API `css2` a un cliente sin navegador, solo de `fonts.gstatic.com`,
  con la firma TrueType comprobada y tope. Con el puerto, los textos del bucle dejan de dar la tipografía por
  irreproducible. **Límite declarado**: llega al aparato DESPLEGANDO entero (la recarga no lleva `fonts/`), y la tool lo dice.
- **Y una cuarta, pura y sin red: `generar_fondo_svg`** (`agent/grafo/generarFondoSvg.ts`,
  `core/fondosSvg.ts`): fondos SVG de degradado, sombra y resplandor para `imgbk`, porque XOne no
  los trae. Va a los mismos especialistas que `buscar_icono` y, al no tener puerto, se monta siempre.
  **Un frame lo usa por `imgbk`, un BOTÓN por `img`: en un `type="B"` `imgbk` se ignora** (medido), y
  un icono en el `img` de un botón se estira, así que el icono va en un `type="IMG"` aparte. Las
  medidas entran como se declaran en el XML (el ancho en porcentaje, el alto en `p`) y son una
  estimación sobre un aparato de referencia.
  **Nada de `<filter>`: XOne los ignora en silencio** (medido); la sombra son rectángulos apilados y
  el resplandor un degradado que acaba transparente. **La esquina se DIBUJA en el SVG**, porque
  `border-corner-radius` no recorta el fondo, así que la tool pide el ancho y el alto del control y
  el `viewBox` lleva su proporción. **Los colores entran como en XOne (`#AARRGGBB`, alfa PRIMERO) y
  se convierten** a `#RRGGBB` más opacidad: pasarlos como `#RRGGBBAA` de HTML los leería mal sin
  error. Solo lee: el SVG lo escribe `write_file` con su aprobación.
- **Y una quinta, de lectura y DETERMINISTA, solo en TrueForge: `comparar_capturas`**
  (`agent/grafo/compararCapturas.ts`, `core/compararCapturas.ts`): mide la ESTRUCTURA de una captura
  contra una maqueta con aritmética de píxeles —dónde hay contenido por franjas del alto y del
  ancho y hasta dónde llega—, sin modelo y sin necesitar visión. Existe por un turno real en el que
  el agente cerró diciendo «sin recorte» mientras el teclado ocupaba un tercio de la pantalla y
  descartó como «no fiable» al crítico visual, que tenía razón: dos opiniones y ninguna cifra. Es
  **la otra mitad de `xone_critica_visual`, no su sustituta**: no ve texto cortado, ni el estilo de
  las formas, ni colores, y **no cuenta teclas** (no es fiable), y su informe lo dice siempre. Va al
  raíz y solo con carpeta de artefactos, con las MISMAS guardas que el crítico: las dos rutas bajo
  `/artefactos/`, comprobadas ANTES de abrir ninguna. `core/` no decodifica imágenes:
  `agent/dispositivos/decodificarImagen.ts` (`pngjs`, `jpeg-js`) las saca a píxeles y **comprueba
  las dimensiones ANTES de descomprimir**, contra una bomba de descompresión. De un error de lectura
  solo cruza su `code`.
- **Y una sexta, `diferencia_de_capturas`, solo en TrueForge y para quien EJECUTA**
  (`agent/grafo/diferenciaDeCapturas.ts`, `core/compararCapturas.ts#medirCambio`): dice si una ZONA
  de la pantalla cambió entre dos capturas de la misma app, con el porcentaje y dónde. Sustituye a lo
  que el conductor escribía a mano en cada pasada (scripts de imagen y comparaciones de `md5`): un
  `md5` igual solo dice que TODA la imagen es igual, y uno distinto puede ser un cursor parpadeando.
  Va al conductor y no al orquestador porque comprueba una ACCIÓN suya (¿mi toque tuvo efecto?), no
  juzga una pantalla. Con las mismas guardas de ruta, y un «igual» da las DOS explicaciones posibles
  (no se repinta, o la captura fue antes del repintado) sin decidir entre ellas.
- **El crítico visual MIDE la geometría antes de opinar** (`core/geometriaDePantalla.ts` puro,
  `agent/dispositivos/cajasDeMaqueta.ts`, dentro de `xone_critica_visual`): compara CAJAS, no píxeles.
  Las del aparato las guarda la captura en el MISMO comando (`skills/xone-hotswap/lib/geometria.mjs`,
  `<captura>.geometria.json` en `/hotswap/`, árbol + barras de `dumpsys window`), emparejadas por
  NOMBRE y nunca por fecha (`geometriaEnDisco.ts`, la regla del nombre atada por test a la del
  script); **y si se renombró o convirtió** (`sips … --out menu.png`), por los PÍXELES de la captura original que
  nombra cada geometría (`geometriaPorContenido`: casi idénticos, y la más parecida), nunca por la fecha. Las de la maqueta salen de renderizar su `code.html` en un Chrome sin ventana, dentro de un
  iframe de su tamaño EXACTO (no baja de 500 px) y sin `--allow-file-access-from-files` (el medidor va
  dentro de la copia y devuelve por `postMessage`); una maqueta sin sus estilos NO da cajas. **Lo que se mide son los
  TEXTOS, no los botones** (`cajasDeMaqueta.ts#medirElementos`): un botón de un solo texto es un elemento con su caja
  (una tecla), uno con varios (una tarjeta) se parte, y lo de fuera de los botones también entra; cada uno dice si es
  botón. Lo que no lo es y no tiene letras es un DATO de ejemplo y no falta; un texto que cae dentro de una imagen del
  aparato está DIBUJADO en ella (un logo) y no falta; y la alineación solo se compara con caja propia. **Y la PROPORCIÓN, solo de un botón**: la caja de un texto suelto o de una tarjeta es lo que ocupan
  sus letras, y en XOne la etiqueta ocupa su ancho asignado (medido en Maset: tres títulos «aplastados» costaron otra vuelta). La función se
  inyecta con `toString()`, y bajo `tsx` esbuild mete `__name(…)`: el script lo define, o la medida no vuelve. Un
  BLOQUEANTE (tapado por una barra, fuera de pantalla) fuerza el rojo aunque el modelo diga verde. Lo
  medido y lo opinado van SEPARADOS, y al modelo se le pasan los hechos para que se centre en lo que
  solo se VE. **Una maqueta que es solo un PNG** mide solo el aparato y lo dice. **Límites
  declarados**: solo Android, y `medidaAutomatica.ts` no la usa.
- **Y el ESTILO de cada control también se MIDE, en sus píxeles** (`core/estiloMedido.ts`, puro; la
  comparación en `core/descripcionDePantalla.ts`): forma (radio y proporción), fondo, color del texto,
  altura de la letra, borde, alineación y texto RECORTADO, en las cajas del árbol (captura) y del
  `code.html` (maqueta), con el MISMO esquema para las dos y comparado por CÓDIGO, control a control
  y agrupado por diferencia. Con `code.html` su rojo es rojo; sin él, se miden los recortes de la captura.
  **Y con maqueta el modelo MIRA siempre, las dos imágenes juntas, con un MÉTODO** (`core/metodoDeComparacionVisual.ts`:
  inventario de la maqueta pieza a pieza, cada una comparada en un orden fijo —está, texto, posición y alineación,
  tamaño, forma y sombras, color y letra—, y lo que sobra), en `PASADAS_DE_COMPARACION` pasadas a la vez cuyas
  observaciones se JUNTAN sin repetidas (`unirObservaciones`, regla de código). Medido en Maset (MAS-3): con `code.html`
  no se le preguntaba y el crítico solo vio la tarjeta que faltaba; con el método, DeepSeek flash vio contadores que no se
  pintan, flechas desalineadas, tarjetas más altas y el icono pegado al texto, y una sola pasada variaba de 4 a 8
  diferencias. Lo que dice va aparte, como OPINIÓN; el mismo método se le da al desarrollador en Claude Code que compara él
  (`textoDeTrabajoSinLlamar`). **Y una cifra junto a una etiqueta que SÍ está en el aparato es un CONTADOR que no se
  pinta**, no un dato de ejemplo (`geometriaDePantalla.ts`, `VECINDAD_DE_CONTADOR`). Salvo que junto a la pareja de esa etiqueta en el aparato
  haya OTRA cifra: se pinta con otro valor (medido: «51» sobre «pend.» salía como «no se pinta» y costó una comprobación). **No se describe la captura con
  el modelo**: medido, la misma imagen descrita otra vez difería y no vio el recorte.
  Un texto distinto en el mismo sitio MEDIDO —palabra con palabra, nunca una cifra— es otro estado o una TRADUCCIÓN
  (la maqueta de Stitch viene en inglés): va como NOTA y no pone el rojo, ni en el estilo ni en la geometría, donde antes
  era BLOQUEANTE («NO está en el aparato»); su caja y su estilo se siguen comparando. **Con `code.html` la maqueta no se
  describe con un modelo**: el bloque que vigilaba imagen contra HTML no decidía nada, costaba una llamada y se equivocaba. El recorte solo se mide
  en lo que no pinta fondo propio. El informe se guarda junto a la captura (`.critica.txt`), y un
  rojo va a `developer-xone`: el diseñador solo escribe en `icons/` y `fonts/`. **Y el ENCAJE y los BLOQUES**:
  dónde empieza y acaba cada fila en fracción del ancho (`ENCAJE`), y el color y la forma de los
  bloques anchos —cabecera, visor, panel— emparejados por altura relativa (`compararBloques`, solo
  lo emparejado: el aparato puede partir en filas lo que la maqueta tiene en un panel). **La foto de
  UN control no lleva geometría** (`esCapturaDeUnControl`): sus cajas serían las de la pantalla. **Y el TAMAÑO de cada IMAGEN
  respecto a su pantalla** (`geometriaDePantalla.ts`, `FACTOR_DE_TAMAÑO_DE_IMAGEN`): el tamaño relativo a las vecinas de
  fila no veía unos iconos todos igual de pequeños (Maset); las que cambian lo mismo salen en UNA diferencia, nunca
  bloqueante.
- **Y una séptima, de lectura, pura y sin llamar a nadie: `validar_fichero_xone`**
  (`agent/grafo/validarFicheroXone.ts`), solo en TrueForge y a TODOS, el raíz incluido. Comprueba un
  fichero —o todos los de una carpeta— con el comprobador puro de su extensión: `.xne`/`.xml` bien formado
  (`core/xmlBienFormado.ts`), la ESTRUCTURA de un `.css` con la gramática de la skill, comentarios `//`
  incluidos (`core/cssBienFormado.ts`), y un `.js` que pueda leer Rhino (`core/jsParaRhino.ts`: `acorn` a
  ES2015 más la rodaja medida que al motor le falta, nunca `new Function`). Ni simulador ni linter ni red.
  Existe por dos turnos de soporte: la persona pegó un error de parsing y el agente releyó a ojo ficheros
  que estaban bien. Su descripción dice qué significa «está bien» frente a un error que alguien ha visto:
  viene de OTRA copia (Studio tras una subida, el aparato). **Es prudente a propósito**: solo marca lo que
  rompe el parser; qué atributos o propiedades existen es de `xone_atributos`. Lee por el backend y reaplica
  `puedeLeerRuta` a mano.
- **Y una octava, pura y de LECTURA, solo en TrueForge: `convertir_a_p`** (`agent/motores/trueforge/convertirAP.ts`,
  `core/convertirAP.ts`): las medidas de una maqueta (px CSS) a la `p` de XOne, con la cuenta de la skill
  (`px × resolution-width / ancho de la maqueta`). Existe porque, medido en Maset, el agente copió los px como `p` y los
  iconos salieron unas 2,6 veces menores, con la regla escrita en la skill. **Los dos datos de la cuenta no los pone el
  modelo**: el `resolution-width` se lee del `app.xml` de la RAÍZ (fijada al construir) y el ancho de la maqueta, de su
  imagen (`buscarMaqueta`), y solo cuando la imagen no lo deja claro lo da él (`ancho_maqueta`). **Lo que no se sabe no
  se adivina**: sin `resolution-width`, o con `-1`, no convierte y lo dice; una imagen que no mide un ancho de móvil en
  px CSS (una a 2×) tampoco, y da sus divisiones. Va a quien recibe `buscar_icono`, con la línea de CUÁNDO usarla junto
  a su lista de tools (`USO_DE_CONVERTIR_A_P`), por lo mismo que `xone_atributos`.
- **Y lo APRENDIDO de un encargo llega a los siguientes** (`core/aprendido.ts`, `agent/grafo/aprendido.ts`, tool
  `apuntar_aprendizaje`): cómo entrar en la app, qué pulsar para llegar a una pantalla, una trampa. Lo apuntan el
  orquestador y quien trabaja (`recibeNucleoDeTrabajo`) en `.xonecode/aprendido.json`, **sin aprobación** (memoria del
  agente, no un fichero de la app; el mismo tema se sustituye, con tope), y **el harness lo pone delante** de cada encargo
  —el prompt del raíz, el de cada hijo y las instrucciones de un hijo externo, que en lugar de la tool lo cuenta en un
  apartado «Aprendido:» para que lo apunte el orquestador—. Medido en Maset: cada encargo redescubría el usuario con que
  se entra. **Puede llevar una contraseña**: el fichero es 0600, de la línea del chat solo sale el tema, y no viaja en un
  paquete de soporte (`SECRETOS_QUE_NO_VIAJAN`). Límite declarado: el raíz lo lee al abrir la sesión.
- **Lo que quien ESCRIBE tiene que saber va en el cuerpo del developer y del designer, no en
  `REGLAS_XONE`** (`ESCRIBIR_XONE_SIN_ROMPER`, `agent/subagentes/agentesEnDisco.ts`): un comentario
  XML no admite `--`, un `L`/`TL` pinta su `title`, `elevation` recorta un fondo redondeado, un botón
  usa `img` y no `imgbk`, y una edición por fichero y ronda. Va ahí porque `REGLAS_XONE` llega al
  consultor y al analista, que no escriben, y porque viaja en cada llamada. Se acompaña de dos cosas
  del plan: `TASKS.md` lleva una sección `## Hallazgos`, porque cada sesión empieza sin memoria, y un
  diseño se destila una vez en `DISENO.md`.
- **`xone_navegacion` existe por una medida, no por completitud**: contestar «¿qué colecciones
  tiene el proyecto?» leyendo ficheros es mucho más caro que contestarla desde el modelo. Cuatro
  reglas: **el reparto** — la semántica de XOne la pone `xone-linter` como LIBRERÍA
  (`CrossReferenceRule` ya define `mapcol`); **el import es PROFUNDO**
  (`xone-linter/dist/project/XoneProject.js`, el barril arrastra un *top-level await* que revienta
  bajo `tsx`); **la raíz se fija al construir y NO entra por parámetro de la tool** (o sería una
  tool que lee cualquier carpeta de la máquina); y **no cachea** (un índice viejo que afirma que
  un campo existe es peor que no tener índice). Las rutas se traducen a VIRTUALES y se filtran EN
  LA FUENTE (`agent/navegacion/modeloDeProyecto.ts`): lo que el agente no puede abrir no entra en
  el índice.
- **Siete operaciones**: `app` (por dónde arranca, login, estilos), `detalle` (campos, eventos,
  nodos, conexiones), `problemas` (referencias a una colección que no existe), y **referencias de
  SCRIPT** — una app XOne navega con `onclick="javascript:appData.getCollection('X')…"` y no con
  `mapcol`, así que sin ellas «¿quién usa Deportes?» contestaba «nadie» con botones apuntándole. Es
  un PATRÓN con literal, no «el nombre aparece en el texto». **Límites declarados**: no ve un
  `getCollection(variable)` ni dice en qué LÍNEA está, y la descripción de la tool lo dice.
- **Hay una SEGUNDA señal, más floja, MARCADA aparte** (`por: "mencion"` frente a `por:
  "script"`): la cadena real puede tener varios saltos (`method="ExecuteNode(abrirColl('X'))"` → un
  nodo con `<param>` → `irColl(coll)` → `getCollection(collname)`), y el nombre solo aparece como
  literal en el primero. Perseguir la cadena ataría esto a los ayudantes de UN proyecto; lo que se
  reconoce es un literal que COINCIDE con una colección del inventario. Se marcan distinto porque
  la confianza es distinta. El atributo `method` se mira, y una colección que se nombra a SÍ MISMA
  no cuenta.
- **Cuando NO sabe contestar, devuelve la llamada a `regex_search` HECHA** — no un consejo. Pasa en
  los cinco callejones sin resultado. El caso que lo justifica: «nadie la referencia» es una
  afirmación fuerte que este índice no puede sostener (no ve un nombre calculado en JavaScript), así
  que el vacío va con «NO concluyas que no se usa» y el siguiente paso ya escrito. El nombre de la
  otra tool sale de una constante (`NOMBRE_BUSQUEDA_REGEX`) y la llamada se valida contra su
  ESQUEMA REAL en el test. Cuando sí encuentra, no manda a ningún sitio.
- **Lo que NO hay, y se midió antes de descartarlo: «colecciones huérfanas»**. Se implementó y se
  tiró: sobre un proyecto real la proporción de falsos positivos era tan alta que la lista no es
  un hallazgo, y con las referencias de script dentro seguía siendo la mitad del proyecto.
- **Va a los cinco especialistas Y al orquestador**, decidido por una MEDIDA que tumbó lo
  contrario (`xoneAgent.navegacion.test.ts`): negada al orquestador con el argumento de que
  delega, medido sobre un proyecto real **no delegó** — la contestó él con `ls`/`glob`/`grep`/
  `read_file` porque la tool no estaba disponible. No le abre nada nuevo; cambia el precio de
  orientarse. A un subagente de motor EXTERNO no puede llegar: corre en otro proceso.
- `.xonecode/memoria.md` se ve por UNA ruta virtual, `/MEMORIA_PROYECTO.md` (Proxy en
  `agent/grafo/memoriaDeProyecto.ts`); la carpeta sigue denegada entera y escribir la memoria pasa
  por la aprobación de siempre. El resumen de contexto usa umbrales **fijados a mano** (32k para
  disparar, 8k de reciente): deepagents asume 170k y con Ollama comprime demasiado tarde.
