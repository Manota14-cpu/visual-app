import type { Almacen } from "../almacen.ts";
import type { Ruteador } from "../http.ts";
import { contiene, entero, normalizar } from "../reglas.ts";
import { TIPOS_MOVIMIENTO } from "../tipos.ts";
import { paginar } from "./catalogo.ts";

/**
 * El historial de stock.
 *
 * Es la respuesta a "¿por qué hay 14 y no 20?". Por eso no se borra nunca, ni
 * siquiera cuando el producto se elimina: el movimiento guarda con cuánto quedó.
 */
export function rutasMovimientos(r: Ruteador, a: Almacen): void {
  r.get("/movimientos", ({ consulta }) =>
    a.leer((d) => {
      let movimientos = [...d.movimientos];

      const tipo = consulta.get("tipo");
      if (tipo && tipo !== "todos") movimientos = movimientos.filter((m) => m.tipo === tipo);

      const productoId = consulta.get("productoId");
      if (productoId) movimientos = movimientos.filter((m) => m.productoId === productoId);

      const dias = entero(consulta.get("dias"), 0);
      if (dias > 0) {
        const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
        movimientos = movimientos.filter((m) => m.creadoEn >= desde);
      }

      const q = consulta.get("q");
      if (q) {
        const termino = normalizar(q);
        const coinciden = new Set(
          d.productos
            .filter((p) => contiene(p.nombre, termino) || contiene(p.sku, termino))
            .map((p) => p.id)
        );

        movimientos = movimientos.filter(
          (m) => coinciden.has(m.productoId) || contiene(m.motivo, termino)
        );
      }

      movimientos.sort((x, y) => y.creadoEn.localeCompare(x.creadoEn));

      return {
        ...paginar(movimientos, consulta, 40, (m) => {
          const producto = d.productos.find((p) => p.id === m.productoId);
          return {
            id: m.id,
            productoId: m.productoId,
            producto: producto?.nombre ?? "Producto eliminado",
            sku: producto?.sku ?? null,
            tipo: m.tipo,
            cantidad: m.cantidad,
            stockResultante: m.stockResultante,
            // Para que la pantalla escriba "250 g" y no "250".
            porPeso: producto?.porPeso ?? false,
            motivo: m.motivo,
      usuario: m.usuario,
            creadoEn: m.creadoEn,
          };
        }),
        tipos: TIPOS_MOVIMIENTO,
      };
    })
  );
}
