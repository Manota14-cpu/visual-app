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
  /** Se vende por peso: el precio es por kilo y el stock va en gramos. */
  porPeso: boolean;
  precioCosto: number | null;
  precioVenta: number;
  precioMayorista: number | null;
  cantidadMayoristaMin: number | null;
  stock: number;
  stockMinimo: number;
  activo: boolean;
  /** Sobre la venta: cuanto de cada peso que entra queda. */
  margen: number | null;
  /** Sobre el costo: cuanto se le suma a lo que se pago. */
  margenCosto: number | null;
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
  /** El de fábrica, si lo tiene. Es el que va en la etiqueta. */
  codigoBarras: string | null;
  /** Por kilo si el producto se vende por peso. */
  precio: number;
  /** En gramos si el producto se vende por peso. */
  stock: number;
  unidadMedida: string;
  porPeso: boolean;
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
  margenCostoNuevo: number | null;
}

export interface Movimiento {
  /** Quién lo hizo. Null en lo anterior a los usuarios. */
  usuario?: string | null;
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
  /** Por kilo si el renglón es por peso. */
  precio: number;
  porPeso: boolean;
  /** En gramos si el renglón es por peso. */
  cantidad: number;
}

export interface Pago {
  metodo: string;
  monto: number;
}

export interface Pedido {
  /** Quién hizo la venta. Null en lo anterior a los usuarios. */
  usuario?: string | null;
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
  /** Quién la cobró. Null en lo anterior a los usuarios. */
  usuario?: string | null;
  renglones: number;
  unidades: number;
  /** Gramos, si la venta tenía productos por peso. */
  gramos: number;
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
  /** Quién abrió el turno y quién lo cerró. Null antes de los usuarios. */
  abrio?: string | null;
  cerro?: string | null;
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
  /** Lo que quedó fiado en este turno: vendido y no cobrado. */
  fiadoDelTurno: number;
  /** Lo que entró por deudas viejas durante el turno. */
  cobradoDeFiado: number;
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
  /** Quién abrió y quién cerró. Null antes de los usuarios. */
  abrio?: string | null;
  cerro?: string | null;
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
  cobradoDeFiado: number;
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
  /** Por kilo si es por peso. */
  precio: number;
  porPeso: boolean;
  /** En gramos si es por peso. */
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
  /** Lo que debe hoy. Cero es que está al día. */
  debe: number;
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
    /** Gramos de los productos que se venden por peso. */
    gramos: number;
    /** Null para un empleado: lo que vale el depósito es cuenta del dueño. */
    valorCosto: number | null;
    valorVenta: number | null;
    bajo: number;
    sinStock: number;
    inactivos: number;
  };
  pendientes: {
    sinCosto: number;
    sinSku: number;
    costoDudoso: number;
    pedidos: number;
    /** Partidas vencidas y a punto de vencer. Las ve también un empleado. */
    vencidos: number;
    porVencer: number;
  };
  /** Plata del negocio que está en la calle: lo que deben los clientes. */
  /** Lo que le deben al negocio. Null para un empleado. */
  fiado: number | null;
  /** Lo que el negocio debe a proveedores. Null para un empleado. */
  aProveedores: number | null;
  hoyVentas: { cantidad: number; total: number; unidades: number; gramos: number };
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
    /** En gramos si es por peso: sin esto "quedan 1.450" no dice kilo y medio. */
    porPeso: boolean;
  }[];
  movimientos: {
    id: string;
    tipo: string;
    cantidad: number;
    stockResultante: number;
    motivo: string | null;
    creadoEn: Fecha;
    producto: string;
    porPeso: boolean;
  }[];
  ventasPorDia: { dia: string; total: number }[];
  /** Unidades y gramos por separado: sumarlos juntos no significa nada. */
  stockPorCategoria: {
    categoria: string;
    color: string | null;
    productos: number;
    unidades: number;
    gramos: number;
  }[];
}

// ────────────────────────────  Informes  ────────────────────────────

