# Tamaños canónicos por tipo de elemento

Valores de referencia para `width`, `height`, `fieldsize` y dimensiones de iconos en XOne. **Calibrados para el dispositivo de referencia por defecto: `resolution-width="1080"` / `resolution-height="1920"`.**

> **REGLA CRÍTICA:** En XOne **`p` ≠ `dp`**. 1p = 1px en el dispositivo de referencia. Material 56dp en 1080×1920 (xxhdpi, density 3×) son **168p**, no 56p. Todos los valores de esta tabla están en `p` reales para 1080×1920. Si el proyecto usa otra `resolution-width`, escalar proporcionalmente.

**Úsalos como punto de partida, no como verdad absoluta.** Sin captura del render real es imposible afinar al píxel — pero estos valores cubren el ~80% de los casos y evitan los errores típicos (frames que desbordan, botones por debajo del touch target, imágenes distorsionadas).

---

## 1. Reglas heurísticas (decidir el valor)

Antes de poner un número, aplica estas reglas en orden:

1. **Header, footer, toolbar, drawer fijos** → `height` en `Np` (absoluto, calibrado para 1920).
2. **Frame body principal entre header y footer fijos** → `height="-2"` (wrap content) **o** `height="100%"` con `scroll="true"`. NUNCA un `%` calculado a mano restando los fijos — el motor no garantiza el cálculo.
3. **Contenido vertical apilado dentro de un frame** → `height="-2"` y dejar que el contenido mande. Solo fijar `Np` si necesitas una altura mínima visual.
4. **Imágenes, avatares, iconos** → `Np` fijos en **ambos** ejes para preservar aspecto. NUNCA `width="100%" height="100%"` en una imagen.
5. **Botones** → `width` en `%`, `height` en `Np`. El touch target mínimo es **144p** (Material 48dp × 3 para xxhdpi).
6. **Inputs de texto** → `width="95%"` o `"100%"`, `height` en `Np` (mínimo 144p).
7. **Si dos elementos van en la misma fila** → cada uno con `width` `%` que sume ≤ 100%, el segundo con `newline="false"`.
8. **Los `%` se refieren al padre directo**, no a la pantalla. Tres frames hermanos con `height="40%"` desbordan (120%).
9. **`<prop>` tiene 2 columnas internas (label + valor)**: si `labelwidth="50"` y `width="50%"`, el valor queda con la mitad del 50% disponible, no con el 50% de la fila.

---

## 2. Frames estructurales

| Elemento | width | height | Notas |
|---|---|---|---|
| TopBar / BottomBar | `100%` | `164p` | Toolbar Material 56dp |
| Header fijo completo (TopBar + tabs) | `100%` | `404p` | Workflow estándar |
| Header con avatar + texto (2 líneas) | `100%` | `240p` |  |
| Header pantalla de perfil (con foto grande) | `100%` | `600p`–`720p` | Avatar XL 360p–480p |
| Body de pantalla (entre header/footer fijos) | `100%` | `-2` o `100%` con `scroll="true"` |  |
| Footer fijo con 1 botón principal | `100%` | `216p`–`288p` | Botón 124p + márgenes |
| Footer con 2-3 botones en fila | `100%` | `216p` |  |
| Footer barra de navegación (bottom nav) | `100%` | `168p` | Material 56dp |
| Drawer lateral (menú) | `840p`–`960p` | `100%` | Material 280-320dp |
| Bottom sheet (peek collapsed) | `100%` | `300p`–`600p` | Atributo `peek-height` |
| Bottom sheet (expanded) | `100%` | `60%`–`80%` |  |
| Tarjeta (card) | `95%` o `100%` | `-2` | Altura por contenido |
| Tarjeta de métrica (KPI numérico) | `48%` (2 cols) o `31%` (3 cols) | `360p`–`480p` |  |
| Modal / diálogo flotante | `840p` (= 78%) | `-2` o `60%` | Valor workflow |
| Snackbar / banner | `100%` | `144p`–`168p` |  |

---

## 3. Botones

