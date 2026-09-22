import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { leerPng, comoPng } from "./png.mjs";

/**
 * Rehace todo lo que se desprende del arte de la marca.
 *
 * El único original es `marca.png`: el monograma VA, el cometa y la estrella en
 * crema sobre la baldosa azul. De ahí salen, y no se dibujan a mano:
 *
 *   herramientas/marca-plana.png  la marca entera, sin el grano del papel
 *   herramientas/marca-chica.png  solo el VA, para el ícono a 16 y 32 píxeles
 *   public/marca.svg              la marca entera, en vector
 *   public/icon.svg               solo el VA, en vector, para la pestaña
 *
 * Hace falta vector además del mapa de bits porque en la pestaña del navegador
 * y arriba de la columna el tamaño lo decide la pantalla del que mira: una
 * imagen ahí se ve borrosa o pesa de más, y un contorno se ve igual de nítido a
 * cualquier tamaño y ocupa dos kilobytes.
 *
 * Se corre una sola vez, cuando cambia el arte. Después `icono.mjs` arma el
 * .ico y los PNG del manifiesto a partir de las dos piezas.
 *
 *   node herramientas/marca-derivada.mjs
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

/** El lado de la pieza grande. Es el ícono más grande que se pide. */
const PLANA = 512;

/** El lado de la pieza chica. Da de sobra para los 32 píxeles que se usan. */
const CHICA = 256;

/**
 * Cuánto del cuadro ocupa el VA en la pieza chica.
 *
 * En el arte completo ocupa tres cuartos, porque el cometa necesita aire
 * alrededor. Sin cometa ese aire es baldosa desperdiciada, y a 16 píxeles cada
 * píxel cuenta. El 76% es apenas más, pero corre el VA al centro del cuadro en
 * vez de dejarlo apoyado a la izquierda, que es lo que más se nota.
 */
const ANCHO_VA = 0.76;

/** El redondeo de la esquina, como fracción del lado. */
const REDONDEO = 0.225;

/**
 * Menos píxeles que esto es basurita de la textura del papel, no dibujo.
 *
 * Vale para las dos puntas: una mancha de crema suelta afuera de las letras, y
 * un agujero oscuro adentro de un trazo. El hueco de la A mide miles.
 */
const MOTA = 400;

const arte = leerPng(join(AQUI, "marca.png"));
const { ancho: LADO, pixeles: px } = arte;
if (arte.alto !== LADO) throw new Error("el arte tiene que ser cuadrado");

// ──────────────────────  Separar las figuras  ──────────────────────
//
// La crema y el azul se distinguen sin vueltas: el arte tiene dos colores y
// nada en el medio salvo el borde suavizado.
const esCrema = (x, y) => {
  if (x < 0 || y < 0 || x >= LADO || y >= LADO) return false;
  const i = (y * LADO + x) * 4;
  return px[i + 3] > 128 && px[i] > 170 && px[i + 1] > 165 && px[i + 2] > 150;
};

// El cometa y la estrella no tocan al VA: son manchas de crema aparte. Buscando
// las manchas conectadas y quedándose con la más grande salen las letras solas,
// sin recortar nada a mano.
const visto = new Uint8Array(LADO * LADO);
const figuras = [];

for (let y = 0; y < LADO; y++) {
  for (let x = 0; x < LADO; x++) {
    const k = y * LADO + x;
    if (visto[k] || !esCrema(x, y)) continue;

    const puntos = [];
    const pila = [k];
    visto[k] = 1;

    while (pila.length) {
      const p = pila.pop();
      const py = (p / LADO) | 0;
      const pxx = p % LADO;
      puntos.push(p);

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = pxx + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= LADO || ny >= LADO) continue;
        const nk = ny * LADO + nx;
        if (visto[nk] || !esCrema(nx, ny)) continue;
        visto[nk] = 1;
        pila.push(nk);
      }
    }

    if (puntos.length >= MOTA) figuras.push(puntos);
  }
}

figuras.sort((a, b) => b.length - a.length);
const [letras, ...resto] = figuras;
if (!letras) throw new Error("no se encontró el monograma en el arte");

const recuadro = (puntos) => {
  let minX = LADO, maxX = 0, minY = LADO, maxY = 0;
  for (const p of puntos) {
    const y = (p / LADO) | 0, x = p % LADO;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY, ancho: maxX - minX + 1, alto: maxY - minY + 1 };
};

const caja = recuadro(letras);
console.log(`  figuras: ${figuras.length}  ·  VA de ${caja.ancho}x${caja.alto}`);

