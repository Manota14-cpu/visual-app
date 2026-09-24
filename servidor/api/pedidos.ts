import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import { noEncontrado, type Ruteador } from "../http.ts";
import { esDueno } from "../usuarios.ts";
import {
  ajustarStock,
  contarRenglones,
  contiene,
  entero,
  importeRenglon,
  normalizar,
  recortar,
  recortarObligatorio,
} from "../reglas.ts";
import { ESTADOS_PEDIDO, type BaseDatos, type EstadoPedido, type ItemPedido, type Pedido } from "../tipos.ts";
import { paginar } from "./catalogo.ts";
import { armarCsv } from "../csv.ts";
import { diaLocal } from "./panel.ts";

/**
 * Las ventas que pide la pantalla, con sus filtros: estado, canal, días y lo
 * que se escribió en el buscador. Lo usan la lista y la planilla, así la
 * planilla trae exactamente lo que se estaba mirando.
 */
function filtrarPedidos(d: BaseDatos, consulta: URLSearchParams): Pedido[] {
  let pedidos = [...d.pedidos];

  const estado = consulta.get("estado");
  if (estado && estado !== "todos") pedidos = pedidos.filter((p) => p.estado === estado);

  const canal = consulta.get("canal");
  if (canal && canal !== "todos") pedidos = pedidos.filter((p) => p.canal === canal);

  const dias = entero(consulta.get("dias"), 0);
  if (dias > 0) {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
    pedidos = pedidos.filter((p) => p.creadoEn >= desde);
  }

  const q = consulta.get("q");
  if (q) {
    const termino = normalizar(q);
    pedidos = pedidos.filter(
      (p) =>
        contiene(p.nombre, termino) ||
        contiene(p.notas, termino) ||
        String(p.numero).includes(termino) ||
        p.items.some((i) => contiene(i.nombre, termino))
    );
  }

  return pedidos.sort((x, y) => y.numero - x.numero);
}

const NOMBRE_MEDIO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
  mixto: "Mixto",
  fiado: "Fiado",
  cuenta: "A cuenta",
};

/**
 * Las ventas en una planilla, para el contador o para mirarlas en Excel.
 *
 * Una fila por venta, con la fecha y la hora en columnas separadas —así se
 * filtran y se ordenan— y los importes como números sin signo de pesos, que
 * es lo que Excel suma. Lo que se llevó va resumido en una columna: el detalle
 * renglón por renglón está en el comprobante.
 */
export function planillaDeVentas(d: BaseDatos, pedidos: Pedido[]): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  // Un nombre escrito como "=HIPERVINCULO(…)" Excel lo ejecuta como fórmula
  // al abrir la planilla. Con un apóstrofo adelante lo muestra como texto,
  // que es lo que es. Solo en lo que escribe una persona: los importes son
  // números y una devolución tiene que seguir sumando negativo.
  const texto = (valor: string | null | undefined) =>
    valor && /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : (valor ?? "");
  const cantidad = (i: ItemPedido) => {
    const c = Math.abs(i.cantidad);
    if (!i.porPeso) return `${c} ×`;
    return c < 1000 ? `${c} g` : `${String(c / 1000).replace(".", ",")} kg`;
  };

  const filas: (string | number | null)[][] = [
    ["Número", "Fecha", "Hora", "Canal", "Estado", "Cliente", "Vendió", "Pago", "Lo que se llevó", "Descuento", "Total"],
    ...pedidos.map((p) => {
      const cuando = new Date(p.creadoEn);
      const cliente = p.clienteId ? d.clientes.find((c) => c.id === p.clienteId)?.nombre : null;
      return [
        p.numero,
        diaLocal(cuando),
        `${dos(cuando.getHours())}:${dos(cuando.getMinutes())}`,
        p.canal,
        p.estado,
        texto(cliente ?? p.nombre),
        texto(p.usuario),
        p.metodoPago ? (NOMBRE_MEDIO[p.metodoPago] ?? p.metodoPago) : "",
        texto(p.items.map((i) => `${cantidad(i)} ${i.nombre}`).join(" · ")),
        // Las ventas de antes de que existieran los descuentos no traen el campo.
        p.descuento ?? 0,
        p.total,
      ];
    }),
  ];

  return armarCsv(filas);
}

