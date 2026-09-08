import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import { noEncontrado, type Ruteador } from "../http.ts";
import {
  ajustarStock,
  cajaAbierta,
  comoPlata,
  efectivoDe,
  entero,
  esperadoEn,
  exigirCajaAbierta,
  recortar,
  recortarObligatorio,
  ventasDe,
} from "../reglas.ts";
import { MEDIOS_PAGO, type BaseDatos, type Caja, type Pedido } from "../tipos.ts";

const MAX_RENGLONES = 60;

/** Un renglón ya validado y normalizado, listo para guardarse. */
interface Renglon {
  productoId: string | null;
  nombre: string;
  unidad: string;
  precio: number;
  cantidad: number;
}

/**
 * El mostrador: turnos de caja, cobros, devoluciones y arqueo.
 *
 * Cobrar toca cuatro cosas a la vez —la venta, sus pagos, el stock de cada
 * renglón y el turno— y ninguna puede quedar a medias. Por eso todo pasa por
 * `almacen.escribir`: si al cuarto renglón no le alcanza el stock, los tres
 * primeros no quedan descontados y la venta no existe.
 */
export function rutasCaja(r: Ruteador, a: Almacen): void {
  r.get("/caja", () =>
    a.leer((d) => {
      const caja = cajaAbierta(d);
      return caja ? vista(d, caja) : null;
    })
  );

  r.get("/caja/historial", () =>
    a.leer((d) =>
      [...d.cajas]
        .sort((x, y) => y.numero - x.numero)
        .slice(0, 60)
        .map((c) => {
          const ventas = ventasDe(d, c.id);
          const esperado = esperadoEn(d, c);

          return {
            id: c.id,
            numero: c.numero,
            estado: c.estado,
            fondo: c.fondo,
            contado: c.contado,
            abiertaEn: c.abiertaEn,
            cerradaEn: c.cerradaEn,
            ventas: ventas.length,
            total: ventas.reduce((s, v) => s + v.total, 0),
            efectivo: efectivoDe(d, c.id),
            esperado,
            // Contado menos esperado. Negativo es faltante.
            diferencia: c.contado === null ? null : c.contado - esperado,
          };
        })
    )
  );

  r.get("/caja/:id", ({ params }) =>
    a.leer((d) => {
      const caja = d.cajas.find((c) => c.id === params.id);
      return caja ? vista(d, caja) : noEncontrado("Ese turno no existe.");
    })
  );

  r.post("/caja/abrir", ({ cuerpo }) =>
    a.escribir((d) => {
      // Uno solo a la vez: con dos turnos abiertos sería imposible saber a cuál
      // pertenece cada cobro, y ninguno de los dos cierres cerraría.
      if (cajaAbierta(d)) throw new Regla("Ya hay una caja abierta. Cerrala antes de abrir otra.");

      const caja: Caja = {
        id: nuevoId(),
        numero: ++d.contadores.caja,
        estado: "abierta",
        fondo: Math.min(Math.max(entero(cuerpo.fondo, 0), 0), 99_999_999),
        contado: null,
        nota: recortar(cuerpo.nota as string, 200),
        abiertaEn: new Date().toISOString(),
        cerradaEn: null,
        movimientos: [],
      };

      d.cajas.push(caja);
      return vista(d, caja);
    })
  );

  r.post("/caja/movimiento", ({ cuerpo }) =>
    a.escribir((d) => {
      const caja = exigirCajaAbierta(d, String(cuerpo.cajaId ?? ""));
      const tipo = cuerpo.tipo === "ingreso" ? "ingreso" : cuerpo.tipo === "retiro" ? "retiro" : null;
      if (!tipo) throw new Regla("Tipo de movimiento inválido.");

      const monto = entero(cuerpo.monto, 0);
      if (monto <= 0) throw new Regla("El monto tiene que ser mayor a cero.");
      if (monto > 99_999_999) throw new Regla("El monto es demasiado grande.");

      // El motivo es obligatorio: un retiro sin motivo es indistinguible de un
      // faltante cuando se mira el cierre a fin de mes.
      const motivo = recortarObligatorio(cuerpo.motivo as string, 200, "Escribí para qué fue.");

      caja.movimientos.push({
        id: nuevoId(),
        tipo,
        monto,
        motivo,
        creadoEn: new Date().toISOString(),
      });

      return vista(d, caja);
    })
  );

  r.post("/caja/cobrar", ({ cuerpo }) =>
    a.escribir((d) => {
      const caja = exigirCajaAbierta(d, String(cuerpo.cajaId ?? ""));
      const items = validarItems(cuerpo.items, "cobrar");
      const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

      const pagos = (Array.isArray(cuerpo.pagos) ? cuerpo.pagos : []) as {
        metodo: string;
        monto: number;
      }[];

      if (pagos.length === 0) throw new Regla("Falta indicar cómo se pagó.");
      if (pagos.length > 4) throw new Regla("Son demasiadas formas de pago para una venta.");

      const limpios = pagos.map((p) => {
        if (!(MEDIOS_PAGO as readonly string[]).includes(p.metodo)) {
          throw new Regla("Ese medio de pago no existe.");
        }
        const monto = entero(p.monto, 0);
        if (monto <= 0) throw new Regla("Cada pago tiene que ser mayor a cero.");
        return { metodo: p.metodo, monto };
      });

      const pagado = limpios.reduce((s, p) => s + p.monto, 0);
      // Tiene que ser exactamente el total: si no, el arqueo de cierre
      // arrastraría una diferencia que mañana nadie va a poder explicar.
      if (pagado !== total) {
        throw new Regla(
          `Lo cobrado (${comoPlata(pagado)}) no coincide con el total de la venta (${comoPlata(total)}).`
        );
      }

      const metodos = new Set(limpios.map((p) => p.metodo));
      const cliente = buscarCliente(d, cuerpo.clienteId);
      const recibido = entero(cuerpo.recibido, 0);

      const pedido: Pedido = {
        id: nuevoId(),
        numero: ++d.contadores.pedido,
        canal: "mostrador",
        estado: "entregado",
        // El nombre se copia además del vínculo: es cómo se llamaba el cliente
        // ese día, y renombrarlo no debería reescribir un comprobante impreso.
        nombre: recortar(cuerpo.nombre as string, 160) ?? cliente?.nombre ?? "Mostrador",
        clienteId: cliente?.id ?? null,
        notas: recortar(cuerpo.notas as string, 400),
        total,
        metodoPago: metodos.size === 1 ? limpios[0]!.metodo : "mixto",
        recibido: recibido > 0 ? recibido : null,
        cajaId: caja.id,
        pagos: limpios,
        items: [],
        creadoEn: new Date().toISOString(),
      };

      for (const item of items) {
        pedido.items.push({
          id: nuevoId(),
          productoId: item.productoId,
          nombre: item.nombre,
          unidadMedida: item.unidad,
          precio: item.precio,
          cantidad: item.cantidad,
        });

        if (item.productoId) {
          ajustarStock(d, item.productoId, -item.cantidad, `Venta mostrador #${pedido.numero}`, "venta");
        }
      }

      d.pedidos.push(pedido);

      const enEfectivo = limpios
        .filter((p) => p.metodo === "efectivo")
        .reduce((s, p) => s + p.monto, 0);

      return {
        id: pedido.id,
        numero: pedido.numero,
        total: pedido.total,
        // El vuelto nunca es negativo: si entregó de menos, no hay vuelto.
        vuelto: Math.max(0, recibido - enEfectivo),
      };
    })
  );

  r.post("/caja/devolver", ({ cuerpo }) =>
    a.escribir((d) => {
      const caja = exigirCajaAbierta(d, String(cuerpo.cajaId ?? ""));
      const items = validarItems(cuerpo.items, "devolver");
      const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

      const metodo = (MEDIOS_PAGO as readonly string[]).includes(String(cuerpo.metodoPago))
        ? String(cuerpo.metodoPago)
        : "efectivo";

      const origen = d.pedidos.find((p) => p.id === cuerpo.pedidoId);
      const cliente = buscarCliente(d, cuerpo.clienteId);

      let notas = recortar(cuerpo.notas as string, 400);
      if (origen) {
        notas = notas ? `${notas} (de la venta #${origen.numero})` : `De la venta #${origen.numero}`;
      }

      // Una devolución es una venta al revés y se guarda como tal: importes y
      // cantidades negativos sobre la misma lista. Así el arqueo y los informes
      // le dan el signo correcto sin ningún caso especial que alguien pueda
      // olvidarse de agregar.
      const pedido: Pedido = {
        id: nuevoId(),
        numero: ++d.contadores.pedido,
        canal: "devolucion",
        estado: "entregado",
        nombre: recortar(cuerpo.nombre as string, 160) ?? cliente?.nombre ?? "Devolución",
        clienteId: cliente?.id ?? null,
        notas,
        total: -total,
        metodoPago: metodo,
        recibido: null,
        cajaId: caja.id,
        pagos: [{ metodo, monto: -total }],
        items: [],
        creadoEn: new Date().toISOString(),
      };

      for (const item of items) {
        pedido.items.push({
          id: nuevoId(),
          productoId: item.productoId,
          nombre: item.nombre,
          unidadMedida: item.unidad,
          precio: item.precio,
          cantidad: -item.cantidad,
        });

        if (item.productoId) {
          ajustarStock(d, item.productoId, item.cantidad, `Devolución #${pedido.numero}`, "devolucion");
        }
      }

      d.pedidos.push(pedido);
      return { id: pedido.id, numero: pedido.numero, total };
    })
  );

  r.post("/caja/cerrar", ({ cuerpo }) =>
    a.escribir((d) => {
      const caja = d.cajas.find((c) => c.id === cuerpo.cajaId);
      if (!caja) throw new Regla("Esa caja no existe.");
      if (caja.estado !== "abierta") throw new Regla("Esta caja ya está cerrada.");

      const contado = Math.min(Math.max(entero(cuerpo.contado, 0), 0), 99_999_999);
      const ventas = ventasDe(d, caja.id);
      const efectivo = efectivoDe(d, caja.id);
      const retiros = caja.movimientos.filter((m) => m.tipo === "retiro").reduce((s, m) => s + m.monto, 0);
      const ingresos = caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
      const esperado = caja.fondo + efectivo + ingresos - retiros;

      caja.estado = "cerrada";
      caja.contado = contado;
      caja.nota = recortar(cuerpo.nota as string, 400) ?? caja.nota;
      caja.cerradaEn = new Date().toISOString();

      return {
        fondo: caja.fondo,
        efectivo,
        total: ventas.reduce((s, v) => s + v.total, 0),
        retiros,
        ingresos,
        esperado,
        contado,
        diferencia: contado - esperado,
      };
    })
  );
}

