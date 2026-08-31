# Tipos de `prop` válidos

> Referencia de `xone-development`. Sale del `SKILL.md` para que las reglas
> duras quepan en una lectura por omisión (100 líneas).

## Tipos de prop válidos

| Tipo | Descripción |
|---|---|
| `T` | Texto editable |
| `TN` / `TN2`…`TN6` | Texto numérico; el sufijo son los decimales visibles |
| `L` | Etiqueta de solo lectura. Sin `title`, muestra el valor del campo |
| `TL` | Alias legacy de `L` |
| `THTML` | Texto con formato HTML |
| `N` / `N2`…`N6` | Número; el sufijo son los decimales visibles |
| `D` / `DT` / `TT` | Fecha / fecha y hora / solo hora |
| `B` | Botón |
| `NC` | Checkbox, toggle, radio o switch |
| `X` | Password enmascarado |
| `IMG` / `PH` | Imagen referenciada / foto capturable |
| `VD` | Vídeo o escáner QR/barcode |
| `DR` | Dibujo o firma digital |
| `Z` | Contenedor de lista embebida |
| `WEB` | WebView |
| `AT` | Adjunto |
| `O` | Sub-objeto JavaScript, no persiste |

Los combos **no tienen tipo propio**: se hacen con `type="T"` (o `type="N"`) más `mapcol` y `mapfld`. No existen `type="C"`, `"M"`, `"A"`, `"F"`, `"S"`, `"P"`, `"E"`, `"R"`, `"H"`, `"W"`, `"CAM"`, `"ARRAY"`, `"STRING"`, `"N1"` ni `"BT"`.