// ──────────────────────  Los dos colores  ──────────────────────
//
// Se miden sobre el arte en vez de anotarlos acá: si el día de mañana cambia el
// azul del dibujo, cambia solo en todos lados. Y se toma la MEDIANA y no el
// promedio, porque el papel tiene textura y el promedio la arrastra.
function mediana(elegir) {
  const canales = [[], [], []];
  for (let y = 0; y < LADO; y += 3) {
    for (let x = 0; x < LADO; x += 3) {
      const i = (y * LADO + x) * 4;
      if (px[i + 3] < 250 || !elegir(x, y)) continue;
      for (let c = 0; c < 3; c++) canales[c].push(px[i + c]);
    }
  }
  return canales.map((v) => {
    v.sort((a, b) => a - b);
    return v[v.length >> 1];
  });
}

const CREMA = mediana(esCrema);
const AZUL = mediana((x, y) => !esCrema(x, y));

const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
console.log(`  crema ${hex(CREMA)}  ·  azul ${hex(AZUL)}`);

// ──────────────────  1 y 2. Las dos piezas, en mapa de bits  ──────────────────
//
// Las dos se dibujan acá desde las manchas, en vez de recortarlas del arte. El
// original tiene grano de papel encima: queda muy bien en una lamina, pero para
// un icono es un problema por dos lados. Un icono de sistema se dibuja plano
// —asi son todos los del escritorio, y con grano el nuestro se ve sucio al
// lado— y, sobre todo, el grano es ruido, y el ruido no comprime. Recortado del
// arte, el PNG de 512 pesaba 378 kB; dibujado, quince. Esos 363 kB de mas viajan
// en cada actualizacion, por un grano que a 32 pixeles no se ve.
//
// Aplanar el color del original no alcanzaba, y vale decir por que: la textura
// ES variacion de luz, asi que al mezclar los dos colores segun el brillo de
// cada pixel el grano sobrevivia como proporcion de mezcla. Desde la mancha no
// hay de donde se cuele.

/**
 * Tapa los agujeros que son basurita del papel, no parte del dibujo.
 *
 * La textura del original deja motas oscuras adentro de los trazos, y al
 * separar por color quedan como agujeros de veinte pixeles en medio de la V.
 * Se buscan las manchas de fondo y se rellenan las que no llegan al minimo: el
 * hueco de la A lo pasa de sobra, una mota no. Es el mismo criterio que filtra
 * los contornos del SVG, para que las dos piezas salgan iguales.
 */
function taparMotas(mascara) {
  const visto = new Uint8Array(LADO * LADO);

  for (let inicio = 0; inicio < mascara.length; inicio++) {
    if (visto[inicio] || mascara[inicio]) continue;

    const mancha = [];
    const pila = [inicio];
    visto[inicio] = 1;

    while (pila.length) {
      const p = pila.pop();
      mancha.push(p);
      const y = (p / LADO) | 0, x = p % LADO;

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= LADO || ny >= LADO) continue;
        const nk = ny * LADO + nx;
        if (visto[nk] || mascara[nk]) continue;
        visto[nk] = 1;
        pila.push(nk);
      }
    }

    if (mancha.length < MOTA) for (const p of mancha) mascara[p] = 1;
  }

  return mascara;
}

/** La baldosa redondeada, por distancia con signo al rectangulo de adentro. */
function baldosa(x, y, lado) {
  const radio = lado * REDONDEO;
  const mitad = lado / 2;
  const dx = Math.abs(x + 0.5 - mitad) - (mitad - radio);
  const dy = Math.abs(y + 0.5 - mitad) - (mitad - radio);
  const dist =
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radio;
  // La distancia sale fraccionaria, y sirve de cobertura del pixel: el borde
  // suavizado de la esquina sale gratis.
  return Math.max(0, Math.min(1, 0.5 - dist));
}

/**
 * Pinta una pieza: la baldosa azul y encima la mancha, en crema.
 *
 * `escala` y el centro dicen como cae la mancha del arte dentro del cuadro de
 * destino. La mancha se promedia en una ventana alrededor de cada pixel, y ese
 * promedio ES el suavizado: sin el, el borde de la V queda en escalera.
 */
