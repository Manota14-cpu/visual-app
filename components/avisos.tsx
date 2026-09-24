"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Icono } from "@/components/iconos";

/**
 * Los avisos que aparecen abajo a la derecha.
 *
 * Un cobro que salió bien y un cobro que falló tienen que distinguirse desde
 * el otro lado del mostrador, sin leer: verde con tilde, rojo con triángulo.
 * El error se queda hasta que alguien lo cierra; el éxito se va solo.
 */

type Clase = "exito" | "error" | "dato";

interface Nota {
  id: number;
  clase: Clase;
  texto: string;
}

interface Contexto {
  exito: (texto: string) => void;
  error: (texto: string) => void;
  dato: (texto: string) => void;
}

const ContextoAvisos = createContext<Contexto | null>(null);

export function useAvisos(): Contexto {
  const contexto = useContext(ContextoAvisos);
  if (!contexto) throw new Error("useAvisos necesita estar dentro de <Avisos>.");
  return contexto;
}

export function Avisos({ children }: { children: ReactNode }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const contenedor = useRef<HTMLDivElement>(null);

  /**
   * Los avisos se muestran como "popover", que es lo que los pone en la capa
   * superior del navegador.
   *
   * Sin esto, un error levantado desde adentro de un diálogo no se veía:
   * `showModal()` pinta la ventana en esa capa superior, por encima de
   * cualquier z-index del documento, así que el aviso quedaba abajo. Y como los
   * errores que más importan —"stock insuficiente", "lo cobrado no coincide"—
   * salen justamente de un formulario en un diálogo, la aplicación parecía no
   * hacer nada.
   *
   * En un navegador que no soporte popover, el atributo se ignora y el aviso
   * queda como estaba: visible en todas las pantallas menos sobre un diálogo.
   */
  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento || typeof elemento.showPopover !== "function") return;

    try {
      const visible = elemento.matches(":popover-open");
      if (notas.length > 0 && !visible) elemento.showPopover();
      if (notas.length === 0 && visible) elemento.hidePopover();
    } catch {
      // Un navegador a medio camino: mejor sin capa superior que sin avisos.
    }
  }, [notas.length]);

  const agregar = useCallback((clase: Clase, texto: string) => {
    const id = Date.now() + Math.random();
    setNotas((previas) => [...previas, { id, clase, texto }]);

    // Un error se queda: suele explicar por qué algo no se guardó, y taparlo a
    // los cuatro segundos obliga a repetir la operación para volver a leerlo.
    if (clase !== "error") {
      setTimeout(() => setNotas((previas) => previas.filter((n) => n.id !== id)), 4200);
    }
  }, []);

  const valor = useMemo<Contexto>(
    () => ({
      exito: (texto) => agregar("exito", texto),
      error: (texto) => agregar("error", texto),
      dato: (texto) => agregar("dato", texto),
    }),
    [agregar]
  );

  return (
    <ContextoAvisos.Provider value={valor}>
      {children}

      <div
        ref={contenedor}
        id="avisos"
        popover="manual"
        className="sin-imprimir pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {notas.map((nota) => (
          <div
            key={nota.id}
            className={cn(
              // Vidrio, no color plano: el aviso se apoya sobre la pantalla en
              // vez de taparla. El color queda en el ícono y en el texto.
              "vidrio-menu pointer-events-auto flex animate-entrar items-start gap-2.5 rounded-md px-3.5 py-3 text-base shadow-elevada ring-1 ring-contraste/[0.06]",
              nota.clase === "exito" && "text-exito-texto",
              nota.clase === "error" && "text-alerta-texto",
              nota.clase === "dato" && "text-tinta"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
                nota.clase === "exito" && "bg-[#34C759]",
                nota.clase === "error" && "bg-[#FF3B30]",
                nota.clase === "dato" && "bg-acento"
              )}
            >
              <Icono
                nombre={nota.clase === "exito" ? "listo" : nota.clase === "error" ? "alerta" : "etiqueta"}
                tamano={12}
              />
            </span>
            <p className="min-w-0 flex-1 text-tinta">{nota.texto}</p>
            <button
              type="button"
              onClick={() => setNotas((previas) => previas.filter((n) => n.id !== nota.id))}
              className="opacity-60 transition-opacity hover:opacity-100"
              aria-label="Cerrar aviso"
            >
              <Icono nombre="cerrar" tamano={14} />
            </button>
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}
