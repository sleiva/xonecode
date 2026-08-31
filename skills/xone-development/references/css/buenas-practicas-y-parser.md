# XOne CSS — Buenas prácticas y funciones del parser

> Fuente: `xone/v2/xone-help-docs/topics/04-css-styling-guide.md` §17–§18. Referencia de la skill; el índice está en [../../SKILL.md](../../SKILL.md).

Contenido: §17 top 15 buenas prácticas, anti-patrones y checklist · §18 funciones del parser: comentarios, @import, variables :root/var(), calc(), !important/!default, @extend, selectores múltiples, modo estricto

---

## 17. Best Practices

### 17.1 Top 15 buenas prácticas CSS en XOne

1. **Usar siempre `default.css` como archivo base** - Es el único archivo CSS obligatorio y debe contener los selectores `coll` y `prop` globales.

2. **Separar colores en `colors.css`** - Facilita el cambio de tema y mantiene el `default.css` más legible.

3. **Usar unidad `p` para dimensiones fijas y `%` para responsivas** - Nunca usar `px`, `em`, `rem`.

4. **Definir `fontsize` sin unidad** - El valor numérico es suficiente: `fontsize: 14`, no `fontsize: 14p`.

5. **Usar `extends` para variantes** - No duplicar atributos cuando solo cambia el color o un detalle.

6. **Comentar las secciones del CSS** - Usar bloques de comentarios con `/* ====== SECCION ====== */` para separar categorías.

7. **Seguir nomenclatura consistente** - Usar prefijos descriptivos (`frame`, `btn`, `input`, `texto`, `tarjeta`, `badge`, `avatar`, `icono`, `group`).

8. **Definir los iconos del sistema en el selector `prop`** - Configurar `img-spinner`, `img-search`, `img-checked`, etc. una sola vez.

9. **Usar `labelwidth: 0` cuando no hay etiqueta** - Evita desperdiciar espacio horizontal.

10. **Preferir `text-border-bottom: true` para inputs** - Es el patron Material Design más limpio y común.

11. **Usar `border-corner-radius` como mitad del `height` para botones pill** - Ejemplo: `height: 56p; border-corner-radius: 28;`.

12. **Recordar que alpha va PRIMERO en ARGB** - `#80FFFFFF` = blanco 50%, no `#FFFFFF80`.

13. **No abusar de animaciones** - Reservarlas para transiciones de pantalla, no para cada elemento.

14. **Definir siempre los tres frames básicos** - `.frameHeader`, `.frameBody` (con `scroll: true`), `.frameFooter`.

15. **Organizar el CSS en el mismo orden** - Globales, layout, tarjetas, botones, inputs, textos, badges, avatares, iconos, listas, grupos, componentes especiales, animaciones.

### 17.2 Anti-patrones comunes

| Anti-patron | Por que es malo | Solución correcta |
|-------------|----------------|-------------------|
| Usar `font-size: 14px` | Nombre y unidad CSS web | `fontsize: 14` |
| Usar `background-color` | Nombre CSS web | `bgcolor: #FFFFFF` |
| Usar `margin: 10p` | Abreviatura no existe en XOne | `tmargin: 10p; bmargin: 10p; lmargin: 10p; rmargin: 10p;` |
| Usar `#RRGGBBAA` para transparencia | Formato web, alpha al final | `#AARRGGBB` (alpha al inicio) |
| Usar `#FFF` abreviado | Abreviatura no garantizada | `#FFFFFF` (6 digitos completos) |
| Duplicar todos los atributos en variantes | Código duplicado, difícil de mantener | `extends: .claseBase;` con sobreescritura |
| Usar `display: none` | Atributo CSS web | `visible: 0` |
| Usar `display: flex` | Flexbox no soportado | Usar `frame` y `group` en XML |
| Mezclar `px` y `p` | `px` no escala entre dispositivos | Usar siempre `p` |
| Poner gradientes | `linear-gradient` no soportado | Usar colores solidos o imágenes de fondo |
| Usar selectores CSS complejos | `div > .header`, `p:first-child` no soportados | Usar clases simples `.miClase` |
| No definir `coll` y `prop` globales | Comportamiento inconsistente | Siempre definir ambos selectores base |

