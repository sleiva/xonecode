# El agente y lo que puede escribir

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# El agente, y lo único que puede escribir

`agent/grafo/xoneAgent.ts`: un orquestador que delega en los especialistas de `core/agentes.ts`.
Cinco cosas no son negociables:

- **Orquestador de SOLO LECTURA por PERMISOS, no por falta de tools** (`PERFIL_DEL_ORQUESTADOR`;
  `xoneAgent.orquestador.test.ts`).
- **`FilesystemBackend` con `virtualMode: true`.** Shell en exactamente UNO, declarado en su `.md`
  (`ejecucion`): `virtualMode` no confina comandos, y deepagents LANZA con `permissions` + backend ejecutable.
- **Permisos con `permisosDe(perfil)`, NUNCA a mano**: `SubAgent.permissions` reemplaza los del
  padre y se perdería la denegación de `/.env`, `/.git` y `/.xonecode`.
- **`SubAgent.tools` lleva SOLO tools propias**: las de fichero las monta `createFilesystemMiddleware`
  y las acota `permissions`.
- **HITL por NOMBRE en `write_file`, `edit_file`, `incorporar_adjunto`** y, en TrueForge, `traer_fuente`
  (`PROPIAS_QUE_ESCRIBEN`). Las dos binarias enseñan `[fichero binario]` en vez de diff.

Y las guardas del proyecto:

- **Vistas aplanadas** (`X.xml` junto a `X.xne`) retiradas con un Proxy (`agent/grafo/proyecto.ts`): regla
  del proyecto, no del prompt.
- **Un texto del proyecto se lee y escribe en la codificación que YA tenía o que DECLARA**
  (`agent/grafo/codificacionDelProyecto.ts`, envoltorio MÁS interno de `backendDeAgente`; regla única de
  `core/codificacion.ts#codificacionParaEscribir`): no-UTF-8 sigue en 8 bits; UTF-8 con tildes sigue
  UTF-8; ASCII puro o fichero NUEVO siguen el `encoding=` del prólogo. **Tabla por declaración y en las
  DOS direcciones**: ISO-8859-15 si se declara, si no windows-1252 (Ficheros, guardado, agente, `readRaw`
  de `regex_search`, marcas). Un carácter que no cabe se DEVUELVE como error, tras la aprobación. Va
  dentro de `sinContenidoInvalido` y de `enSerie`. **El ANTES de la tarjeta se decodifica igual**
  (`decodificarComoTexto`, ambos motores y externos). **Límites**: `grep`/`glob`/`xone_navegacion` en
  UTF-8; los motores externos escriben con sus tools. **Claude Code solo escribe UTF-8**: el HIJO
  convierte con `xone-a-utf8` (`comandoExterno.ts#TEXTO_DE_A_UTF8`, solo si el script es suyo).
- **Un rechazo de guarda se DEVUELVE como `{error}`, nunca se lanza** (`sinVistasAplanadas`,
  `sinArtefactosEnElProyecto`, `sinDescargasEnElProyecto`; `proyecto.test.ts` contra la librería real).
- **Dos escrituras al MISMO fichero no se solapan** (`core/serieDeEscrituras.ts`,
  `agent/grafo/escriturasEnSerie.ts`): serializar basta, se relee y rebusca el ancla. **UNA vez, por fuera
  de TODO lo montado** (`backendDeAgente#enSerie`, para que `/artefactos/`/`/planes/` la hereden) y por
  fuera de `sinContenidoInvalido`. Solo `write`/`edit`; probado contra el backend REAL. **Excepción:
  `incorporar_adjunto`** va directo al disco, sin cola.
- **`/artefactos/` → `.xonecode/sesiones/<id>/artefactos/`**: escribible **sin aprobación**, anunciado con el
  evento `artefacto` (nunca contenido). `esRutaDeArtefacto` es lista BLANCA de forma. No se crea al montar.
  Tope propio de rondas.
