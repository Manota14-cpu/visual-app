"use client";

import { Boton, Cargando, Dialogo, Vacio } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useDatos } from "@/lib/datos";
import { fechaHora, plata } from "@/lib/formato";
import type { CambioPrecio, Producto } from "@/lib/tipos";

/**
 * Cómo llegó este producto al precio que tiene.
 *
 * Cada cambio queda anotado con su motivo, así "esto antes salía menos" se
 * puede contestar con una fecha en vez de con una discusión.
 */
export function DialogoHistorial({
  producto,
  onCerrar,
}: {
  producto: Producto | null;
  onCerrar: () => void;
}) {
  const { datos, cargando } = useDatos<CambioPrecio[]>(
    producto ? `/productos/${producto.id}/precios` : null
  );

  return (
    <Dialogo
      abierto={producto !== null}
      onCerrar={onCerrar}
      titulo="Historial de precios"
      descripcion={producto?.nombre}
      pie={<Boton onClick={onCerrar}>Cerrar</Boton>}
    >
      {cargando && <Cargando filas={3} />}

      {datos && datos.length === 0 && (
        <Vacio
          titulo="Sin cambios todavía"
          detalle="Cuando edites el precio o hagas un ajuste masivo, cada cambio va a quedar acá."
        />
      )}

      {datos && datos.length > 0 && (
        <ul className="flex flex-col">
          {datos.map((cambio) => {
            const subio = cambio.precioNuevo > cambio.precioAnterior;
            const diferencia = cambio.precioNuevo - cambio.precioAnterior;
            const pct =
              cambio.precioAnterior > 0
                ? Math.round((diferencia / cambio.precioAnterior) * 100)
                : null;

            return (
              <li key={cambio.id} className="flex items-start gap-3 border-b border-linea py-3 last:border-0">
                <span
                  className={
                    subio
                      ? "mt-0.5 rounded-full border border-alerta-linea bg-alerta-fondo p-1 text-alerta-texto"
                      : "mt-0.5 rounded-full border border-exito-linea bg-exito-fondo p-1 text-exito-texto"
                  }
                >
                  <Icono nombre={subio ? "mas" : "menos"} tamano={12} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="cifra text-base">
                    <span className="text-tinta-suave line-through">{plata(cambio.precioAnterior)}</span>
                    <span className="px-1.5 text-tinta-suave">→</span>
                    <span className="font-medium">{plata(cambio.precioNuevo)}</span>
                    {pct !== null && pct !== 0 && (
                      <span className="pl-2 text-chico text-tinta-suave">
                        {pct > 0 ? "+" : ""}
                        {pct}%
                      </span>
                    )}
                  </p>

                  {(cambio.costoAnterior ?? 0) !== (cambio.costoNuevo ?? 0) && (
                    <p className="cifra text-chico text-tinta-suave">
                      Costo: {plata(cambio.costoAnterior ?? 0)} → {plata(cambio.costoNuevo ?? 0)}
                    </p>
                  )}

                  <p className="text-chico text-tinta-suave">
                    {fechaHora(cambio.creadoEn)}
                    {cambio.motivo ? ` · ${cambio.motivo}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Dialogo>
  );
}
