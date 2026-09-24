import { nuevoId, Regla } from "./almacen.ts";
import type { BaseDatos, Caja, Pedido, Producto, TipoMovimiento } from "./tipos.ts";

/**
 * Las reglas que no pueden discutirse desde ninguna pantalla.
 *
 * Son el único camino por el que el stock cambia y por el que un precio se
 * modifica, así que ninguna pantalla puede "olvidarse" de dejar el movimiento.
 */

// ─────────────────────────────────  Stock  ─────────────────────────────────

/**
 * Suma o resta stock y deja el movimiento, en una sola operación.
 *
 * El stock del producto nunca se escribe fuera de acá. Si el resultado diera
 * negativo, lanza y nada cambia — y el mensaje nombra el producto, que es lo
 * único útil en un pedido de ocho renglones con el cliente esperando enfrente.
 */
export function ajustarStock(
  d: BaseDatos,
  productoId: string,
  cantidad: number,
  motivo: string,
  tipo: TipoMovimiento = "ajuste",
  // Quién lo hizo. Va al final y con valor por omisión para no tener que tocar
  // las decenas de llamadas que no tienen a nadie identificado detrás —los
  // datos de ejemplo, una importación—, y porque null es la respuesta honesta
  // en un negocio que todavía no creó usuarios.
  quien: { id: string; nombre: string } | null = null
): number {
  const producto = d.productos.find((p) => p.id === productoId);
  if (!producto) throw new Regla("Ese producto ya no existe.");

  const resultante = producto.stock + cantidad;
  if (resultante < 0) {
    throw new Regla(
      `Stock insuficiente de "${producto.nombre}": hay ${producto.stock} y se intentan sacar ${Math.abs(cantidad)}.`
    );
  }

  producto.stock = resultante;
  producto.actualizadoEn = new Date().toISOString();

  d.movimientos.push({
    id: nuevoId(),
    productoId: producto.id,
    tipo,
    cantidad: Math.abs(cantidad),
    stockResultante: resultante,
    motivo: recortar(motivo, 200),
    usuarioId: quien?.id ?? null,
    usuario: quien?.nombre ?? null,
    creadoEn: new Date().toISOString(),
  });

  return resultante;
}

// ─────────────────────────────────  Precios  ─────────────────────────────────

/**
 * Deja anotado un cambio de precio, si de verdad cambió algo.
 *
 * El stock no se mueve sin movimiento porque siempre pasa por `ajustarStock`.
 * Con el precio hace falta lo mismo: sin historial, "esto antes salía menos" no
 * se puede contestar.
 */
export function registrarPrecio(
  d: BaseDatos,
  producto: Producto,
  precioAnterior: number,
  costoAnterior: number | null,
  motivo: string | null,
  quien: { id: string; nombre: string } | null = null
): void {
  if (producto.precioVenta === precioAnterior && producto.precioCosto === costoAnterior) return;

  d.cambiosPrecio.push({
    id: nuevoId(),
    productoId: producto.id,
    precioAnterior,
    precioNuevo: producto.precioVenta,
    costoAnterior,
    costoNuevo: producto.precioCosto,
    motivo: recortar(motivo, 200),
    usuarioId: quien?.id ?? null,
    usuario: quien?.nombre ?? null,
    creadoEn: new Date().toISOString(),
  });
}

/**
 * Aplica un porcentaje y redondea al múltiplo pedido.
 *
 * Lo usan dos caminos que tienen que dar exactamente el mismo número: la
 * previsualización que se ve antes de confirmar y la escritura real.
 */
export function nuevoPrecio(actual: number, porcentaje: number, redondeo: number): number {
  const bruto = actual * (1 + porcentaje / 100);
  const paso = redondeo > 0 ? redondeo : 1;
  const redondeado = Math.round(bruto / paso) * paso;

  // Un precio nunca baja de cero, y si había precio no se vuelve gratis.
  if (actual > 0 && redondeado <= 0) return paso;
  return Math.max(0, redondeado);
}

