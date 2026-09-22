/**
 * Código de barras Code 128, dibujado a mano.
 *
 * Un negocio que hace sus propios productos —el pan, las facturas, la torta—
 * no tiene código de fábrica para pegarles. Sin esto, el lector del mostrador
 * no sirve para la mitad del catálogo y hay que buscar todo tecleando.
 *
 * Code 128 y no EAN-13 porque un EAN se compra: son trece dígitos con un
 * prefijo de país y de empresa que asigna un organismo. Code 128 acepta
 * cualquier texto —"PAN-001"— y es lo que leen todos los lectores de mostrador.
 *
 * Va escrito acá por lo mismo que el resto: la aplicación se distribuye como
 * un archivo para hacer doble clic y no puede arrastrar dependencias.
 */

/**
 * Los anchos de cada símbolo, en módulos.
 *
 * Cada uno son seis números que se leen como barra, espacio, barra, espacio,
 * barra, espacio, y suman once módulos. Es la tabla de la norma, tal cual.
 */
const PATRONES = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "233111",
];

/** El símbolo que arranca en el juego B, que cubre las letras y los números. */
const INICIO_B = 104;
/** El cierre. Lleva trece módulos en vez de once: siete números, no seis. */
const FIN = "2331112";

/**
 * Convierte un texto en la secuencia de barras y espacios.
 *
 * Devuelve una lista de anchos alternados, empezando por barra. Dibujarlos es
 * recorrerla pintando una sí y una no.
 *
 * Lanza si el texto tiene algo que el juego B no sabe escribir — un acento,
 * por ejemplo. Un código de barras con una letra silenciosamente cambiada es
 * peor que no tenerlo: el lector devuelve otra cosa y se cobra otro producto.
 */
export function barrasDe(texto: string): number[] {
  if (!texto) throw new Error("No hay código para dibujar.");

  const valores: number[] = [];
  for (const letra of texto) {
    const codigo = letra.codePointAt(0)!;
    // El juego B va del espacio (32) al 127, y el valor es el código menos 32.
    if (codigo < 32 || codigo > 126) {
      throw new Error(`El código no puede tener "${letra}".`);
    }
    valores.push(codigo - 32);
  }

  // La suma de control: el símbolo de inicio, más cada valor por su posición.
  // Sin ella el lector acepta cualquier basura que se le parezca.
  let suma = INICIO_B;
  valores.forEach((valor, i) => {
    suma += valor * (i + 1);
  });
  const control = suma % 103;

  const patrones = [
    PATRONES[INICIO_B]!,
    ...valores.map((v) => PATRONES[v]!),
    PATRONES[control]!,
    FIN,
  ];

  return patrones.join("").split("").map(Number);
}

/**
 * ¿Se puede dibujar este código?
 *
 * Para poder avisar antes en la pantalla, en vez de romper al imprimir.
 */
export function sePuedeDibujar(texto: string): boolean {
  if (!texto) return false;
  return [...texto].every((l) => {
    const c = l.codePointAt(0)!;
    return c >= 32 && c <= 126;
  });
}

/** El ancho total en módulos, para saber cuánto ocupa antes de dibujarlo. */
export function anchoEnModulos(texto: string): number {
  return barrasDe(texto).reduce((s, n) => s + n, 0);
}
