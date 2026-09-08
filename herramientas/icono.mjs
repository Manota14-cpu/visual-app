import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Genera el ícono de AppPack.
 *
 * Windows necesita un .ico para el acceso directo, y un .ico es un contenedor
 * de imágenes: se dibuja el mismo símbolo en seis tamaños y se los mete a
 * todos, para que la barra de tareas, el escritorio y el explorador tomen cada
 * uno el que le sirve.
 *
 * Está dibujado a mano con funciones de distancia en vez de con una biblioteca:
 * son cien líneas, no agrega una dependencia al proyecto y el resultado no
 * depende de que la máquina tenga instalada una fuente.
 *
 *   node herramientas/icono.mjs dist/AppPack.ico
 */

const TAMANOS = [16, 32, 48, 64, 128, 256];

// El mismo azul del sistema que usa la interfaz, de arriba más claro a abajo
// más saturado: así el ícono tiene volumen sin dibujarle un brillo encima.
const ARRIBA = [61, 156, 255];
const ABAJO = [0, 113, 227];

/** Qué tan adentro del rectángulo redondeado está un punto. Negativo es adentro. */
function distanciaAlCuadrado(x, y, lado, radio) {
  const centro = lado / 2;
  const mitad = centro - lado * 0.055; // un margen, para que no toque el borde
  const dx = Math.abs(x - centro) - (mitad - radio);
  const dy = Math.abs(y - centro) - (mitad - radio);

  const fuera = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return fuera + Math.min(Math.max(dx, dy), 0) - radio;
}

/** Distancia de un punto a un segmento grueso: es cada trazo de la letra. */
function distanciaAlTrazo(x, y, x1, y1, x2, y2, grosor) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const largo = vx * vx + vy * vy;
  const t = largo === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / largo));
  return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy)) - grosor;
}

/** Los tres trazos de una A: las dos patas y el travesaño. */
function distanciaALaLetra(x, y, lado) {
  const u = (v) => v * lado; // proporciones, para que escale a cualquier tamaño
  const grosor = u(0.052);

  return Math.min(
    distanciaAlTrazo(x, y, u(0.5), u(0.235), u(0.295), u(0.755), grosor),
    distanciaAlTrazo(x, y, u(0.5), u(0.235), u(0.705), u(0.755), grosor),
    distanciaAlTrazo(x, y, u(0.375), u(0.605), u(0.625), u(0.605), grosor)
  );
}

/** Cuánto pinta una forma en un píxel: 1 adentro, 0 afuera, y el borde suave. */
function cobertura(distancia) {
  return Math.max(0, Math.min(1, 0.5 - distancia));
}

function dibujar(lado) {
  const pixeles = Buffer.alloc(lado * lado * 4);
  const radio = lado * 0.225;

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      const fondo = cobertura(distanciaAlCuadrado(px, py, lado, radio));
      if (fondo <= 0) continue;

      const mezcla = py / lado;
      const letra = cobertura(distanciaALaLetra(px, py, lado));

      const canal = (i) => {
        const base = ARRIBA[i] + (ABAJO[i] - ARRIBA[i]) * mezcla;
        return Math.round(base + (255 - base) * letra);
      };

      const p = (y * lado + x) * 4;
      pixeles[p] = canal(0);
      pixeles[p + 1] = canal(1);
      pixeles[p + 2] = canal(2);
      pixeles[p + 3] = Math.round(fondo * 255);
    }
  }

  return pixeles;
}

// ─────────────────────────────  PNG  ─────────────────────────────

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);

  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo) >>> 0);

  return Buffer.concat([largo, cuerpo, crc]);
}

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
  return c ^ -1;
}

