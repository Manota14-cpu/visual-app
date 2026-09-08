"use client";

import { useCallback, useEffect, useState } from "react";
import { Boton, Campo, Dialogo, Selector, Tabla, EncabezadoTabla, CuerpoTabla } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { leerNumero, numero, plata, porcentaje as verPorcentaje } from "@/lib/formato";
import type { FilaPrecio } from "@/lib/tipos";

/**
 * Cambiar el precio de varios productos a la vez.
 *
 * Se ve el "antes → después" de cada uno antes de confirmar, y esa lista la
 * calcula el backend con la misma función que después escribe: si la vista
 * previa la hiciera el navegador por su cuenta, un redondeo distinto haría que
 * lo que se mostró no sea lo que se guardó.
 */
export function DialogoPrecios({
  abierto,
  ids,
  onCerrar,
  onAplicado,
}: {
  abierto: boolean;
  ids: string[];
  onCerrar: () => void;
  onAplicado: () => void;
}) {
  const avisos = useAvisos();
  const [porcentaje, setPorcentaje] = useState("10");
  const [aplicarA, setAplicarA] = useState("venta");
  const [redondeo, setRedondeo] = useState("10");
  const [motivo, setMotivo] = useState("");
  const [previa, setPrevia] = useState<FilaPrecio[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const cuerpo = useCallback(
    () => ({
      ids,
      porcentaje: leerNumero(porcentaje) ?? 0,
      aplicarA,
      redondeo: Number(redondeo),
      motivo,
    }),
    [ids, porcentaje, aplicarA, redondeo, motivo]
  );

  useEffect(() => {
    if (!abierto || ids.length === 0) return;

    const t = setTimeout(async () => {
      setCalculando(true);
      try {
        setPrevia(await api.post<FilaPrecio[]>("/productos/precios/previsualizar", cuerpo()));
      } catch {
        setPrevia([]);
      } finally {
        setCalculando(false);
      }
    }, 260);

    return () => clearTimeout(t);
  }, [abierto, ids, cuerpo]);

  async function aplicar() {
    setAplicando(true);
    try {
      const r = await api.post<{ cambiados: number }>("/productos/precios/aplicar", cuerpo());
      avisos.exito(`${numero(r.cambiados)} precios actualizados.`);
      onAplicado();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudieron aplicar los precios.");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Ajustar precios"
      descripcion={`${numero(ids.length)} ${ids.length === 1 ? "producto seleccionado" : "productos seleccionados"}`}
      pie={
        <>
          <Boton onClick={onCerrar} disabled={aplicando}>
            Cancelar
          </Boton>
          <Boton
            tono="principal"
            onClick={() => void aplicar()}
            disabled={aplicando || previa.length === 0}
          >
            {aplicando ? "Aplicando…" : `Aplicar a ${numero(previa.length)}`}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo
            etiqueta="Porcentaje"
            inputMode="decimal"
            ayuda="Negativo para bajar."
            value={porcentaje}
            onChange={(e) => setPorcentaje(e.target.value)}
          />
          <Selector etiqueta="Qué precio" value={aplicarA} onChange={(e) => setAplicarA(e.target.value)}>
            <option value="venta">Solo la venta</option>
            <option value="costo">Solo el costo</option>
            <option value="ambos">Venta y costo</option>
          </Selector>
          <Selector etiqueta="Redondear a" value={redondeo} onChange={(e) => setRedondeo(e.target.value)}>
            <option value="1">Sin redondear</option>
            <option value="10">Múltiplos de 10</option>
            <option value="50">Múltiplos de 50</option>
            <option value="100">Múltiplos de 100</option>
          </Selector>
        </div>

        <Campo
          etiqueta="Motivo"
          placeholder="Aumento de lista de proveedor"
          ayuda="Queda en el historial de cada producto."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />

        <div className="rounded-md border border-linea">
          {calculando ? (
            <p className="px-3 py-6 text-center text-base text-tinta-suave">Calculando…</p>
          ) : previa.length === 0 ? (
            <p className="px-3 py-6 text-center text-base text-tinta-suave">
              Con estos valores no cambia ningún precio.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <Tabla className="min-w-0">
                <EncabezadoTabla>
                  <tr>
                    <th>Producto</th>
                    <th className="text-right">Ahora</th>
                    <th className="text-right">Queda en</th>
                    <th className="text-right">Margen</th>
                  </tr>
                </EncabezadoTabla>
                <CuerpoTabla>
                  {previa.map((fila) => (
                    <tr key={fila.id}>
                      <td className="max-w-[240px] truncate">{fila.nombre}</td>
                      <td className="cifra text-right text-tinta-suave">{plata(fila.precioActual)}</td>
                      <td className="cifra text-right font-medium">{plata(fila.precioNuevo)}</td>
                      <td className="cifra text-right text-tinta-suave">
                        {verPorcentaje(fila.margenNuevo)}
                      </td>
                    </tr>
                  ))}
                </CuerpoTabla>
              </Tabla>
            </div>
          )}
        </div>
      </div>
    </Dialogo>
  );
}
