import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepararActualizaciones, vigilarActualizaciones } from "./actualizacion.ts";
import { Almacen, Regla } from "./almacen.ts";
import { leerCuerpo, responderJson, Respuesta, Ruteador } from "./http.ts";
import { lanzar } from "./lanzar.ts";
import { Sitio } from "./sitio.ts";
import { ultimoLatido } from "./vida.ts";

import { rutasCaja } from "./api/caja.ts";
import { rutasCatalogo } from "./api/catalogo.ts";
import { rutasClientes } from "./api/clientes.ts";
import { rutasGastos } from "./api/gastos.ts";
import { rutasInformes } from "./api/informes.ts";
import { rutasMovimientos } from "./api/movimientos.ts";
import { rutasPanel } from "./api/panel.ts";
import { rutasPedidos } from "./api/pedidos.ts";
import { rutasActualizacion } from "./api/actualizacion.ts";
import { rutasSistema } from "./api/sistema.ts";
import { rutasTraspaso } from "./api/traspaso.ts";

// =====================================================================
// Visual App — panel de stock, caja y ventas.
//
// Un servidor chico que atiende en la propia computadora: sirve la interfaz
// ya compilada, expone la API y guarda todo en un archivo JSON. No hay base
// de datos que instalar ni servicio en la nube del que dependa; el programa
// abre el navegador contra sí mismo.
// =====================================================================

const PUERTO_PREFERIDO = 5177;

const opciones = leerOpciones(process.argv.slice(2));
const almacen = new Almacen(opciones.archivo);
const sitio = new Sitio(carpetaDelSitio());

resguardarAlAbrir();

const api = new Ruteador();
rutasPanel(api, almacen);
rutasCatalogo(api, almacen);
rutasMovimientos(api, almacen);
rutasCaja(api, almacen);
rutasPedidos(api, almacen);
rutasClientes(api, almacen);
rutasGastos(api, almacen);
rutasInformes(api, almacen);
rutasSistema(api, almacen);
rutasTraspaso(api, almacen);
rutasActualizacion(api, almacen);

prepararActualizaciones(opciones.carpeta);

const servidor = http.createServer((req, res) => {
  void atender(req, res);
});

async function atender(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  // Solo atiende a quien entró por la puerta de casa. Ver `esLocal`.
  if (!esLocal(req.headers.host) || !esLocal(req.headers.origin)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Visual App solo atiende pedidos de esta computadora.");
    return;
  }

  // Durante el desarrollo la interfaz corre en el servidor de Next y la API
  // acá. En el paquete las dos cosas son el mismo origen y esto no se usa.
  const origen = req.headers.origin;
  if (origen) {
    res.setHeader("Access-Control-Allow-Origin", origen);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const direccion = new URL(req.url ?? "/", "http://localhost");
  const camino = decodeURIComponent(direccion.pathname);

  if (!camino.startsWith("/api")) {
    sitio.responder(res, camino);
    return;
  }

  try {
    const cuerpo = req.method === "GET" ? {} : await leerCuerpo(req);
    const { encontrada, resultado } = await api.resolver(
      req.method ?? "GET",
      camino.slice(4) || "/",
      direccion.searchParams,
      cuerpo
    );

    if (!encontrada) {
      responderJson(res, 404, { error: "Ese pedido no existe en la API." });
      return;
    }

    if (resultado instanceof Respuesta) {
      responderJson(res, resultado.estado, resultado.cuerpo);
      return;
    }

    responderJson(res, 200, resultado ?? null);
  } catch (error) {
    // Un error de negocio —"stock insuficiente de Vasos 180cc"— es una
    // respuesta esperable y viaja como 400 con el texto tal cual se le muestra
    // al usuario. Cualquier otra excepción es un defecto: se anota entera en la
    // consola y se contesta algo que no filtre el detalle interno.
    if (error instanceof Regla) {
      responderJson(res, 400, { error: error.message });
      return;
    }

    console.error(`[error] ${req.method} ${camino}:`, error);
    responderJson(res, 500, { error: "Algo falló del lado del programa. Probá de nuevo." });
  }
}

/**
 * ¿Este pedido salió de esta computadora?
 *
 * El servidor escucha en 127.0.0.1, y eso alcanzaba para creer que nadie de
 * afuera lo alcanzaba. No alcanza: cualquier página web abierta en el
 * navegador corre EN esta computadora, y puede escribirle. Un `fetch` con
 * `Content-Type: text/plain` no dispara consulta previa, así que el pedido
 * llega y se ejecuta; lo único que el navegador impide después es leer la
 * respuesta. Con eso, un sitio cualquiera podía vaciar la base entera sin que
 * nadie se enterara —probado, borraba todo— o abrir un turno de caja.
 *
 * Se miran las dos cabeceras que el navegador escribe y una página no puede
 * falsificar:
 *
 * - `Origin` dice de qué sitio salió el pedido. La interfaz de Visual App manda
 *   `http://localhost:5177`; una página de internet manda su propio dominio.
 *   Cuando no viene —una navegación normal, o `curl`— no hay sitio del que
 *   defenderse.
 * - `Host` es el nombre por el que se llegó, y cierra la otra puerta: un
 *   dominio que apunta a 127.0.0.1 haría que el navegador considere a Visual App
 *   "el mismo sitio" y deje leer las respuestas.
 */
function esLocal(valor: string | undefined): boolean {
  if (valor === undefined) return true;
  const sinEsquema = valor.replace(/^https?:\/\//, "");
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(sinEsquema);
}

arrancar(opciones.puerto);

/**
 * Levanta el servidor, corriéndose de puerto si hace falta.
 *
 * Si el puerto está ocupado por OTRA copia de Visual App, no se abre una segunda:
 * dos procesos escribiendo el mismo archivo lo dejarían con lo que guardó el
 * último, y perder las ventas de un turno por hacer doble clic dos veces no es
 * un error aceptable. Se trae al frente la ventana que ya estaba y listo.
 */
function arrancar(puerto: number, intentos = 0): void {
  servidor.once("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EADDRINUSE" || intentos > 40) {
      console.error("No se pudo abrir Visual App:", error.message);
      process.exit(1);
    }

    void (async () => {
      if (await esVisualApp(puerto)) {
        console.log("Visual App ya está abierto. Se muestra la ventana que ya estaba.");
        if (!opciones.noAbrir) abrirVentana(`http://localhost:${puerto}`, opciones.carpeta);
        process.exit(0);
      }

      arrancar(puerto + 1, intentos + 1);
    })();
  });

  servidor.listen(puerto, "127.0.0.1", () => {
    const direccion = `http://localhost:${puerto}`;

    console.log("");
    console.log("  Visual App");
    console.log(`  Abierto en   ${direccion}`);
    console.log(`  Datos en     ${almacen.archivo}`);
    console.log("");

    if (opciones.noAbrir) {
      console.log("  Cerrá esta ventana para apagar el programa.");
      console.log("");
      return;
    }

    abrirVentana(direccion, opciones.carpeta);
    vigilarVentana();
    vigilarActualizaciones();
  });
}

