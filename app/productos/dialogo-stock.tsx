"use client";

import { useState } from "react";
import { Boton, Campo, Dialogo } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { leerNumero, numero } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Producto } from "@/lib/tipos";

const MOTIVOS_ENTRADA = ["Compra a proveedor", "Devolución de cliente", "Corrección de conteo"];
const MOTIVOS_SALIDA = ["Rotura", "Vencido", "Uso interno", "Corrección de conteo"];

/**
 * Sumar o restar stock.
 *
 * El motivo es obligatorio y no es burocracia: es lo único que, dentro de tres
 * meses, distingue una rotura de un robo de un error de conteo.
 */
export function DialogoStock({
  producto,
  onCerrar,
  onGuardado,
}: {
  producto: Producto | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const avisos = useAvisos();
  const [signo, setSigno] = useState<1 | -1>(1);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cuantos = Math.round(leerNumero(cantidad) ?? 0);
  const resultante = (producto?.stock ?? 0) + signo * cuantos;
  const insuficiente = resultante < 0;

  async function guardar() {
    if (!producto) return;
    if (cuantos <= 0) {
      avisos.error("Escribí cuántas unidades.");
      return;
    }
    if (!motivo.trim()) {
      avisos.error("Indicá el motivo del ajuste.");
      return;
    }

    setGuardando(true);
    try {
      await api.post(`/productos/${producto.id}/stock`, { cantidad: signo * cuantos, motivo });
      avisos.exito(
        `${signo > 0 ? "Entrada" : "Salida"} de ${numero(cuantos)} · ${producto.nombre} queda en ${numero(resultante)}.`
      );
      onGuardado();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo ajustar el stock.");
    } finally {
      setGuardando(false);
    }
  }

  const motivos = signo > 0 ? MOTIVOS_ENTRADA : MOTIVOS_SALIDA;

  return (
    <Dialogo
      abierto={producto !== null}
      onCerrar={onCerrar}
      titulo="Ajustar stock"
      descripcion={producto ? `${producto.nombre} · hay ${numero(producto.stock)} ${producto.unidadMedida}` : ""}
      ancho="max-w-md"
      pie={
        <>
          <Boton onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            tono="principal"
            onClick={() => void guardar()}
            disabled={guardando || insuficiente || cuantos <= 0}
          >
            {guardando ? "Guardando…" : "Registrar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {([1, -1] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => setSigno(valor)}
              className={cn(
                "flex items-center justify-center gap-2 rounded border px-3 py-2.5 text-base transition-colors",
                signo === valor
                  ? "border-transparent bg-acento text-white shadow-acento"
                  : "border-linea-fuerte/70 bg-papel text-tinta-media shadow-boton hover:bg-[#FAFAFC]"
              )}
            >
              {valor > 0 ? "Entra mercadería" : "Sale mercadería"}
            </button>
          ))}
        </div>

        <Campo
          etiqueta="Cantidad"
          inputMode="numeric"
          autoFocus
          placeholder="0"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          error={insuficiente ? `No alcanza: hay ${numero(producto?.stock ?? 0)}.` : null}
          ayuda={
            cuantos > 0 && !insuficiente
              ? `Queda en ${numero(resultante)} ${producto?.unidadMedida ?? ""}`
              : undefined
          }
        />

        <div className="flex flex-col gap-2">
          <Campo
            etiqueta="Motivo"
            placeholder="Por qué cambia"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {motivos.map((sugerencia) => (
              <button
                key={sugerencia}
                type="button"
                onClick={() => setMotivo(sugerencia)}
                className="rounded-full border border-linea px-2.5 py-1 text-chico text-tinta-suave transition-colors hover:border-linea-fuerte hover:text-tinta"
              >
                {sugerencia}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialogo>
  );
}
