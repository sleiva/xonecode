# Índice completo de las referencias

> Referencia de `xone-development`. Sale del `SKILL.md` para que las reglas
> duras quepan en una lectura por omisión (100 líneas).

## Referencias

Lee el fichero que corresponda antes de responder sobre atributos concretos, valores admitidos o ejemplos.

### Fundamentos
- [fundamentos/plataforma-y-anatomia-de-proyecto.md](references/fundamentos/plataforma-y-anatomia-de-proyecto.md) — Qué es XOne, arquitectura, ciclo de vida colección/objeto/propiedad, sincronización, anatomía de carpetas y tipos de fichero
- [fundamentos/configuracion-app-xml-ini-mappings.md](references/fundamentos/configuracion-app-xml-ini-mappings.md) — `app.xml` atributo por atributo, `app.ini` y `mappings.xne`
- [fundamentos/conceptos-clave.md](references/fundamentos/conceptos-clave.md) — Colecciones, DataObject, props, `##PREF##`, macros del sistema, códigos de error y detalle de la sintaxis JS soportada
- [fundamentos/navegacion-convenciones-y-primer-proyecto.md](references/fundamentos/navegacion-convenciones-y-primer-proyecto.md) — Flujo Splash→Login→EntradaApp→Menu, convenciones de nombres y creación de un proyecto básico paso a paso
- [fundamentos/errores-comunes.md](references/fundamentos/errores-comunes.md) — Errores frecuentes al empezar y su corrección

### XML / UI
- [xml-ui/estructura-y-nodo-coll.md](references/xml-ui/estructura-y-nodo-coll.md) — Introducción a la UI y nodo `coll`: colecciones de datos vs especiales, valores de `progid`, `sql`, `loadall`
- [xml-ui/nodos-group-y-frame.md](references/xml-ui/nodos-group-y-frame.md) — `group` (fijos, drawer, tabs) y `frame` (flotantes, bottom sheet, flujo de layout y `newline`)
- [xml-ui/prop-atributos-y-condiciones.md](references/xml-ui/prop-atributos-y-condiciones.md) — Atributos comunes de `prop`, visibilidad completa, dimensiones, estilos inline, comportamiento, bordes, `disablevisible`/`disableedit`
- [xml-ui/prop-tipos-basicos.md](references/xml-ui/prop-tipos-basicos.md) — Props de texto, número, label, botón, checkbox, fecha/hora, imagen (con animaciones Lottie y GIF), foto (con foto en movimiento), vídeo y escáner
- [xml-ui/prop-tipos-listas-y-mapas.md](references/xml-ui/prop-tipos-listas-y-mapas.md) — Props de mapa, grid/lista, chips, kanban y coverflow
- [xml-ui/prop-tipos-combos-y-controles.md](references/xml-ui/prop-tipos-combos-y-controles.md) — Combos, web, slider, progress, stepper, OTP, markdown, navbar, password, adjunto, THTML, firma DR, `onchange`, `updates` y `formula`
- [xml-ui/contents-y-macros.md](references/xml-ui/contents-y-macros.md) — `contents` (vinculación, filtros dinámicos) y macros (sistema, `setMacro`/`getMacro`)
- [xml-ui/asfilter-visibilidad-eventos-y-macros.md](references/xml-ui/asfilter-visibilidad-eventos-y-macros.md) — `asfilter`, event handlers detallados, sistema de visibilidad y catálogo de macros del sistema
- [xml-ui/patrones-de-pantalla.md](references/xml-ui/patrones-de-pantalla.md) — Plantillas completas de pantalla: login, menú, lista con filtros, detalle, tabs, mapa, chat, dashboard, maestro-detalle, edición en línea, multi-selección
- [xml-ui/layouts-herencia-y-buenas-practicas.md](references/xml-ui/layouts-herencia-y-buenas-practicas.md) — Layouts responsive, modales, FAB, herencia con `inherits`, `include-layout`, checklist de validación y unicidad de nombres
- [xml-ui/atributos-coll-group-frame.md](references/xml-ui/atributos-coll-group-frame.md) — Cualquier atributo de `coll`, `group` o `frame` con tipo, valores y default
- [xml-ui/atributos-prop.md](references/xml-ui/atributos-prop.md) — Cualquier atributo de `prop`: colores por estado, bordes, entrada, multimedia, ML, `classid`, sliders, stepper, OTP, kanban, coverflow, chips
- [xml-ui/atributos-method-macro-script-event-app.md](references/xml-ui/atributos-method-macro-script-event-app.md) — Atributos de `method`, `macro`, `script`, `event`, `platform`, tipos y atributos globales de la app
- [xml-ui/mappings-y-colecciones-separadas.md](references/xml-ui/mappings-y-colecciones-separadas.md) — `mappings.xne` obligatorio y colecciones en archivos separados
- [xml-ui/mapas.md](references/xml-ui/mapas.md) — Mapas completos: atributos, eventos y API JavaScript del control
- [xml-ui/eventos-ciclo-de-vida-e-interaccion.md](references/xml-ui/eventos-ciclo-de-vida-e-interaccion.md) — Catálogo de eventos: ciclo de vida e interacción (`onclick`, `onchange`, `selecteditem`, `onlongpressitem`, `onback`)
- [xml-ui/eventos-sistema-login-y-personalizados.md](references/xml-ui/eventos-sistema-login-y-personalizados.md) — Eventos de drawer y bottom sheet, login, sistema (`onpushreceived`, `maintenance`, `sys-message`), ciclo de aplicación, inactividad, personalizados con `ExecuteNode` y acciones
- [xml-ui/errores-comunes-xml.md](references/xml-ui/errores-comunes-xml.md) — Errores comunes de XML y su corrección

