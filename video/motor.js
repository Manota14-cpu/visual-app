/**
 * El motor del video.
 *
 * Todo lo que se mueve es una función del tiempo: no hay transiciones de CSS,
 * ni animaciones, ni relojes adentro de las escenas. Dado un segundo, cada
 * elemento sabe dónde está. Así cualquier cuadro se puede dibujar solo, en
 * cualquier orden, y el que sale del renderizador es idéntico al que se ve
 * en el navegador.
 */
(function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  /** Cuánto se avanzó entre `a` y `b`, de 0 a 1. */
  const tramo = (t, a, b) => clamp((t - a) / (b - a));

  /** Una curva de CSS (`cubic-bezier`) resuelta a mano, con Newton y bisección. */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const x = (s) => ((ax * s + bx) * s + cx) * s;
    const y = (s) => ((ay * s + by) * s + cy) * s;
    const dx = (s) => (3 * ax * s + 2 * bx) * s + cx;
    return (k) => {
      if (k <= 0) return 0;
      if (k >= 1) return 1;
      let s = k;
      for (let i = 0; i < 8; i++) {
        const e = x(s) - k;
        if (Math.abs(e) < 1e-6) return y(s);
        const d = dx(s);
        if (Math.abs(d) < 1e-6) break;
        s -= e / d;
      }
      let lo = 0, hi = 1;
      s = k;
      for (let i = 0; i < 30; i++) {
        const v = x(s);
        if (Math.abs(v - k) < 1e-6) break;
        if (v < k) lo = s; else hi = s;
        s = (lo + hi) / 2;
      }
      return y(s);
    };
  }

  /**
   * Un resorte amortiguado que llega a 1. `z` es cuánto frena (0,6 pasa un
   * diez por ciento y vuelve; 0,4 rebota de verdad) y `w`, qué tan rápido.
   */
  function resorte(k, z = 0.6, w = 12) {
    if (k <= 0) return 0;
    if (k >= 1) return 1;
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * k) * (Math.cos(wd * k) + ((z * w) / wd) * Math.sin(wd * k));
  }

  const curva = {
    lineal: (k) => k,
    // La de las transiciones de iOS, la misma que usa la aplicación.
    suave: bezier(0.32, 0.72, 0, 1),
    salida: bezier(0.16, 1, 0.3, 1),
    entrada: bezier(0.7, 0, 0.84, 0),
    ida: bezier(0.65, 0, 0.35, 1),
    cubica: (k) => 1 - Math.pow(1 - k, 3),
    resorte,
    rebote: (k) => resorte(k, 0.42, 13),
  };

  /**
   * Pone un elemento en su lugar. Las propiedades son cortas porque se
   * escriben cientos de veces: x, y, z, s (escala), sx, sy, r (giro), rx, ry,
   * o (opacidad), blur, p (perspectiva propia).
   */
  function pon(el, v) {
    if (!el) return;
    let tr = "";
    if (v.p) tr += `perspective(${v.p}px) `;
    if (v.x || v.y || v.z) tr += `translate3d(${(v.x || 0).toFixed(2)}px,${(v.y || 0).toFixed(2)}px,${(v.z || 0).toFixed(2)}px) `;
    if (v.rx) tr += `rotateX(${v.rx.toFixed(3)}deg) `;
    if (v.ry) tr += `rotateY(${v.ry.toFixed(3)}deg) `;
    if (v.r) tr += `rotate(${v.r.toFixed(3)}deg) `;
    if (v.s !== undefined && v.s !== 1) tr += `scale(${v.s.toFixed(4)}) `;
    if (v.sx !== undefined || v.sy !== undefined) tr += `scale(${(v.sx ?? 1).toFixed(4)},${(v.sy ?? 1).toFixed(4)}) `;
    el.style.transform = tr || "none";
    if (v.o !== undefined) {
      const o = clamp(v.o);
      el.style.opacity = o.toFixed(3);
      el.style.visibility = o < 0.002 ? "hidden" : "visible";
    }
    if (v.blur !== undefined) el.style.filter = v.blur > 0.05 ? `blur(${v.blur.toFixed(2)}px)` : "none";
  }

  /**
   * La entrada de siempre: sube, se enfoca y aparece. Devuelve el avance
   * para que quien llama pueda encadenar otra cosa.
   */
  function entra(el, t, desde, dur = 0.7, o = {}) {
    const k = tramo(t, desde, desde + dur);
    const e = (o.curva || curva.salida)(k);
    const ko = tramo(t, desde, desde + dur * 0.6);
    pon(el, {
      x: (o.x || 0) * (1 - e),
      y: (o.y ?? 40) * (1 - e),
      s: lerp(o.s ?? 1, 1, e),
      rx: (o.rx || 0) * (1 - e),
      o: ko,
      blur: (o.blur ?? 12) * (1 - e),
      p: o.p,
    });
    return e;
  }

  /** Entrada y salida en una sola llamada. */
  function entraYSale(el, t, desde, hasta, o = {}) {
    const dur = o.dur ?? 0.7;
    const durSalida = o.durSalida ?? 0.35;
    if (t < hasta - durSalida) return entra(el, t, desde, dur, o);
    const k = curva.entrada(tramo(t, hasta - durSalida, hasta));
    pon(el, {
      y: (o.ySalida ?? -30) * k,
      s: lerp(1, o.sSalida ?? 1, k),
      o: 1 - k,
      blur: (o.blurSalida ?? 10) * k,
    });
    return 1;
  }

  /** Parte un texto en letras, cada una en su <span>, para moverlas de a una. */
  function letras(el) {
    const texto = el.textContent;
    el.textContent = "";
    const hijos = [];
    for (const c of texto) {
      const s = document.createElement("span");
      s.className = "letra";
      s.textContent = c === " " ? " " : c;
      el.appendChild(s);
      hijos.push(s);
    }
    return hijos;
  }

  /** Lo mismo, de a palabras. Respeta los <span> de degradé que haya adentro. */
  function palabras(el) {
    const hijos = [];
    const recorrer = (nodo, destino) => {
      for (const n of [...nodo.childNodes]) {
        if (n.nodeType === 3) {
          const partes = n.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          for (const p of partes) {
            if (!p) continue;
            if (/^\s+$/.test(p)) {
              frag.appendChild(document.createTextNode(" "));
            } else {
              const s = document.createElement("span");
              s.className = "palabra";
              s.textContent = p;
              frag.appendChild(s);
              hijos.push(s);
            }
          }
          nodo.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== "BR") {
          // Un degradé partido en palabras tiene que seguir siendo un solo
          // degradé: cada palabra lo recorta en su lugar.
          if (n.classList.contains("degrade")) {
            const texto = n.textContent;
            n.textContent = "";
            const partes = texto.split(/(\s+)/);
            for (const p of partes) {
              if (!p) continue;
              if (/^\s+$/.test(p)) n.appendChild(document.createTextNode(" "));
              else {
                const s = document.createElement("span");
                s.className = "palabra degrade";
                s.textContent = p;
                n.appendChild(s);
                hijos.push(s);
              }
            }
            n.classList.remove("degrade");
          } else recorrer(n, destino);
        }
      }
    };
    recorrer(el, hijos);
    return hijos;
  }

  /** Revela piezas de a una: letras o palabras que suben desenfocadas. */
  function revela(piezas, t, desde, o = {}) {
    const paso = o.paso ?? 0.04;
    const dur = o.dur ?? 0.7;
    piezas.forEach((el, i) => entra(el, t, desde + i * paso, dur, { y: o.y ?? 36, blur: o.blur ?? 14, s: o.s ?? 1, curva: o.curva }));
  }

  function escondePiezas(piezas, t, desde, o = {}) {
    const paso = o.paso ?? 0.02;
    const dur = o.dur ?? 0.3;
    piezas.forEach((el, i) => {
      const k = curva.entrada(tramo(t, desde + i * paso, desde + i * paso + dur));
      if (k > 0) pon(el, { y: (o.y ?? -30) * k, o: 1 - k, blur: (o.blur ?? 10) * k });
    });
  }

  /** Los números como los escribe la aplicación: punto de miles, sin decimales. */
  function miles(n) {
    const s = String(Math.round(Math.abs(n)));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  const pesos = (n) => (n < 0 ? "−$" : "$") + miles(n);

  /** Un generador de números al azar con semilla: el mismo polvo en cada cuadro. */
  function azar(semilla) {
    let s = semilla >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let r = Math.imul(s ^ (s >>> 15), 1 | s);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Un contador de rodillos: cada cifra es una columna del 0 al 9 que gira
   * hasta la nueva, de derecha a izquierda, como un marcador mecánico.
   */
  function rodillo(el, desde, hasta) {
    const a = miles(desde), b = miles(hasta);
    const largo = Math.max(a.length, b.length);
    const va = a.padStart(largo, " "), vb = b.padStart(largo, " ");
    el.textContent = "";
    el.classList.add("rodillo");
    const signo = document.createElement("span");
    signo.textContent = "$";
    el.appendChild(signo);
    const columnas = [];
    for (let i = 0; i < largo; i++) {
      const ca = va[i], cb = vb[i];
      if (ca === "." || cb === ".") {
        const s = document.createElement("span");
        s.textContent = ".";
        el.appendChild(s);
        continue;
      }
      const ventana = document.createElement("span");
      ventana.className = "rodillo-ventana";
      const tira = document.createElement("span");
      tira.className = "rodillo-tira";
      const inicio = ca === " " ? 0 : Number(ca);
      const fin = cb === " " ? 0 : Number(cb);
      // Una vuelta entera de más si la cifra cambia, así se ve girar aunque
      // pase del 4 al 5.
      const pasos = inicio === fin ? 0 : ((fin - inicio + 10) % 10) + 10;
      let html = "";
      for (let d = 0; d <= pasos; d++) html += `<span>${(inicio + d) % 10}</span>`;
      tira.innerHTML = html;
      ventana.appendChild(tira);
      el.appendChild(ventana);
      columnas.push({ tira, pasos });
    }
    return {
      dibuja(t, t0, dur = 0.9) {
        columnas.forEach((c, i) => {
          const orden = columnas.length - 1 - i;
          const k = curva.salida(tramo(t, t0 + orden * 0.06, t0 + orden * 0.06 + dur));
          // Cada cifra de la tira mide 1,15em (ver .rodillo-tira en index.html).
          c.tira.style.transform = `translateY(${(-c.pasos * k * 1.15).toFixed(4)}em)`;
        });
      },
    };
  }

  window.M = { clamp, lerp, tramo, bezier, curva, resorte, pon, entra, entraYSale, letras, palabras, revela, escondePiezas, miles, pesos, azar, rodillo };
})();
