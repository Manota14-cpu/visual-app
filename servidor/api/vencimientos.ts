import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import type { Ruteador } from "../http.ts";
import { ajustarStock, entero, recortar } from "../reglas.ts";
import { selloDe } from "../usuarios.ts";
import type { BaseDatos, Vencimiento } from "../tipos.ts";

/**
 * Lo que se vence, antes de que haya que tirarlo.
 *
 * En una panadería o un kiosco esto es plata que se va a la basura si nadie la
 * mira a tiempo. Hasta ahora no había dónde anotarlo: se sabía cuánto hay,
 * nunca hasta cuándo sirve.
 *
 * Las partidas van aparte del producto porque en la estantería conviven: la
 * leche que vence el martes y la que vence en tres semanas son el mismo
 * producto con dos fechas.
 */

/** Desde cuántos días antes se considera que algo "está por vencer". */
export const DIAS_DE_AVISO = 7;

export function rutasVencimientos(r: Ruteador, a: Almacen): void {
  /**
   * Las partidas, de la que vence primero a la que vence último.
   *
   * Ese orden es el único que sirve: lo que hay que mirar es lo que se vence
   * mañana, no lo que se cargó ayer.
   */
  r.get("/vencimientos", ({ consulta }) =>
    a.leer((d) => {
      const soloUrgentes = consulta.get("estado") === "urgentes";

      const partidas = [...d.vencimientos]
        .sort((x, y) => x.fecha.localeCompare(y.fecha))
        .map((v) => vista(d, v))
        .filter((v) => !soloUrgentes || v.dias <= DIAS_DE_AVISO);

      return {
        items: partidas,
        vencidos: partidas.filter((v) => v.dias < 0).length,
        porVencer: partidas.filter((v) => v.dias >= 0 && v.dias <= DIAS_DE_AVISO).length,
      };
    })
  );

  r.post("/vencimientos", ({ cuerpo, usuario }) =>
    a.escribir((d) => {
      const producto = d.productos.find((p) => p.id === cuerpo.productoId);
      if (!producto) throw new Regla("Ese producto ya no existe.");

      const fecha = String(cuerpo.fecha ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Regla("Poné la fecha de vencimiento.");

      const cantidad = entero(cuerpo.cantidad, 0);
      if (cantidad <= 0) throw new Regla("Poné cuánto se vence ese día.");

      const partida: Vencimiento = {
        id: nuevoId(),
        productoId: producto.id,
        nombre: producto.nombre,
        fecha,
        cantidad,
        porPeso: producto.porPeso,
        notas: recortar(cuerpo.notas as string, 200),
        ...selloDe(usuario),
        creadoEn: new Date().toISOString(),
      };

      d.vencimientos.push(partida);
      return vista(d, partida);
    })
  );

  /**
   * Tirar lo vencido: saca la partida y descuenta el stock.
   *
   * Es lo que cierra el círculo. Sin esto, alguien tira la leche a la basura y
   * el sistema sigue creyendo que está en la heladera — que es exactamente el
   * problema que esto viene a resolver, pero al revés.
   */
  r.post("/vencimientos/:id/tirar", ({ params, cuerpo, usuario }) =>
    a.escribir((d) => {
      const i = d.vencimientos.findIndex((v) => v.id === params.id);
      if (i < 0) throw new Regla("Esa partida ya no está.");

      const partida = d.vencimientos[i]!;
      const cuanto = Math.min(entero(cuerpo.cantidad, partida.cantidad), partida.cantidad);
      if (cuanto <= 0) throw new Regla("Poné cuánto tirás.");

      // Si el producto ya no existe en el catálogo no hay stock que descontar,
      // pero la partida sí se saca: lo que se tiró, se tiró.
      //
      // Y si parte de la partida ya se vendió, el stock puede estar por debajo
      // de lo que dice la partida. Se descuenta lo que hay: antes el pedido
      // fallaba con "stock insuficiente" y la partida vencida no se podía
      // sacar nunca de la lista.
      const producto = d.productos.find((p) => p.id === partida.productoId);
      const descontar = producto ? Math.min(cuanto, producto.stock) : 0;
      if (producto && descontar > 0) {
        ajustarStock(
          d,
          partida.productoId,
          -descontar,
          `Vencido el ${partida.fecha}`,
          "salida",
          usuario
        );
      }

      if (cuanto >= partida.cantidad) d.vencimientos.splice(i, 1);
      else partida.cantidad -= cuanto;

      return { ok: true, tirado: cuanto };
    })
  );

  /** Sacar la partida sin tocar el stock: se vendió a tiempo, o se cargó mal. */
  r.borrar("/vencimientos/:id", ({ params }) =>
    a.escribir((d) => {
      const i = d.vencimientos.findIndex((v) => v.id === params.id);
      if (i < 0) throw new Regla("Esa partida ya no está.");
      d.vencimientos.splice(i, 1);
      return { ok: true };
    })
  );
}

/**
 * Cuántos días faltan, contados en días del calendario.
 *
 * Al mediodía de los dos lados: así el cambio de horario de verano —una hora
 * de más o de menos— no corre la cuenta un día entero, y "vence hoy" sigue
 * diciendo hoy durante todo el día.
 */
export function diasHasta(fecha: string): number {
  const [aa, mm, dd] = fecha.split("-").map(Number);
  const cuando = new Date(aa ?? 1970, (mm ?? 1) - 1, dd ?? 1, 12).getTime();

  const hoy = new Date();
  const ahora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12).getTime();

  return Math.round((cuando - ahora) / 86_400_000);
}

function vista(d: BaseDatos, v: Vencimiento) {
  const producto = d.productos.find((p) => p.id === v.productoId);

  return {
    id: v.id,
    productoId: v.productoId,
    nombre: v.nombre,
    fecha: v.fecha,
    cantidad: v.cantidad,
    porPeso: v.porPeso,
    notas: v.notas,
    usuario: v.usuario,
    dias: diasHasta(v.fecha),
    /** Lo que hay hoy del producto, para saber si la partida sigue teniendo sentido. */
    stock: producto?.stock ?? null,
    creadoEn: v.creadoEn,
  };
}

/** Cuántas partidas están vencidas o a punto. Lo usa el panel. */
export function vencimientosPendientes(d: BaseDatos): { vencidos: number; porVencer: number } {
  let vencidos = 0;
  let porVencer = 0;

  for (const v of d.vencimientos) {
    const dias = diasHasta(v.fecha);
    if (dias < 0) vencidos++;
    else if (dias <= DIAS_DE_AVISO) porVencer++;
  }

  return { vencidos, porVencer };
}
