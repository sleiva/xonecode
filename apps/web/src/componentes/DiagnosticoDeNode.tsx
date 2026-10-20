import { useEffect, useState } from "react";
import type { DiagnosticoDeNode as Diagnostico, LineaDeDiagnostico } from "../tipos.js";
import estilos from "./DiagnosticoDeNode.module.css";

/**
 * Ajustes → General → Node: lo que hace falta en ESTA máquina para que el agente pruebe en el aparato y verifique el
 * proyecto (`src/core/diagnosticoDeNode.ts`). Nació de un paquete de soporte de un usuario en Windows: el desarrollador en
 * Claude Code se quedaba sin scripts y el verificador decía que `xone-simulator` no estaba, y no había dónde verlo.
 *
 * Una FOTO pedida a mano («Comprobar»), con su hora; sin rutas de la máquina. El botón gira desde el clic hasta que
 * llega una foto NUEVA (otra `cuando`).
 */
export function DiagnosticoDeNode({ diagnostico, alComprobar }: { diagnostico?: Diagnostico; alComprobar?: () => void }) {
  const [esperando, setEsperando] = useState<string | undefined>(undefined);
  const midiendo = esperando !== undefined && esperando === (diagnostico?.cuando ?? "");
  useEffect(() => {
    if (esperando !== undefined && (diagnostico?.cuando ?? "") !== esperando) setEsperando(undefined);
  }, [diagnostico?.cuando, esperando]);

  return (
    <section aria-label="Node y herramientas del agente">
      <h3 className={estilos.encabezado}>Node y herramientas del agente</h3>
      <p className={estilos.nota}>
        Lo que el agente necesita en esta máquina para probar en el aparato y verificar el proyecto.
      </p>
      <div className={estilos.tarjeta}>
        <div className={estilos.cabecera}>
          <span className={estilos.cuando}>
            {diagnostico === undefined ? "Sin comprobar todavía." : `Comprobado ${new Date(diagnostico.cuando).toLocaleString()}`}
          </span>
          {alComprobar === undefined ? null : (
            <button
              type="button"
              className={estilos.boton}
              disabled={midiendo}
              onClick={() => {
                setEsperando(diagnostico?.cuando ?? "");
                alComprobar();
              }}
            >
              {midiendo ? "Comprobando…" : "Comprobar"}
            </button>
          )}
        </div>
        {diagnostico === undefined ? null : (
          <dl className={estilos.lineas}>
            <Fila nombre="Node del servidor" linea={{ ok: true, valor: `${diagnostico.servidor.version} · ${sistema(diagnostico.servidor.plataforma)} ${diagnostico.servidor.arquitectura}` }} />
            <Fila nombre="«node» en el PATH" linea={diagnostico.nodeEnPath} />
            <Fila
              nombre="Scripts de las skills"
              linea={{
                ...diagnostico.scripts,
                ...(diagnostico.scripts.ok ? { valor: `${diagnostico.scripts.cuantos} detectados · ${diagnostico.scripts.valor ?? ""} arranca` } : {}),
              }}
            />
            <Fila nombre="xone-simulator (verificador)" linea={diagnostico.simulador} />
            <Fila nombre="Claude Code" linea={diagnostico.claudeCode} />
            {diagnostico.navegador === undefined ? null : <Fila nombre="Navegador (para medir la maqueta)" linea={diagnostico.navegador} />}
            {/* Sin git, una copia bajada no se puede revisar ni subir (IXCODE-60). Ausente en una foto vieja: no se pinta. */}
            {diagnostico.git === undefined ? null : <Fila nombre="Git (revisar y subir)" linea={diagnostico.git} />}
          </dl>
        )}
      </div>
    </section>
  );
}

function Fila({ nombre, linea }: { nombre: string; linea: LineaDeDiagnostico }) {
  return (
    <>
      <dt>
        <span className={estilos.punto} {...(linea.ok ? { "data-ok": "" } : {})} aria-hidden="true" />
        {nombre}
      </dt>
      <dd>
        {linea.ok ? (linea.valor ?? "funciona") : <span className={estilos.motivo}>{`No funciona: ${linea.motivo ?? "sin motivo"}`}</span>}
      </dd>
    </>
  );
}

function sistema(plataforma: string): string {
  return ({ win32: "Windows", darwin: "macOS", linux: "Linux" } as Record<string, string>)[plataforma] ?? plataforma;
}