/**
 * Guarda una copia de los datos la primera vez que se abre el programa cada día.
 *
 * Todo el negocio —catálogo, ventas, turnos, movimientos— vive en un archivo
 * en una sola computadora. Había un botón para copiarlo, pero un botón que hay
 * que acordarse de apretar no protege a nadie: el día que el disco no arranca,
 * la última copia es de cuando alguien se acordó por última vez.
 *
 * Es al abrir y no al cerrar porque el programa puede terminar de mil maneras
 * —cerrar la ventana, un corte de luz, un apagón de Windows— y de ninguna de
 * ellas se vuelve para hacer una copia.
 */
function resguardarAlAbrir(): void {
  try {
    const copia = almacen.copiaDelDia();
    if (copia) console.log(`  Copia del día  ${copia}`);
  } catch (error) {
    // Una copia que falla —disco lleno, carpeta sin permisos— no puede impedir
    // que el negocio abra. Se avisa y el programa sigue.
    console.error(`  No se pudo guardar la copia del día: ${(error as Error).message}`);
  }
}

/**
 * Apaga el programa cuando ya no hay ninguna ventana mirando.
 *
 * La ventana avisa que sigue abierta cada veinte segundos. Si pasa un minuto y
 * medio sin noticias, el servidor se apaga solo: para quien lo usa, cerrar la
 * ventana es cerrar la aplicación, que es lo que hace cualquier programa.
 *
 * El margen es generoso a propósito — una computadora que se pone a pensar, o
 * la pantalla que se apaga, no tienen que voltear el servidor con una venta a
 * medio cobrar.
 */
function vigilarVentana(): void {
  const MARGEN = 90_000;

  setInterval(() => {
    if (Date.now() - ultimoLatido() < MARGEN) return;

    console.log("  No quedan ventanas abiertas. Apagando Visual App.");
    servidor.close();
    process.exit(0);
  }, 20_000).unref();
}

/** ¿Lo que contesta en ese puerto es otra copia de este mismo programa? */
async function esVisualApp(puerto: number): Promise<boolean> {
  try {
    const respuesta = await fetch(`http://localhost:${puerto}/api/sistema`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!respuesta.ok) return false;
    const datos = (await respuesta.json()) as { archivo?: string };
    return typeof datos.archivo === "string";
  } catch {
    return false;
  }
}

/**
 * Abre Visual App en su propia ventana.
 *
 * Edge y Chrome tienen un modo aplicación: `--app=` abre una ventana sin
 * pestañas, sin barra de direcciones y con su lugar propio en la barra de
 * tareas. Se ve y se usa como cualquier programa; lo único que queda del
 * navegador es el motor que dibuja.
 *
 * El perfil va aparte, en la carpeta de datos: así la ventana no arrastra las
 * pestañas, las extensiones ni la sesión de quien esté navegando, y Windows la
 * agrupa como una aplicación distinta.
 *
 * Si no hay ninguno de los dos —raro en Windows, posible en otro sistema— se
 * cae al navegador por omisión, que abrirá una pestaña común.
 */
