/**
 * El modelo entero de la aplicación.
 *
 * No hay base de datos: todo esto se serializa a un único archivo JSON en la
 * computadora del cliente. Por eso las relaciones se guardan por id y no por
 * referencia, y las listas hijas que nunca se consultan solas —los renglones de
 * un pedido, los movimientos de un turno de caja— viven adentro de su padre:
 * es la única forma en que se leen.
 *
 * Los nombres son los mismos que usa la interfaz en `lib/tipos.ts`. Lo que se
 * guarda es lo que se envía: no hay capa de traducción en el medio.
 */

/** Un instante, en ISO 8601 con zona UTC. */
export type Fecha = string;

export interface BaseDatos {
  /** Versión del formato. Sube cuando el archivo necesite migrarse. */
  version: number;
  config: Configuracion;
  categorias: Categoria[];
  productos: Producto[];
  movimientos: Movimiento[];
  cambiosPrecio: CambioPrecio[];
  pedidos: Pedido[];
  clientes: Cliente[];
  gastos: Gasto[];
  cajas: Caja[];
  /**
   * Los pagos que los clientes traen despues, contra lo que deben.
   *
   * La deuda en si no se guarda: se deduce de las ventas —lo que no se pago en
   * el momento— menos estos cobros. Un saldo guardado aparte es un numero mas
   * que puede quedar desincronizado de los hechos que lo explican, y con plata
   * ajena eso no se puede permitir.
   */
  cobrosFiado: CobroFiado[];
  /**
   * Los correlativos visibles: número de venta y número de turno. Se guardan en
   * vez de calcularse con un máximo, porque borrar el último pedido no tiene
   * que hacer que el siguiente repita un número ya impreso.
   */
  contadores: { pedido: number; caja: number };
}

export interface Configuracion {
  negocio: string;
  /** Se imprime en el comprobante, debajo del nombre. */
  detalle: string | null;
  creadaEn: Fecha;
}

// ───────────────────────────────  Catálogo  ───────────────────────────────

export interface Categoria {
  id: string;
  nombre: string;
  /** Color en #rrggbb, para distinguirla de un vistazo. Opcional. */
  color: string | null;
  creadaEn: Fecha;
}

export interface Producto {
  id: string;
  categoriaId: string | null;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  codigoBarras: string | null;
  /** Describe el envase: unidad, x50u, caja, kg. */
  unidadMedida: string;
  /**
   * Nulo significa "todavía no se sabe", no "vale cero". La diferencia importa:
   * con costo cero el margen daría 100% y el valor del inventario mentiría sin
   * que nada avise.
   */
  precioCosto: number | null;
  precioVenta: number;
  precioMayorista: number | null;
  cantidadMayoristaMin: number | null;
  /** Nunca se escribe directo: cambia solo por `ajustarStock`. */
  stock: number;
  stockMinimo: number;
  /** Eliminar es reversible: se apaga esto y el producto se recupera. */
  activo: boolean;
  creadoEn: Fecha;
  actualizadoEn: Fecha;
}

export const TIPOS_MOVIMIENTO = [
  "creacion",
  "entrada",
  "salida",
  "venta",
  "devolucion",
  "ajuste",
] as const;

export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export interface Movimiento {
  id: string;
  productoId: string;
  tipo: TipoMovimiento;
  /** Siempre positiva; el signo lo da el tipo. */
  cantidad: number;
  /** Con cuánto quedó el producto, para auditar sin recalcular. */
  stockResultante: number;
  motivo: string | null;
  creadoEn: Fecha;
}

export interface CambioPrecio {
  id: string;
  productoId: string;
  precioAnterior: number;
  precioNuevo: number;
  costoAnterior: number | null;
  costoNuevo: number | null;
  motivo: string | null;
  creadoEn: Fecha;
}

// ────────────────────────────────  Ventas  ────────────────────────────────