/**
 * Las ventas ya hechas: las de mostrador, las devoluciones y las que se cargan
 * a mano para un pedido que todavía no se entregó.
 *
 * Cambiar el estado de un pedido mueve stock —cancelarlo devuelve a la
 * estantería lo que se había descontado, y reabrirlo lo vuelve a sacar—, así
 * que estado y stock se tocan en la misma operación o en ninguna.
 */
export function rutasPedidos(r: Ruteador, a: Almacen): void {
  r.get(
    "/pedidos/exportar",
    ({ consulta }) =>
      a.leer((d) => {
        const pedidos = filtrarPedidos(d, consulta);
        return {
          nombre: `ventas-${diaLocal(new Date())}.csv`,
          contenido: planillaDeVentas(d, pedidos),
          ventas: pedidos.length,
        };
      }),
    "dueno"
  );

  r.get("/pedidos", ({ consulta, usuario }) =>
    a.leer((d) => {
      const pedidos = filtrarPedidos(d, consulta);

      return {
        ...paginar(pedidos, consulta, 30, (p) => vista(d, p, esDueno(usuario))),
        conteos: Object.fromEntries(
          ESTADOS_PEDIDO.map((e) => [e, d.pedidos.filter((p) => p.estado === e).length])
        ),
      };
    })
  );

  r.get("/pedidos/:id", ({ params, usuario }) =>
    a.leer((d) => {
      const pedido = d.pedidos.find((p) => p.id === params.id);
      return pedido ? vista(d, pedido, esDueno(usuario)) : noEncontrado("Ese pedido no existe.");
    })
  );

  r.post("/pedidos/:id/estado", ({ params, cuerpo, usuario }) =>
    a.escribir((d) => {
      const pedido = d.pedidos.find((p) => p.id === params.id);
      if (!pedido) throw new Regla("Ese pedido no existe.");

      const estado = cuerpo.estado as EstadoPedido;
      if (!ESTADOS_PEDIDO.includes(estado)) throw new Regla("Ese estado no existe.");
      if (pedido.estado === estado) return vista(d, pedido, esDueno(usuario));

      // Cancelar una venta la saca de los totales de su turno, y con eso cambia
      // el arqueo de un cierre que ya se firmó: el mismo turno pasaría a mostrar
      // una diferencia que nadie contó. Es la misma regla que impide editarla o
      // borrarla.
      exigirCajaEditable(d, pedido, "cambiarle el estado");

      if (estado === "cancelado") {
        // Se cancela: vuelve el stock. Si el producto ya no está en el
        // catálogo, el pedido igual se cancela.
        for (const [productoId, cantidad] of porProducto(pedido.items)) {
          if (d.productos.some((p) => p.id === productoId)) {
            ajustarStock(
              d,
              productoId,
              cantidad,
              `Pedido #${pedido.numero} cancelado`,
              "devolucion",
              usuario
            );
          }
        }
      } else if (pedido.estado === "cancelado") {
        // Se reabre un pedido cancelado: se vuelve a descontar.
        for (const [productoId, cantidad] of porProducto(pedido.items)) {
          if (d.productos.some((p) => p.id === productoId)) {
            ajustarStock(
              d,
              productoId,
              -cantidad,
              `Pedido #${pedido.numero} reabierto`,
              "venta",
              usuario
            );
          }
        }
      }

      pedido.estado = estado;
      return vista(d, pedido, esDueno(usuario));
    })
  );

  r.post("/pedidos/:id/nota", ({ params, cuerpo, usuario }) =>
    a.escribir((d) => {
      const pedido = d.pedidos.find((p) => p.id === params.id);
      if (!pedido) throw new Regla("Ese pedido no existe.");
      pedido.notas = recortar(cuerpo.notas as string, 1000);
      return vista(d, pedido, esDueno(usuario));
    })
  );

  r.put("/pedidos/:id", ({ params, cuerpo }) =>
    a.escribir((d) => {
      const pedido = d.pedidos.find((p) => p.id === params.id);
      if (!pedido) throw new Regla("Ese pedido no existe.");

      if (pedido.estado === "cancelado") {
        throw new Regla("Un pedido cancelado no se puede editar. Reabrilo primero.");
      }

      // Una devolución está escrita al revés: cantidades, total y pagos son
      // negativos, porque es lo que hace que el arqueo y los informes la resten
      // sin ningún caso especial. Este editor solo sabe escribir ventas —exige
      // cantidades positivas—, así que guardarla acá la daba vuelta: la
      // devolución de $20.700 pasaba a sumar $20.700 al cajón, un salto de
      // $41.400, y el stock se movía para el lado contrario.
      if (pedido.canal === "devolucion") {
        throw new Regla(
          "Una devolución no se edita: sus importes van al revés y guardarla acá los daría vuelta. Borrala y registrala de nuevo."
        );
      }

      exigirCajaEditable(d, pedido, "editarla");

      const entradas = Array.isArray(cuerpo.items) ? (cuerpo.items as Record<string, unknown>[]) : [];
      if (entradas.length === 0) throw new Regla("El pedido tiene que tener al menos un renglón.");
      if (entradas.length > 60) throw new Regla("No se pueden cargar más de 60 renglones en un pedido.");

      // El costo que ya tenia cada producto en este pedido. Editar una venta
      // no puede reescribir lo que costo el dia que se hizo: si el renglon ya
      // traia su costo, se conserva; si es un renglon nuevo, se copia el de hoy.
      const costoPrevio = new Map<string, number | null>();
      for (const viejo of pedido.items) {
        if (viejo.productoId && viejo.costo !== null && viejo.costo !== undefined) {
          costoPrevio.set(viejo.productoId, viejo.costo);
        }
      }

      const nuevos: ItemPedido[] = entradas.map((item) => {
        const nombre = recortarObligatorio(item.nombre as string, 160, "Falta el nombre de un renglón.");
        const cantidad = entero(item.cantidad, 0);
        const precio = entero(item.precio, 0);

        if (cantidad <= 0) throw new Regla("La cantidad tiene que ser al menos 1.");
        if (precio < 0) throw new Regla("Un precio no puede ser negativo.");

        const productoId = recortar(item.productoId as string, 64);

        return {
          id: nuevoId(),
          productoId,
          nombre,
          unidadMedida: recortar(item.unidadMedida as string, 24) ?? "unidad",
          precio,
          costo: productoId
            ? (costoPrevio.get(productoId) ??
              d.productos.find((p) => p.id === productoId)?.precioCosto ??
              null)
            : null,
          // Del catálogo, no del pedido: es una decisión del producto.
          porPeso: productoId
            ? (d.productos.find((p) => p.id === productoId)?.porPeso ?? false)
            : false,
          cantidad,
        };
      });

      // Se reconcilia por diferencia y no aplicando cambios de a uno: cambiar
      // una cantidad y mover un producto a otro renglón son la misma operación
      // vistas de cerca, y tratarlas por separado deja huecos por los que el
      // stock se desfasa.
      const antes = porProducto(pedido.items);
      const despues = porProducto(nuevos);

      for (const productoId of new Set([...antes.keys(), ...despues.keys()])) {
        const delta = (despues.get(productoId) ?? 0) - (antes.get(productoId) ?? 0);
        if (delta === 0) continue;
        if (!d.productos.some((p) => p.id === productoId)) continue;

        // Más cantidad en el pedido significa menos en la estantería.
        ajustarStock(
          d,
          productoId,
          -delta,
          `Edición del pedido #${pedido.numero}`,
          delta > 0 ? "venta" : "devolucion"
        );
      }

      const subtotal = nuevos.reduce((s, i) => s + importeRenglon(i.precio, i.cantidad, i.porPeso), 0);

      // El descuento que se hizo al cobrar se conserva. Antes el total se
      // recalculaba con los renglones solos y el descuento desaparecía: el
      // cajón pasaba a esperar plata que nunca entró, y el arqueo daba faltante.
      // Si la venta quedó más chica que el descuento, el descuento se achica
      // con ella: una venta no puede dar negativo.
      pedido.descuento = Math.min(pedido.descuento ?? 0, subtotal);

      pedido.items = nuevos;
      pedido.total = subtotal - pedido.descuento;
      pedido.nombre = recortar(cuerpo.nombre as string, 160) ?? pedido.nombre;
      pedido.notas = recortar(cuerpo.notas as string, 1000);

      const pagado = pedido.pagos.reduce((s, p) => s + p.monto, 0);

      if (pedido.metodoPago === "fiado") {
        // En una venta fiada los pagos son lo que el cliente entregó de verdad,
        // no el total. Igualarlos al total la daba por pagada: la deuda
        // desaparecía y el cajón esperaba una plata que nunca entró. Lo único
        // que no puede pasar es que ahora valga menos de lo que ya entregó.
        if (pagado > pedido.total) {
          throw new Regla(
            "El cliente ya entregó más de lo que quedaría la venta. Registrá una devolución en vez de editarla."
          );
        }
      } else if (pedido.pagos.length === 1) {
        // Si la venta se cobró por caja, el desglose de pagos tiene que seguir
        // sumando el total: si no, el arqueo daría distinto.
        pedido.pagos[0]!.monto = pedido.total;
      } else if (pedido.pagos.length > 1 && pagado !== pedido.total) {
        throw new Regla(
          "Esta venta se pagó con varios medios. Anulala y volvé a cobrarla en vez de editarla."
        );
      }

      return vista(d, pedido);
    }), "dueno");

  r.borrar("/pedidos/:id", ({ params, usuario }) =>
    a.escribir((d) => {
      const indice = d.pedidos.findIndex((p) => p.id === params.id);
      if (indice < 0) throw new Regla("Ese pedido no existe.");
      const pedido = d.pedidos[indice]!;

      exigirCajaEditable(d, pedido, "borrarla");

      if (pedido.estado !== "cancelado") {
        for (const [productoId, cantidad] of porProducto(pedido.items)) {
          if (d.productos.some((p) => p.id === productoId)) {
            ajustarStock(
              d,
              productoId,
              cantidad,
              `Pedido #${pedido.numero} eliminado`,
              "devolucion",
              usuario
            );
          }
        }
      }

      d.pedidos.splice(indice, 1);
      return { ok: true };
    }), "dueno");
}

