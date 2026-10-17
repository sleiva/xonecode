# El verificador, en el turno

Trozo del mapa de la raíz (`CLAUDE.md`), que Claude Code carga al trabajar en esta carpeta.
Mismas reglas que la raíz: mapa e invariantes, y el porqué medido en `docs/DECISIONES.md`.
Ante una discrepancia con el código, **el código manda**.

# El verificador, en el turno

`agent/turno/turnoReal.ts#conVerificacion`. Cinco reglas:

- **Cosido al FINAL del flujo, no después del turno** (`correrTurno` cierra en su `finally`).
- **Solo la ronda FINAL**, la que termina sin escrituras pendientes.
- **Solo si el turno tocó ficheros del PROYECTO** — `.xonecode/` no cuenta. **En TrueForge, tampoco un turno que solo
  dejó documentación** (`core/entrega.ts#soloDocumentacion`, `.md`, lista BLANCA): el simulador mira la app, y sin él en
  la máquina un `.md` bien escrito cerraba con «no se pudo verificar» (IXCODE-27). La entrega de una tarea lo decide con
  el diff de git (`cambiados`) y lo DICE con `SALVEDAD_SOLO_DOCUMENTACION`; el juez lo sabe. Y que falte el binario se
  dice como «no está instalado» y que lo escrito SÍ está en el disco, una vez. El aviso «no ha
  corrido» solo sale si escribió y aun así no se verificó, con el motivo.
- **Los hallazgos se REPARTEN** entre los ficheros del turno (fichero RELATIVO y línea, nunca
  contenido) y `preexistentes`. Uno sin fichero va con los del turno. Un hallazgo no atribuye
  autoría: el simulador mira el proyecto entero.
- **El crítico de pantalla del cierre no corre si el turno ya pasó `xone_critica_visual`** (TrueForge): mira la captura
  SOLA, sin la maqueta, y medido en Maset tomó por defecto una franja del diseño, contradiciendo al que sí la tenía.
- **Que falte el binario es fallo del ENTORNO** y se dice en un `aviso`, sin tumbar el turno. El
  verificador entra por parámetro (`verifier?: VerifierPort`), así que `npm test` sigue sin él.

**Un rojo se REPARA** (`TOPE_REPARACIONES`, dos intentos): los hallazgos vuelven como mensaje de
USUARIO en el mismo hilo. La huella son los **ERRORES** (código|fichero|línea) comparada con la
del veredicto anterior. **Un turno cierra UNA vez**: lo decide el generador al agotar el flujo, y
las condiciones con que predice otra ronda son **las mismas** del `break` del bucle. `reparacion`
se emite al EMPEZAR la pasada.

`agent/turno/instantanea.ts`: la foto del ANTES es un árbol de git en un `GIT_INDEX_FILE` privado
—sin commits, sin tocar el índice del usuario— y se toma **por turno**, no por sesión.