### JavaScript
- [javascript/motor-js-y-contexto-de-ejecucion.md](references/javascript/motor-js-y-contexto-de-ejecucion.md) — Motor JS, cómo se ejecuta desde eventos XML, diferencias con JS web, ámbitos y persistencia de variables, escape XML/CDATA en `.xne`
- [javascript/self-y-dataobject.md](references/javascript/self-y-dataobject.md) — `self`: campos, `getOldValue`, `getOwnerCollection`, `getContents`, `setFieldPropertyValue`, `executeNode`, `save`, JSON y métodos de `DataCollection`
- [javascript/ui-navegacion-mensajes-y-vista.md](references/javascript/ui-navegacion-mensajes-y-vista.md) — `ui`: navegación, `msgBox`/`showToast`/`showSnackbar`, refresco y acceso a controles, showcase, date/time pickers
- [javascript/ui-gps-camara-y-multimedia.md](references/javascript/ui-gps-camara-y-multimedia.md) — `ui`: GPS completo, cámara (`startCamera` con foto en movimiento), escáner de documentos (`scanDocument`), OCR (`recognizeText`), archivos, firma, escáner QR, sleep y timers
- [javascript/ui-catalogo-de-metodos.md](references/javascript/ui-catalogo-de-metodos.md) — `ui`: `executeActionAfterDelay`, cronómetros, API de Stepper y OTP, voz (TTS/STT), audio y catálogo completo de métodos
- [javascript/coleccion-error-y-usuario.md](references/javascript/coleccion-error-y-usuario.md) — API completa de la colección actual (browse, filtros, búsqueda full-text, macros, metadatos, SQL, JSON), objeto de error y usuario logueado
- [javascript/objetos-creables-a-m.md](references/javascript/objetos-creables-a-m.md) — Creables de FileManager a Animation (SqlManager, IniParser, AndroidIntent, Bluetooth, OAuth2, Worker)
- [javascript/objetos-creables-n-z.md](references/javascript/objetos-creables-n-z.md) — Creables de Socket a XOneSigner (NFC, ImageDrawing, BarcodeGenerator, XOnePrinter, XOnePDF, OCR) y la lista canónica completa
- [javascript/singletons-globales.md](references/javascript/singletons-globales.md) — API de cada singleton global
- [javascript/patrones-criticos-seguridad-y-rendimiento.md](references/javascript/patrones-criticos-seguridad-y-rendimiento.md) — Patrones críticos (lock/unlock, browse, filter/restore, contexto en callbacks), seguridad y rendimiento
- [javascript/plantillas-y-funciones-utilitarias.md](references/javascript/plantillas-y-funciones-utilitarias.md) — Plantillas completas: CRUD, filtrado, maestro-detalle, GPS, fotos, chat, QR, login; y utilidades para `functions.js`
- [javascript/debugging-y-best-practices.md](references/javascript/debugging-y-best-practices.md) — Debugging de JavaScript y top 20 de buenas prácticas
- [javascript/metodos-de-los-controles.md](references/javascript/metodos-de-los-controles.md) — Métodos que expone cada control por tipo: campos, numéricos, multimedia, listas, mapas, gráficas, AR, frames
- [javascript/metodos-nativos-de-la-vista.md](references/javascript/metodos-nativos-de-la-vista.md) — Métodos que expone la vista nativa de Android/iOS bajo el frame o el control, no XOne: `setBlur`, `setSaturation`, sin contrato de compatibilidad
- [javascript/patrones-de-navegacion-datos-y-codigo.md](references/javascript/patrones-de-navegacion-datos-y-codigo.md) — Patrones de navegación, de datos y patrones críticos de código
- [javascript/patrones-de-ui-voz-integracion-y-seguridad.md](references/javascript/patrones-de-ui-voz-integracion-y-seguridad.md) — Patrones de UI, control por voz, integración y seguridad
- [javascript/objeto-ai-llm-en-dispositivo.md](references/javascript/objeto-ai-llm-en-dispositivo.md) — Objeto `ai`: LLM en el dispositivo, descarga de modelos, `generate`, `chat` con streaming, function calling, skills y formatos

