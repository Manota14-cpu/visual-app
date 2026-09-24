import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { Almacen, Regla } from "./almacen.ts";
import {
  leerCuerpo,
  responderJson,
  Respuesta,
  Ruteador,
  tokenDeCookies,
  type Acceso,
} from "./http.ts";
import { puedeEntrar } from "./red.ts";
import { Sitio } from "./sitio.ts";
import { usuarioDeToken } from "./usuarios.ts";
import { anotarEscucha } from "./vida.ts";

export { usarAnfitrion } from "./anfitrion.ts";

import { rutasCaja } from "./api/caja.ts";
import { rutasCatalogo } from "./api/catalogo.ts";
import { rutasClientes } from "./api/clientes.ts";
import { rutasGastos } from "./api/gastos.ts";
import { rutasInformes } from "./api/informes.ts";
import { rutasMovimientos } from "./api/movimientos.ts";
import { rutasPanel } from "./api/panel.ts";
import { rutasPedidos } from "./api/pedidos.ts";
import { rutasProveedores } from "./api/proveedores.ts";
import { rutasRecuento } from "./api/recuento.ts";
import { rutasVencimientos } from "./api/vencimientos.ts";
import { rutasSistema } from "./api/sistema.ts";
import { rutasTraspaso } from "./api/traspaso.ts";
import { rutasUsuarios } from "./api/usuarios.ts";

// =====================================================================
// Visual App — panel de stock, caja y ventas.
//
// Un servidor chico que atiende en la propia computadora: sirve la interfaz
// ya compilada, expone la API y guarda todo en un archivo JSON. No hay base
// de datos que instalar ni servicio en la nube del que dependa.
//
// Quien lo arranca es la aplicación de escritorio (`electron/main.js`), que
// después abre su ventana contra él. Corre adentro del mismo proceso: no hay
// un segundo programa suelto, ni una consola, ni un navegador.
//
// Sigue siendo un servidor HTTP de verdad, y no un canal privado entre la
// ventana y el proceso, por el acceso desde el celular: el teléfono del
// mostrador entra por el wifi del local a esta misma dirección.
// =====================================================================

export const PUERTO_PREFERIDO = 5177;

export interface OpcionesServidor {
  /** Dónde vive `datos.json` y sus copias. */
  carpeta: string;
  /** La interfaz compilada (`out/` de Next). */
  sitio: string;
  puerto?: number;
}

export interface ServidorEnMarcha {
  puerto: number;
  almacen: Almacen;
  cerrar: () => Promise<void>;
}

/**
 * Otra copia del programa ya está atendiendo con estos datos.
 *
 * Dos procesos escribiendo el mismo archivo lo dejarían con lo que guardó el
 * último, y perder las ventas de un turno por un doble clic no es un error
 * aceptable. Quien arranca decide qué hacer: la aplicación de escritorio lo
 * explica en un cartel en vez de abrir una segunda.
 */
export class OtraCopiaAbierta extends Error {
  // Sin `constructor(readonly puerto)`: en desarrollo este archivo lo corre
  // Node tal cual, borrando los tipos, y esa forma no es un tipo que se pueda
  // borrar sino código que habría que generar.
  readonly puerto: number;

  constructor(puerto: number) {
    super(`Visual App ya está abierto en el puerto ${puerto}.`);
    this.name = "OtraCopiaAbierta";
    this.puerto = puerto;
  }
}

export async function iniciarServidor(opciones: OpcionesServidor): Promise<ServidorEnMarcha> {
  const almacen = new Almacen(path.join(opciones.carpeta, "datos.json"));
  const sitio = new Sitio(opciones.sitio);

  resguardarAlAbrir(almacen);

  const api = new Ruteador();
  rutasPanel(api, almacen);
  rutasCatalogo(api, almacen);
  rutasMovimientos(api, almacen);
  rutasCaja(api, almacen);
  rutasPedidos(api, almacen);
  rutasClientes(api, almacen);
  rutasGastos(api, almacen);
  rutasProveedores(api, almacen);
  rutasRecuento(api, almacen);
  rutasVencimientos(api, almacen);
  rutasInformes(api, almacen);
  rutasSistema(api, almacen);
  rutasTraspaso(api, almacen);
  rutasUsuarios(api, almacen);

  const servidor = http.createServer((req, res) => {
    // Ningún pedido puede voltear el programa. Un error que se escape de
    // `atender` se contesta como 500 y se anota: sin esto, una promesa
    // rechazada sin atender terminaba el proceso —y con él la caja— por una
    // sola dirección mal escrita.
    atender(req, res, almacen, sitio, api).catch((error: unknown) => {
      console.error(`[error] ${req.method} ${req.url}:`, error);
      if (!res.headersSent) responderJson(res, 500, { error: "Algo falló del lado del programa." });
      else res.end();
    });
  });

  const puerto = await escuchar(servidor, almacen, opciones.puerto ?? PUERTO_PREFERIDO);

  return {
    puerto,
    almacen,
    cerrar: () =>
      new Promise<void>((resolver) => {
        servidor.close(() => resolver());
        // Un celular con la pantalla abierta mantiene la conexión viva, y
        // `close` esperaría a que la suelte. Cerrar el programa no espera.
        servidor.closeAllConnections();
      }),
  };
}

