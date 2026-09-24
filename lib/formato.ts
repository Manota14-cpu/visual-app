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
// De 0 a 23, como el reloj de la caja y el de cualquier comprobante. Con el
// formato de doce horas que trae el idioma salía "10:24 p. m.", y al cerrar la
// oración con un punto quedaba "p. m..".
const HORA = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * "24 sept". El idioma lo arma con guion —"24-sept"—, que al lado de una hora
 * se lee como un código y no como una fecha.
 */
export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  return FECHA.formatToParts(new Date(valor))
    .filter((parte) => parte.type === "day" || parte.type === "month")
    .map((parte) => parte.value)
    .join(" ");
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
  return `${fecha(valor)} · ${hora(valor)}`;
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

/** Cómo se saluda acá según la hora: de mañana es «buen día», no «buenos días». */
export function saludo(ahora = new Date()): string {
  const h = ahora.getHours();
  if (h >= 5 && h < 12) return "Buen día";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

const DIA_ENTERO = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" });

/** «jueves 24 de septiembre», sin la coma que el idioma pone después del día. */
export function diaEntero(fecha = new Date()): string {
  return DIA_ENTERO.format(fecha).replace(",", "");
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
  return FECHA_LARGA.format(comoDiaLocal(iso));
}

/**
 * Un aaaa-mm-dd como instante del mediodía local.
 *
 * `new Date("2026-09-19")` lo lee como medianoche UTC, que en Argentina es el
 * 18 a las 21: la fecha se muestra un día para atrás. Se arma con las partes y
 * al mediodía, así ni el horario de verano lo corre.
 */
export function comoDiaLocal(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
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

/**
 * Con cuánto puede pagar alguien un importe en efectivo.
 *
 * Los montos redondos que salen de juntar billetes: el próximo múltiplo de
 * mil, de dos mil, de cinco mil, de diez mil y de veinte mil —el billete más
 * grande—. Hasta cuatro, de menor a mayor, y nunca el importe exacto: para eso
 * está el botón «Justo». Con $15.200 propone $16.000 y $20.000, que es lo que
 * en el mostrador se escucha: «te doy veinte».
 */
export function billetesSugeridos(importe: number): number[] {
  if (!(importe > 0)) return [];
  const montos = new Set<number>();
  for (const paso of [1000, 2000, 5000, 10000, 20000]) {
    montos.add(Math.ceil(importe / paso) * paso);
  }
  // Un importe que ya es redondo —$10.000— se paga justo o con el billete
  // que sigue; nadie da $11.000.
  montos.add(Math.floor(importe / 20000) * 20000 + 20000);
  return [...montos]
    .filter((monto) => monto > importe)
    .sort((a, b) => a - b)
    .slice(0, 4);
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

/**
 * Un texto para comparar: sin acentos, sin mayúsculas y sin espacios de más.
 * "José  Pérez" y "jose perez" son la misma persona anotada de dos formas.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lo que se escribe en un campo de cantidad o de precio de un renglón.
 *
 * Vacío es 0 mientras se edita, y no "1": antes, al borrar el número para
 * escribir otro, el campo volvía a 1 y lo que se tecleaba se le pegaba atrás.
 * En un producto por peso, borrar los 1000 g para poner 250 dejaba "1250" y se
 * cobraba kilo y cuarto. Quien usa el valor tiene que frenar los ceros antes
 * de guardar.
 *
 * Se lee como se escribe acá: "1.250" son mil doscientos cincuenta. Lo que no
 * es un número deja el valor que había.
 */
export function enteroEscrito(texto: string, anterior: number): number {
  if (texto.trim() === "") return 0;
  const n = leerNumero(texto);
  if (n === null || n < 0) return anterior;
  return Math.round(n);
}