| Elemento | width | height | Notas |
|---|---|---|---|
| Botón primario / CTA grande | `90%`–`100%` | `124p` | Workflow "pill" |
| Botón secundario | `90%`–`100%` | `124p` | Borde, sin relleno |
| Botón compacto en fila | `-2` o `Np` (360-480p) | `120p`–`144p` |  |
| Botón texto pequeño (estilo link) | `-2` | `108p`–`120p` |  |
| Botón "Atrás" / "Cancelar" en footer | `30%`–`40%` | `124p` | Combinado con `Aceptar` 60% |
| FAB circular estándar | `168p` | `168p` | Material 56dp; `border-corner-radius: 84` |
| FAB mini | `120p` | `120p` | Material 40dp |
| FAB grande | `288p`–`336p` | igual |  |
| FAB extendido (texto + icono) | `-2` (mín 240p) | `168p` |  |
| Chip / etiqueta seleccionable | `-2` | `96p`–`120p` | `border-corner-radius` ≈ height/2 |
| Icon button (toolbar) | `104p` | `104p` | Workflow icono cuadrado; `labelwidth: 0` |
| Botón pestaña (tab) | reparto `%` igual | `144p` | Si 3 tabs: 33% cada uno |
| Toggle / switch | `-2` | `144p` |  |
| Botón de menú hamburguesa | `104p` | `104p` |  |

---

## 4. Inputs y campos de formulario

| Elemento | width | height | fieldsize | Notas |
|---|---|---|---|---|
| Input texto línea (1 por fila) | `95%`–`100%` | `144p` | según `size` | Workflow Campo T |
| Input texto compacto (2 por fila) | `48%` | `144p` | 15-20 |  |
| Input numérico corto | `30%`–`50%` | `144p` | 8-10 |  |
| Área de texto multilínea (notas) | `95%`–`100%` | `360p`–`600p` o `-2` |  | `multiline="true"` |
| Checkbox / switch (tipo `NC`) | `100%` o `-2` | `144p` |  | `labelwidth` 70-80% |
| Combo / selector (`mapcol`) | `95%`–`100%` | `144p` |  |  |
| Date picker (`type="D"`) | `95%`–`100%` o `48%` | `144p` |  | `img-date-width: 72p` |
| Time picker (`type="TT"`) | `48%` | `144p` |  |  |
| DateTime picker (`type="DT"`) | `95%`–`100%` | `144p` |  |  |
| Stepper numérico (`viewmode="stepper"`) | `360p`–`480p` | `144p` |  |  |
| OTP 4 dígitos (`viewmode="otp"`) | `-2` | `192p` |  | `box-size: 144p` |
| OTP 6 dígitos | `-2` | `192p` |  | `box-size: 120p`–`144p` |
| Slider (`viewmode="slider"`) | `90%` | `144p` |  |  |
| Firma (`type="DR"`) | `95%`–`100%` | `600p`–`720p` |  | `stroke-width: 4`–`8` |
| Búsqueda (search bar) | `100%` | `144p` |  | En header o como prop con `is-search="true"` |
| Etiqueta (`type="L"`) sobre input | `100%` o `-2` | `-2` o `96p` |  | Workflow Label L: 96p; `fontsize` 5-6 |

---

## 5. Listas e items (dentro de `<contents>`)

| Elemento | width | height | Notas |
|---|---|---|---|
| Item lista 1 línea (solo título) | `100%` | `144p` | Material 48dp |
| Item lista 2 líneas (título + subtítulo) | `100%` | `192p`–`216p` | Material 64-72dp |
| Item lista 3 líneas | `100%` | `264p` |  |
| Item lista con avatar pequeño | `100%` | `192p` | Avatar 120p–144p |
| Item lista con avatar + 2 líneas | `100%` | `216p` |  |
| Item lista con thumbnail (imagen lateral) | `100%` | `240p`–`288p` | Thumbnail 192p–216p |
| Item con foto destacada (estilo card) | `95%` | `-2` o `600p` |  |
| Item de chat (burbuja) | `-2` (máx 75%) | `-2` | Saliente con `lmargin`/`rmargin` |
| Card en grid 2 columnas | `48%` | `-2` o `480p`–`600p` | + `newline="false"` |
| Card en grid 3 columnas | `31%` | `-2` o `360p` |  |
| Card en grid 4 columnas | `23%` | `-2` o `300p` |  |
| Item de Kanban (card en columna) | `100%` (de la columna) | `-2` |  |