async function atender(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  almacen: Almacen,
  sitio: Sitio,
  api: Ruteador
): Promise<void> {
  // Con la red apagada, solo esta computadora. Con la red prendida, además
  // cualquier dirección privada — el wifi del local. Ver `red.ts`.
  const enRed = almacen.leer((d) => d.config.enRed);
  if (!puedeEntrar(req.headers.host, enRed) || !puedeEntrar(req.headers.origin, enRed)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Visual App solo atiende pedidos de esta computadora o de la red del local.");
    return;
  }

  // Durante el desarrollo la interfaz corre en el servidor de Next y la API
  // acá. En la aplicación las dos cosas son el mismo origen y esto no se usa.
  const origen = req.headers.origin;
  if (origen) {
    res.setHeader("Access-Control-Allow-Origin", origen);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    // La sesión viaja en cookie, y el navegador no la manda entre puertos
    // distintos sin este permiso. Se puede nombrar el origen porque
    // `puedeEntrar` ya filtró todo lo que no sea esta computadora o el local:
    // con `*` el navegador directamente prohíbe las credenciales.
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const direccion = new URL(req.url ?? "/", "http://localhost");

  // `decodeURIComponent` lanza con un "%" que no forma un carácter ("/%E0%A4%A",
  // "/%zz"). Antes eso pasaba afuera de todo control y tiraba el servidor:
  // cualquier celular del wifi, con un enlace roto, dejaba la caja sin
  // programa.
  let camino: string;
  try {
    camino = decodeURIComponent(direccion.pathname);
  } catch {
    responderJson(res, 400, { error: "Esa dirección está mal formada." });
    return;
  }

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
      cuerpo,
      quienPide(req, almacen)
    );

    if (!encontrada) {
      responderJson(res, 404, { error: "Ese pedido no existe en la API." });
      return;
    }

    if (resultado instanceof Respuesta) {
      for (const [nombre, valor] of Object.entries(resultado.cabeceras)) {
        res.setHeader(nombre, valor);
      }
      responderJson(res, resultado.estado, resultado.cuerpo);
      return;
    }

    responderJson(res, 200, resultado ?? null);
  } catch (error) {
    // Un error de negocio —"stock insuficiente de Vasos 180cc"— es una
    // respuesta esperable y viaja como 400 con el texto tal cual se le muestra
    // al usuario. Cualquier otra excepción es un defecto: se anota entera y se
    // contesta algo que no filtre el detalle interno.
    if (error instanceof Regla) {
      responderJson(res, 400, { error: error.message });
      return;
    }

    console.error(`[error] ${req.method} ${camino}:`, error);
    responderJson(res, 500, { error: "Algo falló del lado del programa. Probá de nuevo." });
  }
}

/**
 * Quién manda este pedido.
 *
 * `exigir` sale de si el negocio tiene algún usuario activo. Mientras no tenga
 * ninguno, la aplicación se usa sin contraseña igual que siempre: es lo que
 * hace que actualizar a esta versión no deje a nadie afuera de su negocio, y
 * lo que permite que el primer usuario se cree sin tener con qué entrar.
 */
function quienPide(req: http.IncomingMessage, almacen: Almacen): Acceso {
  const token = tokenDeCookies(req.headers.cookie);

  return almacen.leer((d) => ({
    usuario: usuarioDeToken(d, token),
    exigir: d.usuarios.some((u) => u.activo),
    token,
  }));
}

/**
 * Se pone a escuchar, corriéndose de puerto si hace falta.
 *
 * El puerto preferido es siempre el mismo porque el celular guarda la
 * dirección: si el programa cambiara de puerto en cada arranque, el acceso
 * directo del teléfono dejaría de andar.
 */
