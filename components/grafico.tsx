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
  // El día de acá, no el de Greenwich: con `toISOString`, desde las nueve de
  // la noche "hoy" ya era mañana y la columna de hoy dejaba de resaltarse. El
  // servidor arma los días con la misma cuenta (`diaLocal`). "sv-SE" es el
  // idioma que escribe la fecha como AAAA-MM-DD.
  const hoy = new Date().toLocaleDateString("sv-SE");

  return (
    <div className="flex h-[140px] items-end gap-1.5" role="img" aria-label="Ventas de los últimos catorce días">
      {datos.map((punto) => {
        const alto = punto.total > 0 ? Math.max((punto.total / maximo) * 100, 3) : 1.5;
        const esHoy = punto.dia === hoy;
        const [, mes, dia] = punto.dia.split("-");

        return (
          <div key={punto.dia} className="group relative flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
            {/* La columna necesita una altura definida para que el porcentaje
                de la barra signifique algo: sin este contenedor, el alto se
                resolvía contra un padre de altura automática y la barra
                terminaba midiendo cero. */}
            <div className="flex w-full flex-1 items-end">
              <div
                className={
                  esHoy
                    ? "w-full rounded-t-[5px] bg-gradient-to-b from-[#2F7BF0] to-[#0050CE] shadow-[0_2px_8px_-2px_rgba(0,80,206,0.45)] transition-all duration-300 ease-suave"
                    : // Los días anteriores en azul apagado y no en gris. El gris
                      // decía "esto está apagado": con un negocio de verdad, donde
                      // todas las ventas están en días pasados, el gráfico entero
                      // quedaba gris y el panel parecía vacío. Apagado sigue
                      // dejando que el día de hoy destaque, que es para lo que
                      // existía la diferencia.
                      "w-full rounded-t-[5px] bg-acento/[0.28] transition-all duration-300 ease-suave group-hover:bg-acento/50"
                }
                style={{ height: `${alto}%` }}
              />
            </div>
            {/* En un teléfono catorce "09/09" no entran a lo ancho: la
                columna no podía achicarse más que su rótulo y el gráfico se
                salía de la tarjeta, con los últimos días —hoy incluido—
                cortados. Ahí va solo el número del día. */}
            <span className="text-[10px] tabular-nums text-tinta-tenue">
              <span className="sm:hidden">{Number(dia)}</span>
              <span className="hidden sm:inline">
                {dia}/{mes}
              </span>
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
  // `texto` reemplaza al número formateado cuando lo que hay que decir no
  // es la misma cosa que mide la barra: la barra compara cuántos productos,
  // el texto dice "187 unidades · 15,9 kg".
  datos: { etiqueta: string; valor: number; color?: string | null; texto?: string }[];
  formato?: (valor: number) => string;
}) {
  const maximo = Math.max(...datos.map((d) => d.valor), 1);

  return (
    <ul className="flex flex-col gap-3">
      {datos.map((fila) => (
        <li key={fila.etiqueta} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-base">
            <span className="min-w-0 truncate">{fila.etiqueta}</span>
            <span className="cifra shrink-0 font-medium text-tinta-media">
              {fila.texto ?? formato(fila.valor)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-full rounded-full transition-all duration-500 ease-suave"
              style={{
                width: `${Math.max((fila.valor / maximo) * 100, 2)}%`,
                background: fila.color ?? "#0050CE",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
