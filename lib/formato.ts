/**
 * Cómo se escriben los números y las fechas en pantalla.
 *
 * Vive en un solo lugar porque el mismo importe aparece en la caja, en el
 * comprobante y en el informe, y verlo escrito de tres formas distintas hace
 * dudar de si son el mismo número.
 */

/** Un importe en pesos. El menos va antes del signo, como se lee. */
export function plata(valor: number | null | undefined): string {
  const n = Number(valor) || 0;
  const absoluto = Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  // Es el menos tipográfico (−), no el guion del teclado: queda alineado con
  // los dígitos y no se parte al final de una línea.
  return n < 0 ? `−$${absoluto}` : `$${absoluto}`;
}

/** Una cantidad, con separador de miles. */
export function numero(valor: number | null | undefined, decimales = 0): string {
  return (Number(valor) || 0).toLocaleString("es-AR", { maximumFractionDigits: decimales });
}

export function porcentaje(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? "—" : `${valor}%`;
}

const FECHA = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" });
const FECHA_LARGA = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" });
const HORA = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  return FECHA.format(new Date(valor));
}

export function fechaLarga(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  return FECHA_LARGA.format(new Date(valor));
}

export function hora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  return HORA.format(new Date(valor));
}

export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return `${FECHA.format(d)} · ${HORA.format(d)}`;
}

/**
 * "hace 3 días". Para el historial: la fecha exacta importa menos que saber
 * si fue recién o hace un mes.
 */
export function hace(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const minutos = Math.round((Date.now() - new Date(valor).getTime()) / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 31) return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
  const meses = Math.round(dias / 30);
  return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

/** aaaa-mm-dd de hoy, en hora local: el valor por defecto de los formularios. */
export function hoy(referencia = new Date()): string {
  const mes = String(referencia.getMonth() + 1).padStart(2, "0");
  const dia = String(referencia.getDate()).padStart(2, "0");
  return `${referencia.getFullYear()}-${mes}-${dia}`;
}

/**
 * Muestra un aaaa-mm-dd sin convertirlo a instante.
 *
 * `new Date("2026-09-06")` es medianoche UTC, que en Argentina son las 21 del
 * día anterior: la lista de gastos mostraría todo un día antes.
 */
export function dia(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return FECHA_LARGA.format(new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1));
}

const TAMANOS = ["B", "KB", "MB", "GB"];

/** El tamaño de un archivo. Se llamaba `peso`, que ahora es el de la balanza. */
export function tamano(bytes: number): string {
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < TAMANOS.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toFixed(i === 0 ? 0 : 1)} ${TAMANOS[i]}`;
}

/**
 * Lee lo que se escribió en un campo de importe.
 *
 * En el mostrador se teclea "12.500", "12500" y "12,5" para decir lo mismo, y
 * en un teclado numérico el punto está más cerca que la coma. Se interpreta el
 * último separador como decimal solo si deja dos dígitos o menos detrás.
 */
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return null;

  const ultimoPunto = limpio.lastIndexOf(".");
  const ultimaComa = limpio.lastIndexOf(",");
  const corte = Math.max(ultimoPunto, ultimaComa);

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

/** El mismo cálculo que hace el backend, para que la vista previa no discrepe. */
export function nuevoPrecio(actual: number, porcentajeCambio: number, redondeo: number): number {
  const bruto = actual * (1 + porcentajeCambio / 100);
  const paso = redondeo > 0 ? redondeo : 1;
  const redondeado = Math.round(bruto / paso) * paso;
  if (actual > 0 && redondeado <= 0) return paso;
  return Math.max(0, redondeado);
}

/**
 * Las dos formas de mirar la misma diferencia entre costo y venta.
 *
 * Algo que cuesta $100 y se vende a $150 deja 50% sobre el costo —«le pongo un
 * cincuenta»— y 33% sobre la venta —de cada peso que entra, treinta y tres
 * centavos—. Quien atiende piensa en el primero; los informes hablan del
 * segundo. Es el mismo cálculo que hace el servidor, escrito dos veces porque
 * las pantallas no comparten código con él, y los dos están cubiertos por sus
 * pruebas.
 */
export function margenSobreVenta(
  precioVenta: number,
  precioCosto: number | null
): number | null {
  if (!precioVenta || precioVenta <= 0 || !precioCosto || precioCosto <= 0) return null;
  return Math.round(((precioVenta - precioCosto) / precioVenta) * 100);
}

export function margenSobreCosto(
  precioVenta: number,
  precioCosto: number | null
): number | null {
  if (!precioVenta || precioVenta <= 0 || !precioCosto || precioCosto <= 0) return null;
  return Math.round(((precioVenta - precioCosto) / precioCosto) * 100);
}

/**
 * Lo que sale un renglón. El mismo cálculo que hace el servidor.
 *
 * Para un producto por peso el precio es por kilo y la cantidad va en gramos.
 * Escrito dos veces porque las pantallas no comparten código con el servidor, y
 * cubierto por una prueba que compara las dos copias: un renglón que la pantalla
 * muestra a $500 y el servidor cobra a $500.000 sería el peor error posible.
 */
export function importeRenglon(precio: number, cantidad: number, porPeso?: boolean): number {
  if (!porPeso) return precio * cantidad;
  return Math.round((precio * cantidad) / 1000);
}

/**
 * Un peso en gramos, escrito como lo diría alguien.
 *
 * Hasta el kilo se habla en gramos —"500 g"— y de ahí para arriba en kilos con
 * coma, que es como está escrito el cartel del mostrador.
 */
export function peso(gramos: number): string {
  const signo = gramos < 0 ? "-" : "";
  const g = Math.abs(gramos);

  if (g < 1000) return `${signo}${g} g`;

  const kilos = g / 1000;
  // Sin decimales de relleno: 2 kg y no 2,000 kg.
  const texto = kilos.toLocaleString("es-AR", { maximumFractionDigits: 3 });
  return `${signo}${texto} kg`;
}

/** Cuánto se lleva: unidades o peso, según el producto. */
export function cantidadEscrita(cantidad: number, porPeso?: boolean): string {
  return porPeso ? peso(cantidad) : numero(cantidad);
}

/**
 * Lo que se llevó, en las unidades que corresponda.
 *
 * Unidades y peso van separados y nunca sumados: media docena de facturas más
 * medio kilo de pan no son "506 unidades". Cuando hay de los dos se escriben
 * los dos, y cuando hay de uno solo no se nombra el otro.
 */
export function llevado(unidades: number, gramos: number, corto = false): string {
  const partes: string[] = [];
  if (unidades > 0) partes.push(corto ? `${numero(unidades)} u.` : `${numero(unidades)} unidades`);
  if (gramos > 0) partes.push(peso(gramos));
  if (partes.length === 0) return corto ? "0 u." : "0 unidades";
  return partes.join(" · ");
}