---

## 6. Imágenes, avatares e iconos

| Elemento | width | height | Notas |
|---|---|---|---|
| Avatar XS (chip, lista muy densa) | `72p` | `72p` | Material 24dp |
| Avatar S (lista densa, header compacto) | `96p` | `96p` | Material 32dp |
| Avatar M (lista normal) | `120p`–`144p` | igual | Material 40-48dp |
| Avatar L (header grande, detalle) | `192p`–`240p` | igual | Material 64-80dp |
| Avatar XL (perfil principal) | `288p`–`360p` | igual | Material 96-120dp |
| Avatar XXL (pantalla de perfil) | `420p`–`600p` | igual |  |
| Logo en splash (fichero `splash.png`) | gestionado por framework | — | NO se controla con CSS |
| Logo en header | `360p`–`600p` | proporcional o `120p`–`164p` alto |  |
| Icono en toolbar (icon button) | `72p` | `72p` | Material 24dp; `img-width`/`img-height` |
| Icono en FAB | `72p`–`84p` | igual |  |
| Icono en botón con texto | `54p`–`72p` | igual |  |
| Icono en bottom nav | `72p` | `72p` |  |
| Icono en item de lista | `72p`–`96p` | igual |  |
| Icono grande (estado vacío, ilustración) | `288p`–`480p` | igual |  |
| Foto preview (full width) | `100%` | `600p`–`720p` o `40%` |  |
| Foto preview (hero / cabecera) | `100%` | `600p`–`840p` |  |
| Foto miniatura cuadrada | `192p`–`288p` | igual |  |
| Foto en grid (galería 3 cols) | `31%` | igual al width | Cuadrada |
| Tipo `PH` (foto cámara) | `95%`–`100%` | `600p`–`840p` o `30%`–`40%` |  |
| Tipo `VD` (vídeo / scanner QR) | `95%`–`100%` | `600p`–`840p` o `40%` |  |

---

## 7. Separadores, badges y elementos auxiliares

| Elemento | width | height | Notas |
|---|---|---|---|
| Separador horizontal (línea fina) | `100%` | `4p` | Workflow; `bgcolor` gris claro `#E0E0E0` |
| Separador medio (indicador de pestaña) | `100%` | `8p` | Workflow |
| Separador con texto centrado | `100%` | `120p`–`144p` |  |
| Espaciador vertical pequeño | `100%` | `24p` |  |
| Espaciador vertical medio | `100%` | `48p` |  |
| Espaciador vertical grande | `100%` | `72p`–`96p` |  |
| Badge / contador numérico | `-2` (mín 60p) | `60p`–`84p` | `border-corner-radius` ≈ height/2 |
| Indicador de progreso (barra) | `90%`–`100%` | `12p`–`24p` |  |
| Indicador de progreso circular | `96p`–`144p` | igual |  |
| Divider de sección (con título) | `100%` | `-2` | Solo texto + tmargin/bmargin |

---

## 8. Tipografía (`fontsize`) — escala XOne 1-12

> **`fontsize` en XOne NO está en puntos tipográficos ni en `dp`.** Es una **escala propia 1-12** a la que el runtime SUMA el factor de la plataforma (`puntos = fontsize + factor`; en iPad, `+4` más). El factor va en `app.xml`, **uno por plataforma**: `ios-font-factor` y `android-font-factor`. **Valores del proyecto: `android-font-factor="7"`, `ios-font-factor="8"`.** NO mapear directamente a Material `10sp`–`32sp`.

| Rango | Uso típico |
|---|---|
| 1–2 | Mínimos, contadores, marcas de tiempo |
| 3–4 | Textos secundarios, metadatos, fechas |
| **5** | **Texto estándar de campos y labels — el más usado** |
| 6–7 | Títulos de sección, pestañas, números destacados |
| 8–9 | Títulos de tarjeta, subtítulos de pantalla |
| 10–11 | Títulos de topbar, cabeceras de modal |
| 12 | Títulos grandes, nombre de la app |

