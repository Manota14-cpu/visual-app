"use client";

import { useState } from "react";
import { Area, Boton, Campo, Dialogo, Selector } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { useDatos } from "@/lib/datos";
import { leerNumero, plata } from "@/lib/formato";
import type { Pagina, Proveedor } from "@/lib/tipos";

/**
 * Cargar una compra.
 *
 * La compra sube la deuda; lo que se pague en el momento la baja en el mismo
 * acto. Es el mismo camino que una venta fiada con entrega: no hay dos formas
 * de registrar lo mismo, y el caso de todos los días —"me trajo harina, le di
 * algo a cuenta"— entra en una sola pantalla.
 */
export function DialogoCompra({
  proveedor,
  onCerrar,
  onGuardada,
}: {
  proveedor: Proveedor | null;
  onCerrar: () => void;
  onGuardada: () => Promise<void>;
}) {
  const avisos = useAvisos();

  // Sin proveedor elegido hay que ofrecer la lista. Con uno elegido no se
  // pregunta de nuevo: el botón salió de su renglón.
  const { datos: lista } = useDatos<Pagina<Proveedor>>(
    proveedor ? null : "/proveedores?estado=activos&porPagina=200"
  );

  const [proveedorId, setProveedorId] = useState(proveedor?.id ?? "");
  const [detalle, setDetalle] = useState("");
  const [total, setTotal] = useState("");
  const [entrega, setEntrega] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [comprobante, setComprobante] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  // `leerNumero` devuelve null con el campo vacío; acá vacío es cero.
  const totalNumero = leerNumero(total) ?? 0;
  const entregaNumero = leerNumero(entrega) ?? 0;
  const queda = Math.max(0, totalNumero - entregaNumero);

  async function guardar() {
    setGuardando(true);
    try {
      await api.post("/compras", {
        proveedorId,
        detalle,
        total: totalNumero,
        entrega: entregaNumero,
        metodo,
        comprobante,
        fecha,
        notas,
      });

      avisos.exito(
        queda > 0 ? `Compra cargada. Quedan ${plata(queda)} por pagar.` : "Compra cargada y paga."
      );
      await onGuardada();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cargar la compra.");
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto
      titulo={proveedor ? `Compra a ${proveedor.nombre}` : "Cargar compra"}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton
            tono="principal"
            onClick={() => void guardar()}
            disabled={guardando || !proveedorId || !detalle || totalNumero <= 0}
          >
            {guardando ? "Guardando…" : "Cargar compra"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!proveedor && (
          <Selector
            etiqueta="Proveedor"
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
          >
            <option value="">Elegí uno…</option>
            {(lista?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        )}

        <Campo
          etiqueta="Qué compraste"
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Harina 000 x 10 bolsas"
          autoFocus={Boolean(proveedor)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Total"
            inputMode="numeric"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
          <Campo etiqueta="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="¿Le pagaste algo ahora?"
            inputMode="numeric"
            value={entrega}
            onChange={(e) => setEntrega(e.target.value)}
            ayuda="Dejalo vacío si queda todo a cuenta."
          />
          {entregaNumero > 0 && (
            <Selector etiqueta="Con qué" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="otro">Otro</option>
            </Selector>
          )}
        </div>

        {totalNumero > 0 && (
          <p
            className={
              queda > 0
                ? "rounded-md border border-aviso-linea bg-aviso-fondo px-3 py-2 text-base text-aviso-texto"
                : "rounded-md border border-exito-linea bg-exito-fondo px-3 py-2 text-base text-exito-texto"
            }
          >
            {queda > 0
              ? `Le vas a quedar debiendo ${plata(queda)}.`
              : "Queda paga: no suma deuda."}
          </p>
        )}

        <Campo
          etiqueta="Remito o factura"
          value={comprobante}
          onChange={(e) => setComprobante(e.target.value)}
          ayuda="Opcional, pero es por lo que se busca después."
        />

        <Area etiqueta="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
      </div>
    </Dialogo>
  );
}