function pintar(mascara, lado, escala, centro) {
  const salida = Buffer.alloc(lado * lado * 4);
  const cx = lado / 2 - centro.x * escala;
  const cy = lado / 2 - centro.y * escala;
  // La ventana cubre lo que ocupa un pixel de destino en el arte. Al achicar a
  // la mitad son dos pixeles de arte por lado, y hay que mirarlos todos.
  const paso = Math.max(1, Math.round(1 / escala / 2));

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const fondo = baldosa(x, y, lado);
      if (fondo <= 0) continue;

      const x0 = (x + 0.5 - cx) / escala;
      const y0 = (y + 0.5 - cy) / escala;
      let dentro = 0, total = 0;
      for (let oy = -paso; oy <= paso; oy++) {
        for (let ox = -paso; ox <= paso; ox++) {
          const mx = Math.round(x0 + ox), my = Math.round(y0 + oy);
          total++;
          if (mx >= 0 && my >= 0 && mx < LADO && my < LADO && mascara[my * LADO + mx]) dentro++;
        }
      }
      const tinta = dentro / total;

      const d = (y * lado + x) * 4;
      for (let c = 0; c < 3; c++) salida[d + c] = Math.round(AZUL[c] + (CREMA[c] - AZUL[c]) * tinta);
      salida[d + 3] = Math.round(fondo * 255);
    }
  }

  return salida;
}

// La marca entera. Se dibuja a 512 y no al tamano del arte porque el suavizado
// sale de promediar varios pixeles del original en cada uno del destino: a
// tamano natural no habria nada que promediar y el borde quedaria en escalera.
const todo = new Uint8Array(LADO * LADO);
for (const figura of figuras) for (const p of figura) todo[p] = 1;

const centroArte = { x: LADO / 2, y: LADO / 2 };
writeFileSync(
  join(AQUI, "marca-plana.png"),
  comoPng(pintar(taparMotas(todo), PLANA, PLANA / LADO, centroArte), PLANA)
);
console.log(`  herramientas/marca-plana.png  ${PLANA}x${PLANA}`);

// Y solo el VA, centrado y agrandado, para los tamanos chicos.
const soloLetras = new Uint8Array(LADO * LADO);
for (const p of letras) soloLetras[p] = 1;

const centroVa = { x: (caja.minX + caja.maxX + 1) / 2, y: (caja.minY + caja.maxY + 1) / 2 };
writeFileSync(
  join(AQUI, "marca-chica.png"),
  comoPng(pintar(taparMotas(soloLetras), CHICA, (CHICA * ANCHO_VA) / caja.ancho, centroVa), CHICA)
);
console.log(`  herramientas/marca-chica.png  ${CHICA}x${CHICA}`);

// ──────────────────────  3. Los contornos  ──────────────────────

/** Área encerrada por la vuelta, con signo. Fórmula del cordón de zapato. */
function area(vuelta) {
  let suma = 0;
  for (let i = 0; i < vuelta.length; i++) {
    const [x0, y0] = vuelta[i];
    const [x1, y1] = vuelta[(i + 1) % vuelta.length];
    suma += x0 * y1 - x1 * y0;
  }
  return suma / 2;
}

/**
 * Saca los contornos de una figura con marching squares.
 *
 * Se recorre la grilla mirando de a cuatro píxeles y en cada cruce se anota por
 * dónde pasa el borde. Los tramos sueltos se encadenan después uniendo los
 * extremos que coinciden, y sale una vuelta cerrada por contorno — incluidos
 * los agujeros, como el hueco de la A.
 */
function contornos(dentro, caja) {
  const tramos = new Map();
  const clave = (p) => `${p[0]},${p[1]}`;
  const agregar = (a, b) => {
    const k = clave(a);
    if (!tramos.has(k)) tramos.set(k, []);
    tramos.get(k).push(b);
  };

  for (let y = caja.minY - 1; y <= caja.maxY; y++) {
    for (let x = caja.minX - 1; x <= caja.maxX; x++) {
      const caso =
        (dentro(x, y) ? 1 : 0) |
        (dentro(x + 1, y) ? 2 : 0) |
        (dentro(x + 1, y + 1) ? 4 : 0) |
        (dentro(x, y + 1) ? 8 : 0);
      if (caso === 0 || caso === 15) continue;

      // Los puntos medios de los cuatro lados de la celda.
      const N = [x + 0.5, y], E = [x + 1, y + 0.5], S = [x + 0.5, y + 1], O = [x, y + 0.5];

      // Cada tramo se anota con el relleno a la izquierda, así las vueltas de
      // afuera y las de los agujeros giran al revés entre sí y la regla
      // par-impar del SVG recorta los huecos sola.
      switch (caso) {
        case 1: agregar(O, N); break;
        case 2: agregar(N, E); break;
        case 3: agregar(O, E); break;
        case 4: agregar(E, S); break;
        case 5: agregar(O, N); agregar(E, S); break;   // silla
        case 6: agregar(N, S); break;
        case 7: agregar(O, S); break;
        case 8: agregar(S, O); break;
        case 9: agregar(S, N); break;
        case 10: agregar(N, E); agregar(S, O); break;  // silla
        case 11: agregar(S, E); break;
        case 12: agregar(E, O); break;
        case 13: agregar(E, N); break;
        case 14: agregar(N, O); break;
      }
    }
  }

  const vueltas = [];
  while (tramos.size) {
    const inicio = tramos.keys().next().value;
    const vuelta = [];
    let actual = inicio;

    while (true) {
      const salidas = tramos.get(actual);
      if (!salidas?.length) break;
      const siguiente = salidas.pop();
      if (!salidas.length) tramos.delete(actual);
      vuelta.push(siguiente);
      actual = clave(siguiente);
      if (actual === inicio) break;
    }

    // Por área y no por largo: una mota de la textura tiene el perímetro
    // largo y el área de nada, y por perímetro se colaba adentro de la A.
    if (Math.abs(area(vuelta)) >= MOTA) vueltas.push(vuelta);
  }

  return vueltas;
}

