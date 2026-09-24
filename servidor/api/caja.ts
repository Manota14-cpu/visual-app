import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import { selloDe } from "../usuarios.ts";
import { noEncontrado, type Ruteador } from "../http.ts";
import {
  ajustarStock,
  cajaAbierta,
  cobrosFiadoDe,
  adeudadoDe,
  comoPlata,
  deudaDe,
  efectivoDe,
  efectivoDeFiadoDe,
  entero,
  esperadoEn,
  contarRenglones,
  exigirCajaAbierta,
  importeRenglon,
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
  /** El precio es por kilo y la cantidad va en gramos. */
  porPeso: boolean;
  cantidad: number;
}

/**
 * El costo del producto hoy, que es el del día de la venta.
 *
 * Se copia al renglón por la misma razón que se copia el nombre: lo que se
 * guarda tiene que seguir siendo verdad mañana, aunque el catálogo cambie.
 */
function costoDelDia(d: BaseDatos, productoId: string | null): number | null {
  if (!productoId) return null;
  const producto = d.productos.find((p) => p.id === productoId);
  return producto?.precioCosto ?? null;
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
            abrio: c.abrio,
            cerro: c.cerro,
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

  r.post("/caja/abrir", ({ cuerpo, usuario }) =>
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
        abrioId: usuario?.id ?? null,
        abrio: usuario?.nombre ?? null,
        cerroId: null,
        cerro: null,
        abiertaEn: new Date().toISOString(),
        cerradaEn: null,
        movimientos: [],
      };

      d.cajas.push(caja);
      return vista(d, caja);
    })
  );

  r.post("/caja/movimiento", ({ cuerpo, usuario }) =>
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

  r.post("/caja/cobrar", ({ cuerpo, usuario }) =>
    a.escribir((d) => {
      const caja = exigirCajaAbierta(d, String(cuerpo.cajaId ?? ""));
      const items = validarItems(d, cuerpo.items, "cobrar");
      const subtotal = items.reduce(
        (s, i) => s + importeRenglon(i.precio, i.cantidad, i.porPeso),
        0
      );

      // El descuento se guarda aparte del precio de los renglones. Bajando el
      // precio la venta cierra igual, pero se pierde el dato de que hubo
      // descuento: después no se puede saber cuánta plata se regaló.
      const descuento = entero(cuerpo.descuento, 0);
      if (descuento < 0) throw new Regla("El descuento no puede ser negativo.");
      if (descuento > subtotal) {
        throw new Regla("El descuento no puede ser mayor que la venta.");
      }

      const total = subtotal - descuento;

      const pagos = (Array.isArray(cuerpo.pagos) ? cuerpo.pagos : []) as {
        metodo: string;
        monto: number;
      }[];

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
      const cliente = buscarCliente(d, cuerpo.clienteId);
      const fiar = cuerpo.fiar === true;

      // Lo cobrado tiene que dar exactamente el total, salvo que se este
      // fiando. Sin esa regla el arqueo de cierre arrastraria una diferencia
      // que manana nadie va a poder explicar.
      //
      // Fiar es la unica excepcion, y exige un cliente: una deuda sin nombre no
      // se puede cobrar nunca, y "Mostrador" no es un nombre. Es la diferencia
      // entre una cuenta y un faltante.
      if (fiar) {
        if (!cliente) {
          throw new Regla("Para fiar hay que elegir el cliente: una deuda sin nombre no se cobra.");
        }
        if (pagado > total) {
          throw new Regla(
            `Lo entregado (${comoPlata(pagado)}) es mas que el total de la venta (${comoPlata(total)}).`
          );
        }
        if (pagado === total) {
          throw new Regla("Esta venta se pago entera: no queda nada fiado.");
        }
      } else if (total === 0) {
        // Una venta que quedó en cero —un descuento del cien por ciento, un
        // reemplazo por algo fallado— no se puede pagar: un pago tiene que ser
        // mayor a cero. Sin esta rama la venta no se podía cerrar de ninguna
        // manera, y el stock quedaba sin descontar.
        if (pagado !== 0) {
          throw new Regla("Esta venta quedó en cero: no hay nada para cobrar.");
        }
      } else {
        if (limpios.length === 0) throw new Regla("Falta indicar cómo se pagó.");
        if (pagado !== total) {
          throw new Regla(
            `Lo cobrado (${comoPlata(pagado)}) no coincide con el total de la venta (${comoPlata(total)}).`
          );
        }
      }

      const metodos = new Set(limpios.map((p) => p.metodo));
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
        // Una venta fiada se etiqueta como tal aunque haya entregado algo: lo
        // que la define es lo que quedo debiendo, no lo que adelanto.
        metodoPago: fiar ? "fiado" : metodos.size === 1 ? limpios[0]!.metodo : "mixto",
        recibido: recibido > 0 ? recibido : null,
        cajaId: caja.id,
        descuento,
        ...selloDe(usuario),
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
          costo: costoDelDia(d, item.productoId),
          porPeso: item.porPeso,
          cantidad: item.cantidad,
        });

        if (item.productoId) {
          ajustarStock(
            d,
            item.productoId,
            -item.cantidad,
            `Venta mostrador #${pedido.numero}`,
            "venta",
            usuario
          );
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
        vuelto: fiar ? 0 : Math.max(0, recibido - enEfectivo),
        fiado: total - pagado,
        deudaCliente: cliente ? deudaDe(d, cliente.id) : 0,
      };
    })
  );

  r.post("/caja/devolver", ({ cuerpo, usuario }) =>
    a.escribir((d) => {
      const caja = exigirCajaAbierta(d, String(cuerpo.cajaId ?? ""));
      const items = validarItems(d, cuerpo.items, "devolver");
      const total = items.reduce((s, i) => s + importeRenglon(i.precio, i.cantidad, i.porPeso), 0);

      const metodo = (MEDIOS_PAGO as readonly string[]).includes(String(cuerpo.metodoPago))
        ? String(cuerpo.metodoPago)
        : "efectivo";

      const origen = d.pedidos.find((p) => p.id === cuerpo.pedidoId);
      const cliente = buscarCliente(d, cuerpo.clienteId);

      // "A cuenta": lo devuelto baja lo que el cliente debe y no sale plata del
      // cajón. Sin esto, devolver algo que se había llevado fiado le daba la
      // plata en efectivo por mercadería que nunca pagó.
      const aCuenta = cuerpo.aCuenta === true;
      if (aCuenta) {
        if (!cliente) throw new Regla("Para descontarlo de la deuda, elegí el cliente.");
        const debe = deudaDe(d, cliente.id);
        if (debe <= 0) throw new Regla(`${cliente.nombre} no tiene deuda: devolvé la plata por otro medio.`);
        if (total > debe) {
          throw new Regla(
            `${cliente.nombre} debe ${comoPlata(debe)}: a cuenta se puede devolver hasta eso. Por el resto, hacé otra devolución en efectivo.`
          );
        }
      }

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
        metodoPago: aCuenta ? "cuenta" : metodo,
        recibido: null,
        cajaId: caja.id,
        descuento: 0,
        ...selloDe(usuario),
        // A cuenta no sale plata: no hay pago. El crédito va como un cobro a
        // la cuenta del cliente, más abajo.
        pagos: aCuenta ? [] : [{ metodo, monto: -total }],
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
          costo: costoDelDia(d, item.productoId),
          porPeso: item.porPeso,
          cantidad: -item.cantidad,
        });

        if (item.productoId) {
          ajustarStock(
            d,
            item.productoId,
            item.cantidad,
            `Devolución #${pedido.numero}`,
            "devolucion",
            usuario
          );
        }
      }

      d.pedidos.push(pedido);

      if (aCuenta && cliente) {
        // Se anota como un pago a su cuenta —con medio "devolucion", que no es
        // plata del cajón— para que la deuda baje y quede escrito por qué.
        d.cobrosFiado.push({
          id: nuevoId(),
          clienteId: cliente.id,
          nombre: cliente.nombre,
          monto: total,
          metodo: "devolucion",
          cajaId: caja.id,
          nota: `Devolución #${pedido.numero}`,
          creadoEn: new Date().toISOString(),
        });
      }

      return {
        id: pedido.id,
        numero: pedido.numero,
        total,
        aCuenta,
        deudaCliente: cliente ? deudaDe(d, cliente.id) : 0,
      };
    })
  );

  /**
   * Un cliente trae plata contra lo que debe.
   *
   * Va por la caja y no por la agenda de clientes porque, si entro en efectivo,
   * la plata esta en el cajon y el arqueo del turno tiene que contarla. Cobrar
   * sin turno abierto se permite —la transferencia del domingo existe— y en ese
   * caso el cobro queda sin caja.
   */
  r.post("/caja/cobrar-fiado", ({ cuerpo }) =>
    a.escribir((d) => {
      const cliente = buscarCliente(d, cuerpo.clienteId);
      if (!cliente) throw new Regla("Elegí el cliente que está pagando.");

      const metodo = (MEDIOS_PAGO as readonly string[]).includes(String(cuerpo.metodo))
        ? String(cuerpo.metodo)
        : "efectivo";

      const monto = entero(cuerpo.monto, 0);
      if (monto <= 0) throw new Regla("El monto tiene que ser mayor a cero.");

      // No se puede pagar mas de lo que se debe: un saldo a favor es otra cosa
      // —una sena, un adelanto— y merece su propia decision, no colarse por
      // acá como un numero negativo que despues nadie entiende.
      const debe = deudaDe(d, cliente.id);
      if (debe <= 0) throw new Regla(`${cliente.nombre} no tiene deuda.`);
      if (monto > debe) {
        throw new Regla(`${cliente.nombre} debe ${comoPlata(debe)}: no se puede cobrar de más.`);
      }

      const caja = cajaAbierta(d);

      d.cobrosFiado.push({
        id: nuevoId(),
        clienteId: cliente.id,
        nombre: cliente.nombre,
        monto,
        metodo,
        // Se ata al turno cualquiera sea el medio: sirve para saber que entro
        // durante el turno. Solo el efectivo toca el cajon, y de eso se ocupa
        // `efectivoDe`, que filtra por medio.
        cajaId: caja?.id ?? null,
        nota: recortar(cuerpo.nota as string, 200),
        creadoEn: new Date().toISOString(),
      });

      return {
        cliente: cliente.nombre,
        cobrado: monto,
        saldo: deudaDe(d, cliente.id),
        enTurno: caja?.numero ?? null,
      };
    })
  );

  r.post("/caja/cerrar", ({ cuerpo, usuario }) => {
    const cierre = a.escribir((d) => {
      const caja = d.cajas.find((c) => c.id === cuerpo.cajaId);
      if (!caja) throw new Regla("Esa caja no existe.");
      if (caja.estado !== "abierta") throw new Regla("Esta caja ya está cerrada.");

      const contado = Math.min(Math.max(entero(cuerpo.contado, 0), 0), 99_999_999);
      const ventas = ventasDe(d, caja.id);
      const efectivo = efectivoDe(d, caja.id);
      const retiros = caja.movimientos.filter((m) => m.tipo === "retiro").reduce((s, m) => s + m.monto, 0);
      const ingresos = caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
      const deFiado = efectivoDeFiadoDe(d, caja.id);
      const esperado = caja.fondo + efectivo + deFiado + ingresos - retiros;

      caja.estado = "cerrada";
      caja.contado = contado;
      caja.nota = recortar(cuerpo.nota as string, 400) ?? caja.nota;
      caja.cerroId = usuario?.id ?? null;
      caja.cerro = usuario?.nombre ?? null;
      caja.cerradaEn = new Date().toISOString();

      return {
        fondo: caja.fondo,
        efectivo,
        cobradoDeFiado: deFiado,
        total: ventas.reduce((s, v) => s + v.total, 0),
        retiros,
        ingresos,
        esperado,
        contado,
        diferencia: contado - esperado,
      };
    });

    // El cierre de turno es el momento natural para resguardar: la jornada
    // está cuadrada y es exactamente el estado al que alguien querría volver.
    // Va DESPUÉS de escribir —nunca adentro— para que la copia contenga el
    // cierre y no el instante anterior, y falla en silencio: quedarse sin
    // poder cerrar la caja porque el disco está lleno sería peor que no tener
    // la copia. La del día ya corrió al abrir el programa.
    try {
      a.copiar();
    } catch (error) {
      console.error(`[caja] no se pudo copiar al cerrar: ${(error as Error).message}`);
    }

    return cierre;
  });
}