- **Excepción: la carpeta SE CREA antes de un comando** (`proyecto.ts#anunciarArtefactosDeLaShell`, solo con
  `ejecucion`). Los scripts que el prompt NOMBRA se comprueban contra el catálogo real, en las dos
  direcciones y con bit de ejecución.
- **Un artefacto no acaba en el proyecto, por código**: `artefactoFueraDeSitio` (`core/artefactos.ts`). El
  `when` de `seDetieneEn` (`perfiles.ts`) usa la MISMA función (`perfiles.test.ts`).
- **`/large_tool_results/` y `/conversation_history/`** los escribe deepagents directo al backend: montados
  junto a artefactos (`backendConDescargas`); falla CERRADO si el montaje falta.
- **`/hotswap/`** (`core/hotswap.ts`, `backendConHotswap`, `XONECODE_HOTSWAP`): lo que una SHELL saca del
  contexto. El reparto lo decide el LECTOR (captura → `/artefactos/` para `capturasDelTurno`; árbol de
  controles → aquí). HERMANA de artefactos, no subcarpeta. El script nombra la ruta virtual.
- **`/skills/` con barra final** (`CompositeBackend` la retira) y `permisosDe` deniega `write`.
- **Skills del USUARIO bajo esa ruta, una a una** (`proyecto.ts#backendConSkills`, `agent/grafo/skills.ts`):
  paquete, `~/.xonecode/skills/` y proyecto (gana el proyecto). Se apoya en que `CompositeBackend` ordena
  por LONGITUD (`proyecto.test.ts`). **Límites**: `ls /skills` enseña solo las de serie; `SkillsEnDisco` no
  cachea y `skillsMontables` se lee al construir (`turnoReal.ts#construir`), así que una skill nueva no
  alcanza a la sesión abierta.
- **Una skill de serie no se edita: se COPIA** (`arranque.ts#atenderSkill`, `core/skills.ts`); sin
  `.semilla.json`. Barrera en el SERVIDOR; nombre SLUG (`motivoDeNombreInaceptable`) al guardar; destino
  existente es NO; renombrar es `renameSync` y luego escribir. El `cuerpo` de serie se pide (`cuerpoDeSkill`).
- **Se INSTALAN desde `.zip`** (`core/zipDeSkill.ts`, `skills.ts#instalarSkillDesdeZip`, `POST /skill`; bytes
  por HTTP). Regla PURA: lista BLANCA de forma por ruta (no `includes("..")`), tres topes anti-BOMBA,
  `SKILL.md` obligatorio; se decide entero ANTES de escribir; una entrada mala tumba el zip.
- **A un motor EXTERNO las skills le llegan por SU palanca, nunca por `/skills/`**: Claude Code por
  `plugins` (`agent/subagentes/pluginDeSkills.ts`; `additionalDirectories` NO vale), OpenCode por
  `skills.paths`. Nada dentro del proyecto. **Codex fuera**.
- **`Skill` está en la lista de LECTURA de los externos.** El hijo de Claude Code ve **SOLO las skills de su
  `.md` y ningún MCP** (`skillsVisiblesDelHijo`, `xonecode:<nombre>`, `strictMcpConfig`): omitir `skills`
  NO es «off». **Lee la carpeta entera de cada skill montada** (`references/`;
  `pluginDeSkills.ts#carpetasDeLecturaDeSkills` vía `lecturasDelHijo`), por enlace y ruta real, nada más.
  **Límites**: un `Bash` que pida una skill se deniega (salvo sus scripts); OpenCode sigue con
  `external_directory: "deny"`. `promptDeAgente` la nombra sin prefijo.
- **Las skills de un subagente se MARCAN de una lista** (`Agentes.tsx#SkillsDelAgente`; `repartirSkills` →
  `faltan`). Una declarada que falta se pinta señalada; sin catálogo, campo de texto.
