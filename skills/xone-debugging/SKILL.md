---
name: xone-debugging
description: Diagnóstico sistemático de errores y rendimiento en aplicaciones XOne. Usar al depurar pantallas vacías, botones que no responden, eventos que no disparan, colecciones sin datos, self null, errores -8100 y -11888, problemas de refresh o de persistencia MAP_, lentitud en listas, o al analizar un fallo con xone-simulator.
---

# XOne Debugging

Diagnostica por capas: reproduce, aísla, corrige y verifica. Antes de cambiar código, ejecuta el caso con `xone-simulator` y confirma el síntoma exacto. No propongas cambios a ciegas: formula una hipótesis comprobable y compruébala.

## Proceso

1. Reproduce el fallo.
2. Aísla la capa: XML/UI, evento JavaScript, colección o persistencia.
3. Busca el síntoma en las referencias.
4. Corrige con el patrón documentado.
5. Vuelve a validar y hacer smoke.

```bash
xone-simulator validate ./proyecto
xone-simulator run ./proyecto --coll MiColl --event before-edit
xone-simulator render ./proyecto --coll MiColl
xone-simulator smoke ./proyecto --json
```

`--coll` acota, `--json` da salida estructurada y `--db-path` debe apuntar a una **copia** de la BD: el simulador puede mutarla. El validador detecta `ANTIPATTERN_LOAD_EVENT` y `ANTIPATTERN_MULTIPLE_BEFORE_EDIT`.

## Diagnóstico rápido

- **Pantalla vacía**: revisa `loadAll()`, `visible`, `unlock`, `ui.refresh()`, filtros `##FLD_CAMPO##`, que el `contents` del `prop type="Z"` coincida con el `<contents name>`, nombres duplicados en la coll, `special` junto a `sql`, y `newline="false"` en el primer elemento de un frame.
- **CSS que no se aplica**: comprueba primero `compatibility-mode` en el nodo `<app>` (regla en `xone-development`).
- **Botón mudo**: `visible`, `disableedit`, solapamientos, y que exista el handler de `onclick` o `method="ExecuteNode(nombre)"` (nunca los dos a la vez).
- **Evento que no dispara**: nombres exactos y case-sensitive, y errores JavaScript silenciosos.
- **`onchange` que no salta**: en `type="T"` ocurre al perder el foco; para cada tecla, `ontextchanged`. `onchange` acepta comandos (`refresh`, `refresh(MAP_CAMPO)`), no booleanos.
- **Refresh que no repinta**: usa el nombre exacto del `<prop>`. Tras `setFieldPropertyValue` hay que llamar a `ui.refresh(prop)`: no repinta solo. En callbacks, conserva `self` y comprueba `ui.getView(...)`.
- **Datos que no persisten**: los campos `MAP_` son transitorios y el framework los excluye de INSERT y UPDATE. Para guardar, usa un campo con columna.
- **Pantalla que no se inicializa**: la lógica está en `<load>`. Muévela a `<before-edit>`.
- **`-8100`**: falta un campo obligatorio.
- **`-11888`**: distingue `##EXIT##` de `##EXITAPP##` (regla en `xone-development`).
- **Lentitud**: trabajo pesado en `<load>`, `loadall="true"` en tablas grandes, refrescos dentro de bucles.

## Reglas

Las reglas de XOne detrás de estos síntomas viven en la skill `xone-development`. Aquí solo se diagnostica: para la forma correcta, consulta allí antes de aplicar una corrección.

## Referencias

| Para… | Lee |
|---|---|
| Preguntas frecuentes por área: general, XML/UI, JavaScript, CSS y estructura de proyecto | [references/faq.md](references/faq.md) |
| Troubleshooting completo por síntoma (incluye «`load` no inicializa la pantalla») y glosario de términos XOne | [references/troubleshooting-y-glosario.md](references/troubleshooting-y-glosario.md) |

Para las reglas y anti-patrones de cada capa, `xone-development`. Para el flujo completo de validación y auditoría, `xone-review`.
