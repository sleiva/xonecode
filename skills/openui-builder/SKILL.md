---
name: openui-builder
description: "Build a data artifact in OpenUI Lang —a table, a report or a dashboard— that the console renders with its own component library. Much cheaper to write than an HTML page. Use it for pieces that lay out data; for diagrams, or for a piece with its own analysis or style, use artifacts-builder."
---

# OpenUI builder

## Antes de nada: qué necesitas y dónde va

- **Hace falta la tool `get_openui_instructions`**, que enseña el lenguaje y su catálogo de
  componentes. Se monta en el ESPECIALISTA que tiene esta skill, en el motor de xonecode.
  - **Si repartes el trabajo** (eres el orquestador): que tú no la veas no significa que no
    exista. No decidas el formato en el encargo; delega en quien tenga esta skill y déjale elegir.
  - **Si vas a escribir el artefacto y no la tienes** (corres en otro motor): no escribas OpenUI
    —sin ella te inventarías la sintaxis, y un componente inventado no se pinta—. Usa
    `artifacts-builder`.
- **El programa va en un FICHERO**, `/artefactos/<nombre>.openui`, con `write_file`. No en tu
  respuesta: tu respuesta la lee el orquestador, no una persona. Como artefacto se anuncia y se ve
  en la pestaña Artefactos. Puedes dejarlo con su valla ` ```openui ` o sin ella.
- **Se ve en un iframe SIN RED**: nada de `Query()` ni `Mutation()`, nada de imágenes de fuera, y
  las acciones (`@ToAssistant`, `@OpenUrl`, botones) no hacen nada. **Hornea los datos literales.**

## Cuándo OpenUI y cuándo HTML

Escribir OpenUI cuesta varias veces menos que el mismo artefacto en HTML, porque describes QUÉ
componentes van y la librería los pinta. El precio es que no eliges cómo se ven.

- **OpenUI**: tablas (con búsqueda, orden y paginación), informes con resumen y lista, paneles de
  KPIs y gráficos sobre unos datos que ya tienes.
- **`artifacts-builder` (HTML)**: diagramas, piezas donde el análisis ES el contenido, o donde el
  estilo importa.

## Lo que falla, y cómo evitarlo

Salió de medir el mismo encargo en los dos formatos:

- **Los argumentos son POSICIONALES.** `Card([hijos], "card", "row", "m")`: uno corrido desplaza a
  todos los de detrás, y el programa se pinta a medias con un aviso de errores encima. Repasa el
  orden de cada llamada contra su firma.
- **`Tabs` solo para vistas ALTERNATIVAS de lo mismo**, nunca para lo principal: el visor abre en
  la ÚLTIMA pestaña, y lo que dejes en las otras no se ve al abrir. Un informe con los errores en
  una pestaña y la info en otra abre enseñando la info.
- **No inventes categorías que los datos no traen.** Llamar «huérfana» o «aislada» a una colección
  sin referencias es falso: el índice no ve todas las formas de llegar a ella.
- **No sumes ni apiles lo que se contiene.** En un consumo de tokens la caché va DENTRO de la
  entrada: apilarlas en una barra la cuenta dos veces.
- **Calcula con las funciones de la librería** (`@Sum`, `@Count`, `@Avg`…) sobre los datos, en vez
  de escribir a mano un total que puede no cuadrar.