- **Lo comprobado en el aparato se marca en el plan** (`agent/grafo/marcarCriteriosDelPlan.ts`,
  `core/tareasDelPlan.ts#marcarCriterios`): solo `- [ ]`→`- [x]` en UNA tarea, a quien trabaja tareas
  (`recibeMarcarCriterios`), con guarda de slug y enlace a mano. **TAREA A TAREA** (`TRABAJAR_CON_PLAN`);
  `TASKS.md` no se reescribe entero. Alguna casilla = `implementada`; todas = FINALIZADA (`progresoDeTarea`);
  estado por su PRIMERA palabra. **Límite**: sin la cola de `escriturasEnSerie`.
- **`/adjuntos/` de solo lectura, fila INCONDICIONAL en `permisosDe`**: sin ella se escribiría en el proyecto.

## Tools propias

Todas **reaplican `puedeLeerRuta` a mano** (una tool de xonecode no pasa por el middleware de permisos) y
**devuelven** sus rechazos.

- **`regex_search`** (`busquedaRegex.ts`, `LIMITES_REGEX`) busca TEXTO; **`xone_navegacion`**
  (`navegacionXone.ts`) contesta sobre el MODELO resuelto (colecciones, declaraciones, `mapcol`, `mapfld`,
  `linkedfield`, `contents`, `inherits`).
- **`buscar_icono`** (`buscarIcono.ts`): red por `IconosPort` (doble `IconosEnMemoria`, sin puerto no se
  monta), **no escribe** (lo hace `write_file`). A `recibeBuscarIcono` y solo `motor: "modelo"`. **Color hex
  EXPLÍCITO y altura en píxeles siempre** (`core/iconos.ts`). Sin red lo dice y no devuelve SVG. Límite: el modelo reteclea el `path`.
- **`buscar_fuente` / `traer_fuente`** (`fuentesDeGoogle.ts`, `core/fuentes.ts`, `FuentesPort`/`FuentesEnMemoria`),
  solo TrueForge, a `recibeFuentes`. El catálogo (AJENO) se pide una vez por puerto. `traer_fuente` **ESCRIBE y pasa por la aprobación por NOMBRE**,
  reutiliza `motivoDeDestinoEnDisco`. **El destino lo decide el CÓDIGO** (`rutaDeFuente`). `.ttf` estático de
  `css2`, solo `fonts.gstatic.com`, firma TrueType y tope. **Límite**: llega al aparato solo DESPLEGANDO.
- **`generar_fondo_svg`** (`generarFondoSvg.ts`, `core/fondosSvg.ts`), pura, siempre montada. **Frame por
  `imgbk`, BOTÓN por `img`** (en `type="B"` `imgbk` se ignora); un icono va en `type="IMG"` aparte. **Sin
  `<filter>`** (XOne los ignora). **La esquina se DIBUJA**. **Colores `#AARRGGBB` (alfa PRIMERO) convertidos**. Medidas como en el XML (ancho en porcentaje, alto en `p`).
- **`comparar_capturas`** (`compararCapturas.ts`, `core/compararCapturas.ts`), solo TrueForge, al raíz:
  ESTRUCTURA por aritmética de píxeles, sin modelo (no ve texto cortado, forma ni color; **no cuenta teclas**); **la otra mitad de `xone_critica_visual`, no su sustituta**, y el
  informe lo dice. Rutas bajo `/artefactos/` comprobadas ANTES de abrir. `decodificarImagen.ts` **comprueba
  dimensiones ANTES de descomprimir**. De un error solo cruza el `code`. **Una LISTA no exige lo vertical**
  (`Comparacion.lista`, `filasDeLista`: controles repetidos en la geometría de la captura): ni distancia vertical
  ni borde de abajo, y lo horizontal por su FORMA. La misma regla en la medida automática (`cumpleElCriterio`).
- **`diferencia_de_capturas`** (`diferenciaDeCapturas.ts`, `#medirCambio`), solo TrueForge, a quien EJECUTA:
  ¿cambió una ZONA? Un «igual» da las DOS explicaciones sin decidir.