// ──────────────────────────────  Ayudas  ──────────────────────────────

/**
 * Lo que salió de un turno ya cerrado no se toca: su arqueo se hizo con ese
 * importe y alguien lo dio por bueno.
 */
function exigirCajaEditable(d: BaseDatos, pedido: Pedido, accion: string): void {
  if (!pedido.cajaId) return;

  const caja = d.cajas.find((c) => c.id === pedido.cajaId);
  if (caja && caja.estado === "cerrada") {
    throw new Regla(
      `Esta venta se cobró en el turno ${caja.numero}, que ya se cerró. Registrá una devolución en vez de ${accion}.`
    );
  }
}

function porProducto(items: ItemPedido[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const item of items) {
    if (!item.productoId) continue;
    total.set(item.productoId, (total.get(item.productoId) ?? 0) + item.cantidad);
  }
  return total;
}

export function vista(d: BaseDatos, p: Pedido, verCostos = true) {
  const caja = p.cajaId ? d.cajas.find((c) => c.id === p.cajaId) : undefined;

  return {
    id: p.id,
    numero: p.numero,
    canal: p.canal,
    estado: p.estado,
    nombre: p.nombre,
    clienteId: p.clienteId,
    cliente: p.clienteId ? (d.clientes.find((c) => c.id === p.clienteId)?.nombre ?? null) : null,
    notas: p.notas,
    descuento: p.descuento,
    total: p.total,
    metodoPago: p.metodoPago,
    recibido: p.recibido,
    cajaId: p.cajaId,
    cajaNumero: caja?.numero ?? null,
    cajaAbierta: caja?.estado === "abierta",
    pagos: p.pagos,
    // Quién la hizo. No es dato reservado: en un mostrador donde se turnan
    // dos personas, es lo primero que se pregunta cuando algo no cierra.
    usuario: p.usuario,
    // Cada renglón guarda lo que costó la mercadería el día de la venta. Eso
    // es del negocio: sin este recorte, la pantalla de Ventas le contaba el
    // costo y el margen a cualquiera que abriera una venta.
    items: verCostos ? p.items : p.items.map(({ costo: _costo, ...resto }) => resto),
    // Separados: media venta de pan no son "500 unidades".
    unidades: contarRenglones(p.items).unidades,
    gramos: contarRenglones(p.items).gramos,
    creadoEn: p.creadoEn,
  };
}