// ──────────────────────────────  Ayudas  ──────────────────────────────

function buscarCliente(d: BaseDatos, clienteId: unknown) {
  if (typeof clienteId !== "string" || !clienteId) return undefined;
  return d.clientes.find((c) => c.id === clienteId);
}

function validarItems(d: BaseDatos, items: unknown, verbo: string): Renglon[] {
  if (!Array.isArray(items) || items.length === 0) throw new Regla(`No hay nada para ${verbo}.`);
  if (items.length > MAX_RENGLONES) {
    throw new Regla(`No se pueden ${verbo} más de ${MAX_RENGLONES} renglones juntos.`);
  }

  return (items as Record<string, unknown>[]).map((item) => {
    const nombre = recortarObligatorio(item.nombre as string, 160, "Falta el nombre de un renglón.");
    const cantidad = entero(item.cantidad, 0);
    const precio = entero(item.precio, 0);
    const productoId = recortar(item.productoId as string, 64);

    // Si se vende por peso lo dice el catálogo, no la pantalla. Es una decisión
    // del producto —el pan se vende por peso siempre— y dejársela declarar a
    // quien manda el pedido permitiría cobrar un kilo al precio de un gramo.
    const porPeso = productoId
      ? (d.productos.find((p) => p.id === productoId)?.porPeso ?? false)
      : false;

    if (cantidad <= 0) {
      throw new Regla(porPeso ? "El peso tiene que ser mayor a cero." : "La cantidad tiene que ser al menos 1.");
    }
    // Mil kilos de una sentada, o un millón de unidades. En los dos casos es
    // más un error de tecleo que una venta.
    if (cantidad > 1_000_000) {
      throw new Regla(porPeso ? "Ese peso es demasiado grande." : "Esa cantidad es demasiado grande.");
    }
    if (precio < 0) throw new Regla("Un precio no puede ser negativo.");
    if (precio > 99_999_999) throw new Regla("Ese precio es demasiado grande.");

    return {
      productoId,
      nombre,
      unidad: recortar(item.unidadMedida as string, 24) ?? "unidad",
      precio,
      porPeso,
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
    abrio: caja.abrio,
    cerro: caja.cerro,
    abiertaEn: caja.abiertaEn,
    cerradaEn: caja.cerradaEn,

    // Cuánta plata se regaló en el turno. Sin esto, un descuento del 20% en
    // cada venta se ve solamente como "se vendió menos".
    descuentos: ventas.reduce((s, v) => s + (v.descuento ?? 0), 0),

    ventas: ventas.map((v) => ({
      id: v.id,
      numero: v.numero,
      nombre: v.nombre,
      total: v.total,
      canal: v.canal,
      metodoPago: v.metodoPago ?? "efectivo",
      notas: v.notas,
      creadoEn: v.creadoEn,
      usuario: v.usuario,
      descuento: v.descuento ?? 0,
      renglones: v.items.length,
      unidades: contarRenglones(v.items).unidades,
      gramos: contarRenglones(v.items).gramos,
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

    // Lo fiado en el turno y lo cobrado de deudas viejas: son las dos formas
    // en que la plata del turno no coincide con lo vendido.
    fiadoDelTurno: ventas.reduce((s, v) => s + adeudadoDe(v), 0),
    cobradoDeFiado: cobrosFiadoDe(d, caja.id).reduce((s, c) => s + c.monto, 0),

    movimientos: [...caja.movimientos].sort((x, y) => y.creadoEn.localeCompare(x.creadoEn)),
    retirado: caja.movimientos.filter((m) => m.tipo === "retiro").reduce((s, m) => s + m.monto, 0),
    ingresado: caja.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0),
    esperado: esperadoEn(d, caja),
  };
}
