/**
 * Convierte la animación en un MP4 vertical.
 *
 *   node render.mjs                         el video entero, 1080×1920 a 60 cuadros
 *   node render.mjs --cuadros 1.5,9,17.2    solo esas fotos, en PNG, para revisar
 *   node render.mjs --servir                la vista previa en http://localhost:5178
 *
 * Abre index.html en Chromium, le pide a la página que dibuje el segundo
 * exacto de cada cuadro (`window.__dibujar(t)`), le saca una foto y al final
 * junta las fotos y la música con ffmpeg. Como nada se mueve solo, no importa
 * cuánto tarde cada foto: el video sale igual en cualquier máquina.
 *
 * Necesita Chromium (CHROMIUM=/ruta/al/chrome si no está donde Playwright lo
 * busca) y ffmpeg (FFMPEG=/ruta/a/ffmpeg si no está en el PATH).
 */
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i === -1 ? porDefecto : args[i + 1];
};

const FPS = Number(opcion("fps", 60));
const SALIDA = opcion("salida", join(aqui, "visual-app.mp4"));
const CUADROS = opcion("cuadros", null);
const HILOS = Number(opcion("hilos", Math.max(1, Math.min(6, cpus().length))));
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const TEMPORAL = opcion("temporal", join(aqui, ".cuadros"));

// ───────────────────── Un servidor de archivos mínimo ─────────────────────
// Las fuentes no cargan desde file:// en todos los navegadores: se sirve la
// carpeta por HTTP en la propia máquina.
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".woff2": "font/woff2", ".m4a": "audio/mp4", ".wav": "audio/wav", ".png": "image/png", ".svg": "image/svg+xml" };
function servir(puerto = 0) {
  return new Promise((resolver) => {
    const servidor = createServer((pedido, respuesta) => {
      const ruta = normalize(decodeURIComponent(new URL(pedido.url, "http://x").pathname)).replace(/^([/\\])+/, "");
      const archivo = join(aqui, ruta || "index.html");
      if (!archivo.startsWith(aqui) || !existsSync(archivo) || statSync(archivo).isDirectory()) {
        respuesta.writeHead(404).end();
        return;
      }
      respuesta.writeHead(200, { "content-type": TIPOS[extname(archivo)] || "application/octet-stream" });
      respuesta.end(readFileSync(archivo));
    });
    servidor.listen(puerto, "127.0.0.1", () => resolver(servidor));
  });
}

function buscarChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const candidatos = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"];
  return candidatos.find((c) => existsSync(c));
}

async function abrirPagina(navegador, url) {
  const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  pagina.on("pageerror", (error) => {
    console.error("Error en la página:", error.message);
    process.exit(1);
  });
  await pagina.goto(url);
  await pagina.evaluate(() => window.__listo);
  const cdp = await pagina.context().newCDPSession(pagina);
  return { pagina, cdp };
}

async function foto({ pagina, cdp }, t) {
  await pagina.evaluate((t) => window.__dibujar(t), t);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, captureBeyondViewport: false });
  return Buffer.from(data, "base64");
}

function ejecutar(comando, argumentos) {
  return new Promise((resolver, rechazar) => {
    const p = spawn(comando, argumentos, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`${comando} terminó con ${codigo}`))));
  });
}

const servidor = await servir(args.includes("--servir") ? 5178 : 0);
const url = `http://127.0.0.1:${servidor.address().port}/index.html?render`;

if (args.includes("--servir")) {
  console.log("Vista previa en http://127.0.0.1:5178/index.html  (espacio: pausa · flechas: cuadro a cuadro)");
} else {
  const navegador = await chromium.launch({ executablePath: buscarChromium(), args: ["--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars"] });
  const { writeFile } = await import("node:fs/promises");

  if (CUADROS) {
    const pagina = await abrirPagina(navegador, url);
    const carpeta = join(aqui, ".muestras");
    mkdirSync(carpeta, { recursive: true });
    for (const t of CUADROS.split(",").map(Number)) {
      const archivo = join(carpeta, `t${t.toFixed(2).padStart(5, "0")}.png`);
      await writeFile(archivo, await foto(pagina, t));
      console.log(archivo);
    }
  } else {
    const duracion = await (await abrirPagina(navegador, url)).pagina.evaluate(() => window.__duracion);
    const total = Math.round(duracion * FPS);
    rmSync(TEMPORAL, { recursive: true, force: true });
    mkdirSync(TEMPORAL, { recursive: true });
    const inicio = Date.now();
    let hechos = 0;
    // Cada hilo se lleva cuadros salteados (0, 4, 8… / 1, 5, 9…) así terminan todos juntos.
    await Promise.all(
      Array.from({ length: HILOS }, async (_, h) => {
        const pagina = await abrirPagina(navegador, url);
        for (let i = h; i < total; i += HILOS) {
          await writeFile(join(TEMPORAL, `${String(i).padStart(5, "0")}.png`), await foto(pagina, i / FPS));
          hechos++;
          if (hechos % 60 === 0) {
            const s = (Date.now() - inicio) / 1000;
            process.stdout.write(`\r${hechos}/${total} cuadros · ${s.toFixed(0)} s · faltan ${((s / hechos) * (total - hechos)).toFixed(0)} s   `);
          }
        }
      })
    );
    console.log(`\n${total} cuadros en ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
    await navegador.close();

    const musica = ["musica.wav", "musica.m4a"].map((m) => join(aqui, m)).find((m) => existsSync(m));
    await ejecutar(FFMPEG, [
      "-y", "-hide_banner", "-loglevel", "error", "-stats",
      "-framerate", String(FPS), "-i", join(TEMPORAL, "%05d.png"),
      ...(musica ? ["-i", musica] : []),
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
      "-profile:v", "high", "-level", "4.2", "-movflags", "+faststart",
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
      ...(musica ? ["-c:a", "aac", "-b:a", "256k", "-shortest"] : []),
      SALIDA,
    ]);
    rmSync(TEMPORAL, { recursive: true, force: true });
    console.log(SALIDA);
    servidor.close();
    process.exit(0);
  }
  await navegador.close();
  servidor.close();
}
