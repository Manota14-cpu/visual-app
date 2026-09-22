import type { Almacen } from "../almacen.ts";
import type { Ruteador } from "../http.ts";
import { vencimientosPendientes } from "./vencimientos.ts";
import {
  cajaAbierta,
  contarRenglones,
  deudaProveedores,
  deudaTotal,
  esperadoEn,
  importeRenglon,
  ventasDe,
} from "../reglas.ts";

/**
 * Los números de la pantalla principal.
 *
 * Van todos en una sola respuesta a propósito: son la primera pantalla que se
 * abre a la mañana y pedirlos de a uno hacía que aparecieran en cascada.
 */
export function rutasPanel(r: Ruteador, a: Almacen): void {
  r.get("/panel", ({ usuario }) =>
    a.leer((d) => {
      const activos = d.productos.filter((p) => p.activo);
      // Un empleado ve el mostrador, no la contabilidad: nada de cuánto vale el
      // depósito, cuánto costó, ni cuánta plata hay fiada en la calle.
      const esDueno = !usuario || usuario.rol === "dueno";
      const hoy = diaLocal(new Date());

      const ventasDeHoy = d.pedidos.filter(
        (p) => p.estado !== "cancelado" && diaLocal(new Date(p.creadoEn)) === hoy
      );

      const caja = cajaAbierta(d);

      return {
        stock: {
          productos: activos.length,
          // Separadas del peso por lo mismo de siempre: 9.500 gramos de pan no
          // son 9.500 unidades de nada.
          unidades: activos.filter((p) => !p.porPeso).reduce((s, p) => s + p.stock, 0),
          gramos: activos.filter((p) => p.porPeso).reduce((s, p) => s + p.stock, 0),
          // Por la misma regla que un renglón de venta: un producto por peso
          // guarda su stock en gramos y su precio por kilo, así que
          // multiplicarlos a secas da mil veces de más.
          valorCosto: esDueno
            ? activos.reduce((s, p) => s + importeRenglon(p.precioCosto ?? 0, p.stock, p.porPeso), 0)
            : null,
          valorVenta: esDueno
            ? activos.reduce((s, p) => s + importeRenglon(p.precioVenta, p.stock, p.porPeso), 0)
            : null,
          bajo: activos.filter((p) => p.stock <= p.stockMinimo && p.stock > 0).length,
          sinStock: activos.filter((p) => p.stock === 0).length,
          inactivos: d.productos.filter((p) => !p.activo).length,
        },

        // Datos que faltan y que hacen mentir a otros números: sin costo
        // cargado, el valor del inventario y todo margen son adornos.
        pendientes: {
          sinCosto: esDueno ? activos.filter((p) => (p.precioCosto ?? 0) === 0).length : 0,
          sinSku: esDueno ? activos.filter((p) => !p.sku).length : 0,
          // Un costo que deja más del 85% de margen no es un costo: es un
          // relleno para sacarse de encima el aviso de que falta.
          costoDudoso: esDueno
            ? activos.filter(
                (p) =>
                  p.precioVenta > 0 &&
                  (p.precioCosto ?? 0) > 0 &&
                  p.precioCosto! < p.precioVenta * 0.15
              ).length
            : 0,
          pedidos: d.pedidos.filter((p) => p.estado === "pendiente" || p.estado === "preparando")
            .length,
          // Lo que se vence es plata que se va a la basura si nadie la mira a
          // tiempo. Esto sí lo ve un empleado: es lo que hay que sacar adelante
          // en el mostrador, no una cuenta del negocio.
          vencidos: vencimientosPendientes(d).vencidos,
          porVencer: vencimientosPendientes(d).porVencer,
        },

        // Plata del negocio que esta en la calle. Sin esto, el Panel muestra
        // un stock y una caja que cierran, y no dice que ademas hay gente que
        // debe.
        fiado: esDueno ? deudaTotal(d) : null,

        // Y lo que el negocio DEBE. Sin esto el panel mostraba un stock y una
        // caja que cerraban, y no decía que además hay que pagarle al molino.
        aProveedores: esDueno ? deudaProveedores(d) : null,

        hoyVentas: {
          cantidad: ventasDeHoy.length,
          total: ventasDeHoy.reduce((s, p) => s + p.total, 0),
          unidades: contarRenglones(ventasDeHoy.flatMap((p) => p.items)).unidades,
          gramos: contarRenglones(ventasDeHoy.flatMap((p) => p.items)).gramos,
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
            // Sin esto la pantalla no sabe que 1.450 son gramos, y muestra
            // "quedan 1.450" de un producto que tiene kilo y medio.
            porPeso: p.porPeso,
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
            porPeso: d.productos.find((p) => p.id === m.productoId)?.porPeso ?? false,
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

        // Por categoría: cuántos productos, y cuánto hay de cada tipo POR
        // SEPARADO. Antes se sumaba el stock a secas, y una categoría con 187
        // unidades y 15,9 kg decía "16.087": gramos y unidades en la misma
        // cuenta, un número que no significa nada.
        stockPorCategoria: d.categorias
          .map((c) => {
            const suyos = activos.filter((p) => p.categoriaId === c.id);
            return {
              categoria: c.nombre,
              color: c.color,
              productos: suyos.length,
              unidades: suyos.filter((p) => !p.porPeso).reduce((s, p) => s + p.stock, 0),
              gramos: suyos.filter((p) => p.porPeso).reduce((s, p) => s + p.stock, 0),
            };
          })
          .filter((x) => x.productos > 0)
          .sort((x, y) => y.productos - x.productos)
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
