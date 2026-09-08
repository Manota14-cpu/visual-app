"use client";

import { plata } from "@/lib/formato";

/**
 * Los gráficos, dibujados con SVG y CSS a mano.
 *
 * Son dos formas —columnas por día y barras por categoría— y ninguna necesita
 * ejes, zoom ni leyenda. Una biblioteca de gráficos agrega cien kilobytes al
 * paquete y trae su propia estética, que es justo lo que no queremos.
 */

export function ColumnasPorDia({ datos }: { datos: { dia: string; total: number }[] }) {
  const maximo = Math.max(...datos.map((d) => d.total), 1);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex h-[140px] items-end gap-1.5" role="img" aria-label="Ventas de los últimos catorce días">
      {datos.map((punto) => {
        const alto = punto.total > 0 ? Math.max((punto.total / maximo) * 100, 3) : 1.5;
        const esHoy = punto.dia === hoy;
        const [, mes, dia] = punto.dia.split("-");

        return (
          <div key={punto.dia} className="group relative flex h-full flex-1 flex-col items-center gap-1.5">
            {/* La columna necesita una altura definida para que el porcentaje
                de la barra signifique algo: sin este contenedor, el alto se
                resolvía contra un padre de altura automática y la barra
                terminaba midiendo cero. */}
            <div className="flex w-full flex-1 items-end">
              <div
                className={
                  esHoy
                    ? "w-full rounded-t-[5px] bg-gradient-to-b from-[#3D9CFF] to-[#0071E3] shadow-[0_2px_8px_-2px_rgba(0,113,227,0.5)] transition-all duration-300 ease-suave"
                    : "w-full rounded-t-[5px] bg-black/[0.09] transition-all duration-300 ease-suave group-hover:bg-acento/40"
                }
                style={{ height: `${alto}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-tinta-tenue">
              {dia}/{mes}
            </span>

            <span className="vidrio-menu pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded px-2 py-1 text-chico font-medium shadow-elevada ring-1 ring-black/[0.06] group-hover:block">
              {plata(punto.total)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function BarrasEtiquetadas({
  datos,
  formato = (v: number) => String(v),
}: {
  datos: { etiqueta: string; valor: number; color?: string | null }[];
  formato?: (valor: number) => string;
}) {
  const maximo = Math.max(...datos.map((d) => d.valor), 1);

  return (
    <ul className="flex flex-col gap-3">
      {datos.map((fila) => (
        <li key={fila.etiqueta} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-base">
            <span className="min-w-0 truncate">{fila.etiqueta}</span>
            <span className="cifra shrink-0 font-medium text-tinta-media">{formato(fila.valor)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-full rounded-full transition-all duration-500 ease-suave"
              style={{
                width: `${Math.max((fila.valor / maximo) * 100, 2)}%`,
                background: fila.color ?? "#0071E3",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
