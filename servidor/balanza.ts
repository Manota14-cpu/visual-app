import { Regla } from "./almacen.ts";
import type { BaseDatos, ConfigBalanza, Producto } from "./tipos.ts";

/**
 * Las etiquetas que imprime la balanza del mostrador.
 *
 * El fiambre, el queso, la verdura: se pesa, la balanza imprime una etiqueta
 * con un código de barras que empieza con 2 y en la caja se escanea como
 * cualquier otro producto. Adentro del código viaja el número del producto en
 * la balanza (el PLU) y el importe o el peso del paquete. Ver `ConfigBalanza`.
 */

export interface Etiqueta {
  plu: number;
  /** El importe en pesos o el peso en gramos, según la configuración. */
  valor: number;
}

/** Lee una etiqueta de balanza, o null si el código no es una. */
export function leerEtiqueta(codigo: string, config: ConfigBalanza): Etiqueta | null {
  if (!config.activa) return null;
  if (!/^\d{13}$/.test(codigo) || !codigo.startsWith(config.prefijo)) return null;
  // Un dígito mal leído daría otro PLU o, peor, otro importe. El verificador
  // lo detecta: es lo mismo que hace cualquier lector con un EAN común.
  if (!verificadorValido(codigo)) return null;

  const desde = config.prefijo.length;
  const hasta = desde + config.digitosPlu;
  if (hasta >= 12) return null;

  return {
    plu: Number(codigo.slice(desde, hasta)),
    valor: Number(codigo.slice(hasta, 12)),
  };
}

/** El dígito 13 de un EAN-13, calculado con los otros doce. */
export function verificadorValido(codigo: string): boolean {
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(codigo[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10 === Number(codigo[12]);
}

/**
 * El producto que en la balanza tiene ese PLU.
 *
 * Se busca por el código interno (SKU): en cada producto de la balanza se
 * carga como código interno el mismo número que tiene en la balanza. Se
 * comparan como números, así "0123", "123" y el 00123 de la etiqueta son el
 * mismo.
 */
export function productoDelPlu(d: BaseDatos, plu: number): Producto | undefined {
  return d.productos.find((p) => p.activo && p.sku !== null && /^\d+$/.test(p.sku) && Number(p.sku) === plu);
}

export interface Lectura {
  /** En gramos: los productos de balanza se venden por peso. */
  cantidad: number;
  /** Lo que dice la etiqueta, si trae importe. */
  importeEtiqueta: number | null;
}

/**
 * Cuánto del producto trae el paquete.
 *
 * Si la etiqueta trae el peso, es ese. Si trae el importe, el peso se saca
 * dividiendo por el precio del kilo: con el mismo precio en la balanza y en el
 * programa, da exactamente los gramos que se pesaron.
 *
 * Con el importe se cobra siempre lo que dice la etiqueta, que es lo que el
 * cliente ve en el paquete. Si la balanza tiene otro precio que el programa,
 * lo que queda corrido es el stock, no el cobro: por eso conviene que los dos
 * precios sean los mismos, o que la balanza imprima el peso.
 */
export function cantidadDeEtiqueta(producto: Producto, etiqueta: Etiqueta, config: ConfigBalanza): Lectura {
  if (!producto.porPeso) {
    throw new Regla(
      `${producto.nombre} no está marcado como "se vende por peso". Cambialo en Productos para poder leer su etiqueta de balanza.`
    );
  }
  if (etiqueta.valor <= 0) throw new Regla("La etiqueta no trae peso ni importe.");

  if (config.contenido === "peso") {
    return { cantidad: etiqueta.valor, importeEtiqueta: null };
  }

  if (producto.precioVenta <= 0) {
    throw new Regla(`${producto.nombre} no tiene precio: no se puede saber cuánto pesa el paquete.`);
  }

  const cantidad = Math.max(Math.round((etiqueta.valor * 1000) / producto.precioVenta), 1);
  return { cantidad, importeEtiqueta: etiqueta.valor };
}