export const ESTADOS_PEDIDO = ["pendiente", "preparando", "entregado", "cancelado"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const MEDIOS_PAGO = ["efectivo", "transferencia", "tarjeta", "otro"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export interface ItemPedido {
  id: string;
  /** Nulo si el producto se eliminó del catálogo después de la venta. */
  productoId: string | null;
  /**
   * Copiado, no referenciado: renombrar un producto no debería reescribir un
   * comprobante que ya se imprimió.
   */
  nombre: string;
  unidadMedida: string;
  precio: number;
  /**
   * El costo unitario del día de la venta, copiado igual que el nombre.
   *
   * Sin esto, el informe reconstruía el costo con el precio de HOY: cada
   * actualización de costos movía el margen de todos los meses cerrados, y con
   * inflación eso pasa seguido. Un mes que cerró en 41% podía mostrar 25% al
   * mes siguiente sin que cambiara una sola venta.
   *
   * Nulo en los renglones anteriores a que esto existiera, y en los productos
   * que no tenían costo cargado: ahí el informe vuelve a estimar con el costo
   * actual, y lo dice.
   */
  costo: number | null;
  /** Negativa en una devolución. */
  cantidad: number;
}

/**
 * Un pago que un cliente trae contra lo que debe.
 *
 * Va atado al turno de caja si entro en efectivo, porque en ese caso la plata
 * esta fisicamente en el cajon y el arqueo tiene que contarla.
 */
export interface CobroFiado {
  id: string;
  clienteId: string;
  /** Como se llamaba el cliente ese dia. */
  nombre: string;
  monto: number;
  metodo: string;
  /** Nulo si se cobro sin un turno abierto. */
  cajaId: string | null;
  nota: string | null;
  creadoEn: Fecha;
}

/** Un tramo del cobro. Una venta puede pagarse con varios medios. */
export interface PagoPedido {
  metodo: string;
  monto: number;
}

export interface Pedido {
  id: string;
  numero: number;
  /** mostrador · devolucion · manual */
  canal: string;
  estado: EstadoPedido;
  nombre: string;
  clienteId: string | null;
  notas: string | null;
  total: number;
  /** La etiqueta: un medio, o "mixto" si se pagó con varios. */
  metodoPago: string | null;
  /** Lo que entregó el cliente en efectivo, para reimprimir el vuelto. */
  recibido: number | null;
  cajaId: string | null;
  pagos: PagoPedido[];
  items: ItemPedido[];
  creadoEn: Fecha;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  direccion: string | null;
  dniCuit: string | null;
  razonSocial: string | null;
  notas: string | null;
  activo: boolean;
  creadoEn: Fecha;
}

// ────────────────────────────────  Gastos  ────────────────────────────────

export interface Gasto {
  id: string;
  /**
   * aaaa-mm-dd como texto y no como fecha: es un día del calendario, y
   * convertirlo a instante lo corría un día para atrás en Argentina.
   */
  fecha: string;
  categoria: string;
  concepto: string;
  monto: number;
  metodoPago: string;
  proveedor: string | null;
  comprobante: string | null;
  notas: string | null;
  /** El turno del que salió la plata, si se pagó del cajón. */
  cajaId: string | null;
  /** El retiro que este gasto generó en esa caja. Se borra con él. */
  movimientoCajaId: string | null;
  creadoEn: Fecha;
}

// ─────────────────────────────────  Caja  ─────────────────────────────────

export interface MovimientoCaja {
  id: string;
  /** retiro · ingreso */
  tipo: "retiro" | "ingreso";
  /** Siempre positivo; el signo lo da el tipo. */
  monto: number;
  motivo: string;
  creadoEn: Fecha;
}

export interface Caja {
  id: string;
  numero: number;
  /** abierta · cerrada */
  estado: "abierta" | "cerrada";
  /** Con cuánto efectivo arrancó el turno. */
  fondo: number;
  /** Lo contado al cerrar. Nulo mientras siga abierta. */
  contado: number | null;
  nota: string | null;
  abiertaEn: Fecha;
  cerradaEn: Fecha | null;
  movimientos: MovimientoCaja[];
}
