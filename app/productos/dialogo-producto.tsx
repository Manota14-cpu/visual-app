"use client";

import { useState } from "react";
import { Boton, Campo, Dialogo, Selector, Area } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { leerNumero, margenSobreCosto, margenSobreVenta, plata } from "@/lib/formato";
import type { Categoria, Producto } from "@/lib/tipos";

const UNIDADES = [
  "unidad", "x1u", "x3u", "x5u", "x10u", "x20u", "x25u", "x50u", "x100u",
  "x200u", "x500u", "combo", "caja", "paquete", "kg", "litro", "metro",
];

interface Formulario {
  nombre: string;
  categoriaId: string;
  sku: string;
  codigoBarras: string;
  unidadMedida: string;
  porPeso: boolean;
  precioVenta: string;
  precioCosto: string;
  precioMayorista: string;
  cantidadMayoristaMin: string;
  stock: string;
  stockMinimo: string;
  descripcion: string;
}

const vacio: Formulario = {
  nombre: "",
  categoriaId: "",
  sku: "",
  codigoBarras: "",
  unidadMedida: "unidad",
  porPeso: false,
  precioVenta: "",
  precioCosto: "",
  precioMayorista: "",
  cantidadMayoristaMin: "",
  stock: "0",
  stockMinimo: "0",
  descripcion: "",
};

function desde(producto: Producto): Formulario {
  return {
    nombre: producto.nombre,
    categoriaId: producto.categoriaId ?? "",
    sku: producto.sku ?? "",
    codigoBarras: producto.codigoBarras ?? "",
    unidadMedida: producto.unidadMedida,
    porPeso: producto.porPeso,
    precioVenta: String(producto.precioVenta),
    precioCosto: producto.precioCosto ? String(producto.precioCosto) : "",
    precioMayorista: producto.precioMayorista ? String(producto.precioMayorista) : "",
    cantidadMayoristaMin: producto.cantidadMayoristaMin ? String(producto.cantidadMayoristaMin) : "",
    stock: String(producto.stock),
    stockMinimo: String(producto.stockMinimo),
    descripcion: producto.descripcion ?? "",
  };
}

/**
 * Alta y edición de un producto.
 *
 * Al editar, el stock se muestra pero no se toca: cambiarlo acá sería moverlo
 * sin dejar movimiento, y entonces el historial dejaría de explicar por qué
 * hay lo que hay. Para eso está el ajuste, que pide un motivo.
 */