function comoPng(pixeles, lado) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8; // bits por canal
  cabecera[9] = 6; // color RGBA
  cabecera[10] = 0;
  cabecera[11] = 0;
  cabecera[12] = 0;

  // Cada fila lleva adelante un byte con el filtro usado. Sin filtrar (0) es
  // más grande, pero para un ícono de 256 píxeles la diferencia no se nota.
  const filas = Buffer.alloc(lado * (lado * 4 + 1));
  for (let y = 0; y < lado; y++) {
    const destino = y * (lado * 4 + 1);
    filas[destino] = 0;
    pixeles.copy(filas, destino + 1, y * lado * 4, (y + 1) * lado * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cabecera),
    trozo("IDAT", deflateSync(filas, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// ─────────────────────────────  BMP  ─────────────────────────────

/**
 * La forma vieja de guardar un ícono: una cabecera BITMAPINFOHEADER, los
 * píxeles al revés (de abajo hacia arriba, en BGRA) y una máscara de
 * transparencia que ya no se usa pero que tiene que estar.
 *
 * Hace falta porque `System.Drawing` —el dibujo de .NET Framework, que usa el
 * instalador para mostrar el logo— no sabe leer las entradas comprimidas en
 * PNG. El Explorador de Windows sí, así que los tamaños grandes van en PNG y
 * los chicos en este formato: cada uno toma el que entiende.
 */
function comoDib(pixeles, lado) {
  const cabecera = Buffer.alloc(40);
  cabecera.writeUInt32LE(40, 0);
  cabecera.writeInt32LE(lado, 4);
  cabecera.writeInt32LE(lado * 2, 8); // el doble: la imagen y su máscara
  cabecera.writeUInt16LE(1, 12);
  cabecera.writeUInt16LE(32, 14);

  const cuerpo = Buffer.alloc(lado * lado * 4);
  for (let y = 0; y < lado; y++) {
    const origen = (lado - 1 - y) * lado * 4;
    for (let x = 0; x < lado; x++) {
      const desde = origen + x * 4;
      const hasta = (y * lado + x) * 4;
      cuerpo[hasta] = pixeles[desde + 2]; // B
      cuerpo[hasta + 1] = pixeles[desde + 1]; // G
      cuerpo[hasta + 2] = pixeles[desde]; // R
      cuerpo[hasta + 3] = pixeles[desde + 3]; // A
    }
  }

  // La máscara va en ceros: con 32 bits por píxel manda el canal alfa.
  const anchoMascara = Math.ceil(lado / 32) * 4;
  const mascara = Buffer.alloc(anchoMascara * lado);

  return Buffer.concat([cabecera, cuerpo, mascara]);
}

// ─────────────────────────────  ICO  ─────────────────────────────

function comoIco(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2); // 1 = ícono
  cabecera.writeUInt16LE(imagenes.length, 4);

  const entradas = [];
  let desplazamiento = 6 + imagenes.length * 16;

  for (const { lado, datos } of imagenes) {
    const entrada = Buffer.alloc(16);
    entrada[0] = lado >= 256 ? 0 : lado; // 0 significa 256
    entrada[1] = lado >= 256 ? 0 : lado;
    entrada[2] = 0; // colores de la paleta
    entrada[3] = 0;
    entrada.writeUInt16LE(1, 4); // planos
    entrada.writeUInt16LE(32, 6); // bits por píxel
    entrada.writeUInt32LE(datos.length, 8);
    entrada.writeUInt32LE(desplazamiento, 12);

    entradas.push(entrada);
    desplazamiento += datos.length;
  }

  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.datos)]);
}

// ─────────────────────────────  Salida  ─────────────────────────────

const destino = process.argv[2] ?? "dist/AppPack.ico";
mkdirSync(dirname(destino), { recursive: true });

if (destino.toLowerCase().endsWith(".png")) {
  // Un PNG suelto: es el que usa la ventana de la aplicación y el que aparece
  // en la barra de tareas, donde el .ico no llega.
  const lado = Number(process.argv[3]) || 512;
  writeFileSync(destino, comoPng(dibujar(lado), lado));
  console.log(`  ${destino}  (${lado} px)`);
} else {
  // Los tamaños chicos van en el formato viejo, que entiende System.Drawing;
  // los grandes en PNG, que ocupa mucho menos y el Explorador lee sin problema.
  const imagenes = TAMANOS.map((lado) => {
    const pixeles = dibujar(lado);
    return { lado, datos: lado <= 64 ? comoDib(pixeles, lado) : comoPng(pixeles, lado) };
  });
  writeFileSync(destino, comoIco(imagenes));
  console.log(`  ${destino}  (${TAMANOS.join(", ")} px)`);
}
