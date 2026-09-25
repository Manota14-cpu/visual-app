"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Dialogo } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { leerNumero } from "@/lib/formato";
import type { ProductoBuscado } from "@/lib/tipos";

/**
 * Dar de alta, desde la caja, un producto que se escaneó y no estaba cargado.
 *
 * El nombre se busca en la base mundial de códigos de barras mientras el
 * precio se escribe; si no aparece, se escribe a mano. Al guardar queda en
 * Productos con su código y entra directo al carrito. Lo puede hacer quien
 * atienda; el costo lo ve y lo pone solo el dueño.
 */
export function DialogoAlta({
  codigo,
  verCosto,
  onCerrar,
  onCreado,
}: {
  codigo: string;
  verCosto: boolean;
  onCerrar: () => void;
  onCreado: (producto: ProductoBuscado) => void;
}) {
  const avisos = useAvisos();
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState("");
  const [stock, setStock] = useState("");
  const [buscando, setBuscando] = useState(true);
  const [fuente, setFuente] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    api
      .get<{ encontrado: boolean; nombre: string | null; fuente: string | null }>(
        `/productos/mundial/${encodeURIComponent(codigo)}`
      )
      .then((r) => {
        if (!vigente || !r.encontrado || !r.nombre) return;
        // Lo que ya se empezó a escribir no se pisa.
        setNombre((actual) => actual || r.nombre!);
        setFuente(r.fuente);
      })
      .catch(() => {})
      .finally(() => vigente && setBuscando(false));
    return () => {
      vigente = false;
    };
  }, [codigo]);

  async function guardar() {
    if (!nombre.trim()) return avisos.error("Escribí el nombre del producto.");
    const precioVenta = Math.round(leerNumero(precio) ?? 0);
    if (precioVenta <= 0) return avisos.error("Escribí el precio de venta.");
    // Se vende uno ahora: sin stock la venta la rechazaría.
    const inicial = Math.max(Math.round(leerNumero(stock) ?? 0), 1);

    setGuardando(true);
    try {
      const creado = await api.post<{
        id: string;
        nombre: string;
        sku: string | null;
        codigoBarras: string | null;
        precioVenta: number;
        stock: number;
        unidadMedida: string;
        porPeso: boolean;
      }>("/productos/desde-caja", {
        nombre,
        codigoBarras: codigo,
        precioVenta,
        precioCosto: Math.round(leerNumero(costo) ?? 0),
        stock: inicial,
      });
      avisos.exito(`${creado.nombre} quedó cargado en Productos.`);
      onCreado({
        id: creado.id,
        nombre: creado.nombre,
        sku: creado.sku,
        codigoBarras: creado.codigoBarras,
        precio: creado.precioVenta,
        stock: creado.stock,
        unidadMedida: creado.unidadMedida,
        porPeso: creado.porPeso,
      });
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cargar el producto.");
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo="Producto nuevo"
      descripcion={`El código ${codigo} no estaba cargado. Completalo y entra al carrito.`}
      pie={
        <>
          <Boton onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton tono="principal" onClick={() => void guardar()} disabled={guardando}>
            Cargar y agregar
          </Boton>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <Campo
          etiqueta="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={buscando ? "Buscando en la base mundial…" : "Ej.: Shampoo Sedal Ceramidas 340 ml"}
          ayuda={
            buscando
              ? "Buscando el código en internet…"
              : fuente
                ? `Encontrado en ${fuente}. Revisalo antes de guardar.`
                : "No apareció en la base mundial: escribilo a mano."
          }
        />
        <div className={verCosto ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
          <Campo etiqueta="Precio de venta" inputMode="decimal" autoFocus value={precio} onChange={(e) => setPrecio(e.target.value)} />
          {verCosto && (
            <Campo etiqueta="Costo" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} ayuda="Opcional" />
          )}
          <Campo etiqueta="Stock" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="1" />
        </div>
        <button type="submit" hidden />
      </form>
    </Dialogo>
  );
}
