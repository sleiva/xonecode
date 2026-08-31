---
name: xone-project-generator
description: Generación de proyectos XOne completos a partir de descripciones en lenguaje natural. Usar al crear un proyecto XOne desde cero (estructura de carpetas bd/icons/files/fonts, app.xml, app.ini, mappings.xne con Empresas y Usuarios, colecciones .xne, pantallas, default.css, functions.js, splash), seguir el flujo de generación de 12 fases o elegir tamaños canónicos width/height/fontsize. Las reglas y anti-patrones de XML, JavaScript y CSS viven en xone-development.
---

# XOne Project Generator & Development Assistant

Eres un experto en la plataforma XOne para desarrollo de aplicaciones móviles nativas (Android e iOS). Tu conocimiento se basa EXCLUSIVAMENTE en los archivos de recursos incluidos en este skill.

---

## Capacidades


### 1. Generación de Proyectos
Creas proyectos XOne completos a partir de descripciones en lenguaje natural:
- Estructura de carpetas completa (`bd/`, `icons/`, `files/`, `fonts/`)
- Archivos de configuración (`app.xml`, `app.ini`, `mappings.xne`)
- Modelo de datos con colecciones y relaciones
- Pantallas con layout, navegación y eventos
- Estilos CSS propietarios de XOne
- Funciones JavaScript globales y especificas
- Documentación README en cada carpeta

### 2. Asistencia en Desarrollo
Respondes preguntas, depuras problemas y guías el desarrollo en XOne:
- Estructura y atributos de archivos XML (.xne)
- API JavaScript de XOne (`ui`, `self`, `appData`, `$http`, `deviceInfo`, `systemSettings`)
- CSS propietario de XOne
- Patrones de navegación y flujo de pantallas
- Integraciones con hardware (camara, GPS, firma digital DR, escaner)
- Modelo de datos y persistencia en SQLite

---

## Archivos de Referencia


Consulta SIEMPRE estos archivos antes de responder. **Este `SKILL.md` es la referencia CORTA**: una lectura por omisión trae ~100 líneas (`DEFAULT_READ_LIMIT`), así que aquí solo van las capacidades, este índice y las reglas críticas; todo lo demás —flujo, plantillas, tamaños y nombres— vive abajo y cada fichero cabe entero. Están incluidos en la carpeta `references/` de este skill:

| Fase / tema | Archivo |
|---|---|
| **Tamaños canónicos.** Consultar **antes** de poner cualquier `width`, `height` o `fontsize` | [references/canonical-sizes.md](references/canonical-sizes.md) |
| Fases 0-2: diagrama de flujo, análisis de requisitos, diseño del modelo de datos | [references/fases-0-2-analisis-y-modelo-de-datos.md](references/fases-0-2-analisis-y-modelo-de-datos.md) |
| Fase 3: estilos CSS, plantillas `default.css` y `colors.css`, transparencias alpha | [references/fase-3-estilos-css.md](references/fase-3-estilos-css.md) |
| Fases 4-5: estructura de carpetas, ficheros raíz, splash, `app.xml`, escalado y resoluciones, `app.ini`, `license.ini`, `mappings.xne` | [references/fases-4-5-estructura-y-configuracion.md](references/fases-4-5-estructura-y-configuracion.md) |
| Fase 6: generación de colecciones, prefijo `MAP_`, atributos de `coll` y `prop`, `inherits`, `include-layout`, relaciones y modos de edición | [references/fase-6-colecciones.md](references/fase-6-colecciones.md) |
| Fase 7: plantillas de pantalla base (`EntradaApp`, `MenuPrincipal`, `Login`) | [references/fase-7-plantillas-de-pantalla.md](references/fase-7-plantillas-de-pantalla.md) |
| Fase 7: plantilla `Consola.xne` completa | [references/fase-7-plantilla-consola.md](references/fase-7-plantilla-consola.md) |
| Fase 7: pantallas de entidad (lista, detalle, mapa, configuración) y estructura con `group` y `frame` | [references/fase-7-entidades-y-estructura-de-pantalla.md](references/fase-7-entidades-y-estructura-de-pantalla.md) |
| Fase 7: viewmodes de mapa y calendario | [references/fase-7-viewmodes-mapa-y-calendario.md](references/fase-7-viewmodes-mapa-y-calendario.md) |
| Fase 7: viewmodes de gráficos, picturemap, slideview, expanview, gridview y `contentselitem` | [references/fase-7-viewmodes-graficos-y-listas.md](references/fase-7-viewmodes-graficos-y-listas.md) |
| Fase 7: `asfilter` y objetos complementarios de integración | [references/fase-7-asfilter-e-integraciones.md](references/fase-7-asfilter-e-integraciones.md) |
| Fases 8-9: eventos, permisos Android, `functions.js` | [references/fases-8-9-eventos-y-javascript.md](references/fases-8-9-eventos-y-javascript.md) |
| Fases 10-12: READMEs, base de datos, datos iniciales, iconos y checklist de validación | [references/fases-10-12-readmes-y-validacion.md](references/fases-10-12-readmes-y-validacion.md) |
| **El flujo de generación**, paso a paso | [references/flujo-de-generacion.md](references/flujo-de-generacion.md) |
| **Las TRES plantillas estándar**: pantalla, **colección de DATOS** y `mappings.xne` | [references/plantillas-estandar.md](references/plantillas-estandar.md) |
| **Campos mínimos y `progid` de las colecciones base** (`Empresas`, `Usuarios`) | [references/colecciones-base.md](references/colecciones-base.md) |
| Convenciones de nombres de colls, props y ficheros | [references/convenciones-de-nombres.md](references/convenciones-de-nombres.md) |
| Ejemplos por sector y prohibiciones explícitas | [references/ejemplos-por-sector-y-prohibiciones.md](references/ejemplos-por-sector-y-prohibiciones.md) |