/**
 * Las dos formas de mirar la misma diferencia entre costo y venta.
 *
 * No son dos opiniones: son dos números distintos de la misma operación, y
 * confundirlos es el error más caro que se puede cometer poniendo precios.
 *
 * Algo que cuesta $100 y se vende a $150 deja:
 *
 *   sobre costo  →  50%   «le pongo un cincuenta por ciento»
 *   sobre venta  →  33%   de cada peso que entra, treinta y tres centavos
 *
 * Quien atiende el mostrador piensa en el primero: es lo que le suma al costo.
 * El contador y los informes hablan del segundo, porque es el que se compara
 * con los gastos. Mostrar uno solo obliga a adivinar cuál es, y quien creía
 * estar ganando 50 se entera de que gana 33 cuando ya remarcó el catálogo.
 */

/** Sobre la venta: cuánto de cada peso que entra queda. El del contador. */
export function margenSobreVenta(
  precioVenta: number,
  precioCosto: number | null
): number | null {
  if (precioVenta <= 0 || !precioCosto || precioCosto <= 0) return null;
  return Math.round(((precioVenta - precioCosto) * 100) / precioVenta);
}

/** Sobre el costo: cuánto se le suma a lo que se pagó. El del mostrador. */
export function margenSobreCosto(
  precioVenta: number,
  precioCosto: number | null
): number | null {
  if (precioVenta <= 0 || !precioCosto || precioCosto <= 0) return null;
  return Math.round(((precioVenta - precioCosto) * 100) / precioCosto);
}

// ──────────────────────────────────  Caja  ──────────────────────────────────

/**
 * Los productos que se venden por peso.
 *
 * Una panadería no vende "un pan": vende medio kilo. Para esos productos el
 * precio es POR KILO y la cantidad va en GRAMOS — el stock, el mínimo y cada
 * renglón de una venta.
 *
 * Gramos y no kilos con coma, a propósito. Toda la aplicación trabaja con
 * enteros: la plata en pesos enteros, el stock en unidades enteras. Meter
 * decimales acá obligaría a arrastrar redondeos por el stock, los informes y el
 * arqueo, que es justo donde un centavo perdido se vuelve una diferencia de
 * caja que nadie puede explicar. Un gramo es una unidad chica y entera, y la
 * balanza del mostrador ya muestra gramos.
 */
export const GRAMOS_POR_KILO = 1000;

/**
 * Lo que sale un renglón.
 *
 * Es la única fórmula que convierte cantidad en plata, y la usan el cobro, la
 * edición de una venta, los informes y el comprobante. Escrita una sola vez: un
 * producto que se cobra bien en la caja y mal en el informe es peor que uno que
 * se cobra mal en las dos.
 */
export function importeRenglon(precio: number, cantidad: number, porPeso?: boolean): number {
  if (!porPeso) return precio * cantidad;

  // El redondeo va acá y no al final de la suma: lo que se cobra tiene que ser
  // la suma de lo que dice cada renglón. Redondeando el total, el comprobante
  // mostraría renglones que no suman lo que se pagó.
  return Math.round((precio * cantidad) / GRAMOS_POR_KILO);
}

/**
 * Cuántas unidades y cuántos gramos hay en un conjunto de renglones.
 *
 * Van separados y no sumados en un solo número. Media docena de facturas más
 * medio kilo de pan no son "506 unidades": mezclarlos daría un número que no
 * significa nada, y encima parecería un error de la aplicación.
 */
export function contarRenglones(
  renglones: { porPeso?: boolean; cantidad: number }[]
): { unidades: number; gramos: number } {
  let unidades = 0;
  let gramos = 0;

  for (const r of renglones) {
    if (r.porPeso) gramos += r.cantidad;
    else unidades += r.cantidad;
  }

  return { unidades, gramos };
}

export function cajaAbierta(d: BaseDatos): Caja | undefined {
  return d.cajas.find((c) => c.estado === "abierta");
}

export function exigirCajaAbierta(d: BaseDatos, cajaId: string): Caja {
  const caja = d.cajas.find((c) => c.id === cajaId);
  if (!caja) throw new Regla("Esa caja no existe.");
  if (caja.estado !== "abierta") throw new Regla("La caja no está abierta.");
  return caja;
}

/** Las ventas del turno, sin las canceladas. */
export function ventasDe(d: BaseDatos, cajaId: string): Pedido[] {
  return d.pedidos
    .filter((p) => p.cajaId === cajaId && p.estado !== "cancelado")
    .sort((a, b) => b.numero - a.numero);
}