export function DialogoProducto({
  abierto,
  producto,
  categorias,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  producto: Producto | null;
  categorias: Categoria[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const avisos = useAvisos();

  // El formulario se llena una sola vez, al montarse. Quien abre el diálogo lo
  // monta recién en ese momento y le pasa una `key` distinta por producto, así
  // que no hace falta ningún efecto que copie el producto al estado — y no hay
  // riesgo de que lo pise mientras alguien está escribiendo.
  const [datos, setDatos] = useState<Formulario>(() =>
    producto ? desde(producto) : { ...vacio, categoriaId: categorias[0]?.id ?? "" }
  );
  const [guardando, setGuardando] = useState(false);

  // Solo las claves de texto: `porPeso` es un interruptor y tiene su propio
  // manejo. Sin esto, TypeScript deja pasar un booleano al `value` de un input.
  type ClaveTexto = {
    [K in keyof Formulario]: Formulario[K] extends string ? K : never;
  }[keyof Formulario];

  const campo = (clave: ClaveTexto) => ({
    value: datos[clave],
    onChange: (e: { target: { value: string } }) =>
      setDatos((previo) => ({ ...previo, [clave]: e.target.value })),
  });

  const venta = leerNumero(datos.precioVenta) ?? 0;
  const costo = leerNumero(datos.precioCosto) ?? 0;
  // Los dos margenes, porque son dos numeros distintos de la misma
  // operacion: quien pone el precio piensa en lo que le suma al costo, y el
  // informe de fin de mes habla de lo que queda de cada peso que entra.
  const sobreVenta = margenSobreVenta(venta, costo);
  const sobreCosto = margenSobreCosto(venta, costo);

  async function guardar() {
    if (!datos.nombre.trim()) {
      avisos.error("Escribí el nombre del producto.");
      return;
    }

    setGuardando(true);
    const cuerpo = {
      nombre: datos.nombre,
      categoriaId: datos.categoriaId || null,
      descripcion: datos.descripcion,
      sku: datos.sku,
      codigoBarras: datos.codigoBarras,
      unidadMedida: datos.unidadMedida,
      porPeso: datos.porPeso,
      precioVenta: Math.round(leerNumero(datos.precioVenta) ?? 0),
      precioCosto: Math.round(leerNumero(datos.precioCosto) ?? 0),
      precioMayorista: Math.round(leerNumero(datos.precioMayorista) ?? 0),
      cantidadMayoristaMin: Math.round(leerNumero(datos.cantidadMayoristaMin) ?? 0),
      stock: Math.round(leerNumero(datos.stock) ?? 0),
      stockMinimo: Math.round(leerNumero(datos.stockMinimo) ?? 0),
    };

    try {
      if (producto) await api.put(`/productos/${producto.id}`, cuerpo);
      else await api.post("/productos", cuerpo);

      avisos.exito(producto ? "Producto actualizado." : "Producto creado.");
      onGuardado();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={producto ? "Editar producto" : "Producto nuevo"}
      descripcion={producto ? producto.nombre : "Lo mínimo es el nombre y el precio."}
      pie={
        <>
          <Boton onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton tono="principal" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Nombre" placeholder="Vaso plástico 180cc" autoFocus {...campo("nombre")} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Selector etiqueta="Categoría" {...campo("categoriaId")}>
            {categorias.length === 0 && <option value="">Sin categorías</option>}
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </Selector>

          <Selector etiqueta="Unidad" ayuda="Cómo se vende: por unidad, por pack, por kilo." {...campo("unidadMedida")}>
            {UNIDADES.map((unidad) => (
              <option key={unidad} value={unidad}>
                {unidad}
              </option>
            ))}
          </Selector>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Código interno (SKU)" placeholder="VAS-VAS-001" {...campo("sku")} />
          <Campo etiqueta="Código de barras" placeholder="7790000000000" inputMode="numeric" {...campo("codigoBarras")} />
        </div>

        {/* Va arriba de los precios porque cambia lo que significan: con esto
            prendido, el precio es por kilo y el stock se cuenta en gramos. */}
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-linea bg-lienzo px-3 py-2.5">
          <input
            type="checkbox"
            checked={datos.porPeso}
            onChange={(e) => setDatos((previo) => ({ ...previo, porPeso: e.target.checked }))}
            className="mt-0.5 h-4 w-4 cursor-pointer"
          />
          <span className="min-w-0">
            <span className="block text-base">Se vende por peso</span>
            <span className="block text-chico text-tinta-suave">
              Para pan, fiambre, verdura: se pone el precio del kilo y en la caja se cobra lo que
              pese. Medio kilo de algo a $1.000 el kilo sale $500.
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta={datos.porPeso ? "Precio por kilo" : "Precio de venta"}
            inputMode="decimal"
            placeholder="0"
            ayuda={datos.porPeso ? "Lo que sale un kilo entero" : undefined}
            {...campo("precioVenta")}
          />
          <Campo
            etiqueta={datos.porPeso ? "Costo por kilo" : "Costo"}
            inputMode="decimal"
            placeholder="0"
            ayuda={
              sobreVenta !== null
                ? `${sobreCosto}% sobre el costo · ${sobreVenta}% sobre la venta · ` +
                  `${plata(venta - costo)} por unidad`
                : "Dejalo vacío si todavía no lo sabés."
            }
            {...campo("precioCosto")}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Precio mayorista"
            inputMode="decimal"
            placeholder="0"
            ayuda="Opcional."
            {...campo("precioMayorista")}
          />
          <Campo
            etiqueta="Desde cuántas unidades"
            inputMode="numeric"
            placeholder="0"
            ayuda="A partir de esta cantidad se cobra el mayorista."
            {...campo("cantidadMayoristaMin")}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {producto ? (
            <Campo
              etiqueta="Stock"
              value={datos.stock}
              disabled
              ayuda="Se cambia con un ajuste, para que quede el motivo."
              onChange={() => {}}
            />
          ) : (
            <Campo etiqueta="Stock inicial" inputMode="numeric" {...campo("stock")} />
          )}
          <Campo
            etiqueta="Stock mínimo"
            inputMode="numeric"
            ayuda="Debajo de esto aparece en «para reponer»."
            {...campo("stockMinimo")}
          />
        </div>

        <Area etiqueta="Descripción" placeholder="Detalle interno, opcional." {...campo("descripcion")} />
      </div>
    </Dialogo>
  );
}
