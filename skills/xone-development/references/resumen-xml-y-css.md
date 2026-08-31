# Resumen por capa: XML y CSS

> Referencia de `xone-development`. Sale del `SKILL.md` para que las reglas
> duras quepan en una lectura por omisión (100 líneas).

## Estructura XML

Capa declarativa de XOne: ficheros `.xne`, jerarquía `coll > group > frame > prop`, `contents`, macros, eventos y permisos. Antes de proponer código, inspecciona los `.xne` y el CSS del proyecto para respetar sus convenciones.

- Jerarquía: `coll > group > frame > prop`. Un `<prop>` vive dentro de un `<group>` o de un `<frame>`.
- Una coll de datos lleva `sql`, `objname` y `updateobj`, y usa `##PREF##` como prefijo de tabla: `sql="SELECT ID, NOMBRE FROM ##PREF##Clientes"`.
- Una pantalla sin datos (menú, login) usa `special="true"` y **no** lleva `sql`. Son excluyentes.
- `<prop>` tiene dos atributos obligatorios: `name` y `type`.
- `notab="true"` cuando solo hay un grupo visible.
- El splash es un **fichero estático en la raíz** (`splash.png`/`.jpg`/`.gif`/`.webp`/`.apng`/`.mp4`/`.3gp`) que carga el framework. No es una `<coll>`, no es `EntradaApp` (pantalla post-login), y no es `load-imgbk` del `<app>` (fondo del EditView).

**Combo y selector.** Un combo **no tiene tipo propio**: son dos props vinculados, uno oculto con el ID y otro visible con la descripción. Para valores fijos sin tabla, `mapcol-values` en el prop oculto. `mapcol` debe apuntar a una coll existente, y `mapfld`/`linkedfield` a campos reales de esa coll: `xone-simulator` lo valida.

**Contents y listas.**

- El `name` del contents lleva prefijo `@`; sin él no vincula.
- `src` es obligatorio y apunta a una coll existente. `filter` y `sort` son opcionales.
- Filtros dinámicos por el objeto padre con `##FLD_CAMPO##`, p. ej. `filter="IDPADRE=##FLD_IDPADRE##"`.
- Un mapa es `type="Z" viewmode="mapview"` vinculado a un `<contents>`, no un tipo inventado.

**Layout.** Los elementos son `newline="true"` por defecto y se apilan. Para ponerlos en la misma fila, `newline="false"` va en el **segundo y siguientes**; el primero de la fila nunca lo lleva. Si el primer elemento de un `<frame>` lleva `newline="false"`, el frame entero puede no montarse y sus controles desaparecen de la pantalla. Dimensiones en `p` o `%`, nunca `px`/`em`/`rem`.

**Macros.** `##PREF##` prefijo de tablas · `##FLD_CAMPO##` valor del campo del objeto padre en un contents · macros del sistema como `##NOW_TIME##`, `##USERID##`, `##DEVICE_OS##`, `##DEVICE_TYPE##`, `##CURRENT_ORIENTATION##`, `##FRAME_VERSION_CODE##`.

Una macro de colección debe declararse en el XML antes de usarla: `<macro name="##NOMBRE##" value="..." default="true" />` como hijo directo de `<coll>`, al mismo nivel que los `<group>`. Sin esa declaración, `setMacro` no inyecta nada en el SQL. La API es `setMacro`/`getMacro`; `coll.macro(...)` no existe.

## CSS

Sistema de estilos propietario, con sintaxis parecida a CSS web pero atributos propios. Antes de editar, lee el `default.css` del proyecto y respeta sus convenciones de nombres de clase.

**Archivos.** `default.css` en la raíz del proyecto es obligatorio y es el único que se declara en `app.xml`: `<style url="default.css" encoding="UTF-8" />`. Las variantes se cargan automáticamente por convención de nombre.

Si el atributo `compatibility-mode` del nodo `<app>` vale `true`, **el CSS se ignora por completo** — compruébalo antes de diagnosticar cualquier estilo que «no se aplica».

> **El TEMA OSCURO está sin definir, y hasta que se defina no se genera.** El corpus escribe el
> nombre del fichero de variante de dos formas incompatibles —con guion bajo
> (`default_night.css`) y con punto (`default.night.css`)—, y en los proyectos reales de
> referencia no existe ninguno de los dos: lo que hay son variantes con guion normal
> (`default-ios.css`, `default-colors.css`). Como el framework carga estas variantes **por
> convención de nombre**, un nombre equivocado no da error: el fichero no se carga y la app
> se ve en claro sin que nada lo diga. **Decisión del proyecto (2026-08-29): no proponer ni
> generar el fichero de tema oscuro hasta fijar su nombre.** Los ejemplos de tema que quedan
> en las referencias de CSS ilustran la CASCADA, no el nombre — no los copies como ruta.

**Cascada.** De menor a mayor prioridad: `default.css` → plataforma → orientación → tema → condiciones combinadas → **atributos inline en XML** (máxima prioridad). Lo más específico gana atributo por atributo, no bloque por bloque.

**Selectores.** Solo estos: `coll`, `prop`, `prop:TYPE` (`prop:T`, `prop:N`, `prop:B`, `prop:NC`, `prop:Z`, `prop:IMG`, `prop:D`…), `group`, `frame` y `.clase`. Las clases se asignan con `class="..."` en el XML.

**Unidades.**

- `p` para dimensiones absolutas, `%` relativo al contenedor.
- Sin unidad: `fontsize`, `border-corner-radius`, `border-width`, `labelwidth`, `lines`, `visible`, `gallery-columns`, `img-width`, `img-height`.
- Prohibidas: `px`, `em`, `rem`, `vw`, `vh`, `vmin`, `vmax`.

**Colores.** `#RRGGBB` o ARGB `#AARRGGBB`. **El alpha va primero**, al contrario que el `#RRGGBBAA` de CSS web.

**Herencia.** Dos mecanismos equivalentes: el atributo `extends: .claseBase;` y la at-rule `@extend selector;`. Diferencia relevante: `@extend` detecta ciclos en tiempo de parseo (auto-referencia, 2 vías y N vías) y admite referencias adelantadas; `extends:` no detecta ciclos automáticamente. En un proyecto que ya usa `extends:`, mantén `extends:` por consistencia.

**Funciones del parser.**

**Sí soportadas:** comentarios `/* */` y `//`; `@import "ruta";` (solo al inicio del archivo); variables CSS en `:root` o locales de bloque, con `var(--nombre)` y `var(--nombre, fallback)`; `calc()` con `+ - * /`, paréntesis y `-` unario sobre números puros; `!important`; `!default`; selectores múltiples `a, b, c { }`.

**No soportadas:** `min()`, `max()`, `clamp()`, `@media`, pseudo-clases (`:hover`, `:focus`, `:active`, `:nth-child`), pseudo-elementos (`::before`, `::after`), selectores de atributo (`[data-attr]`), combinadores (`>`, `+`, `~`, descendiente), `transition`, `transform`, Flexbox, CSS Grid, `box-shadow`, `text-shadow` y gradientes.

Para sombras usa `elevation` y `shadow-color`. No hay abreviados `margin` ni `padding`: usa `tmargin`, `bmargin`, `lmargin`, `rmargin` y sus equivalentes `*padding`.

**Estilos dinámicos.** No existe selector condicional puro. Dos vías: tokens `##FLD_CAMPO##` en el valor (funcionan en CSS y en atributos inline XML) y cambio de clase desde JavaScript en tiempo de ejecución.

Si un estilo no se aplica, empieza por `compatibility-mode`; el resto de síntomas está en la skill `xone-debugging`.