- **El crítico visual MIDE antes de opinar** (`core/geometriaDePantalla.ts`, `cajasDeMaqueta.ts`, dentro de
  `xone_critica_visual`): compara CAJAS. Las del aparato, del MISMO comando
  (`skills/xone-hotswap/lib/geometria.mjs` → `<captura>.geometria.json` en `/hotswap/`, árbol + barras de `dumpsys window`), emparejadas por
  NOMBRE (`geometriaEnDisco.ts`, atada por test al script) o por PÍXELES si se renombró
  (`geometriaPorContenido`), nunca por fecha. Las de la maqueta, de su `code.html` en Chrome sin ventana,
  iframe de tamaño EXACTO (no baja de 500 px), sin `--allow-file-access-from-files` (`postMessage`). **Se miden TEXTOS, no
  botones** (`#medirElementos`); un dato de ejemplo o un texto dibujado en una imagen no falta.
  **PROPORCIÓN solo de un botón.** Bajo `tsx` esbuild mete `__name(…)`: el script lo define. Un
  BLOQUEANTE fuerza el rojo. Medido y opinado SEPARADOS. Maqueta solo PNG: mide el aparato y lo dice.
  **Límites**: solo Android; `medidaAutomatica.ts` no la usa.
- **El ESTILO también se MIDE en píxeles** (`core/estiloMedido.ts`, `core/descripcionDePantalla.ts`), mismo
  esquema en captura y maqueta, comparado por CÓDIGO. **Con maqueta el modelo MIRA siempre con un MÉTODO**
  (`core/metodoDeComparacionVisual.ts`), en `PASADAS_DE_COMPARACION` pasadas unidas (`unirObservaciones`),
  como OPINIÓN; el mismo método va a Claude Code (`textoDeTrabajoSinLlamar`). **Cifra junto a etiqueta
  presente = CONTADOR que no se pinta** (`VECINDAD_DE_CONTADOR`), salvo otra cifra junto a su pareja.
  **No se describe la captura con el modelo**, ni la maqueta con `code.html`. Texto distinto en el mismo
  sitio = estado o TRADUCCIÓN: NOTA, no rojo. **Texto de la maqueta DENTRO de otro del aparato no falta**
  (`contieneTexto`, en los dos emparejamientos): una NOTA por control. **Los VALORES de la maqueta son de ejemplo**
  (versiones, cifras, un campo relleno): el método no los señala; su SITIO vacío, sí. Un texto que FALTA y
  `pareceDatoDeEjemplo` (código con cifras, contador, nombres en lista) es nota, no bloqueante. **El informe abre con un
  RESUMEN contado de su propio cuerpo** (`resumenDelInforme`): es lo que lee el juez. **Con maqueta, el veredicto
  responde a «¿respeta el diseño?»**: rojo solo por un bloqueante medido, un texto que falta o recortado, o una
  diferencia de DISEÑO que vieron las DOS miradas (`confirmadas`); el resto son DETALLES y no ponen rojo. La frontera,
  en el método (forma de CATEGORÍA, color de lo IMPORTANTE, disposición, un BORDE que la maqueta no tiene; el GRADO y el
  tono son detalle), que busca los SOBRANTES a propósito. Un dato de ejemplo con otras cifras no FALTA (`pareceDatoDeEjemplo`,
  también en la comparación descrita). **Lo medido del ESTILO no
  pone rojo** (`hayQueArreglar`: falsos positivos medidos), y un texto que EMPIEZA donde otro de la maqueta es «otro
  texto en su sitio», no un bloqueante. **Sin `referencia` y con maqueta en la sesión, compara contra la más parecida**
  (`maquetaDeLaSesion`, la misma elección que la medida automática) y lo dice: un verde sin comparar no es «respeta». Recorte solo sin fondo propio. Informe en `.critica.txt`; un
  rojo va a `developer-xone` (el diseñador solo escribe en `icons/` y `fonts/`). **ENCAJE y BLOQUES** (`ENCAJE`, `compararBloques`, solo lo emparejado). Foto de
  UN control sin geometría (`esCapturaDeUnControl`). **Tamaño de IMAGEN respecto a su pantalla**
  (`FACTOR_DE_TAMAÑO_DE_IMAGEN`), nunca bloqueante.
