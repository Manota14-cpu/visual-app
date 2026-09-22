import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { leerPng, comoPng } from "./png.mjs";

/**
 * Genera el ícono de Visual App a partir del arte de la marca.
 *
 * Windows necesita un .ico para el acceso directo, y un .ico es un contenedor
 * de imágenes: el mismo símbolo en seis tamaños, para que la barra de tareas,
 * el escritorio y el explorador tomen cada uno el que le sirve.
 *
 * Hay DOS artes de origen, no uno:
 *
 *   marca-plana.png  el dibujo completo — el monograma VA, el cometa que lo
 *                    rodea y la estrella. Es la marca.
 *   marca-chica.png  solo el VA, un poco más grande y con la baldosa al ras.
 *
 * A 16 y 32 píxeles el cometa se convierte en una mancha sucia encima de las
 * letras y la estrella directamente no existe: ahí no aportan, ensucian. Y el
 * aire que el cometa necesita alrededor del VA, a 16 píxeles es baldosa
 * desperdiciada. Por eso los tamaños chicos salen de un dibujo propio. Es lo
 * que hace cualquier juego de íconos serio: cada tamaño se dibuja para el
 * tamaño en el que se va a ver, en vez de escalar uno solo y aceptar lo que
 * salga.
 *
 * Las dos piezas salen de `marca-derivada.mjs`, que las rehace desde el arte.
 *
 *   node herramientas/icono.mjs "dist/Visual App.ico"
 *   node herramientas/icono.mjs public/icon-512.png 512
 */

const AQUI = dirname(fileURLToPath(import.meta.url));

const TAMANOS = [16, 32, 48, 64, 128, 256];

/** Hasta acá manda el dibujo simplificado. Medido mirándolos, no a ojo. */
const CORTE_CHICO = 32;

// ────────────────────────────  Achicar  ────────────────────────────

/**
 * Achica promediando el área que cae en cada píxel de destino.
 *
 * Tomar una muestra suelta —el vecino más cercano— deja el trazo del VA
 * dentado y el cometa hecho pedazos. Promediar el área es lo que convierte un
 * trazo de veinte píxeles en uno de dos sin que se rompa.
 *
 * El color se promedia MULTIPLICADO por el alfa. Sin eso, los píxeles
 * transparentes de la esquina redondeada —que son negros y no se ven— arrastran
 * el promedio hacia el negro y la baldosa queda con un halo sucio alrededor.
 */
function achicar(origen, lado) {
  const { ancho, alto, pixeles } = origen;
  const salida = Buffer.alloc(lado * lado * 4);
  const escalaX = ancho / lado;
  const escalaY = alto / lado;

  for (let y = 0; y < lado; y++) {
    const y0 = Math.floor(y * escalaY);
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * escalaY));

    for (let x = 0; x < lado; x++) {
      const x0 = Math.floor(x * escalaX);
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * escalaX));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < alto; sy++) {
        for (let sx = x0; sx < x1 && sx < ancho; sx++) {
          const i = (sy * ancho + sx) * 4;
          const alfa = pixeles[i + 3] / 255;
          r += pixeles[i] * alfa;
          g += pixeles[i + 1] * alfa;
          b += pixeles[i + 2] * alfa;
          a += pixeles[i + 3];
          n++;
        }
      }

      const d = (y * lado + x) * 4;
      const alfaMedio = a / n;
      const peso = alfaMedio / 255;
      salida[d] = peso > 0 ? Math.round(r / n / peso) : 0;
      salida[d + 1] = peso > 0 ? Math.round(g / n / peso) : 0;
      salida[d + 2] = peso > 0 ? Math.round(b / n / peso) : 0;
      salida[d + 3] = Math.round(alfaMedio);
    }
  }

  return salida;
}

let cacheCompleta = null;
let cacheChica = null;

/** El dibujo que le corresponde a ese tamaño, ya achicado. */
function dibujar(lado) {
  if (lado <= CORTE_CHICO) {
    cacheChica ??= leerPng(join(AQUI, "marca-chica.png"));
    return achicar(cacheChica, lado);
  }
  cacheCompleta ??= leerPng(join(AQUI, "marca-plana.png"));
  return achicar(cacheCompleta, lado);
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
  cabecera.writeInt32LE(lado * 2, 8);
  cabecera.writeUInt16LE(1, 12);
  cabecera.writeUInt16LE(32, 14);
  cabecera.writeUInt32LE(0, 16);
  cabecera.writeUInt32LE(lado * lado * 4, 20);

  const colores = Buffer.alloc(lado * lado * 4);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const origen = ((lado - 1 - y) * lado + x) * 4;
      const destino = (y * lado + x) * 4;
      colores[destino] = pixeles[origen + 2];
      colores[destino + 1] = pixeles[origen + 1];
      colores[destino + 2] = pixeles[origen];
      colores[destino + 3] = pixeles[origen + 3];
    }
  }

  const filaMascara = Math.ceil(lado / 32) * 4;
  return Buffer.concat([cabecera, colores, Buffer.alloc(filaMascara * lado)]);
}

// ─────────────────────────────  ICO  ─────────────────────────────

function comoIco(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(imagenes.length, 4);

  const entradas = [];
  let desplazamiento = 6 + imagenes.length * 16;

  for (const { lado, datos } of imagenes) {
    const entrada = Buffer.alloc(16);
    // 256 se anota como cero: el campo es de un byte y no entra.
    entrada[0] = lado >= 256 ? 0 : lado;
    entrada[1] = lado >= 256 ? 0 : lado;
    entrada.writeUInt16LE(1, 4);
    entrada.writeUInt16LE(32, 6);
    entrada.writeUInt32LE(datos.length, 8);
    entrada.writeUInt32LE(desplazamiento, 12);

    entradas.push(entrada);
    desplazamiento += datos.length;
  }

  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.datos)]);
}

// ─────────────────────────────  Salida  ─────────────────────────────

const destino = process.argv[2] ?? "dist/Visual App.ico";
mkdirSync(dirname(destino), { recursive: true });

if (destino.toLowerCase().endsWith(".png")) {
  // Un PNG suelto: el que usa el manifiesto y el que Windows y los teléfonos
  // toman para el acceso directo del navegador, donde el .ico no llega.
  const lado = Number(process.argv[3]) || 512;
  writeFileSync(destino, comoPng(dibujar(lado), lado));
  console.log(`  ${destino}  (${lado} px)`);
} else {
  const imagenes = TAMANOS.map((lado) => {
    const pixeles = dibujar(lado);
    return { lado, datos: lado <= 64 ? comoDib(pixeles, lado) : comoPng(pixeles, lado) };
  });
  writeFileSync(destino, comoIco(imagenes));
  console.log(`  ${destino}  (${TAMANOS.join(", ")} px)`);
}