/**
 * Lo cobrado en efectivo en el turno.
 *
 * Sale de los pagos y no de la etiqueta del pedido: en una venta pagada mitad y
 * mitad la etiqueta dice "mixto", y el cajón recibió solo la parte en efectivo.
 * Las devoluciones traen importe negativo, así que restan solas.
 */
export function efectivoDe(d: BaseDatos, cajaId: string): number {
  return ventasDe(d, cajaId)
    .flatMap((p) => p.pagos)
    .filter((p) => p.metodo === "efectivo")
    .reduce((suma, p) => suma + p.monto, 0);
}

/**
 * Lo que entro al cajon por deudas viejas.
 *
 * Va aparte de `efectivoDe` y no sumado adentro: las dos cosas son plata en el
 * cajon, pero una es de lo que se vendio hoy y la otra de lo que se vendio
 * quien sabe cuando. Mezcladas en un solo numero, el desglose del cierre deja
 * de explicar de donde sale lo que deberia haber, que es justamente para lo
 * que alguien lo mira.
 */
export function efectivoDeFiadoDe(d: BaseDatos, cajaId: string): number {
  return cobrosFiadoDe(d, cajaId)
    .filter((c) => c.metodo === "efectivo")
    .reduce((suma, c) => suma + c.monto, 0);
}

/** Lo que debería haber en el cajón: fondo + efectivo + ingresos − retiros. */
export function esperadoEn(d: BaseDatos, caja: Caja): number {
  const ingresos = caja.movimientos
    .filter((m) => m.tipo === "ingreso")
    .reduce((s, m) => s + m.monto, 0);
  const retiros = caja.movimientos
    .filter((m) => m.tipo === "retiro")
    .reduce((s, m) => s + m.monto, 0);

  return (
    caja.fondo + efectivoDe(d, caja.id) + efectivoDeFiadoDe(d, caja.id) + ingresos - retiros
  );
}

// ─────────────────────────────────  Fiado  ─────────────────────────────────

/**
 * Lo que falta cobrar de una venta.
 *
 * Una venta fiada se guarda igual que cualquier otra —con su stock descontado y
 * su renglon en el informe— pero con los pagos que de verdad entraron, que
 * pueden ser ninguno. La diferencia contra el total es lo que el cliente debe.
 */
export function adeudadoDe(pedido: Pedido): number {
  if (pedido.estado === "cancelado") return 0;
  const pagado = pedido.pagos.reduce((s, p) => s + p.monto, 0);
  return Math.max(0, pedido.total - pagado);
}

/**
 * Lo que un cliente debe hoy: lo que quedo sin pagar de sus ventas, menos lo
 * que fue trayendo.
 *
 * No hay un saldo guardado. Un numero aparte es un numero mas que puede quedar
 * desincronizado de los hechos que lo explican, y con plata ajena eso no se
 * puede permitir: el saldo se vuelve a sumar cada vez, de las ventas y de los
 * cobros, que son lo unico que de verdad paso.
 */
export function deudaDe(d: BaseDatos, clienteId: string): number {
  const fiado = d.pedidos
    .filter((p) => p.clienteId === clienteId)
    .reduce((s, p) => s + adeudadoDe(p), 0);

  const cobrado = d.cobrosFiado
    .filter((c) => c.clienteId === clienteId)
    .reduce((s, c) => s + c.monto, 0);

  return fiado - cobrado;
}

/** Lo que debe todo el mundo. Es plata del negocio que esta en la calle. */
export function deudaTotal(d: BaseDatos): number {
  const fiado = d.pedidos.reduce((s, p) => s + (p.clienteId ? adeudadoDe(p) : 0), 0);
  const cobrado = d.cobrosFiado.reduce((s, c) => s + c.monto, 0);
  return fiado - cobrado;
}

/**
 * Los cobros de fiado que entraron durante un turno.
 *
 * Sin las devoluciones a cuenta: bajan la deuda igual que un pago, pero no es
 * plata que haya entrado, y el turno las mostraba como "cobrado de deudas".
 */
export function cobrosFiadoDe(d: BaseDatos, cajaId: string) {
  return d.cobrosFiado.filter((c) => c.cajaId === cajaId && c.metodo !== "devolucion");
}

// ─────────────────────────────────  Gastos  ─────────────────────────────────