### CSS
- [css/selectores-unidades-colores.md](references/css/selectores-unidades-colores.md) — Selectores en detalle, unidades, paletas y formatos de color
- [css/propiedades-y-herencia.md](references/css/propiedades-y-herencia.md) — Atributos por categoría con ejemplos largos (dimensiones, márgenes, padding, fuentes, texto, fondo, bordes, sombras, visibilidad, Material) y el sistema `extends` completo
- [css/atributos-por-categoria.md](references/css/atributos-por-categoria.md) — Tablas compactas de atributos por categoría, incluidas etiquetas, checkbox/toggles, imágenes e iconos, atributos de `coll`, machine learning y la tabla de transparencia alpha
- [css/dinamicos-cascada-y-componentes.md](references/css/dinamicos-cascada-y-componentes.md) — `##FLD_CAMPO##`, cascada de dispositivo, `strict-mode`, animaciones y tokens, gráficos, calendario y mapa
- [css/patrones-material-y-temas.md](references/css/patrones-material-y-temas.md) — Patrones Material (header/body/footer, botones, inputs, tarjetas, FAB, toolbar, item de lista), temas light/dark y un `default.css` + `colors.css` completos y comentados
- [css/buenas-practicas-y-parser.md](references/css/buenas-practicas-y-parser.md) — Buenas prácticas, anti-patrones, checklist de validación y detalle de las funciones del parser (`@import`, variables, `calc()`, `!important`, `!default`, `@extend`, modo estricto)

### Datos e integración
- [datos/appdata.md](references/datos/appdata.md) — `appData` completo: colecciones, login/logout, paso de datos entre pantallas, macros globales, SQL directo, detección de dispositivo, `loadIncludeFile` y `loadCssFile`
- [datos/http.md](references/datos/http.md) — `$http`: verbos, descarga de fichero, futures y llamadas en paralelo, TLS y mutual TLS, pinning, proxy y WebSocket
- [datos/oauth2-y-replica.md](references/datos/oauth2-y-replica.md) — OAuth2 completo y objeto `replica`
- [datos/appdata-referencia-ampliada.md](references/datos/appdata-referencia-ampliada.md) — Segunda redacción del corpus para `appData`, con ejemplos adicionales
- [datos/http-sqlmanager-y-crypto.md](references/datos/http-sqlmanager-y-crypto.md) — Segunda redacción para `$http`, más `SqlManager` y la API `crypto`

### Dispositivo
- [device/objetos-de-dispositivo.md](references/device/objetos-de-dispositivo.md) — FileManager, XOnePDF, XOnePrinter, BarcodeGenerator, Datawedge, XOneNFC, XOneOCR, BluetoothSerialPort, WifiManager, Animation, deviceInfo, GpsTools, OAuth2, WebSocket y fingerprintManager
- [device/systemsettings-y-permisos.md](references/device/systemsettings-y-permisos.md) — `systemSettings`: permisos en runtime con futures, brillo, red, batería, memoria y espacio, hardware, rutas, MDM, XOneLive e Intune
- [device/systemsettings-referencia-ampliada.md](references/device/systemsettings-referencia-ampliada.md) — Segunda redacción del corpus para `systemSettings`, más extensa
- [device/biometria-imagedrawing-y-otros.md](references/device/biometria-imagedrawing-y-otros.md) — `biometricsManager`, `ImageDrawing`, otros objetos utilitarios y tabla resumen de complementarios

Para crear un proyecto completo desde cero, `xone-project-generator`. Para validar y auditar el XML resultante, `xone-review` (`xone-simulator validate`); para diagnosticar un fallo a partir de su síntoma, `xone-debugging`.
