import type { Almacen } from "../almacen.ts";
import type { Ruteador } from "../http.ts";
import { cuentaEnResultado, entero, etiquetaGasto } from "../reglas.ts";
import { diaLocal } from "./panel.ts";

/**
 * Los números del negocio, no los del inventario.
 *
 * El panel dice cómo está el stock hoy. Esto dice qué pasó: qué se vendió, qué
 * dejó margen, qué lleva meses ocupando lugar sin moverse y cuánto costó tener
 * abierto.
 */
export function rutasInformes(r: Ruteador, a: Almacen): void {
  r.get("/informes", ({ consulta }) =>
    a.leer((d) => {
      // 0 significa "desde el principio".
      const pedido = entero(consulta.get("dias"), 30);
      const periodo = [7, 30, 90, 0].includes(pedido) ? pedido : 30;

      const desde =
        periodo === 0 ? "" : new Date(Date.now() - periodo * 86_400_000).toISOString();

      const desdeFecha = (() => {
        if (periodo === 0) return "";
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - periodo);
        return diaLocal(fecha);
      })();

      const ventas = d.pedidos.filter((p) => p.estado !== "cancelado" && p.creadoEn >= desde);
      const renglones = ventas.flatMap((p) => p.items);

      const costoDe = (productoId: string | null) =>
        d.productos.find((p) => p.id === productoId)?.precioCosto ?? 0;

      const ingreso = renglones.reduce((s, i) => s + i.precio * i.cantidad, 0);
      // El costo se estima con el costo ACTUAL del producto, no con el que
      // tenía el día de la venta: es lo que se puede saber sin guardar el costo
      // en cada renglón, y se dice para que nadie lo lea como exacto.
      const costo = renglones.reduce((s, i) => s + costoDe(i.productoId) * i.cantidad, 0);

      const porProducto = new Map<string, { nombre: string; unidades: number; ingreso: number }>();
      for (const item of renglones) {
        const clave = item.productoId ?? item.nombre;
        const actual = porProducto.get(clave) ?? {
          nombre: d.productos.find((p) => p.id === item.productoId)?.nombre ?? item.nombre,
          unidades: 0,
          ingreso: 0,
        };

        actual.unidades += item.cantidad;
        actual.ingreso += item.precio * item.cantidad;
        porProducto.set(clave, actual);
      }

      const productos = [...porProducto.entries()]
        .map(([clave, v]) => {
          const producto = d.productos.find((p) => p.id === clave);
          const costoProducto = (producto?.precioCosto ?? 0) * v.unidades;

          return {
            productoId: producto?.id ?? null,
            nombre: v.nombre,
            unidades: v.unidades,
            ingreso: v.ingreso,
            costo: costoProducto,
            margen:
              v.ingreso > 0 && costoProducto > 0
                ? Math.round(((v.ingreso - costoProducto) * 100) / v.ingreso)
                : null,
          };
        })
        .sort((x, y) => y.ingreso - x.ingreso)
        .slice(0, 50);

      // Capital dormido: lo que está en la estantería sin moverse. La carga
      // inicial no cuenta como movimiento; si contara, todo el catálogo
      // parecería recién tocado el día que se cargó.
      const vendidos = new Set(
        renglones.filter((i) => i.productoId).map((i) => i.productoId as string)
      );

      const inmovilizado = d.productos
        .filter((p) => p.activo && p.stock > 0 && !vendidos.has(p.id))
        .map((p) => {
          const ultimo = d.movimientos
            .filter((m) => m.productoId === p.id && m.tipo !== "creacion")
            .sort((x, y) => y.creadoEn.localeCompare(x.creadoEn))[0];

          return {
            id: p.id,
            nombre: p.nombre,
            categoria: d.categorias.find((c) => c.id === p.categoriaId)?.nombre ?? null,
            stock: p.stock,
            unidadMedida: p.unidadMedida,
            capital: p.stock * (p.precioCosto ?? 0),
            diasQuieto: ultimo
              ? Math.floor((Date.now() - new Date(ultimo.creadoEn).getTime()) / 86_400_000)
              : null,
          };
        })
        .sort((x, y) => y.capital - x.capital)
        .slice(0, 25);

      const gastos = d.gastos.filter((g) => g.fecha >= desdeFecha);

      let gastadoTotal = 0;
      let gastadoOperativo = 0;
      let gastadoMercaderia = 0;
      const gastosPorCategoria = new Map<string, { total: number; cantidad: number }>();

      for (const g of gastos) {
        gastadoTotal += g.monto;
        if (cuentaEnResultado(g.categoria)) gastadoOperativo += g.monto;
        else gastadoMercaderia += g.monto;

        const actual = gastosPorCategoria.get(g.categoria) ?? { total: 0, cantidad: 0 };
        gastosPorCategoria.set(g.categoria, {
          total: actual.total + g.monto,
          cantidad: actual.cantidad + 1,
        });
      }

      const movimientos = new Map<string, number>();
      for (const m of d.movimientos) {
        if (m.creadoEn < desde || m.tipo === "creacion") continue;
        movimientos.set(m.tipo, (movimientos.get(m.tipo) ?? 0) + m.cantidad);
      }

      const canales = new Map<string, { pedidos: number; ingreso: number }>();
      for (const p of ventas) {
        const actual = canales.get(p.canal) ?? { pedidos: 0, ingreso: 0 };
        canales.set(p.canal, { pedidos: actual.pedidos + 1, ingreso: actual.ingreso + p.total });
      }

      return {
        dias: periodo,

        ventas: {
          pedidos: ventas.length,
          unidades: renglones.reduce((s, i) => s + i.cantidad, 0),
          ingreso,
          costo,
          margen: ingreso > 0 && costo > 0 ? Math.round(((ingreso - costo) * 100) / ingreso) : null,
          ticketPromedio: ventas.length > 0 ? Math.round(ingreso / ventas.length) : 0,
        },

        porProducto: productos,
        inmovilizado,
        capitalQuieto: inmovilizado.reduce((s, p) => s + p.capital, 0),

        movimientos: [...movimientos.entries()]
          .map(([tipo, cantidad]) => ({ tipo, cantidad }))
          .sort((x, y) => y.cantidad - x.cantidad),

        // Desde que existe la caja hay dos formas de vender; sin separarlas no
        // se puede saber cuál sostiene el negocio.
        porCanal: [...canales.entries()]
          .map(([canal, v]) => ({ canal, pedidos: v.pedidos, ingreso: v.ingreso }))
          .sort((x, y) => y.ingreso - x.ingreso),

        // Un costo que deja más del 85% de margen no es un costo: es un
        // relleno. El informe lo dice en vez de presentar el porcentaje como si
        // fuera un hallazgo.
        ventasConCostoDudoso: new Set(
          renglones
            .map((i) => d.productos.find((p) => p.id === i.productoId))
            .filter(
              (p) =>
                p && p.precioVenta > 0 && (p.precioCosto ?? 0) > 0 && p.precioCosto! < p.precioVenta * 0.15
            )
            .map((p) => p!.id)
        ).size,

        gastos: {
          total: gastadoTotal,
          operativos: gastadoOperativo,
          mercaderia: gastadoMercaderia,
          cantidad: gastos.length,
          porCategoria: [...gastosPorCategoria.entries()]
            .map(([categoria, v]) => ({
              categoria,
              etiqueta: etiquetaGasto(categoria),
              total: v.total,
              cantidad: v.cantidad,
            }))
            .sort((x, y) => y.total - x.total),
        },

        // Lo vendido, menos lo que costó, menos lo que costó tener abierto.
        // Nulo sin ventas: un resultado negativo puro de gastos no es
        // información, es un período sin actividad.
        resultado: ventas.length > 0 ? ingreso - costo - gastadoOperativo : null,
      };
    })
  );
}
