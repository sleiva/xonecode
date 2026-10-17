# El banco y los evals

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

## El banco (`npm run banco`, nunca en `npm test`)

`src/evals/banco.ts` mide **cuánto cuesta enterarse**: preguntas de solo lectura sobre el
esqueleto, repetidas por modelo, con juez. El eval pregunta si sabe hacerlo; el banco, lo que
cuesta y **cuánto varía**. Las reglas viven en `medidas.ts` (puro, con test): la media **nunca**
sale sin su rango y su dispersión, una pasada que reventó se cuenta aparte, y se marcan dos cosas
que invalidan una comparación — una respuesta INCORRECTA y una pasada que **no delegó** cuando
otras sí. `comparar()` se NIEGA a concluir con los rangos solapados. Su aprobación **rechaza**:
esto son preguntas.

## Los evals (`npm run eval`, nunca en `npm test`)

`src/evals/correr.ts` corre tareas XOne reales sobre el esqueleto «Hola Mundo» en un temporal, con
el agente de verdad, el simulador de verdad y una aprobación que **aprueba todo** (por eso no
acepta una raíz: solo sobre un proyecto que se tira). El veredicto del simulador se MIDE en el
corredor, no se lee del turno. Los JUECES (`tareas.ts`) son código puro y SÍ tienen test en `npm
test`. El corredor vive en `src/` para tipearse, `tsconfig.build.json` lo excluye, y su nombre no
acaba en `.test.ts`. `docs/EVALS.md` tiene las tareas, cómo leer un resultado y por qué la línea
base se comprueba.