// ──────────────────────────────  Ayudas  ──────────────────────────────

function buscarCliente(d: BaseDatos, clienteId: unknown) {
  if (typeof clienteId !== "string" || !clienteId) return undefined;
  return d.clientes.find((c) => c.id === clienteId);
}

function validarItems(items: unknown, verbo: string): Renglon[] {
  if (!Array.isArray(items) || items.length === 0) throw new Regla(`No hay nada para ${verbo}.`);
  if (items.length > MAX_RENGLONES) {
    throw new Regla(`No se pueden ${verbo} más de ${MAX_RENGLONES} renglones juntos.`);
  }

  return (items as Record<string, unknown>[]).map((item) => {
    const nombre = recortarObligatorio(item.nombre as string, 160, "Falta el nombre de un renglón.");
    const cantidad = entero(item.cantidad, 0);
    const precio = entero(item.precio, 0);

    if (cantidad <= 0) throw new Regla("La cantidad tiene que ser al menos 1.");
    if (cantidad > 1_000_000) throw new Regla("Esa cantidad es demasiado grande.");
    if (precio < 0) throw new Regla("Un precio no puede ser negativo.");
    if (precio > 99_999_999) throw new Regla("Ese precio es demasiado grande.");

    return {
      productoId: recortar(item.productoId as string, 64),
      nombre,
      unidad: recortar(item.unidadMedida as string, 24) ?? "unidad",
      precio,
      cantidad,
    };
  });
}

