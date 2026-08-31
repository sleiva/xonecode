# PLAN.md Format

`PLAN.md` es el entregable de `xone-spec-builder` y la entrada que `xone-plan-builder` descompone, y que `xone-project-generator` (app nueva) o `xone-development` (trabajo sobre existente) consumen. Debe contener todo lo que el siguiente paso necesita para actuar **sin preguntas pendientes** — pero expresado como decisiones de diseño, no como código XML/JS/CSS listo para pegar.

> **Niveles de complejidad.** El spec-builder clasifica cada desarrollo como Trivial, Simple, Normal o Grande. Para **Trivial** no se produce `PLAN.md` (ejecución directa). Para **Simple**, el `PLAN.md` es condensado: solo las secciones que apliquen, sin secciones vacías. Para **Normal** y **Grande**, la estructura completa de abajo. Ver el triage de complejidad en `xone-spec-builder/SKILL.md`.

## Estructura

```md
# Plan — {Título del desarrollo}

**Tipo:** {app nueva | feature | refactor | integración de dispositivo | cambio de modelo de datos | rediseño de pantalla}
**Proyecto:** {nombre del proyecto XOne; "nuevo" si es app nueva}
**Scope:** {una o dos frases: qué está dentro; qué fuera}

{Una o dos frases: qué resuelve este desarrollo y por qué ahora.}

## Resumen

{3-6 bullets: el propósito, el alcance, las colls/pantallas afectadas, las integraciones clave, el modo de sincronización si aplica.}

## Modelo de datos

### Colecciones base  ← solo si el desarrollo las toca (app nueva o cambio en mappings.xne)

- **Empresas** (`ASGestion.CASEmpresa`) — CODIGO (N), NOMBRE (T).
- **Usuarios** (`ASGestion.CASUser`) — CODIGO (N), NOMBRE (T), IDEMPRESA (N, combo a Empresas), LOGIN (T), PWD (X).

### Colecciones nuevas

Por cada coll nueva: nombre, progid (omitir salvo que aplique), campos persistidos (nombre + tipo XOne válido), campos `MAP_` (los que no son columna de `objname`), relaciones, y si lleva loadall o carga bajo demanda.

- **Clientes** — NOMBRE (T), CIF (T), DIRECCION (T), TELEFONO (T), EMAIL (T), LATITUD (N6), LONGITUD (N6). Combo a Empresas vía IDEMPRESA. loadall=true (volumen bajo).

### Colecciones modificadas  ← solo si es trabajo sobre existente

Por cada coll afectada: qué cambia, qué se conserva. Nada de repetir el modelo entero si no se toca.

- **Pedidos** — añadir ESTADO (T, combo de valores fijos: borrador/enviado/entregado). Resto sin cambios.
- **LineasPedido** — añadir IVA (N2) y modificar SUBTOTAL a formula que incluya IVA. Requiere migración de esquema (xone-db-tools create-db --overwrite).

### Relaciones

- Clientes 1:N Pedidos (por IDCLIENTE).
- Pedidos 1:N LineasPedido (por IDPEDIDO, contents con filter dinámico).

## Pantallas y navegación

**App nueva:** Splash → Login → EntradaApp → MenuPrincipal → entidades.
**Sobre existente:** qué pantallas se añaden, cuáles se modifican.

Por cada pantalla afectada: nombre, propósito, si es special="true" o coll de datos, coll base si hereda con inherits, estructura en prosa, eventos clave, viewmode si aplica.

- **Login** — coll especial sin sql. Login contra DB local. Campos MAP_LOGIN/MAP_PWD. Botón "Entrar" valida y abre MenuPrincipal.
- **Pedidos (edición)** — coll existente. Modificar: añadir combo de ESTADO en grupo General; antes de guardar, validar que FECHA no sea nula. Evento onchange en ESTADO para refrescar botones de acción según estado. Resto sin cambios.
- **ClientesMapa** — coll nueva, prop type="Z" viewmode="mapview" con contents de Clientes filtrados por GPS.

## Integraciones

- **GPS** — ui.startGps() antes de leer; permiso location-foreground. Mapa de clientes usa GPSColl declarada por el proyecto.
- **Cámara** — prop type="PH" para foto de cliente. Callback con self guardado.
- **Firma digital** — prop type="DR" en Pedidos para firma de entrega.
- Sin biometría, Bluetooth, NFC ni impresión.

Permisos Android a declarar en <permissions>: location-foreground, camera.

## Sincronización y seguridad  ← solo si el desarrollo las toca

- SQLite local con prefijo gen_ (##PREF## siempre).
- Login contra DB local.
- Réplica programada en maintenance de Empresas (si hay backend).
- SQL parametrizado con ?; HTTPS siempre; tokens cifrados en macros globales y limpiados al cerrar sesión.

## Estilo  ← solo si el desarrollo toca la UI visual

- Paleta: primario #1565C0, secundario #FFC107, fondo #FFFFFF, texto #212121. Estados: error #D32F2F, éxito #388E3C.
- Tamaños (1080×1920): header 164p, body -2 con scroll, footer 216p, botones 124p, inputs 144p, fontsize texto 5 / título 7 / topbar 10.
- Clases base: .frameHeader, .frameBody, .frameFooter, .btnPrimario, .btnSecundario, .inputText, .card.

## Pendientes

Preguntas aún no resueltas por el usuario. El siguiente paso no puede resolverlas; deben aclararse antes de continuar.

- [ ] ¿La réplica es en tiempo real o por lotes nocturnos?
- [ ] ¿Hay multiidioma? (carpeta lang/ con subcarpetas ISO)

## Artefactos

- CONTEXT.md — glosario de dominio.
- docs/adr/0001-login-contra-db-local.md
- docs/adr/0002-replica-programada-en-maintenance.md
```