Recomendado: definir clases CSS reutilizables `.font5`, `.font7`, `.font10` y aplicar con `class="font7 font-bold"`.

---

## 9. Áreas especiales

| Elemento | width | height | Notas |
|---|---|---|---|
| Mapa (`type="Z" viewmode="mapview"`) | `100%` | `600p`–`1200p` o `40%`–`60%` |  |
| Calendario (`viewmode="calendarview"`) | `100%` | `900p`–`1200p` o `50%` |  |
| Gráfico (chart) | `95%`–`100%` | `600p`–`900p` o `40%` |  |
| WebView (`type="WEB"`) | `100%` | `100%` con scroll o `Np` fijo |  |
| HTML embebido (`type="THTML"`) | `100%` | `-2` o `Np` según contenido |  |
| Stepper de progreso horizontal | `100%` | `144p`–`192p` |  |
| CoverFlow (`viewmode="coverflow"`) | `100%` | `600p`–`960p` |  |
| Lista de propiedades multinivel | `100%` | `-2` con `scroll="true"` en el padre |  |
| Tab bar (`<group>` con tabs) | `100%` | `144p` para la barra de tabs |  |

---

## 10. Márgenes y padding (`tmargin`, `bmargin`, `lmargin`, `rmargin`)

Valores autoritativos del workflow §5.1b:

| Caso | Valor |
|---|---|
| Margen entre elementos del **mismo bloque** | `tmargin="30p"` |
| Margen entre **bloques distintos** | `tmargin="50p"` |
| Margen lateral del contenido respecto al borde | `lmargin="50p"` / `rmargin="50p"` |
| Padding interno de tarjeta | `tpadding`/`bpadding`/`lpadding`/`rpadding` `30p`–`50p` |
| Margen vertical entre cards en grid | `tmargin="30p"` `bmargin="30p"` |

---

## 11. Wearable (Wear OS)

Para `default_wear.css` los tamaños son **mucho más compactos** porque la pantalla de smartwatch es ≈ 400×400p. Los wearable suelen usar `resolution-width="320"` o `"400"`, por lo que **los valores `p` son ya pequeños sin necesidad de aplicar factor xxhdpi**.

| Elemento | width | height |
|---|---|---|
| Header | `100%` | `40p`–`56p` |
| Body | `100%` | `-2` con scroll |
| Botón principal | `80%` | `56p` |
| Botón compacto | `-2` | `40p`–`48p` |
| Item de lista | `100%` | `48p`–`64p` |
| Avatar | `32p`–`40p` | igual |
| Icono | `20p`–`24p` | igual |
| Foto miniatura | `48p`–`64p` | igual |
| Tipografía body | `fontsize: 3`–`4` | — |
| Tipografía título | `fontsize: 5`–`6` | — |

---

## 12. Anti-patrones de tamaños