/** El turno con sus ventas, sus totales por medio de pago y su arqueo. */
export function vista(d: BaseDatos, caja: Caja) {
  const ventas = ventasDe(d, caja.id);
  const pagos = ventas.flatMap((v) => v.pagos);
  const porMedio = (metodo: string) =>
    pagos.filter((p) => p.metodo === metodo).reduce((s, p) => s + p.monto, 0);

  return {
    id: caja.id,
    numero: caja.numero,
    estado: caja.estado,
    fondo: caja.fondo,
    contado: caja.contado,
    nota: caja.nota,
    abiertaEn: caja.abiertaEn,
    cerradaEn: caja.cerradaEn,

    ventas: ventas.map((v) => ({
      id: v.id,
      numero: v.numero,
      nombre: v.nombre,
      total: v.total,
      canal: v.canal,
      metodoPago: v.metodoPago ?? "efectivo",
      notas: v.notas,
      creadoEn: v.creadoEn,
      renglones: v.items.length,
      unidades: v.items.reduce((s, i) => s + i.cantidad, 0),
    })),

    // Los totales por medio salen de los pagos y no de la etiqueta: en una
    // venta mitad y mitad la etiqueta dice "mixto", y repartirla por ahí
    // sumaría el importe entero a un solo medio.
    totales: {
      efectivo: porMedio("efectivo"),
      transferencia: porMedio("transferencia"),
      tarjeta: porMedio("tarjeta"),
      otro: porMedio("otro"),
      total: ventas.reduce((s, v) => s + v.total, 0),
      cantidad: ventas.length,
    },

    movimientos: [...caja.movimientos].sort((x, y) => y.creadoEn.localeCompare(x.creadoEn)),
    retirado: caja.movimientos.filter((m) => m.tipo === "retiro").reduce((s, m) => s + m.monto, 0),
    ingresado: caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0),
    esperado: esperadoEn(d, caja),
  };
}
