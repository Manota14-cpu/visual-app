/**
 * Un código QR, dibujado a mano.
 *
 * Para entrar desde el celular hay que escribir `http://192.168.1.37:5177` sin
 * equivocarse, y nadie va a hacer eso dos veces. Un QR lo resuelve apuntando
 * la cámara.
 *
 * Está escrito acá y no traído de un paquete por la misma razón que el resto:
 * la aplicación se distribuye como un archivo para hacer doble clic, y sumar
 * dependencias por algo que se dibuja una vez no vale el árbol que arrastran.
 *
 * Solo hace lo que hace falta: modo byte, corrección de errores media, y las
 * versiones chicas —hasta la 6, que entra una dirección larga de sobra—.
 */

// ───────────────────────  Aritmética del campo de Galois  ───────────────────
//
// Reed–Solomon, que es lo que hace que un QR se lea con el vidrio rayado o con
// el dedo encima de una esquina, trabaja en GF(256): se suma con XOR y se
// multiplica con estas dos tablas de logaritmos.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    // El polinomio que define el campo, fijado por la norma del QR.
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}

function multiplicar(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

/** El polinomio generador para `grado` bytes de corrección. */
function generador(grado: number): number[] {
  let poli = [1];
  for (let i = 0; i < grado; i++) {
    const siguiente: number[] = new Array(poli.length + 1).fill(0);
    // Multiplicar por (x + α^i). El índice 0 es el coeficiente de mayor
    // grado: el término en x conserva su lugar y el constante corre uno.
    // Al revés —que es como estaba— el polinomio sale espejado y la
    // corrección de errores queda toda mal, con un QR que se ve perfecto y
    // no lee ningún lector.
    for (let j = 0; j < poli.length; j++) {
      siguiente[j] = (siguiente[j] ?? 0) ^ poli[j]!;
      siguiente[j + 1] = (siguiente[j + 1] ?? 0) ^ multiplicar(poli[j]!, EXP[i]!);
    }
    poli = siguiente;
  }
  return poli;
}

/** Los bytes de corrección de un bloque de datos. */
function corregir(datos: number[], cuantos: number): number[] {
  const gen = generador(cuantos);
  const resto = new Array<number>(cuantos).fill(0);

  for (const byte of datos) {
    const factor = byte ^ resto[0]!;
    resto.shift();
    resto.push(0);
    if (factor !== 0) {
      for (let i = 0; i < gen.length - 1; i++) {
        resto[i] = resto[i]! ^ multiplicar(gen[i + 1]!, factor);
      }
    }
  }

  return resto;
}

// ─────────────────────────────  Las versiones  ─────────────────────────────
//
// Por cada tamaño: cuántos bytes de datos entran, cuántos de corrección lleva
// cada bloque, y en cuántos bloques se parte. Corrección media (M), que es el
// equilibrio razonable: aguanta un 15% dañado sin agrandar mucho el dibujo.

interface Version {
  version: number;
  /** Bytes de datos que entran en total. */
  datos: number;
  /** Bytes de corrección por bloque. */
  correccionPorBloque: number;
  /** Cuántos bloques, y de qué largo. */
  bloques: number[];
}

const VERSIONES: Version[] = [
  { version: 1, datos: 16, correccionPorBloque: 10, bloques: [16] },
  { version: 2, datos: 28, correccionPorBloque: 16, bloques: [28] },
  { version: 3, datos: 44, correccionPorBloque: 26, bloques: [44] },
  { version: 4, datos: 64, correccionPorBloque: 18, bloques: [32, 32] },
  { version: 5, datos: 86, correccionPorBloque: 24, bloques: [43, 43] },
  { version: 6, datos: 108, correccionPorBloque: 16, bloques: [27, 27, 27, 27] },
];

/** Dónde van los cuadraditos de alineación, por versión. */
const ALINEACION: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

// ───────────────────────────────  Armado  ───────────────────────────────

/**
 * Devuelve la matriz del QR: `true` es un módulo negro.
 *
 * Lanza si el texto no entra en la versión 6. Para lo que se usa acá —una
 * dirección de red— eso no puede pasar: entran más de cien caracteres.
 */
export function matrizQr(texto: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(texto)];

  const elegida = VERSIONES.find((v) => bytes.length + 2 + (v.version >= 10 ? 2 : 1) <= v.datos);
  if (!elegida) throw new Error("El texto es demasiado largo para este QR.");

  const lado = 17 + elegida.version * 4;

  // ── Los bits: modo byte, el largo, el texto, y relleno hasta llenar ──
  const bits: number[] = [];
  const empujar = (valor: number, cuantos: number) => {
    for (let i = cuantos - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };

  empujar(0b0100, 4); // modo byte
  empujar(bytes.length, 8); // el largo, que hasta la versión 9 son 8 bits
  for (const b of bytes) empujar(b, 8);

  // Terminador y relleno hasta el byte.
  const capacidadBits = elegida.datos * 8;
  for (let i = 0; i < 4 && bits.length < capacidadBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  // Los dos bytes que la norma manda alternar para rellenar lo que sobra.
  const relleno = [0xec, 0x11];
  let i = 0;
  while (bits.length < capacidadBits) {
    empujar(relleno[i % 2]!, 8);
    i++;
  }

  const datos: number[] = [];
  for (let j = 0; j < bits.length; j += 8) {
    datos.push(bits.slice(j, j + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }

  // ── Partir en bloques, corregir cada uno, y entrelazar ──
  const bloquesDatos: number[][] = [];
  const bloquesCorreccion: number[][] = [];
  let corte = 0;
  for (const largo of elegida.bloques) {
    const bloque = datos.slice(corte, corte + largo);
    corte += largo;
    bloquesDatos.push(bloque);
    bloquesCorreccion.push(corregir(bloque, elegida.correccionPorBloque));
  }

  // Entrelazados: un byte de cada bloque por vuelta. Así un raspón que se come
  // veinte bytes seguidos se reparte entre todos los bloques, y ninguno pierde
  // más de lo que su corrección puede recuperar.
  const finales: number[] = [];
  const masLargo = Math.max(...bloquesDatos.map((b) => b.length));
  for (let k = 0; k < masLargo; k++) {
    for (const bloque of bloquesDatos) if (k < bloque.length) finales.push(bloque[k]!);
  }
  for (let k = 0; k < elegida.correccionPorBloque; k++) {
    for (const bloque of bloquesCorreccion) finales.push(bloque[k]!);
  }

  // ── Dibujar ──
  const matriz: (boolean | null)[][] = Array.from({ length: lado }, () =>
    new Array<boolean | null>(lado).fill(null)
  );

  dibujarFijos(matriz, lado, elegida.version);

  // Los bits, en zigzag de abajo a la derecha hacia arriba.
  const flujo: number[] = [];
  for (const byte of finales) for (let b = 7; b >= 0; b--) flujo.push((byte >> b) & 1);

  let indice = 0;
  let subiendo = true;
  for (let columna = lado - 1; columna > 0; columna -= 2) {
    // La columna 6 es la línea de sincronismo y se saltea entera.
    if (columna === 6) columna--;

    for (let paso = 0; paso < lado; paso++) {
      const fila = subiendo ? lado - 1 - paso : paso;
      for (const c of [columna, columna - 1]) {
        if (matriz[fila]![c] !== null) continue;
        const bit = indice < flujo.length ? flujo[indice]! : 0;
        indice++;
        // Máscara 0: la más simple, y basta con una sola porque el dibujo es
        // siempre el mismo y no hay que elegir la mejor de ocho.
        matriz[fila]![c] = ((fila + c) % 2 === 0 ? bit ^ 1 : bit) === 1;
      }
    }
    subiendo = !subiendo;
  }

  dibujarFormato(matriz, lado);

  return matriz.map((fila) => fila.map((celda) => celda === true));
}

/** Los tres ojos de las esquinas, el sincronismo y los cuadros de alineación. */
function dibujarFijos(matriz: (boolean | null)[][], lado: number, version: number): void {
  const ojo = (fx: number, fy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const f = fy + y;
        const c = fx + x;
        if (f < 0 || c < 0 || f >= lado || c >= lado) continue;
        // Fuera del cuadro de 7x7 está el separador, que va BLANCO. Sin este
        // corte, la esquina de arriba a la derecha del ojo salía negra y el
        // lector no reconocía el patrón.
        const dentro = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const borde = dentro && (x === 0 || x === 6 || y === 0 || y === 6);
        const centro = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        matriz[f]![c] = borde || centro;
      }
    }
  };

  ojo(0, 0);
  ojo(lado - 7, 0);
  ojo(0, lado - 7);

  // La línea de puntos que da la escala.
  for (let i = 8; i < lado - 8; i++) {
    matriz[6]![i] = i % 2 === 0;
    matriz[i]![6] = i % 2 === 0;
  }

  // Los cuadraditos de alineación, que no pisan a los ojos.
  const puntos = ALINEACION[version] ?? [];
  for (const fy of puntos) {
    for (const fx of puntos) {
      const enOjo =
        (fx <= 8 && fy <= 8) || (fx >= lado - 9 && fy <= 8) || (fx <= 8 && fy >= lado - 9);
      if (enOjo) continue;

      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          matriz[fy + y]![fx + x] = Math.max(Math.abs(x), Math.abs(y)) !== 1;
        }
      }
    }
  }

  // El módulo que siempre va negro, al lado del ojo de abajo.
  matriz[lado - 8]![8] = true;

  // Y los lugares del formato quedan reservados para que el zigzag no los use.
  for (let i = 0; i < 9; i++) {
    if (matriz[8]![i] === null) matriz[8]![i] = false;
    if (matriz[i]![8] === null) matriz[i]![8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (matriz[8]![lado - 1 - i] === null) matriz[8]![lado - 1 - i] = false;
    if (matriz[lado - 1 - i]![8] === null) matriz[lado - 1 - i]![8] = false;
  }
}

/**
 * Los quince bits que dicen el nivel de corrección y la máscara usada.
 *
 * Van dos veces, en dos lugares distintos: si una copia se daña, el lector
 * todavía puede leer la otra y saber cómo interpretar el resto.
 */
function dibujarFormato(matriz: (boolean | null)[][], lado: number): void {
  // Corrección M (0b00) con máscara 0 (0b000), ya calculados sus bits de
  // control y aplicada la máscara fija que la norma manda.
  const FORMATO = 0b101010000010010;

  // El bit 14 es el más significativo y va primero. Numerarlos al revés deja
  // un QR que se ve bien y ningún lector entiende: los quince bits del formato
  // dicen con qué corrección y con qué máscara leer todo lo demás.
  const bit = (i: number) => ((FORMATO >> (14 - i)) & 1) === 1;

  for (let i = 0; i <= 5; i++) matriz[8]![i] = bit(i);
  matriz[8]![7] = bit(6);
  matriz[8]![8] = bit(7);
  matriz[7]![8] = bit(8);
  for (let i = 9; i <= 14; i++) matriz[14 - i]![8] = bit(i);

  for (let i = 0; i <= 7; i++) matriz[lado - 1 - i]![8] = bit(i);
  for (let i = 8; i <= 14; i++) matriz[8]![lado - 15 + i] = bit(i);

  matriz[lado - 8]![8] = true;
}
