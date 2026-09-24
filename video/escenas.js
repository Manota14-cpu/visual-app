/**
 * Las escenas del video.
 *
 * Cada escena arma su parte del escenario una sola vez y después tiene una
 * función `dibujar(l)` que recibe el tiempo local (segundos desde que
 * empieza) y pone cada cosa en su lugar. El guion completo:
 *
 *   0 – 4    La marca se dibuja sobre negro y el zoom entra por el azul.
 *   4 – 8    Stock. Caja. Ventas. — y "Todo en una sola app".
 *   8 – 14   El Panel: la ventana de escritorio y sus números de cerca.
 *  14 – 22   La caja: lector de códigos, búsqueda, cobro, vuelto y comprobante.
 *  22 – 27   Productos: elegir varios y subir precios de una vez.
 *  27 – 33   Todo lo demás, en teselas.
 *  33 – 37   Informes: cuánto se vendió y cuánto quedó.
 *  37 – 41   El celular, por el wifi del local.
 *  41 – 45   Cierre con la marca.
 *
 * Los números que aparecen son de un almacén inventado; las pantallas son
 * las de la aplicación, con sus textos, colores e íconos.
 */
(function () {
  const { clamp, lerp, tramo, curva, pon, entra, letras, palabras, revela, escondePiezas, miles, pesos, azar, rodillo } = M;

  const DURACION = 45;
  const escenario = document.getElementById("escenario");
  const $ = (s, r = escenario) => r.querySelector(s);
  const $$ = (s, r = escenario) => [...r.querySelectorAll(s)];

  function crea(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  /**
   * Lo que se mide del DOM se mide la primera vez que la escena está en
   * pantalla: mientras está escondida todo mide cero.
   */
  function perezoso(medir) {
    let valor;
    return () => (valor === undefined ? (valor = medir()) : valor);
  }

  const escenas = [];
  function escena(id, desde, hasta, html, opciones = {}) {
    const nodo = crea(`<section class="escena" id="${id}">${html}</section>`);
    escenario.appendChild(nodo);
    const e = { id, nodo, desde, hasta, antes: opciones.antes || 0, despues: opciones.despues || 0, visible: false, dibujar: () => {} };
    escenas.push(e);
    return e;
  }

  // ───────────────────────────────  Íconos  ───────────────────────────────
  // Los mismos trazos de components/iconos.tsx.
  const TRAZOS = {
    panel: '<rect x="3" y="3" width="7.5" height="8.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="3" y="15" width="7.5" height="6" rx="1.5"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5"/>',
    productos: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
    caja: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7.5Z"/><path d="M3 8h13"/><circle cx="17" cy="13" r="1.2"/>',
    pedidos: '<path d="M6 3h9l4 4v14H6z"/><path d="M14.5 3v4.5H19"/><path d="M9.5 12.5h6M9.5 16h4"/>',
    clientes: '<circle cx="9.5" cy="8" r="3.2"/><path d="M3.5 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 14.9c1.9.6 3 2.2 3 4.1"/>',
    gastos: '<path d="M5.5 3.5h13v17l-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4-2.1-1.4-2.2 1.4z"/><path d="M9 8.5h6M9 12.5h6"/>',
    informes: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16.5v-4M12.5 16.5V7.5M17 16.5v-6.5"/>',
    movimientos: '<path d="M3.5 8.5h13l-3-3M20.5 15.5h-13l3 3"/>',
    ajustes: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    menos: '<path d="M5 12h14"/>',
    buscar: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>',
    cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
    listo: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    alerta: '<path d="M12 4 2.8 20h18.4L12 4Z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    "flecha-derecha": '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    imprimir: '<path d="M7 9V3.5h10V9"/><path d="M5 9h14a2 2 0 0 1 2 2v5h-4v4.5H7V16H3v-5a2 2 0 0 1 2-2Z"/><path d="M7 16h10"/>',
    carpeta: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-11Z"/>',
    recargar: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.5 4v4.5H16"/>',
    archivo: '<path d="M6 3h8l4.5 4.5V21H6z"/><path d="M13.5 3v5H19"/>',
    etiqueta: '<path d="M3.5 11.5V5A1.5 1.5 0 0 1 5 3.5h6.5L21 13l-8 8-9.5-9.5Z"/><circle cx="8" cy="8" r="1.3"/>',
    reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/>',
    salir: '<path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M17.5 8.5 21 12l-3.5 3.5M21 12h-9"/>',
    camion: '<path d="M13.5 17V5.5H4a1 1 0 0 0-1 1V16a1 1 0 0 0 1 1h1.1M8.9 17h6.2"/><path d="M13.5 9h4l3 3.6V16a1 1 0 0 1-1 1h-.6"/><circle cx="7" cy="17" r="1.9"/><circle cx="17" cy="17" r="1.9"/>',
    recuento: '<path d="M8.5 4.5h-2A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5h-2"/><rect x="8.5" y="3" width="7" height="3" rx="1"/><path d="m9 13.5 2.2 2.2 4.3-4.5"/>',
    codigo: '<path d="M3.5 7.5v-2a1 1 0 0 1 1-1h2M17.5 4.5h2a1 1 0 0 1 1 1v2M20.5 16.5v2a1 1 0 0 1-1 1h-2M6.5 19.5h-2a1 1 0 0 1-1-1v-2"/><path d="M7.5 8v8M10 8v8M12.5 8v8M15.5 8v8"/><path d="M16.8 8v8" stroke-width="0.9"/>',
    camara: '<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.6l1.5-2.2h5.8L16.4 7H19a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/><circle cx="12" cy="13" r="3.4"/>',
    puntos: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
    selector: '<path d="m8 10 4-4 4 4M8 14l4 4 4-4"/>',
  };

  function ic(nombre, tam = 18, clase = "", estilo = "") {
    return `<svg class="ic ${clase}" style="${estilo}" viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${TRAZOS[nombre]}</svg>`;
  }

  /** Un ícono que se puede dibujar trazo por trazo. */
  function icTrazado(nombre, tam, clase = "", ancho = 1.6) {
    const trazos = TRAZOS[nombre].replace(/<(path|circle|rect)/g, '<$1 pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"');
    return `<svg class="ic ${clase}" viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="${ancho}" stroke-linecap="round" stroke-linejoin="round" style="overflow:visible">${trazos}</svg>`;
  }

  function trazar(svg, k, escalonado = 0.12) {
    if (!svg) return;
    const partes = svg.querySelectorAll("path, circle, rect");
    const n = partes.length;
    partes.forEach((p, i) => {
      const inicio = n > 1 ? (i / n) * escalonado * n * 0.5 : 0;
      const kk = clamp((k - inicio) / (1 - Math.min(0.6, inicio)));
      p.style.strokeDashoffset = (1 - kk).toFixed(4);
      p.style.opacity = kk > 0.001 ? 1 : 0;
    });
  }

  // ───────────────────────────────  La marca  ───────────────────────────────
  // Los contornos de public/marca.svg. El segundo trazo del original está
  // partido en sus cuatro piezas para poder dibujar la estrella aparte.
  const VA = "M12.98 22.49L6.7 22.64L12.98 35.66L20.27 50.13L29 50.2L31.22 45.76L42.4 45.76L44.39 50.13L53.83 50.16L42.4 22.6L32.48 22.6L24.19 39.84L16.54 22.49L13.02 22.46ZM37.44 31.7L40.73 39.51L33.74 39.55L33.7 39.29L37.4 31.74Z";
  const ADORNOS = [
    "M10.25 31L8.1 33.07L6.03 35.44L4.11 38.18L2.92 40.47L2.33 42.25L1.96 44.17L2.03 46.46L2.77 48.39L4.29 50.05L5.48 50.79L7.4 51.53L9.84 51.98L15.17 51.98L18.72 51.53L22.49 50.72L15.09 50.94L11.25 50.35L9.1 49.61L7.99 49.02L6.81 48.13L5.73 46.83L4.99 45.13L4.77 43.65L4.77 42.25L5.14 40.1L5.73 38.33L6.92 35.88L8.84 32.92L10.4 31.08L10.28 30.96Z",
    "M55.45 18.05L54.57 18.72L54.27 19.38L55.97 20.94L56.79 22.05L57.53 23.53L58.04 25.97L57.82 28.78L56.93 31.45L55.31 34.48L53.09 37.44L50.13 40.4L50.16 40.58L53.94 37.62L56.49 35.07L57.82 33.44L59.89 29.97L60.78 27.3L60.93 24.86L60.63 23.38L60.04 21.97L58.23 19.72L56.6 18.53L55.49 18.02Z",
    "M45.98 14.35L43.36 14.69L39.81 15.43L31.59 17.94L24.27 20.9L19.31 23.42L18.02 24.34L18.2 24.45L22.79 22.23L26.71 20.61L35.66 17.35L42.32 15.28L46.72 14.35L46.02 14.32Z",
  ];
  const ESTRELLA = "M52.2 8.58L52.2 9.69L51.75 12.06L51.16 13.47L50.65 14.21L49.5 15.13L48.54 15.57L45.1 16.28L47.94 16.61L49.2 17.05L50.09 17.65L50.72 18.28L51.46 19.68L52.24 23.42L52.49 21.01L52.79 19.9L53.83 17.98L54.97 17.05L56.01 16.61L58.49 16.13L56.75 15.87L55.64 15.5L53.97 14.35L53.53 13.76L52.79 11.99L52.24 8.55Z";
  const CREMA = "#F0ECE3";

  function marcaAnimada(p) {
    return `<svg viewBox="0 0 64 64" width="100%" height="100%" style="overflow:visible">
      <defs>
        <clipPath id="${p}-recorte"><rect width="64" height="64" rx="14.4"/></clipPath>
        <linearGradient id="${p}-luz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="${p}-barrido" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <radialGradient id="${p}-destello"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".35" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <g class="cuadro">
        <rect width="64" height="64" rx="14.4" fill="#0050CE"/>
        <rect class="luz" width="64" height="64" rx="14.4" fill="url(#${p}-luz)"/>
        <g clip-path="url(#${p}-recorte)"><rect class="barrido" x="-30" y="-20" width="22" height="104" fill="url(#${p}-barrido)"/></g>
      </g>
      <g class="dibujo">
        <path class="va-relleno" d="${VA}" fill="${CREMA}" fill-rule="evenodd" opacity="0"/>
        <path class="va-trazo" d="${VA}" fill="none" stroke="${CREMA}" stroke-width=".7" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>
        ${ADORNOS.map((d) => `<path class="adorno-relleno" d="${d}" fill="${CREMA}" opacity="0"/><path class="adorno-trazo" d="${d}" fill="none" stroke="${CREMA}" stroke-width=".5" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>`).join("")}
        <g class="estrella"><circle class="destello" cx="52.3" cy="16" r="9" fill="url(#${p}-destello)" opacity="0"/><path d="${ESTRELLA}" fill="${CREMA}"/></g>
      </g>
    </svg>`;
  }

  function marcaFija(tam) {
    return `<svg viewBox="0 0 64 64" width="${tam}" height="${tam}"><rect width="64" height="64" rx="14.4" fill="#0050CE"/><g fill="${CREMA}"><path d="${VA}" fill-rule="evenodd"/>${ADORNOS.map((d) => `<path d="${d}"/>`).join("")}<path d="${ESTRELLA}"/></g></svg>`;
  }

  /**
   * La marca en sus etapas: el cuadro, el trazo que la dibuja, el relleno,
   * los adornos, la estrella y el reflejo que la cruza.
   */
  function dibujaMarca(raiz, v) {
    const cuadro = raiz.querySelector(".cuadro");
    const s = v.cuadro ?? 1;
    cuadro.setAttribute("transform", `translate(32 32) rotate(${(v.giro || 0).toFixed(3)}) scale(${s.toFixed(4)}) translate(-32 -32)`);
    cuadro.setAttribute("opacity", (v.cuadroO ?? 1).toFixed(3));
    const trazo = raiz.querySelector(".va-trazo");
    trazo.style.strokeDashoffset = (1 - (v.trazo ?? 1)).toFixed(4);
    trazo.style.opacity = ((v.trazo ?? 1) > 0.001 ? 1 : 0) * (1 - (v.relleno ?? 1));
    raiz.querySelector(".va-relleno").setAttribute("opacity", (v.relleno ?? 1).toFixed(3));
    raiz.querySelectorAll(".adorno-trazo").forEach((p, i) => {
      const k = clamp((v.adornos ?? 1) * 1.3 - i * 0.15);
      p.style.strokeDashoffset = (1 - k).toFixed(4);
      p.style.opacity = (k > 0.001 ? 1 : 0) * (1 - (v.adornosRelleno ?? 1));
    });
    raiz.querySelectorAll(".adorno-relleno").forEach((p) => p.setAttribute("opacity", (v.adornosRelleno ?? 1).toFixed(3)));
    const e = v.estrella ?? 1;
    const estrella = raiz.querySelector(".estrella");
    estrella.setAttribute("transform", `translate(52.3 16) rotate(${((1 - clamp(e)) * -120).toFixed(2)}) scale(${Math.max(0.0001, e).toFixed(4)}) translate(-52.3 -16)`);
    raiz.querySelector(".destello").setAttribute("opacity", (v.destello || 0).toFixed(3));
    const b = v.barrido ?? 0;
    raiz.querySelector(".barrido").setAttribute("transform", `rotate(20 32 32) translate(${lerp(-10, 110, b).toFixed(2)} 0)`);
    raiz.querySelector(".dibujo").setAttribute("opacity", (v.dibujoO ?? 1).toFixed(3));
    raiz.querySelector(".luz").setAttribute("opacity", (v.luz ?? 1).toFixed(3));
  }

  // ──────────────────────────  Polvo de luz  ──────────────────────────
  function polvo(contenedor, n, semilla, color = "255,255,255") {
    const r = azar(semilla);
    const motas = [];
    for (let i = 0; i < n; i++) {
      const d = document.createElement("div");
      const tam = 2 + r() * 5;
      d.style.cssText = `position:absolute;left:0;top:0;width:${tam}px;height:${tam}px;border-radius:50%;background:rgba(${color},1);box-shadow:0 0 ${tam * 3}px rgba(${color},.8)`;
      contenedor.appendChild(d);
      motas.push({ d, x: r() * 1080, y: r() * 1920, v: 20 + r() * 50, a: 10 + r() * 30, f: 0.3 + r() * 0.8, fase: r() * 6.28, brillo: 0.15 + r() * 0.5 });
    }
    return (t, o = 1) => {
      for (const m of motas) {
        let y = (m.y - m.v * t) % 1960;
        if (y < -40) y += 1960;
        const x = m.x + Math.sin(t * m.f + m.fase) * m.a;
        m.d.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
        m.d.style.opacity = (o * m.brillo * (0.55 + 0.45 * Math.sin(t * 2.2 * m.f + m.fase))).toFixed(3);
      }
    };
  }

  /**
   * Dónde está un elemento, en píxeles de la capa `capa`, tal como se ve en
   * este cuadro (con zoom, transformaciones y todo). Si el elemento se
   * escondió, devuelve el último lugar donde estuvo.
   */
  const ultimos = new WeakMap();
  function lugar(el, capa, dx = 0.5, dy = 0.5) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return ultimos.get(el) || [540, 1500];
    const c = capa.getBoundingClientRect();
    const s = escenario.getBoundingClientRect().width / 1080;
    const p = [(r.left - c.left + r.width * dx) / s, (r.top - c.top + r.height * dy) / s];
    ultimos.set(el, p);
    return p;
  }

  // ────────────────────────────  El puntero  ────────────────────────────
  function puntero(padre) {
    const onda = crea('<div class="onda"></div>');
    const el = crea(`<svg class="puntero" viewBox="0 0 28 28"><path d="M6 3.5v19.2l4.9-4.6 3 7 3.3-1.4-3-6.9h6.8L6 3.5Z" fill="#fff" stroke="#1D1D1F" stroke-width="1.5" stroke-linejoin="round"/></svg>`);
    padre.append(onda, el);
    const PX = (6 / 28) * 58, PY = (3.5 / 28) * 58;
    return (t, claves, clics, aparece, desaparece) => {
      let x = claves[0][1], y = claves[0][2];
      for (let i = 0; i < claves.length - 1; i++) {
        const [t0, x0, y0] = claves[i], [t1, x1, y1] = claves[i + 1];
        if (t >= t0 && t <= t1) {
          const k = curva.ida(tramo(t, t0, t1));
          x = lerp(x0, x1, k);
          y = lerp(y0, y1, k);
          // Un arco apenas curvo, como mueve la mano el mouse.
          y -= Math.sin(k * Math.PI) * Math.min(60, Math.hypot(x1 - x0, y1 - y0) * 0.12);
          break;
        }
        if (t > t1) { x = x1; y = y1; }
      }
      const o = Math.min(tramo(t, aparece, aparece + 0.25), 1 - tramo(t, desaparece, desaparece + 0.25));
      let presion = 0, onK = -1;
      for (const c of clics) {
        presion = Math.max(presion, Math.sin(Math.PI * tramo(t, c - 0.08, c + 0.14)));
        if (t >= c && t < c + 0.5) onK = tramo(t, c, c + 0.5);
      }
      el.style.transform = `translate3d(${(x - PX).toFixed(1)}px,${(y - PY).toFixed(1)}px,0) scale(${(1 - 0.16 * presion).toFixed(3)})`;
      el.style.transformOrigin = `${PX}px ${PY}px`;
      el.style.opacity = o.toFixed(3);
      el.style.visibility = o > 0.001 ? "visible" : "hidden";
      if (onK >= 0) {
        const e = curva.salida(onK);
        onda.style.transform = `translate3d(${x}px,${y}px,0) scale(${lerp(0.25, 1.5, e).toFixed(3)})`;
        onda.style.opacity = ((1 - onK) * 0.9 * o).toFixed(3);
      } else onda.style.opacity = 0;
    };
  }

  // ────────────────────────  Piezas de la interfaz  ────────────────────────
  function metrica(rotulo, valor, pie, tono = "", clase = "") {
    return `<div class="hoja metrica ${clase}"><span class="etiqueta-campo">${rotulo}</span><div class="valor ${tono ? "v-" + tono : ""}">${valor}</div>${pie ? `<div class="pie">${pie}</div>` : ""}</div>`;
  }

  const VENTAS_14 = [112400, 98700, 143200, 131800, 87600, 156900, 171300, 124500, 118200, 149800, 162700, 139100, 176400, 184350];
  function columnas(soloDia) {
    const max = Math.max(...VENTAS_14);
    return `<div class="columnas">${VENTAS_14.map((v, i) => {
      const dia = 11 + i;
      const hoy = i === VENTAS_14.length - 1;
      return `<div class="col"><div class="col-area"><div class="barra ${hoy ? "hoy" : ""}" data-alto="${((v / max) * 100).toFixed(2)}"></div></div><span class="dia">${soloDia ? dia : `${dia}/09`}</span></div>`;
    }).join("")}</div>`;
  }

  function dibujaColumnas(raiz, l, desde, paso = 0.045) {
    raiz.querySelectorAll(".barra").forEach((b, i) => {
      const k = curva.salida(tramo(l, desde + i * paso, desde + i * paso + 0.8));
      b.style.height = (Number(b.dataset.alto) * k).toFixed(2) + "%";
    });
  }

  const CATEGORIAS = [
    ["Almacén", 128, "#FF9F0A", "1.912 u"],
    ["Bebidas", 74, "#FF3B30", "1.106 u"],
    ["Golosinas", 58, "#BF5AF2", "846 u"],
    ["Lácteos", 41, "#0A84FF", "388 u"],
    ["Panadería", 23, "#C69C6D", "64,2 kg"],
  ];

  function barrasEtiquetadas(datos) {
    const max = Math.max(...datos.map((d) => d[1]));
    return `<ul class="barras">${datos.map(([et, v, color, texto]) => `<li><div class="barras-fila"><span>${et}</span><span class="cifra medio media">${texto}</span></div><div class="barras-pista"><div class="barras-relleno" data-ancho="${((v / max) * 100).toFixed(1)}" style="background:${color}"></div></div></li>`).join("")}</ul>`;
  }

  /** La ventana del programa en Windows, con el Panel adentro. */
  function ventanaEscritorio() {
    const grupos = [
      ["Día a día", [["Panel", "panel", true], ["Caja", "caja"], ["Ventas", "pedidos"], ["Clientes", "clientes"]]],
      ["Depósito", [["Productos", "productos"], ["Movimientos", "movimientos"], ["Vencimientos", "reloj"], ["Recuento", "recuento"], ["Etiquetas", "etiqueta"]]],
      ["Negocio", [["Proveedores", "camion"], ["Gastos", "gastos"], ["Informes", "informes"]]],
    ];
    const reponer = [
      ["Leche La Serenísima 1 L", "mín. 12", "quedan 3", "aviso"],
      ["Aceite Natura 1,5 L", "mín. 6", "sin stock", "alerta"],
      ["Harina Pureza 1 kg", "mín. 10", "quedan 4", "aviso"],
      ["Azúcar Ledesma 1 kg", "mín. 10", "quedan 6", "aviso"],
    ];
    const movs = [
      ["Yerba Playadito 1 kg", "Entrada · Compra · hace 5 min", "+24", true],
      ["Coca-Cola 2,25 L", "Venta · hace 12 min", "−2", false],
      ["Pan francés", "Venta · hace 20 min", "−750 g", false],
      ["Leche La Serenísima 1 L", "Ajuste · Vencida · hace 1 h", "−1", false],
    ];
    return `<div class="ventana ui">
      <div class="ventana-barra">${marcaFija(16)}<span>Visual App</span>
        <span class="controles"><span>${'<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="#424245"/></svg>'}</span><span><svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" fill="none" stroke="#424245"/></svg></span><span><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="#424245"/></svg></span></span>
      </div>
      <div class="escritorio">
        <aside class="lateral">
          <div class="marca-fila">${marcaFija(36)}<span><b>Visual App</b><span class="micro tenue">Almacén Don Carlos</span></span></div>
          ${grupos.map(([tit, secs], gi) => `<div class="grupo" style="${gi ? "margin-top:16px" : ""}"><span class="etiqueta-campo grupo-tit">${tit}</span>${secs.map(([n, i, a]) => `<div class="renglon ${a ? "activa" : ""}">${ic(i, 17)}${n}</div>`).join("")}</div>`).join("")}
          <div class="renglon" style="margin-top:auto">${ic("ajustes", 17)}Configuración</div>
          <div class="quien"><b>Carlos Gómez</b><span class="micro tenue">Dueño</span><span class="chico suave" style="display:flex;align-items:center;gap:6px;margin-top:6px">${ic("salir", 14)}Salir</span></div>
        </aside>
        <div class="zona-principal">
          <header class="cabecera"><div><h1>Panel</h1><p>Cómo está el negocio hoy: lo que se vendió, lo que falta reponer y lo que hay que revisar.</p></div><span class="boton suave">${ic("recargar", 16)}Actualizar</span></header>
          <div class="contenido">
            <div class="metricas-4">
              ${metrica("Vendido hoy", "$184.350", "47 ventas · 212 unidades", "", "grande")}
              ${metrica("Stock a precio de venta", "$4.812.600", "Costó $3.126.900", "", "grande")}
              ${metrica("Productos", "386", "5.214 unidades en depósito", "", "grande")}
              ${metrica("Caja", "Turno 128", "31 ventas · deberían haber $96.420", "exito", "grande")}
            </div>
            <div class="pendientes">
              <span class="pastilla t-aviso">$38.200 fiados ${ic("flecha-derecha", 13)}</span>
              <span class="pastilla t-alerta">$126.500 a proveedores ${ic("flecha-derecha", 13)}</span>
              <span class="etiqueta suelta t-aviso"><b class="cifra">7</b>por reponer ${ic("flecha-derecha", 13)}</span>
              <span class="etiqueta suelta t-alerta"><b class="cifra">2</b>vencidos ${ic("flecha-derecha", 13)}</span>
              <span class="etiqueta suelta t-aviso"><b class="cifra">4</b>por vencer ${ic("flecha-derecha", 13)}</span>
            </div>
            <div class="graficos">
              <div class="hoja"><div class="hoja-cab"><h2>Ventas de los últimos catorce días</h2></div><div class="hoja-cuerpo">${columnas(false)}</div></div>
              <div class="hoja"><div class="hoja-cab"><h2>Stock por categoría</h2></div><div class="hoja-cuerpo">${barrasEtiquetadas(CATEGORIAS.slice(0, 4))}</div></div>
            </div>
            <div class="listas">
              <div class="hoja"><div class="hoja-cab"><h2>Para reponer</h2><span class="chico suave">Ver todo</span></div>${reponer.map(([n, m, e, t]) => `<div class="lista-fila"><span>${n}</span><span style="display:flex;gap:8px;align-items:center"><span class="cifra suave">${m}</span><span class="etiqueta t-${t}">${e}</span></span></div>`).join("")}</div>
              <div class="hoja"><div class="hoja-cab"><h2>Últimos movimientos</h2><span class="chico suave">Ver todo</span></div>${movs.map(([n, d, c, suma]) => `<div class="lista-fila"><span><span style="display:block">${n}</span><span class="chico suave">${d}</span></span><span class="cifra medio" style="color:var(--${suma ? "exito" : "alerta"}-texto)">${c}</span></div>`).join("")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ─────────────────────────────  Fondo claro  ─────────────────────────────
  // Tres luces de color muy suaves que se mueven detrás de las tarjetas.
  const fondo = crea(`<div class="capa" id="fondo-claro">
    <div class="mancha" style="width:1100px;height:1100px;background:radial-gradient(circle,rgba(59,134,255,.20),rgba(59,134,255,0) 68%)"></div>
    <div class="mancha" style="width:1000px;height:1000px;background:radial-gradient(circle,rgba(123,97,255,.14),rgba(123,97,255,0) 68%)"></div>
    <div class="mancha" style="width:900px;height:900px;background:radial-gradient(circle,rgba(0,190,255,.12),rgba(0,190,255,0) 68%)"></div>
  </div>`);
  escenario.appendChild(fondo);
  const manchas = $$(".mancha", fondo);
  function dibujaFondo(t) {
    const pos = [
      [-300 + Math.sin(t * 0.21) * 160, 200 + Math.cos(t * 0.17) * 220],
      [420 + Math.cos(t * 0.19) * 180, 900 + Math.sin(t * 0.23) * 260],
      [-100 + Math.sin(t * 0.27 + 2) * 200, 1300 + Math.cos(t * 0.2 + 1) * 200],
    ];
    manchas.forEach((m, i) => (m.style.transform = `translate3d(${pos[i][0].toFixed(1)}px,${pos[i][1].toFixed(1)}px,0)`));
  }

  // ═════════════════════════════  1 · La marca  ═════════════════════════════
  {
    const e = escena("s1", 0, 4.0, `
      <div class="capa" style="background:#000"></div>
      <div class="capa" id="s1-polvo"></div>
      <div class="abs" id="s1-brillo" style="left:-160px;top:120px;width:1400px;height:1400px;border-radius:50%;background:radial-gradient(circle,rgba(30,105,240,.62) 0%,rgba(0,80,206,.22) 34%,rgba(0,80,206,0) 66%)"></div>
      <div class="abs" id="s1-logo" style="left:390px;top:670px;width:300px;height:300px">${marcaAnimada("s1")}</div>
      <div class="abs centro-x titular" id="s1-nombre" style="top:1000px;color:#fff;font-size:150px">Visual App</div>
      <div class="abs centro-x bajada" id="s1-bajada" style="top:1200px;color:#A1A1A6;font-size:46px">Stock, caja y ventas para tu negocio.</div>
    `);
    const polvo1 = polvo($("#s1-polvo"), 46, 7);
    const brillo = $("#s1-brillo"), logo = $("#s1-logo"), svg = logo.querySelector("svg");
    const nombre = letras($("#s1-nombre")), bajada = palabras($("#s1-bajada"));
    e.dibujar = (l) => {
      polvo1(l, tramo(l, 0.2, 1.4) * (1 - tramo(l, 3.3, 3.8)));
      const kb = curva.salida(tramo(l, 0, 1.6));
      pon(brillo, { s: lerp(0.25, 1, kb) * (1 + 0.035 * Math.sin(l * 2.6)), o: tramo(l, 0, 0.9) * 0.9 * (1 - tramo(l, 3.3, 3.8)) });

      const kc = curva.resorte(tramo(l, 0.2, 1.3), 0.55, 11);
      const salida = curva.entrada(tramo(l, 3.25, 3.9));
      const subir = curva.ida(tramo(l, 1.65, 2.5));
      const s = lerp(1, 0.8, subir) * lerp(1, 17, salida);
      // Al entrar por el cuadro se va al centro de la pantalla: agrandado desde
      // arriba dejaba ver el negro por las esquinas de abajo.
      pon(logo, { y: lerp(-150, 140, curva.ida(tramo(l, 3.25, 3.8))) * subir, s, o: tramo(l, 0.2, 0.45) });
      dibujaMarca(svg, {
        cuadro: lerp(0.45, 1, kc),
        giro: lerp(-14, 0, kc),
        trazo: curva.salida(tramo(l, 0.45, 1.35)),
        relleno: curva.cubica(tramo(l, 1.05, 1.55)),
        adornos: curva.salida(tramo(l, 0.85, 1.6)),
        adornosRelleno: curva.cubica(tramo(l, 1.35, 1.8)),
        estrella: curva.rebote(tramo(l, 1.35, 2.1)),
        destello: Math.sin(Math.PI * tramo(l, 1.45, 2.2)) * 0.9,
        barrido: tramo(l, 1.9, 2.7),
        dibujoO: 1 - tramo(l, 3.25, 3.5),
        luz: 1 - salida,
      });

      revela(nombre, l, 1.95, { paso: 0.045, dur: 0.8, y: 50, blur: 18 });
      revela(bajada, l, 2.45, { paso: 0.06, dur: 0.7, y: 24, blur: 10 });
      escondePiezas(nombre, l, 3.15, { paso: 0.015 });
      escondePiezas(bajada, l, 3.1, { paso: 0.015 });
    };
  }

  // ═══════════════════════  2 · Stock. Caja. Ventas.  ═══════════════════════
  {
    const PALABRAS = [
      { p: "Stock.", i: "productos", d: "Qué hay, qué falta y qué se vence.", fondo: "#0050CE", c: "#fff", ci: "#fff", cd: "rgba(255,255,255,.78)" },
      { p: "Caja.", i: "caja", d: "Cobrá, devolvé y cerrá el turno.", fondo: "#000", c: "#fff", ci: "#3B86FF", cd: "#A1A1A6" },
      { p: "Ventas.", i: "pedidos", d: "Cada venta, con su comprobante.", fondo: "#fff", c: "#1D1D1F", ci: "#0050CE", cd: "#6E6E73" },
    ];
    const e = escena("s2", 4.0, 8.0, `
      <div class="capa" id="s2-fondo"></div>
      ${PALABRAS.map((w, i) => `<div class="abs capa s2-grupo" id="s2-g${i}">
        <div class="abs s2-icono" style="left:445px;top:520px;color:${w.ci}">${icTrazado(w.i, 190, "", 1.5)}</div>
        <div class="abs centro-x titular s2-palabra" style="top:760px;font-size:250px;color:${w.c};letter-spacing:-0.055em">${w.p}</div>
        <div class="abs centro-x bajada s2-desc" style="top:1080px;font-size:50px;color:${w.cd}">${w.d}</div>
      </div>`).join("")}
      <div class="abs capa" id="s2-final">
        <div class="abs" id="s2-insignias" style="left:0;right:0;top:560px;display:flex;justify-content:center;gap:34px">
          ${["productos", "caja", "pedidos"].map((i) => `<div class="insignia">${ic(i, 84, "", "stroke-width:1.6")}</div>`).join("")}
        </div>
        <div class="abs centro-x titular" id="s2-todo" style="top:800px;font-size:136px">Todo en<br><span class="degrade">una sola app.</span></div>
        <div class="abs centro-x bajada" id="s2-todo-bajada" style="top:1130px;font-size:46px">Hecha para el mostrador de tu negocio.</div>
      </div>
    `, { despues: 0.2 });
    const fondoS2 = $("#s2-fondo");
    const grupos = PALABRAS.map((_, i) => ({ g: $(`#s2-g${i}`), icono: $(`#s2-g${i} .s2-icono`), svg: $(`#s2-g${i} svg`), palabra: $(`#s2-g${i} .s2-palabra`), desc: $(`#s2-g${i} .s2-desc`) }));
    const insignias = $$("#s2-insignias .insignia");
    const todo = palabras($("#s2-todo"));
    const todoBajada = $("#s2-todo-bajada");
    const final = $("#s2-final");
    e.dibujar = (l) => {
      const i = Math.min(2, Math.floor(l));
      fondoS2.style.background = l < 3 ? PALABRAS[i].fondo : "#fff";
      fondoS2.style.opacity = (1 - tramo(l, 3.55, 4.0)).toFixed(3);
      grupos.forEach((g, j) => {
        const li = l - j;
        const visible = li >= 0 && li < (j === 2 ? 1.25 : 1);
        g.g.style.display = visible ? "block" : "none";
        if (!visible) return;
        const k = curva.salida(tramo(li, 0, 0.5));
        const deriva = lerp(1, 1.05, tramo(li, 0, 1));
        const sale = curva.entrada(tramo(li, j === 2 ? 0.95 : 0.84, j === 2 ? 1.2 : 1.0));
        pon(g.palabra, { s: lerp(1.22, 1, k) * deriva * lerp(1, 1.1, sale), o: tramo(li, 0, 0.2) * (1 - sale), blur: 18 * (1 - k) + 14 * sale });
        trazar(g.svg, curva.salida(tramo(li, 0.02, 0.6)), 0.3);
        pon(g.icono, { s: lerp(0.7, 1, curva.resorte(tramo(li, 0, 0.7))) * lerp(1, 1.15, sale), y: -20 * sale, o: 1 - sale, blur: 12 * sale });
        entra(g.desc, li, 0.22, 0.6, { y: 30, blur: 10 });
        if (sale > 0) pon(g.desc, { o: 1 - sale, blur: 10 * sale, y: -10 * sale });
      });
      final.style.display = l >= 2.9 ? "block" : "none";
      if (l >= 2.9) {
        insignias.forEach((b, j) => {
          const k = curva.rebote(tramo(l, 2.95 + j * 0.08, 3.75 + j * 0.08));
          pon(b, { s: lerp(0.3, 1, k), o: tramo(l, 2.95 + j * 0.08, 3.1 + j * 0.08), y: lerp(60, 0, k) });
        });
        revela(todo, l, 3.0, { paso: 0.07, dur: 0.7, y: 50, blur: 16 });
        entra(todoBajada, l, 3.3, 0.6, { y: 24 });
        const sale = curva.entrada(tramo(l, 3.4, 3.8));
        final.style.transform = `translateY(${(-260 * sale).toFixed(1)}px) scale(${lerp(1, 0.92, sale).toFixed(4)})`;
        final.style.opacity = (1 - sale).toFixed(3);
        final.style.filter = sale > 0.01 ? `blur(${(12 * sale).toFixed(2)}px)` : "none";
      }
    };
  }

  // ═════════════════════════════  3 · El Panel  ═════════════════════════════
  {
    const e = escena("s3", 8.0, 14.0, `
      <div class="capa" id="s3-todo">
        <div class="abs centro-x titular" id="s3-titular" style="top:170px">Todo tu negocio,<br><span class="degrade">de un vistazo.</span></div>
        <div class="abs" id="s3-ventana-3d" style="left:40px;top:560px;width:1000px;height:625px;transform-origin:580px 140px">
          <div id="s3-ventana" style="width:1440px;height:900px;transform:scale(0.69445);transform-origin:0 0">${ventanaEscritorio()}</div>
        </div>
        <div class="abs" id="s3-grande" style="left:60px;top:470px;width:960px">
          <div class="ui" style="zoom:2.4;width:400px">
            <div class="metricas-2">
              ${metrica("Vendido hoy", '<span id="s3-v0">$0</span>', "47 ventas · 212 unidades")}
              ${metrica("Stock a precio de venta", '<span id="s3-v1">$0</span>', "Costó $3.126.900")}
              ${metrica("Productos", '<span id="s3-v2">0</span>', "5.214 unidades en depósito")}
              ${metrica("Caja", "Turno 128", "31 ventas · deberían haber $96.420", "exito")}
            </div>
            <div class="pendientes" id="s3-chips" style="margin-top:14px">
              <span class="pastilla t-aviso">$38.200 fiados ${ic("flecha-derecha", 13)}</span>
              <span class="etiqueta suelta t-aviso"><b class="cifra">7</b>por reponer ${ic("flecha-derecha", 13)}</span>
              <span class="etiqueta suelta t-alerta"><b class="cifra">2</b>vencidos ${ic("flecha-derecha", 13)}</span>
              <span class="etiqueta suelta t-aviso"><b class="cifra">4</b>por vencer ${ic("flecha-derecha", 13)}</span>
            </div>
            <div class="hoja" id="s3-grafico" style="margin-top:14px">
              <div class="hoja-cab"><h2>Ventas de los últimos catorce días</h2></div>
              <div class="hoja-cuerpo" style="position:relative">${columnas(true)}<div class="globo" id="s3-globo">$184.350</div></div>
            </div>
          </div>
        </div>
      </div>
    `, { antes: 0.45, despues: 0.05 });
    const todo = $("#s3-todo");
    const titular = palabras($("#s3-titular"));
    const v3d = $("#s3-ventana-3d"), ventana = $("#s3-ventana");
    const grande = $("#s3-grande");
    const tarjetas = $$("#s3-grande .metrica");
    const valores = [[$("#s3-v0"), 184350, true], [$("#s3-v1"), 4812600, true], [$("#s3-v2"), 386, false]];
    const chips = $$("#s3-chips > span");
    const grafico = $("#s3-grafico"), globo = $("#s3-globo");
    const ventanaColumnas = $(".columnas", ventana), ventanaBarras = $$(".barras-relleno", ventana);
    const ventanaMetricas = $$(".metricas-4 .metrica", ventana);
    e.dibujar = (l) => {
      // La ventana sube acostada y se endereza.
      const kv = curva.salida(tramo(l, -0.25, 0.95));
      const zoom = curva.entrada(tramo(l, 1.05, 1.75));
      pon(v3d, {
        p: 2600,
        y: lerp(900, 0, kv) + lerp(0, 130, zoom),
        rx: lerp(38, 10, kv) * (1 - zoom) + lerp(0, 0, zoom),
        s: lerp(0.9, 1, kv) * lerp(1, 3.1, zoom),
        o: tramo(l, -0.25, 0.05) * (1 - tramo(l, 1.45, 1.75)),
        blur: 18 * tramo(l, 1.3, 1.75),
      });
      ventanaMetricas.forEach((m, i) => entra(m, l, 0.35 + i * 0.07, 0.6, { y: 20, blur: 6 }));
      dibujaColumnas(ventanaColumnas, l, 0.5, 0.03);
      ventanaBarras.forEach((b, i) => (b.style.width = (Number(b.dataset.ancho) * curva.salida(tramo(l, 0.6 + i * 0.06, 1.3 + i * 0.06))).toFixed(1) + "%"));

      revela(titular, l, 0.0, { paso: 0.07, dur: 0.75, y: 44, blur: 16 });

      // Las tarjetas grandes aparecen cuando la cámara atraviesa la ventana.
      const dentro = l > 1.3;
      grande.style.display = dentro ? "block" : "none";
      if (dentro) {
        const deriva = tramo(l, 1.3, 6.0);
        grande.style.transform = `translateY(${lerp(10, -14, deriva).toFixed(2)}px) scale(${lerp(0.985, 1.015, deriva).toFixed(4)})`;
        tarjetas.forEach((t, i) => entra(t, l, 1.45 + i * 0.09, 0.9, { y: 90, s: 0.9, blur: 16, curva: (k) => curva.resorte(k, 0.7, 10) }));
        valores.forEach(([el, fin, plata], i) => {
          const k = curva.salida(tramo(l, 1.6 + i * 0.09, 2.9 + i * 0.09));
          el.textContent = plata ? pesos(fin * k) : miles(fin * k);
        });
        chips.forEach((c, i) => {
          const k = curva.rebote(tramo(l, 2.3 + i * 0.08, 3.0 + i * 0.08));
          pon(c, { s: lerp(0.4, 1, k), o: tramo(l, 2.3 + i * 0.08, 2.45 + i * 0.08) });
        });
        entra(grafico, l, 2.0, 0.9, { y: 120, s: 0.95, blur: 14 });
        dibujaColumnas(grafico, l, 2.35);
        const kg = curva.rebote(tramo(l, 3.25, 3.85));
        pon(globo, { s: lerp(0.3, 1, kg), y: lerp(20, 0, kg), o: tramo(l, 3.25, 3.4) });
      }

      // Se va hacia la izquierda: la caja entra empujando.
      const sale = curva.ida(tramo(l, 5.45, 6.05));
      todo.style.transform = `translateX(${(-1080 * sale).toFixed(1)}px)`;
    };
  }

  // ══════════════════════════════  4 · La caja  ══════════════════════════════
  {
    const FILAS = [
      { n: "Coca-Cola 2,25 L", d: "$3.200 · quedan 46", q: "1", imp: 3200 },
      { n: "Pan francés", d: "$2.800 el kilo · quedan 18,4 kg", q: "750", imp: 2100, peso: true },
      { n: "Yerba Playadito 1 kg", d: "$4.950 · quedan 24", q: "1", imp: 4950 },
    ];
    const codigoBarras = (semilla) => {
      const r = azar(semilla);
      let x = 0, rects = "";
      rects += `<rect x="0" y="0" width="3" height="100"/><rect x="6" y="0" width="3" height="100"/>`;
      x = 12;
      while (x < 280) {
        const w = [2, 3, 5, 7][Math.floor(r() * 4)];
        rects += `<rect x="${x}" y="0" width="${w}" height="${x > 140 && x < 150 ? 100 : 88}"/>`;
        x += w + [2, 3, 4][Math.floor(r() * 3)];
      }
      rects += `<rect x="${x}" y="0" width="3" height="100"/><rect x="${x + 6}" y="0" width="3" height="100"/>`;
      return `<svg viewBox="0 0 ${x + 9} 100" width="100%" height="100%" preserveAspectRatio="none" fill="#1D1D1F">${rects}</svg>`;
    };
    const e = escena("s4", 14.0, 22.0, `
      <div class="capa" id="s4-todo">
        <div class="abs centro-x titular" id="s4-titular" style="top:170px">Cobrá<br><span class="degrade">en segundos.</span></div>
        <div class="abs centro-x titular" id="s4-titular2" style="top:170px">Y el comprobante,<br><span class="degrade">listo para imprimir.</span></div>
        <div class="abs" id="s4-tarjeta" style="left:60px;top:470px;width:960px">
          <div class="ui" style="zoom:2.4;width:400px">
            <div class="banner-exito" id="s4-banner"><div class="banner-in">
              <span style="display:flex;gap:8px;align-items:flex-start">${ic("listo", 17, "", "margin-top:2px")}<span>Venta #1.482 cobrada por $15.200 · vuelto $4.800</span></span>
              <span class="boton suave chico" style="border-color:var(--exito-linea)">${ic("imprimir", 14)}Comprobante</span>
            </div></div>
            <div class="hoja">
              <div class="hoja-cab"><h2>Cobrar</h2><span class="etiqueta t-exito">Turno 128</span></div>
              <div class="hoja-cuerpo" style="display:flex;flex-direction:column;gap:12px">
                <div class="campo" id="s4-buscar">${ic("buscar", 16, "tenue")}<span class="ph" id="s4-ph">Buscar producto o escanear código</span><span id="s4-escrito"></span><span class="cursor-texto" id="s4-cursor"></span><span class="anillo" id="s4-anillo"></span></div>
                <div class="lector" id="s4-lector">${ic("codigo", 18, "", "color:var(--acento)")}<span id="s4-lector-texto"><span class="medio">Lector de códigos listo.</span> <span class="suave">Pasá el producto por el lector en cualquier momento.</span></span></div>
                <div class="lista-caja" id="s4-lista">
                  <div class="vacio" id="s4-vacio"><b>Sin renglones</b><span class="chico suave">Buscá el producto por nombre o pasá el lector de códigos.</span></div>
                  ${FILAS.map((f, i) => `<div class="fila-caja" id="s4-f${i}"><div class="fila-caja-in">
                    <span class="fc-nombre"><span style="display:block">${f.n}</span><span class="chico suave" style="display:block">${f.d}</span></span>
                    <span class="fc-controles">
                      <span class="paso"><span class="paso-b">${ic("menos", 14)}</span><span class="paso-n cifra"><span id="s4-q${i}">${f.q}</span></span><span class="paso-b" id="s4-mas${i}">${ic("mas", 14)}</span></span>
                      <span class="fc-importe cifra medio" id="s4-imp${i}">${pesos(f.imp)}</span>
                      <span class="suave" style="padding:4px">${ic("cerrar", 15)}</span>
                    </span>
                  </div></div>`).join("")}
                </div>
                <div class="total-fila">
                  <div><span class="etiqueta-campo">Total</span><div class="cifra total-grande" id="s4-total">$0</div></div>
                  <div style="display:flex;gap:8px"><span class="boton fantasma">Vaciar</span><span class="boton principal" id="s4-cobrar">${ic("caja", 16)}Cobrar</span></div>
                </div>
              </div>
              <div class="menu" id="s4-menu">
                <div class="menu-item activo"><span><span style="display:block" class="medio">Pan francés</span><span class="chico suave">$2.800 el kilo · quedan 18,4 kg</span></span><span class="etiqueta t-dato">Enter</span></div>
                <div class="menu-item"><span><span style="display:block">Pan lactal Bimbo 550 g</span><span class="chico suave">$3.100 · quedan 12</span></span></div>
                <div class="menu-item"><span><span style="display:block">Pan dulce Terrabusi</span><span class="chico suave">$6.900 · quedan 8</span></span></div>
              </div>
            </div>
          </div>
        </div>
        ${[0, 1].map((i) => `<div class="abs codigo-tarjeta" id="s4-codigo${i}"><div class="codigo-barras">${codigoBarras(11 + i)}</div><div class="codigo-numero cifra">${i ? "7 790387 000215" : "7 790895 000997"}</div><div class="laser"></div><div class="codigo-destello"></div></div>`).join("")}
        <div class="capa" id="s4-velo" style="background:rgba(0,0,0,.25)"></div>
        <div class="abs" id="s4-dialogo" style="left:60px;top:300px;width:960px">
          <div class="ui" style="zoom:2.2;width:436px">
            <div class="dialogo">
              <div class="dlg-cab"><div><h2>Cobrar</h2><p class="chico suave" style="margin:2px 0 0">3 renglones · Mostrador</p></div><span class="boton fantasma chico" style="width:32px;padding:0">${ic("cerrar", 14)}</span></div>
              <div class="dlg-cuerpo">
                <div class="total-caja"><span class="etiqueta-campo">Total</span><span class="cifra total-grande">$15.200</span></div>
                <div style="display:flex;align-items:flex-end;gap:8px">
                  <div style="flex:1"><span class="etiqueta-campo" style="margin-bottom:6px">Descuento</span><div class="campo"><span class="ph">500</span></div></div>
                  <div class="seg-peso"><span class="sel">$</span><span>%</span></div>
                </div>
                <div>
                  <span class="etiqueta-campo" style="margin-bottom:8px">Cómo paga</span>
                  <div class="tramo"><div class="medios"><span class="medio-pago sel">Efectivo</span><span class="medio-pago">Transferencia</span><span class="medio-pago">Tarjeta</span><span class="medio-pago">Otro</span></div><div class="campo monto cifra">15200</div></div>
                  <div style="margin-top:8px"><span class="boton fantasma chico" style="padding-left:6px">${ic("mas", 14)}Dividir el pago</span></div>
                </div>
                <div class="grilla-2">
                  <div><span class="etiqueta-campo" style="margin-bottom:6px">Con cuánto paga</span><div class="campo cifra" id="s4-recibido"><span class="ph" id="s4-recibido-ph">0</span><span id="s4-recibido-txt"></span><span class="cursor-texto" id="s4-cursor2"></span><span class="anillo" id="s4-anillo2"></span></div></div>
                  <div style="display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:2px"><span class="etiqueta-campo">Vuelto</span><span class="cifra vuelto" id="s4-vuelto">$0</span></div>
                </div>
                <div class="fiado-caja"><span class="casilla"></span><span><span style="display:block">Queda fiado</span><span class="chico suave">Se lleva la mercadería y paga después. Lo que entregue ahora va arriba; el resto queda en su cuenta.</span></span></div>
              </div>
              <div class="dlg-pie"><span class="boton suave">Cancelar</span><span class="boton principal" id="s4-cobrar2"><span id="s4-cobrar2-txt">Cobrar $15.200</span><span class="giro" id="s4-giro"></span></span></div>
            </div>
          </div>
        </div>
        <div class="abs" id="s4-ticket-botones" style="left:60px;top:470px;width:960px">
          <div class="ui" style="zoom:2.2;width:436px;display:flex;justify-content:space-between;align-items:center">
            <span class="suave">← Volver a ventas</span>
            <span style="display:flex;gap:8px"><span class="boton suave">${ic("archivo", 16)}Guardar PDF</span><span class="boton principal">${ic("imprimir", 16)}Imprimir</span></span>
          </div>
        </div>
        <div class="abs" id="s4-ticket" style="left:120px;top:590px;width:840px">
          <div class="ui" style="zoom:2.2;width:382px">
            <article class="hoja ticket">
              <header class="ticket-cab"><h1>Almacén Don Carlos</h1><p class="chico suave">Av. San Martín 1234 · Tel. 4455-6677</p><p style="margin:12px 0 0">Comprobante <span class="cifra medio">#1.482</span></p><p class="chico suave">24 sep · 18:42</p></header>
              <section class="ticket-cliente"><p><span class="suave">Cliente: </span>Consumidor final</p><p class="chico suave">Turno de caja 128</p></section>
              <div class="ticket-items">
                ${[["Coca-Cola 2,25 L", "1 u × $3.200", "$3.200"], ["Pan francés", "750 g × $2.800 el kilo", "$2.100"], ["Yerba Playadito 1 kg", "2 u × $4.950", "$9.900"]].map(([n, d, v]) => `<div class="ticket-item"><span><span style="display:block">${n}</span><span class="chico suave">${d}</span></span><span class="cifra">${v}</span></div>`).join("")}
              </div>
              <div class="ticket-total"><span style="font-size:16px">Total</span><span class="cifra" style="font-size:28px;line-height:34px;letter-spacing:-0.021em">$15.200</span></div>
              <div class="ticket-pagos"><div><span class="suave">Efectivo</span><span class="cifra">$15.200</span></div><div><span class="suave">Recibido</span><span class="cifra">$20.000</span></div><div class="medio"><span>Vuelto</span><span class="cifra">$4.800</span></div></div>
              <p class="chico suave" style="text-align:center;margin:20px 0 0">Gracias por la compra. Este comprobante no es una factura.</p>
            </article>
          </div>
        </div>
        <div class="capa" id="s4-puntero" style="pointer-events:none"></div>
      </div>
    `, { antes: 0.6, despues: 0.1 });

    const todo = $("#s4-todo");
    const titular = palabras($("#s4-titular")), titular2 = palabras($("#s4-titular2"));
    const tarjeta = $("#s4-tarjeta");
    const anillo = $("#s4-anillo"), ph = $("#s4-ph"), escrito = $("#s4-escrito"), cursorTexto = $("#s4-cursor");
    const lectorTexto = $("#s4-lector-texto"), lector = $("#s4-lector");
    const vacio = $("#s4-vacio");
    const filas = FILAS.map((_, i) => ({ el: $(`#s4-f${i}`), in: $(`#s4-f${i} .fila-caja-in`), q: $(`#s4-q${i}`), imp: $(`#s4-imp${i}`), mas: $(`#s4-mas${i}`) }));
    const alturas = perezoso(() => filas.map((f) => f.in.offsetHeight));
    const total = $("#s4-total"), cobrar = $("#s4-cobrar");
    const menu = $("#s4-menu"), menuActivo = $("#s4-menu .menu-item.activo");
    const codigos = [0, 1].map((i) => ({ el: $(`#s4-codigo${i}`), laser: $(`#s4-codigo${i} .laser`), destello: $(`#s4-codigo${i} .codigo-destello`) }));
    const velo = $("#s4-velo"), dialogo = $("#s4-dialogo");
    const recibidoPh = $("#s4-recibido-ph"), recibidoTxt = $("#s4-recibido-txt"), cursor2 = $("#s4-cursor2"), anillo2 = $("#s4-anillo2");
    const vuelto = $("#s4-vuelto"), cobrar2 = $("#s4-cobrar2"), cobrar2Txt = $("#s4-cobrar2-txt"), giro = $("#s4-giro");
    const banner = $("#s4-banner"), bannerIn = $("#s4-banner .banner-in");
    const alturaBanner = perezoso(() => bannerIn.offsetHeight + 16);
    const ticket = $("#s4-ticket"), ticketBotones = $("#s4-ticket-botones");
    const capaPuntero = $("#s4-puntero"), recibidoCampo = $("#s4-recibido"), buscarCampo = $("#s4-buscar");
    const dibujaPuntero = puntero(capaPuntero);

    // Los tiempos de la escena, en segundos locales.
    const T = { scan1: 0.85, busca: 1.35, enter: 1.95, scan2: 2.95, mas: 3.75, cobrar: 4.25, abre: 4.3, recibido: 4.9, cobra: 5.75, cierra: 5.88, ticket: 6.5 };
    const escribe = (texto, l, desde, paso) => texto.slice(0, Math.max(0, Math.min(texto.length, Math.floor((l - desde) / paso) + 1)));

    e.dibujar = (l) => {
      // Entra empujando al Panel.
      const kIn = curva.ida(tramo(l, -0.55, 0.05));
      const kSale = curva.entrada(tramo(l, 7.45, 7.95));
      todo.style.transform = `translateX(${(1080 * (1 - kIn)).toFixed(1)}px) translateY(${(-240 * kSale).toFixed(1)}px)`;
      todo.style.opacity = (1 - kSale).toFixed(3);
      todo.style.filter = kSale > 0.01 ? `blur(${(14 * kSale).toFixed(2)}px)` : "none";

      revela(titular, l, 0.0, { paso: 0.08, dur: 0.7, y: 44, blur: 16 });
      escondePiezas(titular, l, T.abre - 0.05, { paso: 0.03 });
      if (l >= T.ticket - 0.2) revela(titular2, l, T.ticket, { paso: 0.06, dur: 0.7, y: 44, blur: 16 });
      else titular2.forEach((p) => pon(p, { o: 0 }));

      // El buscador toma el foco.
      anillo.style.opacity = (tramo(l, 0.3, 0.5) * (1 - tramo(l, T.abre, T.abre + 0.2))).toFixed(3);

      // Primer código: la tarjeta entra, el láser la barre, pita.
      const scan = (c, t0) => {
        const kIn = curva.resorte(tramo(l, t0 - 0.45, t0 + 0.1), 0.6, 11);
        const vuela = curva.entrada(tramo(l, t0 + 0.08, t0 + 0.38));
        // Vuela a meterse en el buscador, que es por donde entra la lectura.
        const destino = lugar(buscarCampo, capaPuntero);
        const base = [610, 720];
        const x = lerp(base[0] + 700, base[0], kIn), y = base[1];
        pon(c.el, {
          x: lerp(x, destino[0] - 210, vuela),
          y: lerp(y, destino[1] - 125, vuela),
          r: lerp(14, -5, kIn) * (1 - vuela),
          s: lerp(1, 0.25, vuela),
          o: tramo(l, t0 - 0.45, t0 - 0.3) * (1 - tramo(l, t0 + 0.25, t0 + 0.38)),
          blur: 6 * vuela,
        });
        const on = tramo(l, t0 - 0.2, t0 - 0.15) * (1 - tramo(l, t0 + 0.02, t0 + 0.08));
        const parpadeo = 0.75 + 0.25 * Math.sin(l * 90);
        c.laser.style.opacity = (on * parpadeo).toFixed(3);
        c.laser.style.transform = `translateY(${(Math.sin((l - t0) * 22) * 18).toFixed(1)}px)`;
        c.destello.style.opacity = (Math.sin(Math.PI * tramo(l, t0 - 0.02, t0 + 0.18)) * 0.9).toFixed(3);
      };
      scan(codigos[0], T.scan1);
      scan(codigos[1], T.scan2);

      // El renglón que entra se abre desde cero.
      const abre = (i, t0) => {
        const k = curva.salida(tramo(l, t0, t0 + 0.55));
        filas[i].el.style.height = (alturas()[i] * k).toFixed(2) + "px";
        filas[i].el.style.borderBottomWidth = k > 0.01 ? "1px" : "0";
        pon(filas[i].in, { y: lerp(-24, 0, k), o: tramo(l, t0 + 0.05, t0 + 0.3), blur: 8 * (1 - k) });
        // Destello azul del renglón recién agregado.
        filas[i].el.style.backgroundColor = `rgba(0,80,206,${(0.1 * (1 - tramo(l, t0 + 0.3, t0 + 1.2)) * (l > t0 ? 1 : 0)).toFixed(3)})`;
      };
      abre(0, T.scan1 + 0.1);
      abre(1, T.enter + 0.1);
      abre(2, T.scan2 + 0.1);
      vacio.style.display = l < T.scan1 + 0.1 ? "flex" : "none";
      pon(vacio, { o: 1 - tramo(l, T.scan1 - 0.05, T.scan1 + 0.1) });

      // Lo que dice el lector.
      if (l < T.scan1) lectorTexto.innerHTML = '<span class="medio">Lector de códigos listo.</span> <span class="suave">Pasá el producto por el lector en cualquier momento.</span>';
      else if (l < T.scan2) lectorTexto.innerHTML = '<span class="media">Leído: <span class="medio" style="color:var(--tinta)">Coca-Cola 2,25 L</span></span><span class="cifra suave"> · 7790895000997</span>';
      else lectorTexto.innerHTML = '<span class="media">Leído: <span class="medio" style="color:var(--tinta)">Yerba Playadito 1 kg</span></span><span class="cifra suave"> · 7790387000215</span>';
      const pulso = Math.max(Math.sin(Math.PI * tramo(l, T.scan1, T.scan1 + 0.5)), Math.sin(Math.PI * tramo(l, T.scan2, T.scan2 + 0.5)));
      lector.style.backgroundColor = `rgba(0,80,206,${(0.08 * pulso).toFixed(3)})`;
      lector.style.borderColor = pulso > 0.02 ? `rgba(0,80,206,${(0.2 + 0.4 * pulso).toFixed(3)})` : "";

      // Buscar "pan" y elegir con Enter.
      const texto = l >= T.busca && l < T.enter + 0.1 ? escribe("pan", l, T.busca, 0.08) : "";
      escrito.textContent = texto;
      ph.style.display = texto ? "none" : "inline";
      cursorTexto.style.opacity = l > 0.4 && l < T.abre && Math.floor(l * 2.2) % 2 === 0 ? 1 : 0;
      const km = curva.salida(tramo(l, T.busca + 0.22, T.busca + 0.5));
      const cierraMenu = curva.entrada(tramo(l, T.enter + 0.02, T.enter + 0.18));
      pon(menu, { y: lerp(-8, 0, km), s: lerp(0.97, 1, km) * lerp(1, 0.98, cierraMenu), o: tramo(l, T.busca + 0.22, T.busca + 0.35) * (1 - cierraMenu) });
      menuActivo.style.backgroundColor = `rgba(0,80,206,${(0.08 + 0.1 * Math.sin(Math.PI * tramo(l, T.enter - 0.1, T.enter + 0.1))).toFixed(3)})`;

      // Los gramos de la balanza y el "más" de la yerba.
      filas[1].q.textContent = escribe("750", l, T.enter + 0.4, 0.07) || "0";
      filas[1].imp.textContent = pesos(l < T.enter + 0.4 ? 0 : [0, 1960, 2100][Math.min(2, Math.floor((l - T.enter - 0.4) / 0.07))]);
      const dosYerbas = l >= T.mas;
      filas[2].q.textContent = dosYerbas ? "2" : "1";
      pon(filas[2].q, { s: 1 + 0.35 * Math.sin(Math.PI * tramo(l, T.mas, T.mas + 0.25)) });
      const kImp = curva.salida(tramo(l, T.mas, T.mas + 0.4));
      filas[2].imp.textContent = pesos(lerp(4950, 9900, kImp));
      filas[2].mas.style.backgroundColor = `rgba(0,0,0,${(0.06 * Math.sin(Math.PI * tramo(l, T.mas - 0.05, T.mas + 0.2))).toFixed(3)})`;

      // El total sigue a cada renglón.
      const pasos = [[T.scan1 + 0.1, 0, 3200], [T.enter + 0.4, 3200, 5300], [T.scan2 + 0.1, 5300, 10250], [T.mas, 10250, 15200]];
      let v = 0;
      for (const [t0, a, b] of pasos) if (l >= t0) v = lerp(a, b, curva.salida(tramo(l, t0, t0 + 0.45)));
      total.textContent = pesos(l >= T.cierra + 0.1 ? lerp(15200, 0, tramo(l, T.cierra + 0.1, T.cierra + 0.2)) : v);
      pon(total, { s: 1 + 0.05 * pasos.reduce((m, [t0]) => Math.max(m, Math.sin(Math.PI * tramo(l, t0, t0 + 0.3))), 0) });
      cobrar.style.transform = `scale(${(1 - 0.03 * Math.sin(Math.PI * tramo(l, T.cobrar - 0.08, T.cobrar + 0.14))).toFixed(4)})`;

      // Vendido: los renglones se van y aparece el aviso verde arriba.
      if (l >= T.cierra + 0.1) {
        const kv = curva.ida(tramo(l, T.cierra + 0.1, T.cierra + 0.45));
        filas.forEach((f, i) => {
          f.el.style.height = (alturas()[i] * (1 - kv)).toFixed(2) + "px";
          f.in.style.opacity = (1 - kv).toFixed(3);
        });
        vacio.style.display = kv > 0.9 ? "flex" : "none";
        pon(vacio, { o: tramo(l, T.cierra + 0.35, T.cierra + 0.55) });
      }
      const kb = curva.salida(tramo(l, T.cierra + 0.1, T.cierra + 0.6));
      banner.style.height = (alturaBanner() * kb).toFixed(2) + "px";
      pon(bannerIn, { y: lerp(-12, 0, kb), o: tramo(l, T.cierra + 0.2, T.cierra + 0.45), s: lerp(0.97, 1, kb) });

      // El diálogo de cobro.
      const kd = curva.resorte(tramo(l, T.abre, T.abre + 0.7), 0.72, 11);
      const cierra = curva.entrada(tramo(l, T.cierra, T.cierra + 0.2));
      const abierto = l >= T.abre && l < T.cierra + 0.22;
      dialogo.style.display = abierto ? "block" : "none";
      if (abierto) pon(dialogo, { y: lerp(40, 0, kd) + 30 * cierra, s: lerp(0.94, 1, kd) * lerp(1, 0.94, cierra), o: tramo(l, T.abre, T.abre + 0.14) * (1 - cierra), blur: 12 * cierra });
      const kVelo = tramo(l, T.abre, T.abre + 0.25) * (1 - tramo(l, T.cierra, T.cierra + 0.3));
      velo.style.opacity = kVelo.toFixed(3);
      velo.style.display = kVelo > 0.001 ? "block" : "none";
      tarjeta.style.filter = kVelo > 0.01 ? `blur(${(3 * kVelo).toFixed(2)}px)` : "none";

      const recibido = escribe("20000", l, T.recibido + 0.1, 0.06);
      recibidoTxt.textContent = recibido ? miles(Number(recibido)) : "";
      recibidoPh.style.display = recibido ? "none" : "inline";
      anillo2.style.opacity = tramo(l, T.recibido - 0.05, T.recibido + 0.08).toFixed(3);
      cursor2.style.opacity = l > T.recibido && l < T.cobra && Math.floor(l * 2.2) % 2 === 0 ? 1 : 0;
      const kVuelto = curva.salida(tramo(l, T.recibido + 0.45, T.recibido + 0.95));
      vuelto.textContent = pesos(4800 * kVuelto);
      pon(vuelto, { s: 1 + 0.12 * Math.sin(Math.PI * tramo(l, T.recibido + 0.8, T.recibido + 1.15)) });
      vuelto.style.color = kVuelto > 0.99 ? "var(--exito-texto)" : "var(--tinta)";

      const cobrando = l >= T.cobra + 0.05;
      cobrar2Txt.style.opacity = cobrando ? 0 : 1;
      giro.style.opacity = cobrando ? 1 : 0;
      giro.style.transform = `rotate(${(l * 720).toFixed(1)}deg)`;
      cobrar2.style.transform = `scale(${(1 - 0.04 * Math.sin(Math.PI * tramo(l, T.cobra - 0.08, T.cobra + 0.14))).toFixed(4)})`;

      // El puntero, medido sobre los lugares reales en cada cuadro: los
      // renglones se abren y empujan lo de abajo.
      const posMas = lugar(filas[2].mas, capaPuntero), posCobrar = lugar(cobrar, capaPuntero, 0.4, 0.6);
      const pr = lugar(recibidoCampo, capaPuntero, 0.35, 0.6), pb = lugar(cobrar2, capaPuntero, 0.45, 0.6);
      dibujaPuntero(l, [
        [T.mas - 0.6, 980, 1500],
        [T.mas - 0.02, posMas[0], posMas[1] + 10],
        [T.cobrar - 0.4, posMas[0], posMas[1] + 10],
        [T.cobrar - 0.02, posCobrar[0], posCobrar[1] + 8],
        [T.recibido - 0.45, posCobrar[0], posCobrar[1] + 8],
        [T.recibido - 0.02, pr[0], pr[1]],
        [T.cobra - 0.5, pr[0], pr[1]],
        [T.cobra - 0.02, pb[0], pb[1]],
        [T.cobra + 1, pb[0] + 60, pb[1] + 120],
      ], [T.mas, T.cobrar, T.recibido, T.cobra], T.mas - 0.6, T.cobra + 0.35);

      // El comprobante sube acostado y se endereza.
      const kt = curva.salida(tramo(l, T.ticket, T.ticket + 0.95));
      const ticketVisible = l >= T.ticket - 0.05;
      ticket.style.display = ticketVisible ? "block" : "none";
      ticketBotones.style.display = ticketVisible ? "block" : "none";
      if (ticketVisible) {
        pon(ticket, { p: 2200, y: lerp(1200, 0, kt), rx: lerp(45, 0, kt), s: lerp(0.9, 1, kt), o: tramo(l, T.ticket, T.ticket + 0.2) });
        entra(ticketBotones, l, T.ticket + 0.45, 0.6, { y: 30 });
        const hundir = curva.salida(tramo(l, T.ticket, T.ticket + 0.8));
        pon(tarjeta, { s: lerp(1, 0.9, hundir), y: 60 * hundir, o: 1 - 0.85 * hundir, blur: 10 * hundir });
      } else pon(tarjeta, { s: 1, o: 1 });
      if (kVelo > 0.01 && !ticketVisible) tarjeta.style.filter = `blur(${(3 * kVelo).toFixed(2)}px)`;
    };
  }

  // ═════════════════════════════  5 · Productos  ═════════════════════════════
  {
    const PRODUCTOS = [
      { n: "Yerba Playadito 1 kg", cat: "Almacén", c: "#FF9F0A", u: "u", p: 4950, nuevo: 5450, s: "stock 24", elegir: true },
      { n: "Coca-Cola 2,25 L", cat: "Bebidas", c: "#FF3B30", u: "u", p: 3200, nuevo: 3520, s: "stock 46", elegir: true },
      { n: "Pan francés", cat: "Panadería", c: "#C69C6D", u: "kg", p: 2800, s: "18,4 kg", kilo: true },
      { n: "Leche La Serenísima 1 L", cat: "Lácteos", c: "#0A84FF", u: "u", p: 1450, t: ["aviso", "quedan 3"] },
      { n: "Aceite Natura 1,5 L", cat: "Almacén", c: "#FF9F0A", u: "u", p: 3990, t: ["alerta", "sin stock"] },
      { n: "Galletitas Oreo 118 g", cat: "Golosinas", c: "#BF5AF2", u: "u", p: 1350, nuevo: 1490, s: "stock 32", elegir: true },
    ];
    const e = escena("s5", 22.0, 27.0, `
      <div class="capa" id="s5-todo">
        <div class="abs centro-x titular" id="s5-titular" style="top:160px">Tu stock,<br><span class="degrade">siempre al día.</span></div>
        <div class="abs" id="s5-buscar" style="left:60px;top:430px;width:960px"><div class="ui" style="zoom:2.3;width:417px">
          <div class="campo">${ic("buscar", 16, "tenue")}<span class="ph">Buscar por nombre, código o descripción</span></div>
        </div></div>
        <div class="abs" id="s5-barra" style="left:60px;top:540px;width:960px"><div class="ui" style="zoom:2.3;width:417px">
          <div class="barra-elegidos"><span class="medio" id="s5-cuenta">1 elegido</span><span class="separador"></span><span class="boton suave chico" id="s5-ajustar">Ajustar precios</span><span class="boton suave chico">Eliminar</span><span class="boton fantasma chico">Limpiar</span></div>
        </div></div>
        <div class="abs" id="s5-lista" style="left:60px;top:540px;width:960px"><div class="ui" style="zoom:2.3;width:417px">
          <div class="hoja">
            ${PRODUCTOS.map((p, i) => `<div class="fila-prod" id="s5-f${i}">
              <span class="casilla" id="s5-c${i}"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 8.4l2.6 2.6L12 5.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/></svg></span>
              <span class="fp-info"><span class="medio" style="display:block">${p.n}</span><span class="chico suave fp-meta"><i class="punto" style="background:${p.c}"></i>${p.cat} · ${p.u}</span></span>
              <span class="fp-der"><span class="cifra medio fp-precio" id="s5-p${i}">${pesos(p.p)}</span>${p.t ? `<span class="etiqueta t-${p.t[0]}">${p.t[1]}</span>` : `<span class="chico suave">${p.kilo ? "el kilo · " : ""}${p.s}</span>`}<span class="sube" id="s5-sube${i}">+10%</span></span>
            </div>`).join("")}
          </div>
        </div></div>
        ${[["+24", "Yerba Playadito 1 kg", "Entrada · Compra a Distribuidora Norte", "exito"], ["−2", "Coca-Cola 2,25 L", "Venta #1.482 · recién", "alerta"]].map(([c, n, d, t], i) => `
          <div class="abs" id="s5-mov${i}" style="left:90px;top:${1560 + i * 150}px;width:900px"><div class="ui" style="zoom:2.2;width:409px">
            <div class="aviso-mov"><span class="aviso-mov-ic t-${t}">${ic(i ? "menos" : "mas", 16)}</span><span style="flex:1;min-width:0"><span class="medio" style="display:block">${n}</span><span class="chico suave">${d}</span></span><span class="cifra medio" style="color:var(--${t}-texto);font-size:16px">${c}</span></div>
          </div></div>`).join("")}
        <div class="capa" id="s5-puntero"></div>
      </div>
    `, { antes: 0.5, despues: 0.05 });
    const todo = $("#s5-todo");
    const titular = palabras($("#s5-titular"));
    const buscar = $("#s5-buscar"), barra = $("#s5-barra"), lista = $("#s5-lista"), cuenta = $("#s5-cuenta");
    const hojaLista = $("#s5-lista .hoja");
    const filas = PRODUCTOS.map((p, i) => ({ p, el: $(`#s5-f${i}`), c: $(`#s5-c${i}`), check: $(`#s5-c${i} path`), precio: $(`#s5-p${i}`), sube: $(`#s5-sube${i}`) }));
    const rodillos = filas.map((f) => (f.p.nuevo ? rodillo(f.precio, f.p.p, f.p.nuevo) : null));
    const movs = [$("#s5-mov0"), $("#s5-mov1")];
    const capaPuntero = $("#s5-puntero"), ajustar = $("#s5-ajustar");
    const dibujaPuntero = puntero(capaPuntero);
    const T = { elige: [1.05, 1.4, 1.75], ajusta: 2.3, sube: 2.45, movs: 3.2 };
    const altoBarra = 118;
    e.dibujar = (l) => {
      const kIn = curva.salida(tramo(l, -0.3, 0.5));
      const kSale = curva.entrada(tramo(l, 4.55, 5.0));
      todo.style.transform = `translateY(${lerp(300, 0, kIn).toFixed(1)}px) scale(${lerp(1, 0.94, kSale).toFixed(4)})`;
      todo.style.opacity = (tramo(l, -0.3, 0.0) * (1 - kSale * 0.6)).toFixed(3);

      revela(titular, l, -0.15, { paso: 0.07, dur: 0.7, y: 44, blur: 16 });
      entra(buscar, l, -0.2, 0.7, { y: 40 });
      // La tarjeta y sus renglones entran juntos: una tarjeta vacía subiendo
      // se lee como una pantalla que no cargó.
      entra(hojaLista, l, -0.25, 0.8, { y: 80, s: 0.96, blur: 12 });
      filas.forEach((f, i) => entra(f.el, l, -0.18 + i * 0.055, 0.8, { y: 60, rx: -50, p: 1400, blur: 10 }));

      // Elegir tres: la casilla se llena y se dibuja el tilde.
      let elegidos = 0;
      filas.filter((f) => f.p.elegir).forEach((f, j) => {
        const t0 = T.elige[j];
        const k = curva.rebote(tramo(l, t0, t0 + 0.5));
        const on = l >= t0;
        if (on) elegidos++;
        f.c.style.background = on ? "var(--acento)" : "#fff";
        f.c.style.borderColor = on ? "var(--acento)" : "var(--linea-fuerte)";
        pon(f.c, { s: on ? lerp(0.6, 1, k) : 1 });
        f.check.style.strokeDashoffset = (1 - curva.salida(tramo(l, t0 + 0.05, t0 + 0.35))).toFixed(3);
        f.el.style.backgroundColor = on ? `rgba(235,241,251,${Math.min(1, tramo(l, t0, t0 + 0.2)).toFixed(3)})` : "transparent";
      });
      cuenta.textContent = `${Math.max(1, elegidos)} ${elegidos > 1 ? "elegidos" : "elegido"}`;
      const kb = curva.resorte(tramo(l, T.elige[0] + 0.05, T.elige[0] + 0.7), 0.75, 11);
      pon(barra, { y: lerp(-20, 0, kb), s: lerp(0.96, 1, kb), o: tramo(l, T.elige[0] + 0.05, T.elige[0] + 0.25) });
      lista.style.transform = `translateY(${(altoBarra * curva.salida(tramo(l, T.elige[0], T.elige[0] + 0.5))).toFixed(2)}px)`;

      // Ajustar precios: los rodillos giran y aparece el diez por ciento.
      filas.forEach((f, i) => {
        if (!rodillos[i]) return;
        rodillos[i].dibuja(l, T.sube + i * 0.05, 0.9);
        const k = curva.rebote(tramo(l, T.sube + 0.3 + i * 0.05, T.sube + 0.9 + i * 0.05));
        pon(f.sube, { s: lerp(0.3, 1, k), o: tramo(l, T.sube + 0.3, T.sube + 0.4) });
        f.precio.style.color = l > T.sube + 0.2 ? "var(--exito-texto)" : "var(--tinta)";
      });

      const c0 = lugar(filas[0].c, capaPuntero), c1 = lugar(filas[1].c, capaPuntero), c5 = lugar(filas[5].c, capaPuntero);
      const [ax, ay] = lugar(ajustar, capaPuntero, 0.45, 0.6);
      dibujaPuntero(l, [
        [T.elige[0] - 0.55, 700, 1500],
        [T.elige[0] - 0.02, c0[0] + 6, c0[1] + 6],
        [T.elige[1] - 0.3, c0[0] + 6, c0[1] + 124],
        [T.elige[1] - 0.02, c1[0] + 6, c1[1] + 6],
        [T.elige[2] - 0.3, c1[0] + 6, c1[1] + 6],
        [T.elige[2] - 0.02, c5[0] + 6, c5[1] + 6],
        [T.ajusta - 0.4, c5[0] + 6, c5[1] + 6],
        [T.ajusta - 0.02, ax, ay],
        [T.ajusta + 1, ax + 80, ay + 200],
      ], [...T.elige, T.ajusta], T.elige[0] - 0.55, T.ajusta + 0.5);

      movs.forEach((m, i) => entra(m, l, T.movs + i * 0.25, 0.8, { x: 500, y: 0, blur: 10, curva: (k) => curva.resorte(k, 0.72, 10) }));
    };
  }

  // ═══════════════════════════  6 · Todo lo demás  ═══════════════════════════
  {
    const TESELAS = [
      { i: "clientes", c: "#FFB340", t: "Fiado", d: "Cuentas de clientes, con lo que debe cada uno.", extra: '<span class="mini-pastilla" style="color:#FFB340;background:rgba(255,179,64,.14)" id="s6-fiado">$38.200</span>' },
      { i: "camion", c: "#40C8E0", t: "Proveedores", d: "Compras, pagos y lo que les debés.", extra: `<span class="mini-camion" id="s6-camion">${ic("camion", 54)}</span>` },
      { i: "reloj", c: "#FF6961", t: "Vencimientos", d: "Te avisa antes de tener que tirarlo.", extra: '<span class="mini-pastilla" style="color:#FF6961;background:rgba(255,105,97,.14)">2 vencidos</span>' },
      { i: "etiqueta", c: "#3B86FF", t: "Etiquetas", d: "Códigos de barras para lo que hacés vos.", extra: `<span class="mini-barras" id="s6-barras">${Array.from({ length: 16 }, (_, j) => `<i style="width:${[3, 6, 3, 9, 3, 4][j % 6]}px"></i>`).join("")}</span>` },
      { i: "recuento", c: "#30D158", t: "Recuento", d: "Contá la estantería y el stock se acomoda.", extra: '<span class="mini-pastilla" style="color:#30D158;background:rgba(48,209,88,.14)">+3 ajustados</span>' },
      { i: "clientes", c: "#BF5AF2", t: "Usuarios", d: "El dueño y quien atiende, cada uno con lo suyo.", extra: '<span class="mini-roles"><span style="background:#0050CE">Dueño</span><span>Atiende</span></span>' },
      { i: "carpeta", c: "#FFD60A", t: "Copias de seguridad", d: "Solas, una vez por día, a un pendrive o a Drive.", extra: `<span class="mini-pastilla" style="color:#FFD60A;background:rgba(255,214,10,.14)">${ic("listo", 22)}Hoy</span>` },
      { i: "recargar", c: "#64D2FF", t: "Se actualiza sola", d: "La versión nueva llega sin reinstalar nada.", extra: '<span class="mini-progreso"><i id="s6-progreso"></i></span>' },
    ];
    const MARQUESINA = [
      ["Gastos", "Devoluciones", "Cierre de caja con arqueo", "Venta por peso", "Lector de códigos", "Exportar a Excel"],
      ["Historial de precios", "Categorías", "Descuentos", "Pagos divididos", "Retiros e ingresos", "Pedidos", "Comprobante en PDF"],
    ];
    const e = escena("s6", 27.0, 33.0, `
      <div class="capa" id="s6-negro" style="background:#000"></div>
      <div class="capa" id="s6-todo">
        <div class="abs centro-x titular" id="s6-titular" style="top:180px;color:#fff;font-size:92px">Todo lo que<br><span class="degrade-oscuro">tu negocio necesita.</span></div>
        <div class="abs" id="s6-grilla" style="left:60px;top:462px;width:960px;height:1110px">
          ${TESELAS.map((t, i) => `<div class="tesela" id="s6-t${i}" style="left:${(i % 2) * 492}px;top:${Math.floor(i / 2) * 280}px">
            <div class="tesela-ic" style="color:${t.c};background:${t.c}22">${ic(t.i, 40)}</div>
            <div class="tesela-extra">${t.extra}</div>
            <div class="tesela-tit">${t.t}</div>
            <div class="tesela-txt">${t.d}</div>
          </div>`).join("")}
        </div>
        ${MARQUESINA.map((fila, i) => `<div class="abs marquesina" id="s6-m${i}" style="top:${1610 + i * 104}px"><div class="marquesina-tira">${[...fila, ...fila, ...fila].map((x, j) => `<span class="marquesina-item"><i style="background:${["#3B86FF", "#30D158", "#FFB340", "#BF5AF2", "#FF6961", "#64D2FF"][j % 6]}"></i>${x}</span>`).join("")}</div></div>`).join("")}
      </div>
    `, { antes: 0.45, despues: 0.5 });
    const todo = $("#s6-todo");
    const titular = palabras($("#s6-titular"));
    const grilla = $("#s6-grilla");
    const teselas = TESELAS.map((_, i) => $(`#s6-t${i}`));
    const fiado = $("#s6-fiado"), camion = $("#s6-camion"), barras = $$("#s6-barras i"), progreso = $("#s6-progreso");
    const marquesinas = [0, 1].map((i) => ({ el: $(`#s6-m${i}`), tira: $(`#s6-m${i} .marquesina-tira`) }));
    const anchos = perezoso(() => marquesinas.map((m) => m.tira.scrollWidth / 3));
    e.dibujar = (l) => {
      // Entra con un círculo negro que crece desde el centro.
      const kc = curva.ida(tramo(l, -0.45, 0.1));
      const kSale = curva.ida(tramo(l, 5.5, 6.05));
      // Bordes difusos: un círculo de corte duro se lee como un agujero.
      let mascara = "none";
      if (l < 0.1) {
        const r = lerp(-300, 2300, kc);
        mascara = `radial-gradient(circle at 50% 55%, #000 ${r.toFixed(1)}px, transparent ${(r + 300).toFixed(1)}px)`;
      } else if (kSale > 0) {
        const q = lerp(-20, 100, kSale);
        mascara = `linear-gradient(to top, transparent ${q.toFixed(2)}%, #000 ${(q + 20).toFixed(2)}%)`;
      }
      e.nodo.style.webkitMaskImage = mascara;
      e.nodo.style.maskImage = mascara;

      revela(titular, l, -0.12, { paso: 0.07, dur: 0.75, y: 44, blur: 16 });

      // La grilla flota apenas en tres dimensiones, como si la cámara se moviera.
      const d = tramo(l, 0, 6);
      pon(grilla, { p: 2400, rx: lerp(10, -4, d), ry: Math.sin(l * 0.8) * 3, s: lerp(0.98, 1.02, d) });
      teselas.forEach((t, i) => {
        const t0 = 0.2 + i * 0.09;
        const k = curva.resorte(tramo(l, t0, t0 + 0.9), 0.62, 11);
        pon(t, { y: lerp(120, 0, k), s: lerp(0.82, 1, k), o: tramo(l, t0, t0 + 0.2), blur: 14 * (1 - curva.salida(tramo(l, t0, t0 + 0.5))) });
      });

      // Cada tesela tiene su gesto.
      fiado.textContent = pesos(38200 * curva.salida(tramo(l, 0.7, 1.8)));
      pon(camion, { x: lerp(-160, 0, curva.salida(tramo(l, 0.8, 1.5))), o: tramo(l, 0.8, 1.0), blur: 8 * (1 - tramo(l, 0.8, 1.4)) });
      barras.forEach((b, j) => (b.style.transform = `scaleY(${curva.salida(tramo(l, 1.1 + j * 0.03, 1.5 + j * 0.03)).toFixed(3)})`));
      progreso.style.width = (100 * curva.ida(tramo(l, 1.4, 3.2))).toFixed(1) + "%";

      marquesinas.forEach((m, i) => {
        const dir = i ? 1 : -1;
        const ancho = anchos()[i];
        const x = (l * 120 * dir) % ancho;
        m.tira.style.transform = `translateX(${(dir > 0 ? x - ancho : x).toFixed(1)}px)`;
        entra(m.el, l, 1.1 + i * 0.12, 0.8, { y: 50 });
      });
    };
  }

  // ═════════════════════════════  7 · Informes  ═════════════════════════════
  {
    const MAS_VENDIDOS = [
      ["Yerba Playadito 1 kg", "186 u", 920700, "31%"],
      ["Coca-Cola 2,25 L", "240 u", 768000, "28%"],
      ["Pan francés", "96,4 kg", 269900, "52%"],
      ["Queso cremoso", "21,3 kg", 208700, "35%"],
    ];
    const e = escena("s7", 33.0, 37.0, `
      <div class="capa" id="s7-todo">
        <div class="abs centro-x titular" id="s7-titular" style="top:150px">Sabé cuánto<br><span class="degrade">ganás de verdad.</span></div>
        <div class="abs" id="s7-seg" style="left:0;right:0;top:400px;display:flex;justify-content:center"><div class="ui" style="zoom:2.4">
          <div class="segmentado"><span class="seg-pildora" id="s7-pildora"></span><span>7 días</span><span>30 días</span><span>90 días</span><span>Todo</span></div>
        </div></div>
        <div class="abs" id="s7-grande" style="left:60px;top:520px;width:960px"><div class="ui" style="zoom:2.25;width:427px">
          <div class="metricas-2">
            ${metrica("Vendido", '<span id="s7-v0">$0</span>', "412 ventas · $41.300 en descuentos")}
            ${metrica("Costó", '<span id="s7-v1">$0</span>', "Con el costo que tenía cada producto el día que se vendió")}
            ${metrica("Margen s/venta", '<span id="s7-v2">0%</span>', "59% sobre el costo · ticket promedio $6.910")}
            ${metrica("Resultado", '<span id="s7-v3">$0</span>', "Vendido − costo − gastos de tener abierto", "exito")}
          </div>
          <div class="hoja" id="s7-tabla" style="margin-top:14px">
            <div class="hoja-cab"><h2>Lo que más se vendió</h2><span class="chico suave">30 días</span></div>
            <div class="tabla-cab"><span>Producto</span><span>Vendido</span><span>Margen</span></div>
            ${MAS_VENDIDOS.map(([n, u, v, m], i) => `<div class="tabla-fila" id="s7-f${i}"><span style="min-width:0"><span style="display:block" class="recorte">${n}</span><span class="tabla-barra"><i style="width:${((v / MAS_VENDIDOS[0][2]) * 100).toFixed(1)}%"></i></span></span><span class="cifra medio" style="text-align:right">${pesos(v)}<span class="chico suave" style="display:block">${u}</span></span><span class="cifra suave" style="text-align:right">${m}</span></div>`).join("")}
          </div>
        </div></div>
      </div>
    `, { antes: 0.5, despues: 0.3 });
    const todo = $("#s7-todo");
    const titular = palabras($("#s7-titular"));
    const seg = $("#s7-seg"), pildora = $("#s7-pildora"), opciones = $$("#s7-seg .segmentado > span:not(.seg-pildora)");
    const tarjetas = $$("#s7-grande .metrica"), tabla = $("#s7-tabla");
    const filasT = MAS_VENDIDOS.map((_, i) => $(`#s7-f${i}`));
    const barrasT = $$("#s7-tabla .tabla-barra i");
    const valores = [[$("#s7-v0"), 2846900, "$"], [$("#s7-v1"), 1793500, "$"], [$("#s7-v2"), 37, "%"], [$("#s7-v3"), 812400, "$"]];
    const posiciones = perezoso(() => opciones.map((o) => [o.offsetLeft, o.offsetWidth]));
    e.dibujar = (l) => {
      const kIn = curva.salida(tramo(l, -0.3, 0.5));
      const kSale = curva.entrada(tramo(l, 3.55, 4.1));
      todo.style.transform = `translateY(${lerp(160, 0, kIn).toFixed(1)}px) scale(${lerp(1, 0.9, kSale).toFixed(4)})`;
      todo.style.opacity = (tramo(l, -0.3, 0.1) * (1 - kSale)).toFixed(3);
      revela(titular, l, -0.15, { paso: 0.07, dur: 0.7, y: 44, blur: 16 });
      entra(seg, l, 0.05, 0.6, { y: 30 });
      const pos = posiciones();
      const kp = curva.resorte(tramo(l, 0.65, 1.2), 0.7, 12);
      pildora.style.left = lerp(pos[0][0], pos[1][0], kp).toFixed(2) + "px";
      pildora.style.width = lerp(pos[0][1], pos[1][1], kp).toFixed(2) + "px";
      opciones.forEach((o, i) => (o.style.color = (i === 1) === l > 0.8 ? "var(--tinta)" : "var(--tinta-suave)"));
      tarjetas.forEach((t, i) => entra(t, l, 0.35 + i * 0.08, 0.9, { y: 90, s: 0.9, blur: 16, curva: (k) => curva.resorte(k, 0.7, 10) }));
      valores.forEach(([el, fin, u], i) => {
        const k = curva.salida(tramo(l, 0.9 + i * 0.08, 2.2 + i * 0.08));
        el.textContent = u === "%" ? `${Math.round(fin * k)}%` : pesos(fin * k);
      });
      entra(tabla, l, 0.9, 0.9, { y: 120, s: 0.95, blur: 14 });
      filasT.forEach((f, i) => entra(f, l, 1.2 + i * 0.07, 0.6, { y: 20, blur: 6 }));
      barrasT.forEach((b, i) => (b.style.transform = `scaleX(${curva.salida(tramo(l, 1.4 + i * 0.07, 2.3 + i * 0.07)).toFixed(3)})`));
    };
  }

  // ═════════════════════════════  8 · El celular  ═════════════════════════════
  {
    const e = escena("s8", 37.0, 41.0, `
      <div class="capa" id="s8-azul" style="background:radial-gradient(120% 80% at 50% 30%, #1E6CF0 0%, #0050CE 45%, #002A78 100%)"></div>
      <div class="capa" id="s8-todo">
        <div class="abs centro-x titular" id="s8-titular" style="top:140px;color:#fff;font-size:92px">También desde<br>el celular.</div>
        <div class="abs centro-x bajada" id="s8-bajada" style="top:360px;color:rgba(255,255,255,.8);font-size:40px">Por el wifi del local. Sin internet.</div>
        <svg class="abs" id="s8-wifi" style="left:770px;top:520px" width="200" height="160" viewBox="0 0 200 160" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round">
          <path class="w0" d="M88 128a17 17 0 0 1 24 0"/><path class="w1" d="M64 104a51 51 0 0 1 72 0"/><path class="w2" d="M40 80a85 85 0 0 1 120 0"/><path class="w3" d="M16 56a119 119 0 0 1 168 0"/>
        </svg>
        <div class="abs" id="s8-telefono" style="left:270px;top:500px;width:540px;height:1110px">
          <div class="telefono">
            <div class="tel-pantalla">
              <div class="tel-estado"><span class="cifra">9:41</span><span class="isla"></span><span class="tel-iconos"><svg width="34" height="20" viewBox="0 0 34 20"><rect x="0" y="12" width="5" height="8" rx="1.5" fill="#1D1D1F"/><rect x="8" y="8" width="5" height="12" rx="1.5" fill="#1D1D1F"/><rect x="16" y="4" width="5" height="16" rx="1.5" fill="#1D1D1F"/><rect x="24" y="0" width="5" height="20" rx="1.5" fill="#1D1D1F"/></svg><svg width="44" height="22" viewBox="0 0 44 22"><rect x="1" y="1" width="36" height="20" rx="6" fill="none" stroke="#1D1D1F" stroke-opacity=".4" stroke-width="2"/><rect x="4" y="4" width="26" height="14" rx="3.5" fill="#1D1D1F"/><rect x="39.5" y="7" width="3" height="8" rx="1.5" fill="#1D1D1F" fill-opacity=".4"/></svg></span></div>
              <div class="ui tel-ui" style="zoom:1.3">
                <div class="tel-cabecera"><h1>Caja</h1><p class="suave">Turno 128 · 31 ventas hoy</p></div>
                <div style="padding:16px">
                  <div class="hoja">
                    <div class="hoja-cab"><h2>Cobrar</h2><span class="etiqueta t-exito">Turno 128</span></div>
                    <div class="hoja-cuerpo" style="display:flex;flex-direction:column;gap:12px">
                      <div style="display:flex;gap:8px"><div class="campo" style="flex:1">${ic("buscar", 16, "tenue")}<span class="ph">Buscar producto</span></div><span class="boton suave" style="padding:0 10px">${ic("camara", 16)}</span></div>
                      <div class="camara">
                        <div class="camara-escena"><div class="camara-producto"><div class="camara-rotulo"><b>COCA-COLA</b><span>2,25 L</span><div class="camara-codigo">${Array.from({ length: 30 }, (_, j) => `<i style="width:${[1, 2, 1, 3, 1, 2, 4, 1][j % 8]}px"></i>`).join("")}</div></div></div></div>
                        <div class="camara-guia" id="s8-guia"></div>
                        <div class="camara-linea" id="s8-linea"></div>
                      </div>
                      <div><span class="etiqueta-campo" style="margin-bottom:6px">Leídos</span><div class="chico media leido" id="s8-leido">${ic("listo", 14, "", "color:var(--exito-texto)")}<span class="cifra">7790895000997</span><span class="suave">· Coca-Cola 2,25 L</span></div></div>
                      <div class="lista-caja"><div class="fila-caja" id="s8-fila" style="border-bottom:0"><div class="fila-caja-in" style="flex-wrap:nowrap;align-items:center"><span style="flex:1"><span style="display:block">Coca-Cola 2,25 L</span><span class="chico suave">$3.200 · quedan 45</span></span><span class="cifra medio">$3.200</span></div></div></div>
                      <div class="total-fila" id="s8-total"><div><span class="etiqueta-campo">Total</span><div class="cifra" style="font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.025em">$3.200</div></div><span class="boton principal">${ic("caja", 16)}Cobrar</span></div>
                    </div>
                  </div>
                </div>
                <nav class="tel-barra">
                  ${[["Panel", "panel"], ["Caja", "caja", true], ["Productos", "productos"], ["Ventas", "pedidos"], ["Más", "puntos"]].map(([n, i, a]) => `<span class="${a ? "activa" : ""}">${ic(i, 20)}${n}</span>`).join("")}
                </nav>
              </div>
            </div>
          </div>
        </div>
        <div class="abs" id="s8-pastillas" style="left:0;right:0;top:1685px;display:flex;justify-content:center;gap:20px">
          ${[["Sin internet", "listo"], ["Sin nube", "listo"], ["Tus datos, en tu compu", "carpeta"]].map(([t, i]) => `<span class="vidrio-pastilla">${ic(i, 28)}${t}</span>`).join("")}
        </div>
      </div>
    `, { antes: 0.5, despues: 0.4 });
    const azul = $("#s8-azul"), todo = $("#s8-todo");
    const titular = palabras($("#s8-titular")), bajada = $("#s8-bajada");
    const tel = $("#s8-telefono"), guia = $("#s8-guia"), linea = $("#s8-linea"), leido = $("#s8-leido");
    const fila = $("#s8-fila"), totalTel = $("#s8-total");
    const altoFila = perezoso(() => $(".fila-caja-in", fila).offsetHeight);
    const ondas = [0, 1, 2, 3].map((i) => $(`#s8-wifi .w${i}`));
    const pastillas = $$("#s8-pastillas .vidrio-pastilla");
    e.dibujar = (l) => {
      const kc = curva.ida(tramo(l, -0.5, 0.15));
      const r = lerp(-300, 2400, kc);
      const mascara = l < 0.2 ? `radial-gradient(circle at 50% 100%, #000 ${r.toFixed(1)}px, transparent ${(r + 300).toFixed(1)}px)` : "none";
      e.nodo.style.webkitMaskImage = mascara;
      e.nodo.style.maskImage = mascara;
      const kSale = curva.entrada(tramo(l, 3.6, 4.2));
      todo.style.transform = `scale(${lerp(1, 0.85, kSale).toFixed(4)})`;
      todo.style.opacity = (1 - kSale).toFixed(3);
      todo.style.filter = kSale > 0.01 ? `blur(${(16 * kSale).toFixed(2)}px)` : "none";
      azul.style.opacity = (1 - curva.ida(tramo(l, 3.7, 4.3))).toFixed(3);

      revela(titular, l, -0.05, { paso: 0.07, dur: 0.7, y: 44, blur: 16 });
      entra(bajada, l, 0.3, 0.7, { y: 24 });

      const kt = curva.resorte(tramo(l, 0.0, 1.3), 0.68, 9);
      pon(tel, { p: 2600, y: lerp(1300, 0, kt), rx: lerp(40, 0, kt), ry: lerp(-24, 0, kt) + Math.sin(l * 0.9) * 5 - 3, r: lerp(-6, 0, kt), o: tramo(l, 0, 0.2) });

      ondas.forEach((w, i) => {
        const ciclo = ((l - 0.9 - i * 0.12) % 1.2 + 1.2) % 1.2;
        const on = l > 0.9 + i * 0.12;
        w.style.opacity = on ? (0.95 * Math.max(0, 1 - ciclo / 1.0)).toFixed(3) : 0;
      });

      // La cámara lee el código: la línea barre y la guía se pone verde.
      linea.style.top = `${(18 + 64 * Math.abs(Math.sin((l - 1.1) * 2.8))).toFixed(2)}%`;
      linea.style.opacity = l > 1.1 && l < 2.2 ? 0.9 : 0;
      const verde = l > 2.2;
      guia.style.borderColor = verde ? "var(--exito-texto)" : "rgba(255,255,255,.8)";
      guia.style.backgroundColor = verde ? `rgba(29,127,53,${(0.2 * (1 - tramo(l, 2.5, 3.2))).toFixed(3)})` : "transparent";
      pon(guia, { s: 1 + 0.06 * Math.sin(Math.PI * tramo(l, 2.2, 2.45)) });
      entra(leido, l, 2.3, 0.5, { y: 10, blur: 4 });
      const kf = curva.salida(tramo(l, 2.35, 2.85));
      fila.style.height = (altoFila() * kf).toFixed(2) + "px";
      fila.style.backgroundColor = `rgba(0,80,206,${(0.1 * (1 - tramo(l, 2.7, 3.6))).toFixed(3)})`;
      entra(totalTel, l, 2.5, 0.6, { y: 16, blur: 6 });

      pastillas.forEach((p, i) => {
        const k = curva.rebote(tramo(l, 2.35 + i * 0.13, 3.0 + i * 0.13));
        pon(p, { s: lerp(0.5, 1, k), y: lerp(40, 0, k), o: tramo(l, 2.35 + i * 0.13, 2.5 + i * 0.13) });
      });
    };
  }

  // ══════════════════════════════  9 · Cierre  ══════════════════════════════
  {
    const e = escena("s9", 41.0, 45.0, `
      <div class="capa" id="s9-negro" style="background:#000"></div>
      <div class="capa" id="s9-polvo"></div>
      <div class="abs" id="s9-brillo" style="left:-160px;top:0px;width:1400px;height:1400px;border-radius:50%;background:radial-gradient(circle,rgba(30,105,240,.5) 0%,rgba(0,80,206,.18) 34%,rgba(0,80,206,0) 66%)"></div>
      <div class="abs" id="s9-logo" style="left:400px;top:560px;width:280px;height:280px">${marcaAnimada("s9")}</div>
      <div class="abs centro-x titular" id="s9-nombre" style="top:900px;color:#fff;font-size:140px">Visual App</div>
      <div class="abs centro-x bajada" id="s9-bajada" style="top:1085px;color:#A1A1A6;font-size:46px">Stock, caja y ventas para tu negocio.</div>
      <div class="abs" id="s9-datos" style="left:0;right:0;top:1225px;display:flex;justify-content:center;gap:16px">
        ${["Para Windows", "Funciona sin internet", "Se actualiza sola"].map((t) => `<span class="dato-final">${t}</span>`).join("")}
      </div>
      <div class="abs centro-x" id="s9-firma" style="top:1640px;color:#6E6E73;font-size:30px;letter-spacing:-0.01em">Hecho por <b style="color:#D1D1D6;font-weight:600">Visual Solution</b><br><span style="color:#86868B;font-size:28px">visual-solution.vercel.app</span></div>
      <div class="capa" id="s9-fundido" style="background:#000"></div>
    `, { antes: 0.4 });
    const negro = $("#s9-negro");
    const polvo9 = polvo($("#s9-polvo"), 40, 21);
    const brillo = $("#s9-brillo"), logo = $("#s9-logo"), svg = logo.querySelector("svg");
    const nombre = letras($("#s9-nombre")), bajada = palabras($("#s9-bajada"));
    const datos = $$("#s9-datos .dato-final"), firma = $("#s9-firma"), fundido = $("#s9-fundido");
    e.dibujar = (l) => {
      negro.style.opacity = curva.ida(tramo(l, -0.4, 0.2)).toFixed(3);
      polvo9(l + 10, tramo(l, 0, 1.2));
      pon(brillo, { s: lerp(0.3, 1, curva.salida(tramo(l, 0, 1.4))) * (1 + 0.03 * Math.sin(l * 2.4)), o: tramo(l, 0, 0.8) * 0.85 });
      const kc = curva.resorte(tramo(l, 0.05, 1.05), 0.55, 11);
      pon(logo, { o: tramo(l, 0.05, 0.25) });
      dibujaMarca(svg, {
        cuadro: lerp(0.4, 1, kc), giro: lerp(12, 0, kc),
        trazo: curva.salida(tramo(l, 0.2, 0.95)), relleno: curva.cubica(tramo(l, 0.7, 1.1)),
        adornos: curva.salida(tramo(l, 0.5, 1.15)), adornosRelleno: curva.cubica(tramo(l, 0.95, 1.3)),
        estrella: curva.rebote(tramo(l, 1.0, 1.7)), destello: Math.sin(Math.PI * tramo(l, 1.1, 1.8)) * 0.9,
        barrido: tramo(l, 1.5, 2.3),
      });
      revela(nombre, l, 0.55, { paso: 0.045, dur: 0.8, y: 50, blur: 18 });
      revela(bajada, l, 1.0, { paso: 0.06, dur: 0.7, y: 24, blur: 10 });
      datos.forEach((d, i) => entra(d, l, 1.45 + i * 0.1, 0.7, { y: 30, s: 0.9 }));
      entra(firma, l, 1.9, 0.8, { y: 20 });
      fundido.style.opacity = curva.ida(tramo(l, 3.45, 4.0)).toFixed(3);
    };
  }

  // ═══════════════════════════════  El reloj  ═══════════════════════════════
  function dibujar(t) {
    dibujaFondo(t);
    for (const e of escenas) {
      const visible = t >= e.desde - e.antes && t < e.hasta + e.despues;
      if (visible !== e.visible) {
        e.nodo.style.display = visible ? "block" : "none";
        e.visible = visible;
      }
      if (visible) e.dibujar(t - e.desde, t);
    }
  }

  window.__duracion = DURACION;
  window.__dibujar = dibujar;
  // La fuente se pide a mano: el navegador solo la baja cuando algo visible
  // la usa, y un renderizador que arranca por el segundo 40 sacaría el texto
  // invisible mientras tanto.
  window.__listo = Promise.all([
    document.fonts.load('400 16px "Inter"', "Aa$1"),
    document.fonts.load('700 96px "Inter"', "Aa$1"),
    document.fonts.load('400 16px "Inter"', "\u0100"),
  ])
    .then(() => document.fonts.ready)
    .then(() => {
      dibujar(0);
      return true;
    });

  // ─────────────────  Vista previa en el navegador  ─────────────────
  const parametros = new URLSearchParams(location.search);
  if (parametros.has("render")) return;

  const marco = document.getElementById("marco");
  const ajustar = () => {
    const s = Math.min(innerWidth / 1080, (innerHeight - 56) / 1920);
    marco.style.transform = `translateY(-24px) scale(${s})`;
  };
  addEventListener("resize", ajustar);
  ajustar();

  const barra = crea(`<div style="position:fixed;left:0;right:0;bottom:0;height:48px;display:flex;align-items:center;gap:12px;padding:0 16px;background:#161618;color:#D1D1D6;font:13px system-ui">
    <button id="p-play" style="width:72px;height:30px;border-radius:8px;border:0;background:#0050CE;color:#fff;font-weight:600">Pausa</button>
    <input id="p-barra" type="range" min="0" max="${DURACION}" step="0.01" value="0" style="flex:1">
    <span id="p-tiempo" style="width:90px;text-align:right;font-variant-numeric:tabular-nums">0.00 s</span>
  </div>`);
  document.body.appendChild(barra);
  const audio = new Audio("musica.m4a");
  const boton = $("#p-play", barra), rango = $("#p-barra", barra), reloj = $("#p-tiempo", barra);
  let t = Number(parametros.get("t") || 0), andando = !parametros.has("t"), ultimo = performance.now();
  const alternar = () => {
    andando = !andando;
    boton.textContent = andando ? "Pausa" : "Play";
    if (andando) { audio.currentTime = t; audio.play().catch(() => {}); } else audio.pause();
  };
  boton.onclick = alternar;
  addEventListener("keydown", (ev) => {
    if (ev.code === "Space") { ev.preventDefault(); alternar(); }
    if (ev.code === "ArrowRight") t = Math.min(DURACION, t + (ev.shiftKey ? 1 : 1 / 60));
    if (ev.code === "ArrowLeft") t = Math.max(0, t - (ev.shiftKey ? 1 : 1 / 60));
    audio.currentTime = t;
  });
  rango.oninput = () => { t = Number(rango.value); audio.currentTime = t; };
  boton.textContent = andando ? "Pausa" : "Play";
  window.__listo.then(() => {
    if (andando) audio.play().catch(() => {});
    const cuadro = (ahora) => {
      if (andando) {
        t += (ahora - ultimo) / 1000;
        if (t >= DURACION) { t = 0; audio.currentTime = 0; }
        if (!audio.paused && Math.abs(audio.currentTime - t) > 0.08) t = audio.currentTime;
      }
      ultimo = ahora;
      dibujar(t);
      rango.value = t;
      reloj.textContent = t.toFixed(2) + " s";
      requestAnimationFrame(cuadro);
    };
    requestAnimationFrame(cuadro);
  });
})();
