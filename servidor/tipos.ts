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
   * Quiénes usan el programa. Vacío es "todavía nadie": la app funciona sin
   * pedir contraseña, igual que antes de que esto existiera.
   */
  /**
   * A quiénes le compra el negocio, y lo que les debe.
   *
   * Es el espejo de los clientes y el fiado: la app sabía muy bien lo que le
   * deben al negocio y nada de lo que el negocio debe.
   */
  proveedores: Proveedor[];
  compras: Compra[];
  /** Las partidas con fecha de vencimiento que hay en el depósito. */
  vencimientos: Vencimiento[];
  /** Los recuentos de stock hechos, para poder mirar atrás. */
  recuentos: Recuento[];
  usuarios: Usuario[];
  /** Las sesiones abiertas. Se limpian solas al vencer. */
  sesiones: Sesion[];
  /**
   * Los correlativos visibles: número de venta y número de turno. Se guardan en
   * vez de calcularse con un máximo, porque borrar el último pedido no tiene
   * que hacer que el siguiente repita un número ya impreso.
   */
  contadores: { pedido: number; caja: number };
}

/**
 * Qué puede hacer cada uno.
 *
 * Dos roles y no una lista de permisos: un negocio chico tiene al dueño y a
 * quien atiende, y un tablero de casillas para tildar no lo va a usar nadie.
 *
 * - `dueno`    ve y toca todo, incluidos costos, márgenes, gastos, informes,
 *              la configuración y los usuarios.
 * - `empleado` cobra, hace devoluciones, carga stock, ve el catálogo y los
 *              clientes. No ve lo que costó la mercadería ni cuánto se gana,
 *              ni los informes, ni los gastos del negocio.
 */
export type Rol = "dueno" | "empleado";

export interface Usuario {
  id: string;
  /** Cómo se llama, para mostrarlo. */
  nombre: string;
  /** Con qué entra. Único, sin mayúsculas ni acentos. */
  usuario: string;
  /**
   * La contraseña, derivada con scrypt. Nunca el texto.
   *
   * Guardada como `scrypt$<sal en hex>$<clave en hex>`. Va el algoritmo
   * adelante para poder cambiarlo algún día sin que las contraseñas viejas
   * dejen de andar.
   */
  clave: string;
  rol: Rol;
  activo: boolean;
  creadoEn: Fecha;
  ultimoIngreso: Fecha | null;
}

/**
 * Una sesión abierta.
 *
 * Del token se guarda el HASH, no el token. El archivo de datos es texto
 * común y encima se copia a un pendrive: con los tokens en claro, cualquiera
 * que agarre una copia podría entrar como el dueño sin saber la contraseña.
 */
export interface Sesion {
  /** SHA-256 del token que tiene el navegador. */
  hash: string;
  usuarioId: string;
  creadaEn: Fecha;
  expiraEn: Fecha;
}

// ──────────────────────────────  Proveedores  ──────────────────────────────

export interface Proveedor {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  cuit: string | null;
  notas: string | null;
  /** Eliminar es reversible: se apaga esto y vuelve. */
  activo: boolean;
  creadoEn: Fecha;
}

/**
 * Una compra a un proveedor: mercadería que entró y todavía hay que pagar.
 *
 * El pago NO vive acá. Pagarle a un proveedor es un gasto —plata que sale— y
 * se anota como gasto, apuntando al proveedor. Así la deuda sale de restar dos
 * cosas que de verdad pasaron, y no hay un saldo guardado que pueda quedar
 * desincronizado; es la misma decisión que se tomó con el fiado de clientes.
 *
 * Y evita contar dos veces: si la compra fuera un gasto y el pago otro, el
 * informe sumaría la harina dos veces.
 */
export interface Compra {
  id: string;
  proveedorId: string;
  /** aaaa-mm-dd. Un día del calendario, igual que el de un gasto. */
  fecha: string;
  /** El número de remito o factura, para poder buscarla después. */
  comprobante: string | null;
  detalle: string;
  total: number;
  notas: string | null;
  /** Quién la cargó. Null en lo anterior a los usuarios. */
  usuarioId: string | null;
  usuario: string | null;
  creadoEn: Fecha;
}

// ─────────────────────────────  Vencimientos  ─────────────────────────────

/**
 * Una partida con fecha: tantas unidades de esto se vencen tal día.
 *
 * Va aparte del producto y no como un campo suyo, porque en la estantería
 * conviven partidas distintas: la leche que vence el martes y la que vence en
 * tres semanas son el mismo producto. Un solo campo "vence el" obligaría a
 * elegir cuál de las dos fechas mentir.
 *
 * No toca el stock por su cuenta. Que algo se venza no lo saca del depósito —
 * lo saca alguien, cuando lo tira—, y ese momento deja su movimiento de salida
 * como cualquier otro.
 */
export interface Vencimiento {
  id: string;
  productoId: string;
  /** Copiado, como en un renglón de venta: el historial no se reescribe. */
  nombre: string;
  /** aaaa-mm-dd. Un día del calendario. */
  fecha: string;
  cantidad: number;
  porPeso: boolean;
  notas: string | null;
  usuarioId: string | null;
  usuario: string | null;
  creadoEn: Fecha;
}

// ───────────────────────────────  Recuento  ───────────────────────────────

/**
 * Un recuento de stock: lo que decía el sistema contra lo que había.
 *
 * Todo negocio cuenta la góndola cada tanto, y hasta ahora la única forma de
 * conciliar era ir producto por producto ajustando a mano y escribiendo un
 * motivo en cada uno. Con veinte diferencias eso no lo hace nadie, y el stock
 * se va quedando cada vez más lejos de la realidad.
 *
 * Se guarda el recuento entero, incluidos los renglones que coincidieron: el
 * valor está en poder decir "el 21 se contó todo y sobró esto", y sin los que
 * dieron bien no se sabe si se contó todo o solo lo que fallaba.
 */
