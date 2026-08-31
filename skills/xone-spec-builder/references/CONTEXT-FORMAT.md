# CONTEXT.md Format

## Estructura

```md
# {Nombre del dominio}

{Una o dos frases: qué es este dominio y por qué existe.}

## Lenguaje

**Cliente**:
Persona u organización que realiza pedidos.
_Evitar_: Cuenta, comprador, usuario

**Pedido**:
Solicitud de productos realizada por un cliente en una fecha.
_Evitar_: Orden, transacción, compra

**Línea de pedido**:
Cada uno de los productos que componen un pedido, con cantidad y precio.
_Evitar_: Detalle, item, línea

**Estado de pedido**:
Fase del ciclo de vida de un pedido: borrador, enviado, entregado, facturado.
_Evitar_: Status, situación
```

## Reglas

- **Sé opinado.** Cuando existan varias palabras para el mismo concepto, elige la mejor y lista las demás bajo `_Evitar_`.
- **Definiciones ajustadas.** Una o dos frases máximo. Define lo que ES, no lo que hace.
- **Solo términos del dominio.** Los conceptos generales de programación (timeout, error, callback) no pertenecen aquí aunque el proyecto los use. Antes de añadir un término, pregúntate: ¿es un concepto único de este dominio, o un concepto general? Solo lo primero va aquí.
- **Agrupa bajo subencabezados** cuando aparezcan clústeres naturales. Si todos los términos pertenecen a un área cohesionada, una lista plana es suficiente.
- **Sin detalles de implementación.** Nada de SQL, nombres de `<prop>`, tipos de XOne ni nombres de coll. `CONTEXT.md` es un glosario de negocio, no un spec técnico — eso vive en `PLAN.md`.
- **Sin términos técnicos de XOne.** "Colección", "DataObject", "contents", `MAP_`, `##PREF##` son vocabulario de la plataforma, no del dominio del usuario. No van aquí; viven en `xone-development`.

## Cuándo actualizar

Durante la entrevista, cada vez que un término de dominio se **resuelva** —el usuario lo define o se elige el canónico entre sinónimos— se actualiza `CONTEXT.md` ahí mismo, sin batchear. Si no existe el archivo, se crea en ese momento.

No actualices `CONTEXT.md` con términos de XOne ni de implementación. Solo lenguaje de negocio.