### 17.3 Checklist de validación CSS

Antes de entregar un archivo CSS XOne, verificar:

**Selectores:**
- [ ] Se usa `coll`, `prop`, `prop:TYPE`, `.clase`, `group`, o `frame` - no otros selectores
- [ ] Los nombres de clase son descriptivos y siguen la nomenclatura del proyecto
- [ ] No hay selectores de ID (`#id`) ni selectores combinadores (`>`, `+`, `~`)

**Unidades:**
- [ ] Todas las dimensiones usan `p` (puntos) o `%` (porcentaje)
- [ ] `fontsize` se define sin unidad (solo número)
- [ ] `border-corner-radius` se define sin unidad (solo número)
- [ ] `border-width` se define sin unidad (solo número)
- [ ] No se usa `px`, `em`, `rem`, `vh`, `vw`

**Colores:**
- [ ] Formato `#RRGGBB` para colores sin transparencia
- [ ] Formato `#AARRGGBB` para colores con alpha (alpha PRIMERO)
- [ ] Colores siempre con 6 u 8 digitos hexadecimales completos
- [ ] No se usan nombres de color (excepto `transparent` con precaucion)

**Atributos:**
- [ ] Todos los atributos usados existen en la knowledgebase CSS de XOne
- [ ] No se mezclan atributos CSS web (`font-size`, `background-color`, `margin-top`)
- [ ] Los valores booleanos son `true`/`false` (no 0/1 para booleanos)
- [ ] Los valores de `visible` usan el bitmask correcto (0-7)

**Herencia:**
- [ ] `extends` referencia clases con el prefijo `.` (ej: `extends: .claseBase`)
- [ ] No hay herencia circular (A extends B extends A)
- [ ] Las sobreescrituras son intencionales

**Estructura:**
- [ ] Existe el selector `coll` con configuración global
- [ ] Existe el selector `prop` con tipografía base
- [ ] Las secciones están comentadas y organizadas
- [ ] Los iconos del sistema están configurados en `prop`

> **Referencia cruzada:** Para la validación completa del proyecto (XML, JS, CSS, estructura de carpetas), consultar el tópico 01 - Fundamentos.

### 17.4 Organización recomendada del archivo CSS

El siguiente es el orden recomendado para las secciones del archivo `default.css`, basado en el análisis de todos los proyectos de ejemplo:

```
1.  Comentario de cabecera (nombre del proyecto, paleta de colores)
2.  Configuración global: prop { }
3.  Configuración global: coll { }
4.  Iconos del sistema (img-spinner, img-search, etc.)
5.  Frames de layout (.frameHeader, .frameBody, .frameFooter)
6.  Tarjetas y contenedores (.tarjeta, .panelInferior)
7.  Botones (.btnPrimario, .btnSecundario, .btnPeligro, .btnFlotante)
8.  Campos de texto (.inputTexto, .inputBusqueda, .textoEditable)
9.  Textos y etiquetas (.textoTitulo, .textoSubtitulo, .textoSecundario)
10. Badges de estado (.badgeEstado, .badgePendiente, etc.)
11. Imagenes y avatares (.avatar, .avatarGrande, .iconoAccion)
12. Listas e items (.itemLista, .separador)
13. Grupos y tabs (.groupNoTab, .groupConTab)
14. Componentes especiales (.areaFirma, .fotoPreview, .barraProgreso)
15. Animaciones (.animSlideRight, .animFadeIn)
```

---

## 18. Funciones del parser CSS

Esta sección documenta las **funciones de sintaxis del parser CSS** de XOne. Son features procesadas antes de que el motor de render reciba las reglas, por lo que el consumidor (los controles de la UI) no ve diferencia con un valor literal: ve el resultado ya calculado o sustituido.

### 18.1 Comentarios

XOne acepta dos formas de comentario, válidas en cualquier posición fuera de un valor (entre reglas, entre selector y `{`, dentro del cuerpo de un bloque entre declaraciones):

```css
/* Comentario multilínea
   tan largo como haga falta */

// Comentario de una sola línea (hasta el final del renglón)

.tarjeta {
    // pendiente: revisar contraste con el tema oscuro
    bgcolor: #FFFFFF;
    /* color de marca */
    forecolor: #1565C0;
}
```