function escuchar(servidor: http.Server, almacen: Almacen, puerto: number): Promise<number> {
  // `0.0.0.0` es "atendé por todas las placas de red"; `127.0.0.1` es "solo
  // por la de adentro, que no sale de esta computadora". Es la diferencia
  // entre que el celular llegue o no llegue.
  const enRed = almacen.leer((d) => d.config.enRed);
  const host = enRed ? "0.0.0.0" : "127.0.0.1";

  return new Promise((resolver, rechazar) => {
    const intentar = (candidato: number, intentos: number) => {
      const alFallar = (error: NodeJS.ErrnoException) => {
        servidor.off("listening", alEscuchar);
        if (error.code !== "EADDRINUSE" || intentos > 40) {
          rechazar(error);
          return;
        }

        void (async () => {
          if (await esVisualSolution(candidato)) {
            rechazar(new OtraCopiaAbierta(candidato));
            return;
          }
          intentar(candidato + 1, intentos + 1);
        })();
      };

      const alEscuchar = () => {
        servidor.off("error", alFallar);
        anotarEscucha(candidato, enRed);
        resolver(candidato);
      };

      servidor.once("error", alFallar);
      servidor.once("listening", alEscuchar);
      servidor.listen(candidato, host);
    };

    intentar(puerto, 0);
  });
}

/**
 * ¿Lo que contesta en ese puerto es otra copia de este mismo programa?
 *
 * Se mira `programa`, que `/api/sistema` devuelve siempre —con sesión o sin
 * ella—. Antes se miraba la ruta del archivo, que con usuarios creados solo ve
 * el dueño: la otra copia pasaba por un programa cualquiera, el nuevo se corría
 * de puerto y quedaban dos escribiendo el mismo archivo.
 */
async function esVisualSolution(puerto: number): Promise<boolean> {
  try {
    const respuesta = await fetch(`http://127.0.0.1:${puerto}/api/sistema`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!respuesta.ok) return false;
    const datos = (await respuesta.json()) as { programa?: unknown };
    return typeof datos.programa === "string";
  } catch {
    return false;
  }
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
function resguardarAlAbrir(almacen: Almacen): void {
  try {
    const copia = almacen.copiaDelDia();
    if (copia) console.log(`  Copia del día  ${copia}`);
  } catch (error) {
    // Una copia que falla —disco lleno, carpeta sin permisos— no puede impedir
    // que el negocio abra. Se avisa y el programa sigue.
    console.error(`  No se pudo guardar la copia del día: ${(error as Error).message}`);
  }

  // Y la de afuera, si el negocio eligió una carpeta.
  //
  // Esta es la que importa de verdad: la de arriba vive en el mismo disco que
  // el archivo que protege, así que del disco que no arranca no salva a nadie.
  //
  // Que falle no frena nada ni se avisa acá con un cartel: el destino puede ser
  // un pendrive que hoy no está enchufado, y trabar el mostrador por eso sería
  // peor que la falta de copia. La pantalla lo muestra —Configuración lo dice,
  // y el Panel avisa si se hizo vieja— porque ahí se puede leer con calma.
  const carpeta = almacen.leer((d) => d.config.resguardo);
  if (!carpeta) return;

  try {
    const copia = almacen.resguardar(carpeta);
    if (copia) console.log(`  Copia de seguridad  ${copia}`);
  } catch (error) {
    console.error(`  No se pudo guardar la copia de seguridad: ${(error as Error).message}`);
  }
}

/**
 * Dónde se guardan los datos.
 *
 * En la carpeta del usuario y no al lado del programa: la carpeta del programa
 * la reemplaza cada actualización, y puede terminar en un lugar donde Windows
 * no deja escribir.
 *
 * La carpeta es la misma que usaba la versión de PowerShell: ahí están el
 * catálogo, las ventas y los turnos de todos los que ya lo usan. Cambiarla
 * haría que la versión nueva arranque con una base vacía, con los datos
 * intactos al lado pero invisibles.
 */
export function carpetaDeDatos(elegida?: string): string {
  if (elegida) return elegida;

  const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share");
  const carpeta = path.join(base, "Visual App");
  mudarDatosDeAppPack(base, carpeta);
  return carpeta;
}

/**
 * Se lleva los datos de la carpeta vieja a la nueva.
 *
 * El programa se llamaba AppPack y sus datos vivían en una carpeta con ese
 * nombre. Sin esto, la primera vez que se abre la versión nueva encuentra una
 * carpeta que no existe, crea una base vacía y el negocio ve su catálogo, sus
 * ventas y sus turnos desaparecidos.
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