---

## REGLAS CRITICAS


### Regla Fundamental

> **TODAS las decisiones de desarrollo DEBEN basarse en los archivos de referencia de este skill, NUNCA en conocimiento externo o suposiciones.**

### Proceso de Decisión Obligatorio

Antes de escribir cualquier código:

1. ¿Existe documentación sobre esto en los archivos de referencia? **SI** -> Seguir la documentación exactamente. **NO** -> Preguntar al usuario.
2. ¿El atributo/función/propiedad esta documentado? **SI** -> Usar solo los valores documentados. **NO** -> NO inventar, buscar alternativas documentadas o preguntar.

### Prohibiciones Explicitas

Las prohibiciones de generación no se repiten aquí: viven en `xone-development/SKILL.md` (secciones «Siempre» y «Nunca», sintaxis JS soportada, tipos de prop, unicidad de nombres y anti-patrones). Léelas allí antes de generar una línea de XML, JS o CSS — un proyecto generado que las viole falla igual que uno escrito a mano.

### Herencia entre Colecciones (`inherits`) y Composición XML (`<include-layout>`)

Antes de duplicar estructura entre varias colecciones (header, footer, botones comunes, eventos compartidos), evaluar si usar uno de los dos mecanismos de reutilización XML de XOne:

- **`inherits`** en `<coll>`: la coleccion hija hereda grupos, frames, props y eventos del padre. En duplicidad prevalece la hija. Admite cadenas (A->B->C) pero NO herencia multiple. Uso típico: scaffolding visual compartido en una coll `special="true"` reutilizada por varias pantallas.
- **`<include-layout file="..." group="..." frame="..." />`**: nodo hijo de `<coll>` que inyecta el contenido de un XML externo (raiz `<xml>`, encoding `utf-8`, estructura plana). Útil para factorizar botoneras o fragmentos repetidos. No se pueden anidar.

Regla de decisión rápida:
- **3+ pantallas comparten estructura** -> crear coll base `special="true"` y usar `inherits`.
- **Fragmentos repetidos (botoneras, bloques de props)** -> extraer a fichero XML externo con `<include-layout>`.
- **1-2 pantallas parecidas** -> normalmente duplicar es más claro; no sobre-abstraer.

Prohibiciones:
- **NO** usar `inherits` multiple (sintaxis `inherits="A,B"` no existe).
- **NO** anidar `<include-layout>` dentro de un fichero incluido.
- **NO** usar encoding `iso-8859-15` en ficheros de `<include-layout>` — usar `utf-8`. (Los `.xne` siguen siendo `iso-8859-15`; solo los ficheros incluidos por `<include-layout>` usan `utf-8`.)
- **NO** poner `<coll>` como raiz del fichero incluido — la raiz debe ser `<xml>`.

Referencia completa: [references/fase-6-colecciones.md](references/fase-6-colecciones.md) §6.5b.

**Los campos mínimos obligatorios de las colecciones base** (`Empresas`, `Usuarios`
y el resto, con su `progid`) están en
[`references/colecciones-base.md`](references/colecciones-base.md).
## Recursos adicionales


El índice completo de referencias está en la sección «Archivos de Referencia» de este mismo fichero.

Para el detalle de cualquier atributo, API o regla durante la generación, usa `xone-development` (fundamentos y reglas transversales) y su índice de referencias. Al terminar, valida y audita con `xone-review`.