/**
 * Las categorías de gasto y cuáles se restan del resultado.
 *
 * Comprar mercadería no es una pérdida: son pesos que se cambiaron por cajas
 * que están en la estantería. Se vuelven costo recién cuando esa mercadería se
 * vende, y para entonces el informe ya las contó como costo de lo vendido.
 * Restarlas también acá sería contar la misma plata dos veces y mostrar meses
 * en rojo que en realidad fueron buenos.
 */
export const CATEGORIAS_GASTO: { valor: string; etiqueta: string; enResultado: boolean }[] = [
  { valor: "mercaderia", etiqueta: "Mercadería y proveedores", enResultado: false },
  { valor: "envios", etiqueta: "Envíos y fletes", enResultado: true },
  { valor: "servicios", etiqueta: "Luz, agua, internet", enResultado: true },
  { valor: "alquiler", etiqueta: "Alquiler", enResultado: true },
  { valor: "sueldos", etiqueta: "Sueldos y cargas", enResultado: true },
  { valor: "impuestos", etiqueta: "Impuestos y tasas", enResultado: true },
  { valor: "transporte", etiqueta: "Combustible y vehículo", enResultado: true },
  { valor: "mantenimiento", etiqueta: "Mantenimiento y arreglos", enResultado: true },
  { valor: "insumos", etiqueta: "Insumos y limpieza", enResultado: true },
  { valor: "bancario", etiqueta: "Comisiones y bancos", enResultado: true },
  { valor: "otro", etiqueta: "Otro", enResultado: true },
];

export function categoriaGastoValida(valor: string): boolean {
  return CATEGORIAS_GASTO.some((c) => c.valor === valor);
}

export function etiquetaGasto(valor: string): string {
  return CATEGORIAS_GASTO.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

/** Si la categoría se resta del resultado. Lo desconocido cuenta como gasto. */
export function cuentaEnResultado(valor: string): boolean {
  return CATEGORIAS_GASTO.find((c) => c.valor === valor)?.enResultado ?? true;
}

// ─────────────────────────────────  Texto  ─────────────────────────────────

export function recortar(valor: string | null | undefined, largo: number): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  if (!limpio) return null;
  return limpio.length <= largo ? limpio : limpio.slice(0, largo);
}

export function recortarObligatorio(
  valor: string | null | undefined,
  largo: number,
  error: string
): string {
  const limpio = recortar(valor, largo);
  if (limpio === null) throw new Regla(error);
  return limpio;
}

/**
 * Quita acentos y deja letras y números, para armar códigos.
 *
 * El rango de las marcas de acento va escrito como `̀-ͯ` y no con
 * los caracteres puestos directamente. Son invisibles en el editor: si un
 * guardado con la codificación equivocada los rompe —ya pasó una vez en este
 * repositorio, con los acentos de `api/sistema.ts`—, el código sigue
 * compilando y el buscador deja de ignorar acentos sin que nadie se entere.
 * Escrito con el escape no hay nada que se pueda romper.
 */