- **`validar_fichero_xone`** (`validarFicheroXone.ts`), solo TrueForge, a TODOS: `.xne`/`.xml`
  (`core/xmlBienFormado.ts`), `.css` (`core/cssBienFormado.ts`), `.js` para Rhino (`core/jsParaRhino.ts`,
  `acorn`, nunca `new Function`). Sin simulador, linter ni red. **Prudente**: solo lo que rompe el parser;
  atributos son de `xone_atributos` (varios en UNA llamada con `atributos`).
- **`convertir_a_p`** (`agent/motores/trueforge/convertirAP.ts`, `core/convertirAP.ts`), solo TrueForge: px
  CSS → `p`. **Los datos no los pone el modelo**: `resolution-width` del `app.xml` RAÍZ y ancho de la
  imagen (`buscarMaqueta`; `ancho_maqueta` si no queda claro). **Lo que no se sabe no se adivina** (sin
  `resolution-width`, `-1` o imagen a 2×: no convierte). A quien recibe `buscar_icono`, con `USO_DE_CONVERTIR_A_P`.
- **Lo APRENDIDO llega a los siguientes encargos** (`core/aprendido.ts`, `agent/grafo/aprendido.ts`,
  `apuntar_aprendizaje`): orquestador y `recibeNucleoDeTrabajo`, en `.xonecode/aprendido.json`, **sin
  aprobación**, tema sustituido, con tope; **el harness lo pone delante** (raíz, hijos, externos vía
  «Aprendido:»). **Puede llevar contraseña**: 0600, del chat solo el tema, fuera de soporte
  (`SECRETOS_QUE_NO_VIAJAN`). Límite: el raíz lo lee al abrir la sesión.
- **Lo que quien ESCRIBE debe saber va en developer y designer, no en `REGLAS_XONE`**
  (`ESCRIBIR_XONE_SIN_ROMPER`, `agentesEnDisco.ts`): `REGLAS_XONE` llega a quien no escribe y viaja en cada
  llamada. `TASKS.md` lleva `## Hallazgos`; el diseño se destila en `DISENO.md`.

## `xone_navegacion`

- **Existe por una medida**: orientarse desde el modelo es mucho más barato que leyendo ficheros. **La
  semántica la pone `xone-linter` como LIBRERÍA**; **import PROFUNDO**
  (`xone-linter/dist/project/XoneProject.js`: el barril trae un *top-level await* que revienta bajo `tsx`);
  **la raíz se fija al construir, no por parámetro**; **no cachea**. Rutas VIRTUALES filtradas EN LA FUENTE
  (`agent/navegacion/modeloDeProyecto.ts`).
- **Siete operaciones**, incluidas `app`, `detalle`, `problemas` y **referencias de SCRIPT**
  (`getCollection('X')` con literal). **Límites**: no ve `getCollection(variable)` ni la línea.
- **Segunda señal, MARCADA aparte** (`por: "mencion"` frente a `por: "script"`): literal que coincide con una
  colección del inventario; se mira `method`; la autorreferencia no cuenta.
- **Sin respuesta, devuelve la llamada a `regex_search` HECHA** (`NOMBRE_BUSQUEDA_REGEX`, validada contra su
  ESQUEMA REAL en test); el vacío lleva «NO concluyas que no se usa».
- **No hay «colecciones huérfanas»**: se probó y se tiró por falsos positivos.
- **Va a los cinco especialistas Y al orquestador** (`xoneAgent.navegacion.test.ts`). A un externo no llega.

`.xonecode/memoria.md` se ve solo como `/MEMORIA_PROYECTO.md` (Proxy, `memoriaDeProyecto.ts`); la carpeta sigue denegada y escribirla pasa
por la aprobación. El resumen de contexto usa umbrales **fijados a mano** (32k/8k): deepagents asume 170k.