> **Limitación:** los comentarios NO se reconocen dentro del valor de una declaración. `bgcolor: red /* nota */;` acumularía `red /* nota */` literal como valor.

### 18.2 `@import` — composición de hojas

Permite cargar otra hoja CSS y mergear sus reglas como si estuvieran inline en el archivo actual. La hoja importada puede a su vez tener sus propios `@import` al inicio.

```css
@import "colors.css";
@import url("base.css");

/* Aquí ya están disponibles todas las reglas y variables de las dos hojas */
.frameHeader {
    bgcolor: var(--color-primario);
}
```

**Reglas:**

- **Posición**: solo al inicio del archivo, antes de cualquier regla. Si aparece después → error de parseo.
- **Sintaxis admitida**: `@import "ruta";`, `@import 'ruta';`, `@import url("ruta");`, `@import url(ruta);`.
- **Ciclos detectados**: si A importa B y B importa A, el parser lanza error con el path en conflicto.
- **Variables globales** declaradas en la hoja importada (`:root`) son visibles en la principal. Reglas y `!default` también se mergean.
- **Patrón típico**: una hoja `colors.css` con la paleta + una `base.css` con valores `!default` + tu `default.css` que solo sobreescribe lo que cambia.

### 18.3 Variables CSS (`:root`, `var()`)

#### Variables globales

Se declaran en un bloque `:root { ... }`. Se referencian con `var(--nombre)` o `var(--nombre, fallback)` en cualquier valor. La resolución es post-pasada: el orden de declaración no importa, `:root` puede aparecer al final del archivo o en una hoja importada.

```css
:root {
    --color-primario:   #1565C0;
    --color-acento:     #FFC107;
    --espaciado-base:   8;
    --radio-tarjeta:    12;
}

.tarjeta {
    bgcolor:              var(--color-primario);
    border-corner-radius: var(--radio-tarjeta);
    tmargin:              var(--espaciado-base);
    bmargin:              var(--espaciado-base);
}

.alerta {
    /* fallback usado cuando --color-error no está declarada */
    bgcolor: var(--color-error, #F44336);
}
```

**Características:**

- **Case-sensitive**: `--Color` ≠ `--color`.
- **Múltiples por valor**: `caption: pad var(--p1) var(--p2) fin;` se sustituye pieza a pieza.
- **Anidamiento**: una variable puede referenciar a otra. `--acento: var(--primario);` funciona aunque `--primario` aparezca más adelante.
- **Variable sin declarar y sin fallback**: el `var(...)` queda literal en el valor (no rompe la regla).

#### Variables locales (scope de bloque)

Una declaración `--nombre: valor;` dentro de un bloque que NO sea `:root` puro queda confinada al bloque. Se sustituyen al cerrar `}`. Útil para valores derivados que solo aplican a una clase concreta.

```css
.tarjeta {
    --pad: 16;
    --pad-doble: calc(var(--pad) * 2);

    lpadding: var(--pad);
    rpadding: var(--pad);
    tpadding: var(--pad-doble);
    bpadding: var(--pad-doble);
}
```

- **Sombreado**: si una local y una global tienen el mismo nombre, gana la local dentro de su bloque.
- **No visibles fuera** del bloque sintáctico.
- **Multi-selector**: en `a, b { --c: red; ... }` la local aplica a las reglas generadas para `a` y para `b`.

### 18.4 `calc()` — aritmética en valores

Evalúa expresiones aritméticas con `+`, `-`, `*`, `/`, paréntesis y operador unario `-` sobre números puros. Se ejecuta tras la resolución de variables, así que puedes combinarlas libremente.

```css
:root {
    --base:  8;
    --doble: calc(var(--base) * 2);  /* 16 */
}

.frameHeader {
    height:               calc(var(--base) * 20);     /* 160 */
    border-corner-radius: calc(var(--doble) - 4);     /* 12 */
}

.btnPrimario {
    fontsize: calc(14 + 2);
    lmargin:  calc((100 - 90) / 2);   /* 5 */
}
```

**Características:**

