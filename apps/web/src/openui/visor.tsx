/**
 * El VISOR de un artefacto OpenUI: lo que corre DENTRO del iframe de un `.openui`.
 *
 * **Es una entrada de build aparte** (`vite.openui.config.ts`) y la aplicación no la importa
 * nunca (`frontera.openui.test.ts`): el renderer y su librería de componentes pesan varios
 * megas, y cargarlos en la consola para no usarlos sería pagar ese peso en cada arranque.
 *
 * El servidor lo incrusta ENTERO en el documento del artefacto, con el programa al lado
 * (`web/servidor/visorOpenui.ts`), porque el iframe tiene un origen opaco: una petición suya al
 * servidor sale con `Origin: null` y se contesta con 403. Así que aquí no se pide nada:
 *
 * - **Sin `toolProvider`**: un `Query()` o un `Mutation()` no tienen a quién llamar.
 * - **`onAction` inerte**: un `@ToAssistant` o un `@OpenUrl` no salen de aquí.
 * - **Los errores de análisis se ENSEÑAN** encima de lo que se pinte: un programa con un
 *   argumento corrido pinta a medias, y a medias sin decirlo es un dibujo que miente.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/defaults.css";
import { programaDeOpenui } from "./programa.js";

interface ErrorDeAnalisis {
  code?: string;
  message?: string;
}

function Visor({ programa }: { programa: string }) {
  const [errores, setErrores] = useState<ErrorDeAnalisis[]>([]);
  return (
    <>
      {errores.length === 0 ? null : (
        <div role="alert" className="xonecode-openui-errores">
          <strong>{`El programa tiene ${errores.length} ${errores.length === 1 ? "error" : "errores"}: lo que se ve puede estar incompleto.`}</strong>
          <ul>
            {errores.slice(0, 5).map((e, i) => (
              <li key={i}>{`${e.code ?? "error"} · ${(e.message ?? "").slice(0, 200)}`}</li>
            ))}
          </ul>
        </div>
      )}
      <Renderer
        response={programa}
        library={openuiLibrary}
        toolProvider={null}
        onAction={() => {}}
        onParseResult={(r) => {
          const lista = (r as { meta?: { errors?: ErrorDeAnalisis[] } } | null)?.meta?.errors ?? [];
          setErrores((antes) => (antes.length === lista.length ? antes : lista));
        }}
      />
    </>
  );
}

const fuente = document.getElementById("xonecode-programa")?.textContent ?? "";
const raiz = document.getElementById("xonecode-raiz");
if (raiz !== null) createRoot(raiz).render(<Visor programa={programaDeOpenui(JSON.parse(fuente || '""'))} />);