## Reglas

- **Decisiones, no código.** Nada de `<coll>`, `<prop>`, `self.X` ni CSS pegado. El siguiente paso lo produce a partir del plan.
- **Nombres en MAYÚSCULAS para campos persistidos**, PascalCase para colls; el `MAP_`, según `xone-development`.
- **Tipos válidos.** Solo los de la tabla de tipos de `xone-development`: `T`, `TN`, `N`, `D`, `DT`, `TT`, `L`, `B`, `NC`, `X`, `IMG`, `PH`, `VD`, `DR`, `Z`, `WEB`, `AT`, `O`, `THTML`. Los combos no tienen tipo propio: `type="T"` + `mapcol` + `mapfld`.
- **Empresas y Usuarios en mappings.xne** con sus campos obligatorios y progid propio. El resto de colls sin progid salvo excepción.
- **Secciones condicionales.** Incluye solo las que el desarrollo toca. Si una sección no aplica, omítela —no la dejes vacía ni pongas "N/A". El propio tipo de desarrollo ya indica cuáles aplican.
- **Modificaciones, no repeticiones.** En trabajo sobre existente, no repitas el modelo o las pantallas que no se tocan. Lista solo qué cambia y qué se conserva.
- **Pendientes explícitos.** Lo que no se resolvió va en §Pendientes, no se rellena por intuición.
- **Sin detalles de implementación irrelevantes.** No enumeres cada atributo de cada prop; el siguiente paso los infiere. Solo lo que es decisión de diseño: tipos, relaciones, eventos clave, viewmodes, integraciones.

## Checklist de cierre

Antes de entregar el plan, comprueba:

- [ ] Tipo de desarrollo declarado y scope claro (dentro/fuera).
- [ ] Modelo de datos: colls nuevas listadas con campos y tipos válidos; colls modificadas con qué cambia y qué se conserva.
- [ ] Relaciones expresadas con el mecanismo correcto de XOne (mapcol/mapfld, linkedto, contents, filter).
- [ ] Si el desarrollo toca mappings.xne: Empresas y Usuarios con sus campos obligatorios.
- [ ] Pantallas: flujo completo (app nueva) o cambios concretos (sobre existente).
- [ ] Cada pantalla afectada tiene propósito y contenido en prosa.
- [ ] Integraciones listadas con su objeto canónico y permisos (o "sin integraciones" explícito).
- [ ] Sincronización y seguridad definidas si aplica.
- [ ] Paleta, tema y tamaños canónicos presentes si el desarrollo toca UI visual.
- [ ] Pendientes explícitos (o sección ausente si no hay ninguno).
- [ ] CONTEXT.md con los términos de dominio nuevos resueltos.
- [ ] ADRs para las decisiones que cumplen los tres criterios.