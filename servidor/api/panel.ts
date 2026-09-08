import type { Almacen } from "../almacen.ts";
import type { Ruteador } from "../http.ts";
import { cajaAbierta, esperadoEn, ventasDe } from "../reglas.ts";

/**
 * Los números de la pantalla principal.
 *
 * Van todos en una sola respuesta a propósito: son la primera pantalla que se
 * abre a la mañana y pedirlos de a uno hacía que aparecieran en cascada.
 */
export function rutasPanel(r: Ruteador, a: Almacen): void {
  r.get("/panel", () =>
    a.leer((d) => {
      const activos = d.productos.filter((p) => p.activo);
      const hoy = diaLocal(new Date());

      const ventasDeHoy = d.pedidos.filter(
        (p) => p.estado !== "cancelado" && diaLocal(new Date(p.creadoEn)) === hoy
      );

      const caja = cajaAbierta(d);

      return {
        stock: {
          productos: activos.length,
          unidades: activos.reduce((s, p) => s + p.stock, 0),
          valorCosto: activos.reduce((s, p) => s + p.stock * (p.precioCosto ?? 0), 0),
          valorVenta: activos.reduce((s, p) => s + p.stock * p.precioVenta, 0),
          bajo: activos.filter((p) => p.stock <= p.stockMinimo && p.stock > 0).length,
          sinStock: activos.filter((p) => p.stock === 0).length,
          inactivos: d.productos.filter((p) => !p.activo).length,
        },

        // Datos que faltan y que hacen mentir a otros números: sin costo
        // cargado, el valor del inventario y todo margen son adornos.
        pendientes: {
          sinCosto: activos.filter((p) => (p.precioCosto ?? 0) === 0).length,
          sinSku: activos.filter((p) => !p.sku).length,
          // Un costo que deja más del 85% de margen no es un costo: es un
          // relleno para sacarse de encima el aviso de que falta.
          costoDudoso: activos.filter(
            (p) => p.precioVenta > 0 && (p.precioCosto ?? 0) > 0 && p.precioCosto! < p.precioVenta * 0.15
          ).length,
          pedidos: d.pedidos.filter((p) => p.estado === "pendiente" || p.estado === "preparando")
            .length,
        },

        hoyVentas: {
          cantidad: ventasDeHoy.length,
          total: ventasDeHoy.reduce((s, p) => s + p.total, 0),
          unidades: ventasDeHoy.flatMap((p) => p.items).reduce((s, i) => s + i.cantidad, 0),
        },

        caja: caja
          ? {
              id: caja.id,
              numero: caja.numero,
              fondo: caja.fondo,
              abiertaEn: caja.abiertaEn,
              ventas: ventasDe(d, caja.id).length,
              esperado: esperadoEn(d, caja),
            }
          : null,

        criticos: activos
          .filter((p) => p.stock <= p.stockMinimo)
          .sort((x, y) => x.stock - y.stock || x.nombre.localeCompare(y.nombre, "es"))
          .slice(0, 8)
          .map((p) => ({
            id: p.id,
            nombre: p.nombre,
            stock: p.stock,
            stockMinimo: p.stockMinimo,
            unidadMedida: p.unidadMedida,
          })),

        movimientos: [...d.movimientos]
          .sort((x, y) => y.creadoEn.localeCompare(x.creadoEn))
          .slice(0, 8)
          .map((m) => ({
            id: m.id,
            tipo: m.tipo,
            cantidad: m.cantidad,
            stockResultante: m.stockResultante,
            motivo: m.motivo,
            creadoEn: m.creadoEn,
            producto: d.productos.find((p) => p.id === m.productoId)?.nombre ?? "Producto eliminado",
          })),

        // Catorce días es lo que entra legible en el gráfico y alcanza para ver
        // si la semana viene mejor o peor que la anterior.
        ventasPorDia: Array.from({ length: 14 }, (_, i) => {
          const dia = new Date();
          dia.setDate(dia.getDate() - 13 + i);
          const clave = diaLocal(dia);

          return {
            dia: clave,
            total: d.pedidos
              .filter((p) => p.estado !== "cancelado" && diaLocal(new Date(p.creadoEn)) === clave)
              .reduce((s, p) => s + p.total, 0),
          };
        }),

        stockPorCategoria: d.categorias
          .map((c) => ({
            categoria: c.nombre,
            color: c.color,
            unidades: activos.filter((p) => p.categoriaId === c.id).reduce((s, p) => s + p.stock, 0),
          }))
          .filter((x) => x.unidades > 0)
          .sort((x, y) => y.unidades - x.unidades)
          .slice(0, 8),
      };
    })
  );
}

/**
 * El día de una fecha, en hora local y como aaaa-mm-dd.
 *
 * Se compara por texto y no por instante: `toISOString()` daría el día UTC, y
 * una venta de las 22 en Argentina figuraría al día siguiente.
 */
export function diaLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}
