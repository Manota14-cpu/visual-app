import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";

/**
 * La interfaz web, servida desde el disco.
 *
 * Next compila las pantallas a HTML, CSS y JavaScript estáticos. El paquete
 * deja esa carpeta al lado del servidor y desde acá se responde: sin plantillas,
 * sin render en el servidor, sin base de datos en el medio.
 *
 * Todo se lee a memoria al arrancar —son unos pocos megas— para no ir al disco
 * veinte veces por cada pantalla que se abre.
 */
export class Sitio {
  private readonly archivos = new Map<string, Buffer>();

  constructor(carpeta: string) {
    if (!fs.existsSync(carpeta)) return;

    const recorrer = (actual: string) => {
      for (const entrada of fs.readdirSync(actual, { withFileTypes: true })) {
        const completa = path.join(actual, entrada.name);
        if (entrada.isDirectory()) {
          recorrer(completa);
        } else {
          const relativa = "/" + path.relative(carpeta, completa).split(path.sep).join("/");
          this.archivos.set(relativa.toLowerCase(), fs.readFileSync(completa));
        }
      }
    };

    recorrer(carpeta);
  }

  get vacio(): boolean {
    return this.archivos.size === 0;
  }

  /**
   * Busca el archivo que responde a una dirección del navegador.
   *
   * Next escribe `/productos` como `productos.html`, así que una dirección sin
   * extensión se prueba primero con `.html`. Lo que no existe cae en la página
   * 404 del propio sitio, no en un error del servidor: quien lo ve es una
   * persona, no un programa.
   */
  resolver(ruta: string): { contenido: Buffer; tipo: string; estado: number } | null {
    let camino = ruta.split("?")[0] ?? "/";

    // Nada de subir de carpeta: la dirección la escribe el navegador, pero
    // podría escribirla cualquiera.
    if (camino.includes("..")) return null;

    if (camino === "/" || camino === "") camino = "/index.html";
    camino = camino.replace(/\/+$/, "") || "/index.html";

    for (const candidata of [camino, `${camino}.html`, `${camino}/index.html`, ...segmentosRsc(camino)]) {
      const contenido = this.archivos.get(candidata.toLowerCase());
      if (contenido) return { contenido, tipo: tipoDe(candidata), estado: 200 };
    }

    const noEncontrada = this.archivos.get("/404.html");
    if (noEncontrada) return { contenido: noEncontrada, tipo: "text/html; charset=utf-8", estado: 404 };

    return null;
  }

  responder(res: ServerResponse, ruta: string): void {
    const archivo = this.resolver(ruta);

    if (!archivo) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        this.vacio
          ? "La interfaz no está compilada. Corré npm run build, o abrí la aplicación con npm run dev."
          : "No encontrado."
      );
      return;
    }

    res.writeHead(archivo.estado, {
      "Content-Type": archivo.tipo,
      "Content-Length": archivo.contenido.length,
      "Cache-Control": cacheDe(ruta),
    });
    res.end(archivo.contenido);
  }
}

/**
 * Dónde dejó Next los datos de una pantalla que el navegador pide con puntos.
 *
 * Al tocar un enlace, la interfaz no pide la página entera: pide sus datos,
 * con un nombre como `/panel/__next.panel.__PAGE__.txt`. La compilación los
 * escribe en carpetas, `/panel/__next.panel/__PAGE__.txt`. Sin esta traducción
 * cada pedido daba "no encontrado" y la interfaz se rendía recargando la página
 * entera en cada clic del menú.
 *
 * Se prueba cada punto como posible separador de carpeta, de izquierda a
 * derecha, y gana la primera que existe.
 */
function segmentosRsc(camino: string): string[] {
  const corte = camino.lastIndexOf("/");
  const carpeta = camino.slice(0, corte);
  const nombre = camino.slice(corte + 1);
  if (!nombre.startsWith("__next.") || !nombre.endsWith(".txt")) return [];

  const partes = nombre.slice(0, -".txt".length).split(".");
  const candidatas: string[] = [];
  for (let k = 1; k < partes.length - 1; k++) {
    candidatas.push(`${carpeta}/${partes.slice(0, k + 1).join(".")}/${partes.slice(k + 1).join("/")}.txt`);
  }
  return candidatas;
}

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

function tipoDe(ruta: string): string {
  return TIPOS[path.extname(ruta).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Lo que sirve para siempre y lo que no.
 *
 * Next le pone un hash en el nombre a todo lo que hay bajo `/_next/`: si el
 * contenido cambia, cambia el nombre. Eso se puede cachear un año. El HTML no:
 * es el que dice cuáles son los nombres de hoy.
 */
function cacheDe(ruta: string): string {
  return ruta.startsWith("/_next/") ? "public, max-age=31536000, immutable" : "no-cache";
}