| MAL | BIEN |
|---|---|
| Pensar que `header 56p` es una toolbar Material (es ~18dp en 1080×1920) | Toolbar Material en 1080×1920 = `164p`–`168p` |
| Tres frames hermanos con `height="40%"` (suman 120%, desbordan) | Sumar `%` ≤ 100, o un frame con `-2`/`scroll` y los otros con `Np` fijo |
| `height="100%"` en frame body cuando arriba/abajo hay frames fijos (no resta los fijos) | `height="-2"` con `scroll="true"`, o calcular dejando margen |
| Imagen con `width="100%" height="100%"` (distorsiona) | Una dimensión fija en `Np`, la otra `-2` o usar `width="100%" height="600p"` aceptando recorte |
| Botón con `height="48p"` o `height="56p"` (por debajo del touch target en xxhdpi) | Mínimo `height="144p"` (Material 48dp × 3); idealmente `124p` para CTAs principales según workflow |
| Avatar de `200p` dentro de un header de `164p` | Avatar ≤ `(height del frame) - 48p` de margen vertical |
| `<prop width="50%">` con `labelwidth="50"` (el valor real queda con 25% de la fila) | Bajar `labelwidth` a 20-30, o subir `width` a 95-100% |
| Separador con `height="0p"` o `height="1p"` (apenas se ve en xxhdpi) | `height="4p"` con `bgcolor` definido (workflow estándar) |
| FAB con `width="100%"` (deja de ser FAB) | FAB siempre cuadrado `168p × 168p`, posicionamiento `floating="true"` |
| Footer con `height="600p"` para un solo botón de 124p (espacio muerto) | Footer `216p`–`288p` (botón + márgenes razonables) |
| `width` en `px` (`width="200px"`) | Siempre `p` o `%`. NUNCA `px`, `em`, `rem`, `dp` |
| Aplicar valores Material `dp` directamente en XOne (`56p` para una toolbar) | Multiplicar Material dp por **~3** para 1080×1920 (xxhdpi): `56dp → 164p`–`168p` |
| Mezclar `Np` y `%` arbitrariamente en hermanos | Convención: estructura en `%`, controles en `Np` fijos |
| Card en grid con `width="50%"` (no hay margen entre cards) | `width="48%"` con `lmargin="30p"` `rmargin="30p"`, o `width="49%"` con `newline="false"` |
| `<prop type="L">` (etiqueta) con `height="144p"` fijo (sobra espacio) | `height="-2"` o `96p` y dejar que la tipografía mande |
| Tab bar con `height="404p"` (demasiado alta) | `height="144p"` estándar workflow |
| Usar `fontsize="14"` o `fontsize="24"` pensando que es Material `sp` | `fontsize` en XOne va de 1 a 12. Estándar = `5`. Título topbar = `10`–`11`. Nombre app = `12` |

---

## 13. Tabla de fallback rápido (cuando no sabes qué poner)

Si tienes dudas, estos defaults nunca son escandalosos **para 1080×1920**:

| Tipo de nodo | Default seguro |
|---|---|
| `<frame>` cabecera | `width="100%" height="164p"` |
| `<frame>` cuerpo principal | `width="100%" height="-2" scroll="true"` |
| `<frame>` pie con botones | `width="100%" height="216p"` |
| `<frame>` tarjeta | `width="95%" height="-2"` |
| `<prop type="T">` (input) | `width="100%" height="144p"` |
| `<prop type="N">` (número) | `width="100%" height="144p"` |
| `<prop type="B">` (botón) | `width="90%" height="124p"` |
| `<prop type="L">` (label) | `width="100%" height="-2"` |
| `<prop type="NC">` (checkbox) | `width="100%" height="144p"` |
| `<prop type="IMG">` (imagen) | `width="100%" height="600p"` |
| `<prop type="PH">` (foto) | `width="100%" height="720p"` |
| `<prop type="DR">` (firma) | `width="100%" height="600p"` |
| `<prop type="Z">` (contenedor / lista) | `width="100%" height="-2"` o `height="100%"` |
| `<prop type="WEB">` (webview) | `width="100%" height="1200p"` |
| `<group>` (tab/pantalla) | sin width/height → ocupa el padre |
| Icono `img-width`/`img-height` | `72p` × `72p` (toolbar) o `104p` × `104p` (botón cuadrado) |
| `fontsize` texto estándar | `5` |
| `tmargin` entre elementos | `30p` |
| `tmargin` entre bloques | `50p` |

---

## 14. Si tu proyecto usa otra `resolution-width`

Si el dispositivo de referencia es distinto a 1080×1920, **escala todos los valores con la fórmula**:

```
valor_p_nuevo = valor_p_tabla × (resolution-width_proyecto / 1080)
```

Ejemplos:

| `resolution-width` | Factor | Header (164p) | Botón (124p) | Input (144p) |
|---|---|---|---|---|
| 480 (HDPI) | × 0.44 | `72p` | `54p` | `64p` |
| 720 (XHDPI) | × 0.67 | `110p` | `83p` | `96p` |
| 1080 (XXHDPI, default) | × 1.0 | `164p` | `124p` | `144p` |
| 1440 (XXXHDPI Premium) | × 1.33 | `218p` | `165p` | `192p` |

Para wearable (≈ `resolution-width` 320-400), usar directamente la tabla §11.
