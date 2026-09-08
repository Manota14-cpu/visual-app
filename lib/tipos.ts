/**
 * Lo que devuelve el backend.
 *
 * Es la contracara de los modelos de C#: el serializador escribe las
 * propiedades en minúscula inicial, así que los nombres coinciden campo a
 * campo. Cuando algo cambia allá, tiene que cambiar acá.
 */

export type Fecha = string;

export interface Categoria {
  id: string;
  nombre: string;
  color: string | null;
  productos: number;
}

export interface Producto {
  id: string;
  categoriaId: string | null;
  categoria: string | null;
  categoriaColor: string | null;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  codigoBarras: string | null;
  unidadMedida: string;
  precioCosto: number | null;
  precioVenta: number;
  precioMayorista: number | null;
  cantidadMayoristaMin: number | null;
  stock: number;
  stockMinimo: number;
  activo: boolean;
  margen: number | null;
  creadoEn: Fecha;
  actualizadoEn: Fecha;
}

export interface Pagina<T> {
  items: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export type PaginaProductos = Pagina<Producto>;

export interface ProductoBuscado {
  id: string;
  nombre: string;
  sku: string | null;
  precio: number;
  stock: number;
  unidadMedida: string;
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

export interface FilaPrecio {
  id: string;
  nombre: string;
  precioActual: number;
  precioNuevo: number;
  costoActual: number | null;
  costoNuevo: number | null;
  margenNuevo: number | null;
}

export interface Movimiento {
  id: string;
  productoId: string;
  producto: string;
  sku: string | null;
  tipo: string;
  cantidad: number;
  stockResultante: number;
  motivo: string | null;
  creadoEn: Fecha;
}

export interface PaginaMovimientos extends Pagina<Movimiento> {
  tipos: string[];
}

// ─────────────────────────────  Ventas  ─────────────────────────────

export type EstadoPedido = "pendiente" | "preparando" | "entregado" | "cancelado";

export interface ItemPedido {
  id: string;
  productoId: string | null;
  nombre: string;
  unidadMedida: string;
  precio: number;
  cantidad: number;
}

export interface Pago {
  metodo: string;
  monto: number;
}

export interface Pedido {
  id: string;
  numero: number;
  canal: string;
  estado: EstadoPedido;
  nombre: string;
  clienteId: string | null;
  cliente: string | null;
  notas: string | null;
  total: number;
  metodoPago: string | null;
  recibido: number | null;
  cajaId: string | null;
  cajaNumero: number | null;
  cajaAbierta: boolean;
  pagos: Pago[];
  items: ItemPedido[];
  unidades: number;
  creadoEn: Fecha;
}

export interface PaginaPedidos extends Pagina<Pedido> {
  conteos: Record<string, number>;
}

// ──────────────────────────────  Caja  ──────────────────────────────

export const MEDIOS_PAGO = ["efectivo", "transferencia", "tarjeta", "otro"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export const ETIQUETA_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
  mixto: "Mixto",
};

export interface VentaCaja {
  id: string;
  numero: number;
  nombre: string;
  total: number;
  canal: string;
  metodoPago: string;
  notas: string | null;
  creadoEn: Fecha;
  renglones: number;
  unidades: number;
}

export interface MovimientoCaja {
  id: string;
  tipo: string;
  monto: number;
  motivo: string;
  creadoEn: Fecha;
}

export interface Caja {
  id: string;
  numero: number;
  estado: string;
  fondo: number;
  contado: number | null;
  nota: string | null;
  abiertaEn: Fecha;
  cerradaEn: Fecha | null;
  ventas: VentaCaja[];
  totales: {
    efectivo: number;
    transferencia: number;
    tarjeta: number;
    otro: number;
    total: number;
    cantidad: number;
  };
  movimientos: MovimientoCaja[];
  retirado: number;
  ingresado: number;
  esperado: number;
}

export interface CajaResumen {
  id: string;
  numero: number;
  estado: string;
  fondo: number;
  contado: number | null;
  abiertaEn: Fecha;
  cerradaEn: Fecha | null;
  ventas: number;
  total: number;
  efectivo: number;
  esperado: number;
  diferencia: number | null;
}

export interface Arqueo {
  fondo: number;
  efectivo: number;
  total: number;
  retiros: number;
  ingresos: number;
  esperado: number;
  contado: number;
  diferencia: number;
}

/** Un renglón del cobro, antes de confirmarlo. */
export interface ItemCobro {
  productoId: string | null;
  nombre: string;
  unidadMedida: string;
  precio: number;
  cantidad: number;
  /** Lo que hay en góndola, para no cobrar más de lo que se puede entregar. */
  stock: number;
}

// ────────────────────────────  Clientes  ────────────────────────────

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
  compras: number;
  gastado: number;
  ultimaCompra: Fecha | null;
}

export interface CompraCliente {
  id: string;
  numero: number;
  canal: string;
  estado: string;
  total: number;
  creadoEn: Fecha;
  renglones: number;
}

// ─────────────────────────────  Gastos  ─────────────────────────────

export interface Gasto {
  id: string;
  fecha: string;
  categoria: string;
  etiqueta: string;
  concepto: string;
  monto: number;
  metodoPago: string;
  proveedor: string | null;
  comprobante: string | null;
  notas: string | null;
  cajaId: string | null;
  cajaNumero: number | null;
  cajaAbierta: boolean;
  enResultado: boolean;
  creadoEn: Fecha;
}

export interface RespuestaGastos {
  items: Gasto[];
  resumen: {
    total: number;
    operativos: number;
    mercaderia: number;
    cantidad: number;
    porCategoria: { categoria: string; total: number; cantidad: number }[];
  };
  categorias: { valor: string; etiqueta: string; enResultado: boolean }[];
  cajaAbierta: { id: string; numero: number } | null;
}

// ─────────────────────────────  Panel  ─────────────────────────────

export interface Panel {
  stock: {
    productos: number;
    unidades: number;
    valorCosto: number;
    valorVenta: number;
    bajo: number;
    sinStock: number;
    inactivos: number;
  };
  pendientes: {
    sinCosto: number;
    sinSku: number;
    costoDudoso: number;
    pedidos: number;
  };
  hoyVentas: { cantidad: number; total: number; unidades: number };
  caja: {
    id: string;
    numero: number;
    fondo: number;
    abiertaEn: Fecha;
    ventas: number;
    esperado: number;
  } | null;
  criticos: {
    id: string;
    nombre: string;
    stock: number;
    stockMinimo: number;
    unidadMedida: string;
  }[];
  movimientos: {
    id: string;
    tipo: string;
    cantidad: number;
    stockResultante: number;
    motivo: string | null;
    creadoEn: Fecha;
    producto: string;
  }[];
  ventasPorDia: { dia: string; total: number }[];
  stockPorCategoria: { categoria: string; color: string | null; unidades: number }[];
}

// ────────────────────────────  Informes  ────────────────────────────

export interface Informe {
  dias: number;
  ventas: {
    pedidos: number;
    unidades: number;
    ingreso: number;
    costo: number;
    margen: number | null;
    ticketPromedio: number;
  };
  porProducto: {
    productoId: string | null;
    nombre: string;
    unidades: number;
    ingreso: number;
    costo: number;
    margen: number | null;
  }[];
  inmovilizado: {
    id: string;
    nombre: string;
    categoria: string | null;
    stock: number;
    unidadMedida: string;
    capital: number;
    diasQuieto: number | null;
  }[];
  capitalQuieto: number;
  movimientos: { tipo: string; cantidad: number }[];
  porCanal: { canal: string; pedidos: number; ingreso: number }[];
  ventasConCostoDudoso: number;
  gastos: {
    total: number;
    operativos: number;
    mercaderia: number;
    cantidad: number;
    porCategoria: { categoria: string; etiqueta: string; total: number; cantidad: number }[];
  };
  resultado: number | null;
}

// ────────────────────────────  Sistema  ────────────────────────────

export interface Sistema {
  archivo: string;
  carpeta: string;
  carpetaCopias: string;
  tamano: number;
  version: number;
  programa: string;
  config: { negocio: string; detalle: string | null; creadaEn: Fecha };
  conteos: {
    categorias: number;
    productos: number;
    movimientos: number;
    pedidos: number;
    clientes: number;
    gastos: number;
    cajas: number;
    cambiosPrecio: number;
  };
  copias: { nombre: string; tamano: number; fecha: Fecha }[];
}

// ─────────────────────────  Exportar e importar  ─────────────────────────

export interface Exportacion {
  nombre: string;
  contenido: string;
  productos: number;
}

/** Qué va a pasar con una fila del archivo, antes de que pase. */
export interface FilaImportada {
  linea: number;
  accion: "nuevo" | "actualiza" | "igual" | "error";
  detalle: string;
  sku: string | null;
  nombre: string;
  stockActual: number | null;
  stockNuevo: number | null;
  precioActual: number | null;
  precio: number | null;
}

export interface PlanImportacion {
  /** Los campos que se reconocieron en el encabezado. */
  columnas: string[];
  /** Los encabezados que no se entendieron, tal como venían escritos. */
  ignoradas: string[];
  /** Si el archivo trae una columna de stock. Sin ella el stock no se toca. */
  traeStock: boolean;
  filas: FilaImportada[];
  categoriasNuevas: string[];
  resumen: {
    total: number;
    nuevos: number;
    actualiza: number;
    iguales: number;
    errores: number;
  };
}

export interface ResultadoImportacion {
  creados: number;
  actualizados: number;
  movidos: number;
  categorias: number;
  omitidos: number;
}

// ───────────────────────────  Actualizaciones  ───────────────────────────

export interface Actualizacion {
  /** Falso mientras no se haya publicado un lugar de dónde bajar versiones. */
  configurado: boolean;
  instalada: string;
  revisadoEn: Fecha | null;
  buscando: boolean;
  hay: boolean;
  ultima: {
    version: string;
    notas: string | null;
    fecha: string | null;
    tamano: number | null;
  } | null;
  error: string | null;
}
