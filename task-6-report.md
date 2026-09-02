# Task 6 — cierre y documentación

## Cambios

- README y `docs/COMO-PROBARLO.md` reflejan el comando `/modelos <proveedor>`.
- Se documenta que `/modelos` consulta el catálogo vivo, filtra modelos de conversación y
  guarda la elección global para un papel.
- Se mantiene la separación de secretos: las claves viven en `~/.xonecode/auth.json` y
  `/provider` solo las configura; no lista modelos.
- No se modificaron los ficheros de estado del plan que ya estaban sucios.

## Verificación

Comando ejecutado correctamente: `npm test && npm run typecheck && npm run build && git diff --check`.

- `npm test`: 62 ficheros y 660 tests pasan.
- `npm run typecheck`: pasa.
- `npm run build`: pasa.
- `git diff --check`: pasa.

## Ajuste posterior

- La descripción de `COMANDOS.modelos` ahora indica explícitamente en `/ayuda` que la
  selección se guarda globalmente, conservando la sintaxis `/modelos <proveedor>`.
- El test existente de `/ayuda` ya verifica automáticamente la descripción de cada comando;
  no fue necesario añadir otro test.