export interface Informe {
  dias: number;
  ventas: {
    pedidos: number;
    unidades: number;
    /** Lo que de verdad entró: a precio de lista menos descuentos. */
    ingreso: number;
    aPrecioDeLista: number;
    descuentos: number;
    costo: number;
    margen: number | null;
    margenCosto: number | null;
    gramos: number;
    ticketPromedio: number;
  };
  /** Lo que el informe no pudo medir: se vendió sin saber cuánto costaba. */
  sinCosto: { unidades: number; ingreso: number };
  /** Vendido no es cobrado: lo que salió fiado. */
  fiado: { enElPeriodo: number; total: number };
  porProducto: {
    productoId: string | null;
    nombre: string;
    /** En gramos si el producto es por peso. */
    unidades: number;
    porPeso: boolean;
    ingreso: number;
    costo: number;
    margen: number | null;
    margenCosto: number | null;
  }[];
  inmovilizado: {
    id: string;
    nombre: string;
    categoria: string | null;
    stock: number;
    unidadMedida: string;
    porPeso: boolean;
    capital: number;
    diasQuieto: number | null;
  }[];
  capitalQuieto: number;
  movimientos: { tipo: string; cantidad: number }[];
  porCanal: { canal: string; pedidos: number; ingreso: number }[];
  /** Quién vendió qué en el período. */
  porUsuario: {
    usuario: string;
    ventas: number;
    vendido: number;
    descuentos: number;
    devoluciones: number;
    devuelto: number;
  }[];
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

// ──────────────────────────────  Proveedores  ──────────────────────────────

export interface Proveedor {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  cuit: string | null;
  notas: string | null;
  activo: boolean;
  /** Lo que el negocio le debe hoy. Se deduce, no se guarda. */
  deuda: number;
  compras: number;
  ultimaCompra: string | null;
  creadoEn: Fecha;
}

/** Un renglón de la cuenta corriente: sube si es compra, baja si es pago. */
export interface MovimientoProveedor {
  tipo: "compra" | "pago";
  id: string;
  fecha: string;
  detalle: string;
  comprobante: string | null;
  monto: number;
  usuario: string | null;
}

export interface CuentaProveedor {
  proveedor: Proveedor;
  movimientos: MovimientoProveedor[];
  comprado: number;
  pagado: number;
  deuda: number;
}

// ───────────────────────────────  Recuento  ───────────────────────────────

export interface PlanillaRecuento {
  categoria: string | null;
  productos: {
    id: string;
    nombre: string;
    sku: string | null;
    codigoBarras: string | null;
    precio: number;
    categoria: string | null;
    unidadMedida: string;
    porPeso: boolean;
    /** Lo que dice el sistema ahora mismo. */
    esperado: number;
  }[];
}

export interface ResumenRecuento {
  id: string;
  fecha: string;
  categoria: string | null;
  usuario: string | null;
  contados: number;
  coinciden: number;
  faltantes: number;
  sobrantes: number;
  /** Cuánta plata falta, no solo cuántas unidades. */
  valorFaltante: number;
  valorSobrante: number;
  creadoEn: Fecha;
}

/** Los dos roles. Ver `servidor/tipos.ts` para qué puede cada uno. */
export type Rol = "dueno" | "empleado";

export interface UsuarioSesion {
  id: string;
  nombre: string;
  usuario: string;
  rol: Rol;
  activo: boolean;
  creadoEn: Fecha;
  ultimoIngreso: Fecha | null;
}

/**
 * Lo que devuelve `/sistema`.
 *
 * Casi todo es opcional porque a un empleado le llega solo el nombre del
 * negocio: dónde vive el archivo, cuánto hay cargado y cómo viene la copia de
 * seguridad son cuentas del dueño. El tipo lo dice para que la pantalla tenga
 * que contemplarlo en vez de romperse.
 */
export interface Sistema {
  programa: string;
  archivo?: string;
  carpeta?: string;
  carpetaCopias?: string;
  tamano?: number;
  version?: number;
  config: {
    negocio: string;
    detalle: string | null;
    /** Carpeta de afuera donde se deja la copia de cada día. Solo al dueño. */
    resguardo?: string | null;
    creadaEn?: Fecha;
  };
  conteos?: {
    categorias: number;
    productos: number;
    movimientos: number;
    pedidos: number;
    clientes: number;
    gastos: number;
    cajas: number;
    cambiosPrecio: number;
  };
  copias?: { nombre: string; tamano: number; fecha: Fecha }[];
  /**
   * Cómo viene la copia fuera de la computadora.
   *
   * `dias` cuenta desde la última: es con lo que el Panel decide si avisar.
   * `error` tiene texto solo si el destino no responde ahora mismo —el
   * pendrive desenchufado, la carpeta de red caída—, que es distinto de que
   * nunca se haya configurado.
   */
  resguardo?: {
    carpeta: string | null;
    ultima: string | null;
    dias: number | null;
    copias: number;
    error: string | null;
    /** Las copias que hay en esa carpeta, para poder volver a una. */
    archivos: { nombre: string; fecha: Fecha | null }[];
  };
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

/** La cuenta de un cliente: de dónde sale lo que debe, renglón por renglón. */
export interface CuentaCliente {
  cliente: { id: string; nombre: string; telefono: string | null };
  debe: number;
  renglones: {
    tipo: "venta" | "pago";
    id: string;
    detalle: string;
    /** Positivo suma deuda, negativo la baja. */
    monto: number;
    creadoEn: Fecha;
  }[];
}