/**
 * Tira los puntos que no cambian la forma (Douglas–Peucker).
 *
 * Marching squares deja un punto cada medio píxel —miles por contorno, y los
 * lados rectos del VA dibujados como escalera—. Se conservan los dos extremos,
 * se busca el punto más lejano de la recta que los une y solo se guarda si se
 * aparta más que la tolerancia. Un lado recto de la V pasa de cuatrocientos
 * puntos a dos.
 */
function simplificar(puntos, tolerancia) {
  if (puntos.length < 3) return puntos;

  const distancia = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const largo = dx * dx + dy * dy;
    if (largo === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };

  const guardar = new Uint8Array(puntos.length);
  guardar[0] = guardar[puntos.length - 1] = 1;
  const pila = [[0, puntos.length - 1]];

  while (pila.length) {
    const [i, j] = pila.pop();
    let peor = -1, lejos = tolerancia;
    for (let k = i + 1; k < j; k++) {
      const d = distancia(puntos[k], puntos[i], puntos[j]);
      if (d > lejos) { lejos = d; peor = k; }
    }
    if (peor >= 0) { guardar[peor] = 1; pila.push([i, peor], [peor, j]); }
  }

  return puntos.filter((_, i) => guardar[i]);
}

// Al cuadro del SVG: 0..64.
const VISTA = 64;
const aVista = VISTA / LADO;
const n = (v) => Math.round(v * 100) / 100;

function camino(puntos) {
  const m = new Uint8Array(LADO * LADO);
  for (const p of puntos) m[p] = 1;
  const dentro = (x, y) => x >= 0 && y >= 0 && x < LADO && y < LADO && m[y * LADO + x] === 1;

  return contornos(dentro, recuadro(puntos))
    .map(
      (vuelta) =>
        simplificar(vuelta, 1.6)
          .map(([x, y], i) => `${i ? "L" : "M"}${n(x * aVista)} ${n(y * aVista)}`)
          .join("") + "Z"
    )
    .join("");
}

const dLetras = camino(letras);
const dResto = resto.map(camino).join("");

// ──────────────────────  4. Los dos SVG  ──────────────────────

const aviso = `<!-- Generado por herramientas/marca-derivada.mjs desde marca.png. No editar a mano. -->`;
const fondo = `<rect width="${VISTA}" height="${VISTA}" rx="${n(VISTA * REDONDEO)}" fill="${hex(AZUL)}"/>`;

writeFileSync(
  join(RAIZ, "public", "marca.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VISTA} ${VISTA}">
${aviso}
  ${fondo}
  <g fill="${hex(CREMA)}" fill-rule="evenodd">
    <path d="${dLetras}"/>
    <path d="${dResto}"/>
  </g>
</svg>
`
);
console.log(`  public/marca.svg  (${dLetras.length + dResto.length} caracteres de contorno)`);

// El favicon lleva solo el VA, agrandado y centrado igual que la pieza chica:
// la pestaña del navegador lo dibuja a dieciséis o veinte píxeles, y ahí el
// cometa es una mancha encima de las letras.
const escalaVa = (VISTA * ANCHO_VA) / (caja.ancho * aVista);
const tx = n(VISTA / 2 - ((caja.minX + caja.maxX + 1) / 2) * aVista * escalaVa);
const ty = n(VISTA / 2 - ((caja.minY + caja.maxY + 1) / 2) * aVista * escalaVa);

writeFileSync(
  join(RAIZ, "public", "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VISTA} ${VISTA}">
${aviso}
  ${fondo}
  <path d="${dLetras}" fill="${hex(CREMA)}" fill-rule="evenodd"
        transform="translate(${tx} ${ty}) scale(${n(escalaVa * 1000) / 1000})"/>
</svg>
`
);
console.log(`  public/icon.svg  (solo el VA)`);