export interface Recuento {
  id: string;
  /** aaaa-mm-dd, el día en que se contó. */
  fecha: string;
  /** Null si se contó el depósito entero. */
  categoriaId: string | null;
  categoria: string | null;
  lineas: LineaRecuento[];
  notas: string | null;
  usuarioId: string | null;
  usuario: string | null;
  creadoEn: Fecha;
}

export interface LineaRecuento {
  productoId: string;
  /** Copiado, como en un renglón de venta: el historial no se reescribe. */
  nombre: string;
  porPeso: boolean;
  /** Lo que decía el sistema en el momento de contar. */
  esperado: number;
  /** Lo que había de verdad. */
  contado: number;
  /**
   * Lo que costaba la unidad ese día, para poder valorizar el faltante.
   *
   * Sin esto, "faltaron 14 unidades" no dice si son catorce caramelos o
   * catorce tortas, que es la diferencia entre un error de conteo y un
   * problema que hay que mirar.
   */
  costo: number | null;
}

export interface Configuracion {
  negocio: string;
  /** Se imprime en el comprobante, debajo del nombre. */
  detalle: string | null;
  /**
   * Carpeta fuera de esta computadora donde dejar una copia cada día.
   *
   * Un pendrive que queda enchufado, la carpeta de OneDrive o Drive que el
   * negocio ya usa, una carpeta de la red. Null mientras nadie eligió ninguna.
   *
   * Es lo único que protege del disco que no arranca: las copias de adentro
   * viven en el mismo disco y se van con él.
   */
  resguardo: string | null;
  /**
   * Atender también a los celulares y tablets del local.
   *
   * Apagado, el programa escucha solo en 127.0.0.1 y nadie de afuera llega.
   * Prendido, escucha en la red y acepta pedidos que vengan de una dirección
   * privada — la del wifi del local, nunca de internet.
   *
   * Solo tiene sentido con usuarios creados: sin contraseña, abrirlo al wifi
   * deja entrar a cualquiera que esté conectado, incluido un cliente. El
   * servidor lo exige y no se puede prender sin eso.
   */
  enRed: boolean;
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
   * Se vende por peso: el precio es por kilo y el stock va en gramos.
   *
   * Es del producto y no del renglón porque es una decisión del catálogo: el
   * pan se vende por peso siempre, no a veces.
   */
  porPeso: boolean;
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
  /**
   * Quién lo hizo. Null en lo cargado antes de que existieran los usuarios, y
   * en un negocio que todavía no creó ninguno.
   *
   * Va el id Y el nombre, copiado. El id sirve para agrupar; el nombre está
   * copiado por la misma razón que el de un producto en un renglón de venta:
   * si a esa persona la dan de baja o le cambian el nombre, el historial tiene
   * que seguir diciendo quién lo hizo el día que pasó.
   */
  usuarioId: string | null;
  usuario: string | null;
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
  /** Quién lo cambió. Null en lo anterior a los usuarios. */
  usuarioId: string | null;
  usuario: string | null;
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
  /**
   * Copiado del producto, igual que el nombre y el costo.
   *
   * Sin esto, pasar un producto de "por unidad" a "por peso" reescribiría el
   * importe de todas sus ventas pasadas: lo cobrado hace tres meses pasaría a
   * valer mil veces menos.
   */
  porPeso: boolean;
  /** En gramos si el renglón es por peso. Negativa en una devolución. */
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
  /**
   * Lo que se descontó de esta venta, en pesos.
   *
   * Se guarda aparte y no bajando el precio de los renglones. Bajando el
   * precio la venta cierra igual, pero se pierde para siempre el dato de que
   * hubo descuento: el informe no puede decir cuánta plata se regaló, ni el
   * dueño enterarse de que alguien hace 20% todos los días.
   *
   * `total` ya lo tiene restado: es lo que de verdad entró.
   */
  descuento: number;
  total: number;
  /** La etiqueta: un medio, o "mixto" si se pagó con varios. */
  metodoPago: string | null;
  /** Lo que entregó el cliente en efectivo, para reimprimir el vuelto. */
  recibido: number | null;
  cajaId: string | null;
  pagos: PagoPedido[];
  items: ItemPedido[];
  /**
   * Quién lo hizo. Null en lo cargado antes de que existieran los usuarios.
   *
   * Van el id Y el nombre copiado, igual que el nombre de un producto en un
   * renglón: si a esa persona la dan de baja o le cambian el nombre, el
   * historial tiene que seguir diciendo quién fue el día que pasó.
   */
  usuarioId: string | null;
  usuario: string | null;
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
  /**
   * El nombre escrito a mano. Es lo que había antes de que existieran los
   * proveedores como entidad, y se conserva: las bases viejas lo tienen
   * cargado y perderlo sería perder información.
   */
  proveedor: string | null;
  /**
   * El proveedor de verdad, cuando el gasto es un pago a su cuenta.
   *
   * Es lo que baja la deuda: la deuda es la suma de sus compras menos la suma
   * de los gastos que apuntan acá.
   */
  proveedorId: string | null;
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
  /** Quién abrió el turno y quién lo cerró. Null antes de los usuarios. */
  abrioId: string | null;
  abrio: string | null;
  cerroId: string | null;
  cerro: string | null;
  abiertaEn: Fecha;
  cerradaEn: Fecha | null;
  movimientos: MovimientoCaja[];
}
