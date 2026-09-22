import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";

/**
 * Leer y escribir PNG, sin depender de nada.
 *
 * Son las ciento y pico de líneas que evitan sumarle una dependencia al
 * proyecto por un archivo que se genera una vez cada muerte de obispo. Solo
 * entiende PNG de 8 bits sin entrelazar, que es lo único que hay acá: el arte
 * de la marca y los íconos que salen de él.
 */

// ─────────────────────────────  Leer  ─────────────────────────────

/** Devuelve `{ ancho, alto, pixeles }` con los píxeles en RGBA, uno por byte. */
export function leerPng(ruta) {
  const b = readFileSync(ruta);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${ruta} no es un PNG`);

  let pos = 8;
  let ancho = 0, alto = 0, canales = 4;
  const partes = [];

  while (pos < b.length) {
    const largo = b.readUInt32BE(pos);
    const tipo = b.toString("ascii", pos + 4, pos + 8);
    const datos = b.subarray(pos + 8, pos + 8 + largo);

    if (tipo === "IHDR") {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      if (datos[8] !== 8 || (datos[9] !== 6 && datos[9] !== 2)) {
        throw new Error(`${ruta}: solo se leen PNG de 8 bits RGB o RGBA`);
      }
      if (datos[12] !== 0) throw new Error(`${ruta}: entrelazado no soportado`);
      canales = datos[9] === 6 ? 4 : 3;
    } else if (tipo === "IDAT") {
      partes.push(datos);
    } else if (tipo === "IEND") {
      break;
    }

    pos += 12 + largo;
  }

  const crudo = inflateSync(Buffer.concat(partes));
  const paso = ancho * canales;
  const pixeles = Buffer.alloc(ancho * alto * 4);
  const previa = Buffer.alloc(paso);
  const actual = Buffer.alloc(paso);

  let leido = 0;
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[leido++];
    crudo.copy(actual, 0, leido, leido + paso);
    leido += paso;

    // Deshacer el filtro. Cada fila se guarda como diferencia contra el píxel
    // de al lado, el de arriba, o un promedio de los dos: es lo que hace que un
    // PNG comprima bien, y hay que revertirlo para ver los píxeles.
    for (let i = 0; i < paso; i++) {
      const izq = i >= canales ? actual[i - canales] : 0;
      const arriba = previa[i];
      const diagonal = i >= canales ? previa[i - canales] : 0;

      switch (filtro) {
        case 1: actual[i] = (actual[i] + izq) & 0xff; break;
        case 2: actual[i] = (actual[i] + arriba) & 0xff; break;
        case 3: actual[i] = (actual[i] + ((izq + arriba) >> 1)) & 0xff; break;
        case 4: {
          const p = izq + arriba - diagonal;
          const pa = Math.abs(p - izq), pb = Math.abs(p - arriba), pc = Math.abs(p - diagonal);
          actual[i] = (actual[i] + (pa <= pb && pa <= pc ? izq : pb <= pc ? arriba : diagonal)) & 0xff;
          break;
        }
      }
    }

    for (let x = 0; x < ancho; x++) {
      const o = (y * ancho + x) * 4;
      const s = x * canales;
      pixeles[o] = actual[s];
      pixeles[o + 1] = actual[s + 1];
      pixeles[o + 2] = actual[s + 2];
      pixeles[o + 3] = canales === 4 ? actual[s + 3] : 255;
    }

    actual.copy(previa);
  }

  return { ancho, alto, pixeles };
}

// ────────────────────────────  Escribir  ────────────────────────────

const TABLA_CRC = (() => {
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  return tabla;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);

  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));

  return Buffer.concat([largo, cuerpo, crc]);
}

/**
 * Elige el filtro de una fila y la escribe filtrada.
 *
 * Un PNG no guarda los píxeles: guarda, fila por fila, la diferencia contra el
 * píxel de al lado, el de arriba, el promedio de los dos, o el que predice
 * Paeth. Eso es lo que comprime. Escribir todo sin filtrar es válido y es lo
 * más fácil, pero el arte de la marca tiene la textura del papel encima, y el
 * ruido sin filtrar no comprime: el ícono de 512 pesaba cuatrocientos y pico de
 * kilobytes, que después viajan en cada actualización.
 *
 * Se prueban los cinco y se elige el de menor suma de valores absolutos, que es
 * la regla que recomienda la propia especificación: la fila que quedó más
 * cerca de cero es la que mejor comprime.
 */
function filtrarFila(fila, previa, ancho, destino, salida) {
  const CANALES = 4;
  const largo = ancho * CANALES;

  let mejor = 0;
  let mejorPuntaje = Infinity;
  let mejorFila = null;

  for (let filtro = 0; filtro <= 4; filtro++) {
    const probada = Buffer.alloc(largo);
    let puntaje = 0;

    for (let i = 0; i < largo; i++) {
      const izq = i >= CANALES ? fila[i - CANALES] : 0;
      const arriba = previa[i];
      const diagonal = i >= CANALES ? previa[i - CANALES] : 0;

      let prediccion = 0;
      switch (filtro) {
        case 1: prediccion = izq; break;
        case 2: prediccion = arriba; break;
        case 3: prediccion = (izq + arriba) >> 1; break;
        case 4: {
          const p = izq + arriba - diagonal;
          const pa = Math.abs(p - izq), pb = Math.abs(p - arriba), pc = Math.abs(p - diagonal);
          prediccion = pa <= pb && pa <= pc ? izq : pb <= pc ? arriba : diagonal;
          break;
        }
      }

      const v = (fila[i] - prediccion) & 0xff;
      probada[i] = v;
      // Como valor con signo: 200 es "−56", una diferencia chica.
      puntaje += v < 128 ? v : 256 - v;
    }

    if (puntaje < mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = filtro;
      mejorFila = probada;
    }
  }

  salida[destino] = mejor;
  mejorFila.copy(salida, destino + 1);
}

/** Arma un PNG RGBA a partir de los píxeles crudos. */
export function comoPng(pixeles, ancho, alto = ancho) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8; // bits por canal
  cabecera[9] = 6; // color RGBA

  const paso = ancho * 4;
  const filas = Buffer.alloc(alto * (paso + 1));
  let previa = Buffer.alloc(paso);

  for (let y = 0; y < alto; y++) {
    const fila = pixeles.subarray(y * paso, (y + 1) * paso);
    filtrarFila(fila, previa, ancho, y * (paso + 1), filas);
    previa = fila;
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cabecera),
    trozo("IDAT", deflateSync(filas, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}