export function soloAlfanumerico(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Un SKU legible que sirve de código interno y de etiqueta impresa: tres letras
 * de la categoría, tres del producto y un correlativo.
 */
export function sugerirSku(categoria: string, nombre: string, n: number): string {
  const cat = (soloAlfanumerico(categoria) + "GEN").slice(0, 3);
  const prod = (soloAlfanumerico(nombre) + "XXX").slice(0, 3);
  return `${cat}-${prod}-${String(n).padStart(3, "0")}`;
}

/**
 * Deja el teléfono en solo dígitos, para comparar.
 *
 * "3492 30-1333", "03492301333" y "+54 3492 301333" son la misma persona
 * anotada de tres formas. Sin normalizar, el aviso de duplicado no saltaría
 * nunca y la agenda se llenaría del mismo cliente repetido.
 */
export function soloDigitos(telefono: string | null | undefined): string {
  if (!telefono) return "";
  return telefono.replace(/\D/g, "").replace(/^54/, "").replace(/^0+/, "");
}

/** Comparación para buscadores: sin acentos, sin mayúsculas. */
export function normalizar(valor: string | null | undefined): string {
  if (!valor) return "";
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function contiene(campo: string | null | undefined, terminoNormalizado: string): boolean {
  return !!campo && normalizar(campo).includes(terminoNormalizado);
}

/** Una fecha aaaa-mm-dd que existe de verdad. */
export function exigirFecha(valor: string | null | undefined): string {
  const texto = (valor ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new Regla("La fecha tiene que ser un día del calendario.");
  }

  const [a, m, d] = texto.split("-").map(Number) as [number, number, number];
  const fecha = new Date(a, m - 1, d);

  // El Date de JS acomoda lo imposible en silencio: "2026-02-31" se convierte
  // en el 3 de marzo sin avisar. Por eso se compara contra lo que se escribió.
  if (fecha.getFullYear() !== a || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) {
    throw new Regla("Ese día no existe.");
  }

  // Un día de margen cubre la diferencia horaria. Más allá es un error de
  // tipeo: un año mal escrito ensucia los informes por meses.
  const limite = new Date();
  limite.setDate(limite.getDate() + 1);
  limite.setHours(23, 59, 59, 999);
  if (fecha > limite) throw new Regla("Esa fecha todavía no llegó.");

  return texto;
}

// ─────────────────────────────────  Números  ─────────────────────────────────

/**
 * Un número escrito por una persona o por una planilla.
 *
 * "12.500", "12500", "$ 12.500" y "12,5" son todos números válidos según quién
 * los haya tecleado y en qué programa. El último separador cuenta como decimal
 * solo si deja dos dígitos o menos detrás; si no, era el de los miles.
 *
 * Es el mismo criterio que usa `leerNumero` en la interfaz, escrito dos veces
 * porque el servidor no comparte código con las pantallas. Los dos están
 * cubiertos por sus pruebas.
 */
export function numeroDeTexto(texto: string): number | null {
  const limpio = texto.replace(/[^\d.,-]/g, "").trim();
  if (!limpio || limpio === "-") return null;

  const corte = Math.max(limpio.lastIndexOf("."), limpio.lastIndexOf(","));

  let normalizado: string;
  if (corte === -1) {
    normalizado = limpio;
  } else {
    const decimales = limpio.length - corte - 1;
    normalizado =
      decimales > 0 && decimales <= 2
        ? limpio.slice(0, corte).replace(/[.,]/g, "") + "." + limpio.slice(corte + 1)
        : limpio.replace(/[.,]/g, "");
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Un entero de un cuerpo JSON, con su valor por defecto. */
export function entero(valor: unknown, porDefecto = 0): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? Math.round(n) : porDefecto;
}

export function monto(valor: unknown, campo: string): number {
  const n = entero(valor, 0);
  if (n < 0) throw new Regla(`${campo} no puede ser negativo.`);
  if (n > 99_999_999) throw new Regla(`${campo} es demasiado grande.`);
  return n;
}

/** Cómo se escribe un importe dentro de un mensaje de error. */
export function comoPlata(valor: number): string {
  return valor.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

// ───────────────────────────────  Proveedores  ───────────────────────────────

/**
 * Lo que el negocio le debe a un proveedor.
 *
 * Misma decisión que con el fiado de clientes, y por la misma razón: no hay
 * saldo guardado. Se suma lo comprado y se le resta lo pagado, cada vez. Un
 * número aparte es un número más que puede quedar desincronizado de los hechos
 * que lo explican, y con plata ajena eso no se puede permitir.
 *
 * Lo pagado son los GASTOS que apuntan a ese proveedor. Pagarle es plata que
 * sale del negocio, así que ya es un gasto; anotarlo aparte lo contaría dos
 * veces en los informes.
 */
export function deudaProveedor(d: BaseDatos, proveedorId: string): number {
  const comprado = d.compras
    .filter((c) => c.proveedorId === proveedorId)
    .reduce((s, c) => s + c.total, 0);

  const pagado = d.gastos
    .filter((g) => g.proveedorId === proveedorId)
    .reduce((s, g) => s + g.monto, 0);

  return comprado - pagado;
}

/** Lo que el negocio le debe a todo el mundo. */
export function deudaProveedores(d: BaseDatos): number {
  const comprado = d.compras.reduce((s, c) => s + c.total, 0);
  const pagado = d.gastos.reduce((s, g) => s + (g.proveedorId ? g.monto : 0), 0);
  return comprado - pagado;
}
