"use client";

import { Icono, type NombreIcono } from "@/components/iconos";
import { useTema, type Tema } from "@/lib/tema";
import { cn } from "@/lib/utils";

const OPCIONES: { valor: Tema; icono: NombreIcono; nombre: string; explicacion: string }[] = [
  { valor: "claro", icono: "sol", nombre: "Claro", explicacion: "Claro" },
  { valor: "automatico", icono: "automatico", nombre: "Automático", explicacion: "Automático: como el sistema" },
  { valor: "oscuro", icono: "luna", nombre: "Oscuro", explicacion: "Oscuro" },
];

/**
 * Los tres temas, en tres botones chicos.
 *
 * Va en la columna y en "Más" del teléfono, y no en Configuración: esa
 * pantalla es del dueño, y el tema es de quien está mirando la pantalla.
 */
export function SelectorTema({ className, conNombres }: { className?: string; conNombres?: boolean }) {
  const [tema, elegir] = useTema();

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la pantalla"
      className={cn("flex rounded-[10px] bg-contraste/[0.05] p-0.5", className)}
    >
      {OPCIONES.map((opcion) => {
        const activo = tema === opcion.valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            title={opcion.explicacion}
            aria-label={opcion.explicacion}
            onClick={() => elegir(opcion.valor)}
            className={cn(
              "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[8px] text-chico transition-all duration-200 ease-suave",
              // En el oscuro el elegido se aclara en vez de oscurecerse, como el
              // selector de iOS.
              activo
                ? "bg-papel text-tinta shadow-apoyo dark:bg-contraste/[0.16]"
                : "text-tinta-tenue hover:text-tinta-suave"
            )}
          >
            <Icono nombre={opcion.icono} tamano={14} />
            {conNombres && <span>{opcion.nombre}</span>}
          </button>
        );
      })}
    </div>
  );
}
