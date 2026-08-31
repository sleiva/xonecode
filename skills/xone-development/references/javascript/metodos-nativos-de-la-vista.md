# XOne JavaScript — Métodos nativos de la vista (Android/iOS)

Contenido: el mecanismo · qué garantías hay · regla de admisión · tabla de métodos · cómo se envuelve

---

## El mecanismo

`ui.getView(self)` devuelve la **ventana** del objeto actual. Indexarla por nombre devuelve un
frame o un control, igual que `getControl`:

```javascript
let window = ui.getView(self);       // ventana
let frame  = window["mi_frame"];     // frame
let ctrl   = window["MAP_MI_PROP"];  // control (equivale a getControl("MAP_MI_PROP"))
```

Esos tres objetos son **envoltorios sobre la vista nativa** de la plataforma: `View` en Android,
`UIView` en iOS. Los métodos de esta página actúan sobre esa vista, y por eso valen igual para
un frame que para un control: lo que hay debajo es una vista en ambos casos.

La API que XOne garantiza por cada **tipo** de control —campos, listas, mapas, cámara…— es otra
cosa, y vive en [métodos de los controles](metodos-de-los-controles.md).

## Qué garantías hay

Cada método se implementa sobre la vista nativa de cada plataforma, así que **la disponibilidad
y el comportamiento se confirman por plataforma, no en general**. La columna «Confirmado en» es
la que manda, y hay casos que además exigen una versión mínima del sistema — `setBlur` y
`setSaturation` necesitan **iOS 17+**.

Que un método funcione en una plataforma no implica que exista en la otra. Lo que no aparece en
la tabla no está confirmado en ninguna.

## Regla de admisión

> **Una entrada entra en la tabla solo si se ha confirmado funcionando, anotando en qué
> plataforma. Lo no confirmado no se escribe.**

No es burocracia: si esta página se llena de métodos plausibles pero no comprobados, deja de
valer para nada. Una lista corta y cierta es útil; una larga y verosímil es un pasivo.

Esta página **no enumera la API de vistas de Android ni de iOS**. Esa lista no pertenece a este
repositorio.

## Métodos

| Método | Qué hace | Confirmado en |
|---|---|---|
| `setBlur(radius)` | Desenfoque. `0` = sin efecto; mayor, más desenfoque | Android · **iOS 17+** |
| `setSaturation(value)` | Saturación. `0` = grises; `1` = normal; `>1` = saturado | Android · **iOS 17+** |
| `setOpacity(0-100)` | Opacidad. `0` = transparente; `100` = opaca | Android · iOS |
| `setTintColor(color)` | Color de tinte. Color hex | Android · iOS |
| `setShadow(opacity, radius, offsetX, offsetY, color)` | Sombra. Opacidad `0–1`, radio, desplazamiento y color hex. **No se ve si la vista recorta su contenido**, porque la sombra cae fuera del borde | Android · iOS |
| `setScale(sx[, sy])` | Escala. `sy` opcional: si falta, se usa `sx`. **Acumula** | Android · iOS |
| `setRotation(grados)` | Rotación en **grados**, no radianes. **Acumula** | Android · iOS |
| `setTranslate(dx, dy)` | Desplazamiento, en puntos. **Acumula** | Android · iOS |
| `resetTransform()` | Deshace todas las transformaciones acumuladas | Android · iOS |
| `setZIndex(z)` | Posición en el eje Z | Android · iOS |
| `bringToFront()` | Trae al frente **dentro de su contenedor**, no de la pantalla | Android · iOS |
| `sendToBack()` | Manda al fondo **dentro de su contenedor**, no de la pantalla | Android · iOS |

**Las transformaciones acumulan.** `setScale`, `setRotation` y `setTranslate` se concatenan
sobre la transformación actual en vez de reemplazarla: llamar dos veces a `setScale(2)` deja la
vista a escala 4. Para volver al punto de partida se usa `resetTransform()`, no una
transformación inversa.

## Cómo se envuelve

No se llaman sueltos: se envuelven en `functions.js`. El envoltorio resuelve la ventana una vez
y comprueba el nulo, que es lo que evita el error cuando el evento salta sin vista montada.

```javascript
// Desenfoque sobre un frame
function doBlurEffect(sFrame, nValue) {
    let window = ui.getView(self);
    if (!window) return;
    window[sFrame].setBlur(nValue);
}

// Saturacion sobre un frame
function doSaturationEffect(sFrame, nValue) {
    let window = ui.getView(self);
    if (!window) return;
    window[sFrame].setSaturation(nValue);
}
```

El patrón típico es un slider que llama al envoltorio desde su `onchange`. El rango del ejemplo
—`min="0" max="32"`— es el del slider, no un límite del método:

```xml
<prop name="MAP_BLUR_SLIDER" type="N"
      updates="MAP_BLUR_SLIDER"
      min="0" max="32"
      viewmode="slider" orientation="horizontal"
      notify-only-when-dropped="false"
      width="800p" height="100p" />
```

```xml
<onchange>
    <field name="MAP_BLUR_SLIDER">
        <action name="runscript">
            <script>
                doBlurEffect("mi_frame", self.MAP_BLUR_SLIDER);
            </script>
        </action>
    </field>
</onchange>
```

**No existe `ui.setBlur` ni `ui.setSaturation`.** Se llaman sobre el frame o el control, nunca
sobre `ui`.
