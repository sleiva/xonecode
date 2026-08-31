# Tamaños canónicos (`width` / `height` / `fontsize`)

> Referencia de `xone-project-generator`. Sale del `SKILL.md` para que lo
> esencial quepa en una lectura por omisión (100 líneas).

## Tamaños canónicos (`width` / `height` / `fontsize`)


Antes de fijar cualquier `width` o `height`, consulta **[references/canonical-sizes.md](references/canonical-sizes.md)** — contiene tablas por tipo de elemento (frames, botones, inputs, listas, avatares, iconos, tipografía, áreas especiales, wearable) y los anti-patrones más frecuentes. **Todos los valores están calibrados para `resolution-width="1080"` / `resolution-height="1920"` (default XOne).**

> **REGLA CRÍTICA:** En XOne **`p` ≠ `dp`**. 1p = 1px en el dispositivo de referencia. Material 56dp en 1080×1920 (xxhdpi, density 3×) = **~168p**, NO 56p. Aplicar valores Material directamente como `p` produce barras/botones ~3× más pequeños de lo necesario.

### Heurísticas de decisión (memorizar)

1. **Header / footer / toolbar / drawer fijos** → `height` en `Np` absoluto (típicos en 1080×1920: header `164p`, header completo con tabs `404p`, footer con botones `216p`–`288p`, bottom nav `168p`, drawer width `840p`–`960p`).
2. **Frame body principal entre header y footer fijos** → `height="-2"` o `height="100%" scroll="true"`. NUNCA un `%` calculado a mano restando los fijos.
3. **Contenido apilado verticalmente** → `height="-2"` (wrap content) y dejar que el contenido mande. Solo fijar `Np` si necesitas mínimo visual.
4. **Imágenes, avatares, iconos** → `Np` fijos en **ambos** ejes para preservar aspecto. NUNCA `width="100%" height="100%"` en una imagen.
5. **Botones** → `width` en `%`, `height` en `Np`, mínimo **144p** (touch target Material 48dp × 3 en xxhdpi). CTAs principales: `124p` (workflow pill).
6. **Inputs** → `width="95%"`–`"100%"`, `height` en `Np` (típico `144p`).
7. **Dos elementos en la misma fila** → anchos `%` que sumen ≤ 100%; el segundo no hereda el salto de línea por defecto (regla en `xone-development`).
8. **Los `%` se refieren al padre directo**, no a la pantalla. Tres frames hermanos con `height="40%"` desbordan (suman 120%).
9. **`<prop>` tiene 2 columnas internas (label + valor)**: si `labelwidth="50"` y `width="50%"`, el valor real queda con 25% de la fila. Bajar `labelwidth` a 20-30 o subir `width` a 95-100%.
10. **`fontsize` usa escala XOne 1-12**, NO Material `sp`/`dp`. Texto estándar = `5`, título sección = `7`, topbar = `10`–`11`, nombre app = `12`.

### Defaults seguros para 1080×1920 (cuando no estás seguro)

| Nodo | width | height |
|------|-------|--------|
| `<frame>` cabecera | `100%` | `164p` |
| `<frame>` cuerpo | `100%` | `-2` con `scroll="true"` |
| `<frame>` pie con botones | `100%` | `216p` |
| `<frame>` tarjeta | `95%` | `-2` |
| `<prop type="T">` / `N` / `D` / `combo` | `100%` | `144p` |
| `<prop type="B">` (botón) | `90%` | `124p` |
| `<prop type="L">` (label) | `100%` | `-2` (o `96p`) |
| `<prop type="NC">` (checkbox) | `100%` | `144p` |
| `<prop type="IMG">` / `PH` / `DR` | `100%` | `600p`–`720p` |
| `<prop type="Z">` (contenedor) | `100%` | `-2` o `100%` |
| Icono `img-width` / `img-height` | `72p` (toolbar) o `104p` (botón cuadrado) | igual |
| `tmargin` entre elementos del mismo bloque | — | `30p` |
| `tmargin` entre bloques distintos | — | `50p` |
| `fontsize` texto estándar | — | `5` |

> **Si `resolution-width` ≠ 1080**, escalar con `valor_nuevo = valor_tabla × (resolution-width / 1080)`. Detalle en §14 de [references/canonical-sizes.md](references/canonical-sizes.md).

> **Limitación honesta:** sin ver el render real es imposible afinar al píxel. Estos valores cubren el caso típico y evitan errores groseros (desborde, touch target insuficiente, distorsión de imagen), pero pueden requerir ajuste tras la primera compilación. Si el usuario aporta una captura o el dispositivo objetivo (móvil / tablet / wearable / kiosko), usar la sección §11 (wearable) o ajustar proporcionalmente.

---