function abrirVentana(direccion: string, carpeta: string): void {
  const perfil = path.join(carpeta, "ventana");

  const candidatos =
    process.platform === "win32"
      ? [
          path.join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft/Edge/Application/msedge.exe"),
          path.join(process.env.ProgramFiles ?? "", "Microsoft/Edge/Application/msedge.exe"),
          path.join(process.env.ProgramFiles ?? "", "Google/Chrome/Application/chrome.exe"),
          path.join(
            process.env["ProgramFiles(x86)"] ?? "",
            "Google/Chrome/Application/chrome.exe"
          ),
          path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
        ]
      : [];

  const navegador = candidatos.find((ruta) => ruta && fs.existsSync(ruta));

  if (navegador) {
    lanzar(navegador, [
      `--app=${direccion}`,
      `--user-data-dir=${perfil}`,
      "--window-size=1280,860",
      "--no-first-run",
      "--no-default-browser-check",
      // Sin esto, la primera vez pregunta por el llavero del sistema.
      "--password-store=basic",
    ]);
    return;
  }

  if (process.platform === "win32") {
    // El primer argumento vacío es el título de la ventana: sin él, `start`
    // toma la dirección entre comillas como título y no abre nada.
    lanzar("cmd", ["/c", "start", "", direccion]);
  } else if (process.platform === "darwin") {
    lanzar("open", [direccion]);
  } else {
    lanzar("xdg-open", [direccion]);
  }
}

interface Opciones {
  carpeta: string;
  archivo: string;
  puerto: number;
  noAbrir: boolean;
}

/**
 * Cómo arranca el programa: dónde guarda, en qué puerto, si abre el navegador.
 *
 * Los datos van a la carpeta del usuario y no al lado del programa: la carpeta
 * del programa puede terminar en un lugar donde Windows no deja escribir, y ahí
 * la primera venta fallaría.
 */
function leerOpciones(args: string[]): Opciones {
  const valor = (nombre: string): string | undefined => {
    const i = args.indexOf(nombre);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
  };

  const elegida = valor("--datos") ?? process.env.VISUALAPP_DATOS;
  const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share");
  const carpeta = elegida ?? path.join(base, "Visual App");

  // El programa se llamaba AppPack y sus datos vivían en una carpeta con ese
  // nombre. Solo se mira cuando nadie eligió otra a mano: si alguien pasó
  // --datos, ahí manda esa.
  if (!elegida) mudarDatosDeAppPack(base, carpeta);

  const puerto = Number(valor("--puerto"));

  return {
    carpeta,
    archivo: path.join(carpeta, "datos.json"),
    puerto: Number.isInteger(puerto) && puerto > 0 ? puerto : PUERTO_PREFERIDO,
    noAbrir: args.includes("--no-abrir"),
  };
}

/**
 * Se lleva los datos de la carpeta vieja a la nueva.
 *
 * El programa cambió de nombre, y con él la carpeta donde guarda. Sin esto, la
 * primera vez que se abre la versión nueva encuentra una carpeta que no existe,
 * crea una base vacía y el negocio ve su catálogo, sus ventas y sus turnos
 * desaparecidos — con los datos ahí al lado, intactos, pero invisibles.
 *
 * Se mueve la carpeta entera de una sola vez, que en el mismo disco es
 * instantáneo y no deja dos copias que después no se sepa cuál es la buena. Y
 * solo si la nueva todavía no existe: si ya hay datos nuevos, mandan esos.
 */
function mudarDatosDeAppPack(base: string, carpeta: string): void {
  const vieja = path.join(base, "AppPack");

  if (fs.existsSync(carpeta) || !fs.existsSync(vieja)) return;
  if (!fs.existsSync(path.join(vieja, "datos.json"))) return;

  try {
    fs.renameSync(vieja, carpeta);
    console.log(`  Se mudaron los datos de AppPack a ${carpeta}`);
  } catch (error) {
    // Que no se pueda mudar no puede impedir que el programa abra: se avisa y
    // se arranca con la carpeta nueva, y los datos viejos quedan donde estaban.
    console.error(`[datos] no se pudieron mudar desde ${vieja}: ${(error as Error).message}`);
  }
}

/**
 * Dónde está la interfaz compilada.
 *
 * En el paquete, al lado del servidor. Corriendo desde el repositorio, la
 * carpeta `out` que deja `next build`, así se puede levantar el backend sin
 * volver a empaquetar.
 */
function carpetaDelSitio(): string {
  const aca = path.dirname(fileURLToPath(import.meta.url));

  for (const candidata of [
    path.join(aca, "..", "sitio"),
    path.join(aca, "..", "..", "out"),
    path.join(process.cwd(), "out"),
  ]) {
    if (fs.existsSync(candidata)) return candidata;
  }

  return path.join(aca, "..", "sitio");
}