- **Operandos sin unidades**: `calc(8 * 2)` → `16`. NO interpreta `p`, `dp`, `%`, etc. Para tamaños en `p` o `%`, escribe el número solo y deja el ajuste de unidad fuera del `calc()`.
- **Precedencia estándar**: `*` y `/` antes que `+` y `-`. Paréntesis para sobreescribir.
- **Resultado entero exacto** → se emite como entero (`calc(4*3)` → `12`, no `12.0`). Si no es entero, se redondea a 6 dígitos y se eliminan ceros al final.
- **Múltiples calc en un mismo valor**: `caption: pad calc(8+8) fin;` se procesa pieza a pieza.
- **Errores** (división por cero, paréntesis sin balancear, sintaxis inválida): en parseo silencioso el `calc(...)` se preserva literal; en modo estricto el parser lanza.

### 18.5 `!important` y `!default`

Sufijos al final del valor que controlan la cascada **dentro del propio parser**, antes de que el motor de render aplique nada.

```css
.alerta {
    bgcolor: #FFF3CD !important;     /* no se sobreescribe por declaraciones normales */
    fontsize: 14;
}

/* Otra hoja u otro bloque NO cambia el bgcolor anterior: */
.alerta {
    bgcolor: lime;   /* ignorado: la previa es !important */
}
```

**`!important`**: una declaración normal posterior NO sobreescribe a una `!important` previa del mismo atributo (ni dentro del mismo bloque, ni entre bloques separados del mismo selector). Solo otra `!important` produce sobreescritura.

**`!default`**: opuesto a `!important`. La declaración solo se aplica si el atributo no estaba ya definido. Pensado para hojas base sobre-escribibles.

```css
/* base.css importada por default.css */
boton {
    bgcolor:  gray   !default;
    fontsize: 14     !default;
    lmargin:  8      !default;
}

/* default.css — solo cambia lo que toca; el resto conserva los defaults */
boton {
    bgcolor: #1565C0;
}
```

Resultado: `boton` queda con `bgcolor: #1565C0`, `fontsize: 14`, `lmargin: 8`.

**Combinación**: `!important !default` aplicado en cualquier orden significa "si no había declaración previa, aplica con `!important`". Si la había, se descarta.

### 18.6 `@extend selector;` — herencia vía at-rule

Alternativa moderna al atributo `extends:` tradicional. La at-rule `@extend selector;` dentro de un bloque copia las declaraciones del selector referenciado **antes** de que el motor de render reciba nada.

```css
/* Base reutilizable */
.btnBase {
    width: 90%;
    height: 144p;
    border-corner-radius: 28;
    fontsize: 16;
}

/* Variantes via at-rule */
.btnPrimario {
    @extend .btnBase;
    bgcolor:   #1565C0;
    forecolor: #FFFFFF;
}

.btnPeligro {
    @extend .btnPrimario;          /* encadenado: hereda de primario que hereda de base */
    bgcolor: #F44336 !important;
}

/* Multi-extend: combina varios padres */
.btnExitoGrande {
    @extend .btnBase;
    @extend .colorExito;
    height: 168p;
}
```

**Características:**

- **Referencias adelantadas permitidas**: el target del `@extend` puede declararse en cualquier punto de la hoja, incluso posterior al uso (se resuelve en post-pasada).
- **Hijo gana**: las declaraciones propias del bloque vencen sobre las heredadas, salvo cuando el padre es `!important` y el hijo no.
- **Encadenamiento transitivo**: `c → b → a` funciona; cada nivel se expande antes de aplicarse al siguiente.
- **Múltiples `@extend` por bloque**: entre los padres aplica "último gana".
- **Ciclos detectados**: auto-referencia (`a` → `a`), 2-vías (`a` ↔ `b`) y N-vías → error de parseo.
- **Multi-selector**: en `a, b { @extend base; }` el extend se aplica a `a` y a `b` independientemente.

#### `@extend` vs atributo `extends:`

Conviven sin conflicto. Diferencias:

| Aspecto | `extends: .clase;` (atributo) | `@extend .clase;` (at-rule) |
|---|---|---|
| Sintaxis | Declaración dentro del bloque | At-rule dentro del bloque |
| Quién lo resuelve | El motor de render (xonecss_lib) en cascada | El parser, en post-pasada |
| Cuándo se resuelve | Al aplicar la regla a una vista | Al parsear la hoja |
| Visibilidad del resultado | El atributo `extends` queda en la regla | Las declaraciones aparecen "in-line" en la regla |
| Detección de ciclos | NO automática | SÍ (en parseo) |
| Estado de adopción | Establecido en proyectos existentes | Nuevo, alternativa moderna |

**Recomendación**: usa el que prefieras según el estilo del proyecto. Si vas a empezar de cero o quieres validación temprana de ciclos, prefiere `@extend`. Si tu proyecto ya usa `extends:`, mantenlo por consistencia.

### 18.7 Selectores múltiples

Un bloque puede aplicarse a varios selectores separados por comas. Internamente se crea una regla independiente por cada uno (no compartida).

```css
.btnPrimario, .btnSecundario, .btnPeligro {
    width: 90%;
    height: 144p;
    border-corner-radius: 28;
    fontsize: 16;
}

/* Equivalente a haberlas escrito una a una con los mismos valores */
```

Variantes de espaciado válidas: `a,b`, `a, b`, `a ,b`, `a , b`.

### 18.8 Modo estricto del parser

El framework puede arrancar el parser en **modo estricto** (`bStrictMode = true`). En ese modo, varios casos que en modo permisivo se ignoran silenciosamente se convierten en errores:

- Declaración sin `;` final o que cierra con `}` antes que con `;`.
- Variable sin declarar y sin fallback en `var(...)`.
- Expresión `calc(...)` inválida o división por cero.
- Target de `@extend` que no existe.

Recomendado durante el desarrollo para detectar typos y referencias rotas; opcional en producción si la hoja ya está validada.

---

**Tabla de equivalencias rápida CSS Web a XOne:**

| CSS Web | XOne CSS |
|---------|----------|
| `font-size: 14px` | `fontsize: 14` |
| `font-family: Roboto` | `fontname: Roboto-Regular.ttf` |
| `font-weight: bold` | `fontbold: true` |
| `font-style: italic` | `fontitalic: true` |
| `color: #333` | `forecolor: #333333` |
| `background-color: #fff` | `bgcolor: #FFFFFF` |
| `background-image: url(img.png)` | `imgbk: img.png` |
| `margin-top: 10px` | `tmargin: 10p` |
| `margin-bottom: 10px` | `bmargin: 10p` |
| `margin-left: 20px` | `lmargin: 20p` |
| `margin-right: 20px` | `rmargin: 20p` |
| `padding-top: 10px` | `tpadding: 10p` |
| `padding-left: 20px` | `lpadding: 20p` |
| `border-radius: 8px` | `border-corner-radius: 8` |
| `border: 1px solid #ccc` | `border: true; border-width: 1; border-color: #CCCCCC;` |
| `text-align: center` | `text-align: center` |
| `height: 50px` | `height: 50p` |
| `width: 100%` | `width: 100%` |
| `display: none` | `visible: 0` |
| `overflow: scroll` | `scroll: true` |
| `position: fixed` | `fixed: true` |
| `opacity: 0.5` | Usar alpha ARGB: `bgcolor: #80...` |
| `cursor: pointer` | No necesario (es móvil) |
| `box-shadow: ...` | No soportado (usar `border` como alternativa) |
| `transition: ...` | No soportado (usar `animation-in`/`animation-out`) |
| `transform: ...` | No soportado |
| `display: flex` | No soportado (usar `frame` y `group`) |
| `display: grid` | No soportado (usar `gallery-columns`) |
| `var(--color)` | `var(--color)` (declarar en `:root`) |
| `calc(8px * 2)` | `calc(8 * 2)` (sobre números puros) |
| `@import url("a.css")` | `@import "a.css";` (solo al inicio) |
| `// comentario` o `/* */` | `// comentario` o `/* */` (no dentro de valores) |

---

> **Documento generado a partir de:** `xone-css-knowledgebase.md` (knowledgebase oficial), `xone-css-styling-guide.md` (guía de referencia del generador), y el análisis de los archivos CSS de los proyectos UseCars, MiMensajeria, SocialNetwork, XOneDelivery y GestionTareas ubicados en `templates/synthetic_samples/` y `knowledgebase/examples/`.

