# ADR Format

Los ADRs viven en `docs/adr/` y usan numeración secuencial: `0001-slug.md`, `0002-slug.md`, etc.

Crea el directorio `docs/adr/` **lazy** —solo cuando se necesita el primer ADR.

## Plantilla

```md
# {Título corto de la decisión}

{1-3 frases: qué contexto había, qué se decidió y por qué.}
```

Eso es todo. Un ADR puede ser un solo párrafo. El valor está en registrar *que* se tomó una decisión y *por qué*, no en rellenar secciones.

## Secciones opcionales

Inclúyelas solo cuando aporten valor real. La mayoría de ADRs no las necesita.

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`) — útil cuando se revisitan decisiones
- **Opciones consideradas** — solo cuando las alternativas descartadas merezcan recordarse
- **Consecuencias** — solo cuando haya efectos colaterales no obvios que señalar

## Numeración

Escanea `docs/adr/` buscando el número más alto existente e incrementa en uno.

## Cuándo ofrecer un ADR

Los tres deben cumplirse:

1. **Difícil de revertir** — el coste de cambiar de opinión después es significativo
2. **Sorprendente sin contexto** — un futuro lector mirará el código y se preguntará «¿por qué hicieron esto así?»
3. **Resultado de un trade-off real** — había alternativas genuinas y se eligió una por razones concretas

Si la decisión es fácil de revertir, sáltatelo —simplemente la revertirás. Si no sorprende, nadie se preguntará por qué. Si no había alternativa real, no hay nada que registrar más allá de «hicimos lo obvio».

### Qué cuenta en XOne

- **Forma de sincronización.** «SQLite local puro» contra «réplica programada con backend». Revertir implica re-arquitecturar el modelo de datos.
- **Modelo de autenticación.** Login contra DB local vs OAuth2 contra IdP externo. Cambiarlo tarde toca todo el flujo de entrada.
- **Estrategia offline.** «La app opera siempre offline y replica en segundo plano» vs «requiere conexión». Define la arquitectura entera.
- **Persistencia de tokens.** Tokens OAuth2 cifrados en macros globales y limpiados al cerrar sesión — no en claro, no en logs.
- **Elección de viewmode para un volumen grande.** `gridview` vs `mapview` cuando el número de registros o la usabilidad lo justifican y la elección no es obvia.
- **`compatibility-mode="true"` activado a propósito.** El CSS se ignora por completo; registrar el ADR evita que alguien pierda tiempo diagnosticando estilos que no aplican.
- **`inherits` frente a `<include-layout>`.** Cuando se elige uno sobre el otro por razones no obvias (cadena de herencia vs factorización de fragmentos), y revertir implicaría reestructurar varias colls.
- **Uso de `fetch` frente a `$http`.** Si se desvía del idiomático `$http` hacia `fetch` por una razón concreta (p. ej., `AbortController`), vale la pena registrarlo porque el siguiente ingeniero asumirá `$http`.

### Qué no cuenta

- El nombre de una coll. Reversible: se renombra.
- Un `fontsize` concreto. Reversible: se cambia en el CSS.
- Usar `before-edit` en vez de `load`. Es la regla, no una decisión —no hay trade-off.
- Declarar o no `ID`/`ROWID` como `<prop>`. Es redundante pero válido; no sorprende a nadie.