import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Regla } from "./almacen.ts";
import { VERSION } from "./api/sistema.ts";

/**
 * Actualizarse solo.
 *
 * El programa mira un archivo publicado en internet que dice cuál es la última
 * versión. Si hay una más nueva lo avisa en la pantalla, y recién cuando alguien
 * acepta la baja, la verifica y la instala.
 *
 * Tres decisiones que valen para todo lo que sigue:
 *
 * 1. **Nunca se actualiza solo.** Esto es una caja registradora. Una
 *    actualización que arranca sola a mitad de un turno es lo peor que puede
 *    pasar, por más que la versión nueva sea mejor. Se avisa y se espera.
 *
 * 2. **El canal es la confianza.** No podemos firmar ejecutables, así que quien
 *    controle esa dirección controla lo que se instala en la computadora. Por
 *    eso solo se acepta HTTPS y el archivo se compara contra el SHA-256 que
 *    declara el aviso: si no coincide, no se instala nada.
 *
 * 3. **Instalar no es asunto de acá.** Bajar el paquete y reemplazar el programa
 *    son dos problemas distintos, y el segundo ya está resuelto: el instalador
 *    cierra lo que está abierto, arma la copia al lado y la reemplaza de un
 *    saque. Este archivo baja, verifica y lo llama.
 */

/**
 * Dónde se publica la última versión.
 *
 * Con GitHub, `releases/latest/download/<archivo>` siempre apunta a la
 * publicación más reciente, así que la dirección no cambia nunca y no hay nada
 * que reconfigurar al sacar una versión nueva.
 *
 * Mientras diga USUARIO/REPO, la comprobación queda apagada: sin una dirección
 * de verdad no hay a quién preguntarle, y molestar con un error cada día por
 * algo que nadie configuró es peor que no hacer nada.
 */
export const ORIGEN =
  process.env.VISUALAPP_ACTUALIZACIONES ??
  "https://github.com/Manota14-cpu/visual-app/releases/latest/download/version.json";

export const CONFIGURADO = !ORIGEN.includes("USUARIO/REPO");

/** Lo que publica quien saca la versión. */
interface Aviso {
  version: string;
  fecha?: string;
  notas?: string;
  archivo: string;
  sha256: string;
  tamano?: number;
}

export interface Estado {
  configurado: boolean;
  instalada: string;
  revisadoEn: string | null;
  buscando: boolean;
  hay: boolean;
  ultima: { version: string; notas: string | null; fecha: string | null; tamano: number | null } | null;
  error: string | null;
}

let estadoActual: Estado = {
  configurado: CONFIGURADO,
  instalada: VERSION,
  revisadoEn: null,
  buscando: false,
  hay: false,
  ultima: null,
  error: null,
};

let ultimoAviso: Aviso | null = null;
let carpetaDatos = "";

export function estado(): Estado {
  return estadoActual;
}

export function prepararActualizaciones(carpeta: string): void {
  carpetaDatos = carpeta;
}

/**
 * Compara dos versiones tipo 1.2.3.
 *
 * Se comparan los números uno por uno y no como texto: "1.10.0" es posterior a
 * "1.9.0", pero alfabéticamente iría antes, y el programa se quedaría clavado
 * en la vieja sin decir nada.
 */
export function esPosterior(candidata: string, actual: string): boolean {
  const partes = (v: string) => v.trim().split(".").map((n) => Number.parseInt(n, 10));
  const a = partes(candidata);
  const b = partes(actual);

  if (a.some(Number.isNaN) || b.some(Number.isNaN) || a.length === 0) return false;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }

  return false;
}

function exigirHttps(direccion: string, que: string): URL {
  let url: URL;
  try {
    url = new URL(direccion);
  } catch {
    throw new Regla(`La dirección ${que} no es válida.`);
  }

  // Sin esto, quien pueda meterse en el medio de una conexión sin cifrar elige
  // qué programa se instala en esta computadora.
  //
  // La única excepción es la propia computadora: ahí no hay medio en el que
  // meterse, y es lo que permite probar el mecanismo completo —publicar, bajar,
  // verificar e instalar— sin montar un servidor con certificado.
  const enCasa = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && enCasa)) {
    throw new Regla("Las actualizaciones tienen que venir por HTTPS.");
  }
  return url;
}

/** Le pregunta al aviso publicado si hay algo nuevo. */
export async function revisar(): Promise<Estado> {
  if (!CONFIGURADO) return estadoActual;

  estadoActual = { ...estadoActual, buscando: true, error: null };

  try {
    exigirHttps(ORIGEN, "de actualizaciones");

    const respuesta = await fetch(ORIGEN, {
      signal: AbortSignal.timeout(12_000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!respuesta.ok) throw new Error(`el servidor contestó ${respuesta.status}`);

    const aviso = (await respuesta.json()) as Aviso;
    if (!aviso?.version || !aviso?.archivo || !aviso?.sha256) {
      throw new Error("el aviso de versión está incompleto");
    }

    ultimoAviso = aviso;
    estadoActual = {
      configurado: true,
      instalada: VERSION,
      revisadoEn: new Date().toISOString(),
      buscando: false,
      hay: esPosterior(aviso.version, VERSION),
      ultima: {
        version: aviso.version,
        notas: aviso.notas ?? null,
        fecha: aviso.fecha ?? null,
        tamano: aviso.tamano ?? null,
      },
      error: null,
    };
  } catch (error) {
    // Quedarse sin internet no es un problema del programa: se anota y se
    // sigue. La pantalla lo muestra flojito, no como una falla.
    estadoActual = {
      ...estadoActual,
      buscando: false,
      revisadoEn: new Date().toISOString(),
      error: (error as Error).message,
    };
  }

  return estadoActual;
}

/**
 * Baja el paquete, comprueba que sea el que dice ser y lo deja listo.
 *
 * El hash es lo único que separa "instalar la versión nueva" de "instalar lo
 * que haya en esa dirección". Se comprueba antes de descomprimir nada.
 */
async function bajar(aviso: Aviso): Promise<string> {
  exigirHttps(aviso.archivo, "del paquete");

  const carpeta = path.join(carpetaDatos, "actualizaciones");
  fs.mkdirSync(carpeta, { recursive: true });

  const respuesta = await fetch(aviso.archivo, { signal: AbortSignal.timeout(180_000) });
  if (!respuesta.ok) throw new Regla(`No se pudo bajar la actualización (${respuesta.status}).`);

  const datos = Buffer.from(await respuesta.arrayBuffer());
  const hash = createHash("sha256").update(datos).digest("hex");

  if (hash.toLowerCase() !== aviso.sha256.trim().toLowerCase()) {
    throw new Regla(
      "El archivo que llegó no coincide con el que se esperaba, así que no se instaló nada. Probá de nuevo más tarde."
    );
  }

  const zip = path.join(carpeta, `visual-app-${aviso.version}.zip`);
  fs.writeFileSync(zip, datos);
  return zip;
}

/** Corre PowerShell y espera. Se usa para descomprimir, que Node no sabe hacer. */
function correr(argumentos: string[]): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", ...argumentos], {
      stdio: "ignore",
    });
    hijo.on("error", (error) => rechazar(error));
    hijo.on("exit", (codigo) =>
      codigo === 0 ? resolver() : rechazar(new Error(`PowerShell terminó con ${codigo}`))
    );
  });
}

/**
 * Instala la versión nueva y vuelve a abrir el programa.
 *
 * El que instala tiene que sobrevivir a este proceso: lo primero que hace el
 * instalador es cerrar Visual App, o sea, a quien lo llamó. Por eso se lanza suelto
 * —fuera de este árbol de procesos— y desde la carpeta del paquete nuevo, que
 * es la única que la instalación no va a tocar.
 */
export async function aplicar(): Promise<{ version: string }> {
  if (!CONFIGURADO) throw new Regla("No hay un lugar de actualizaciones configurado.");
  if (!ultimoAviso) throw new Regla("Todavía no se buscó ninguna actualización.");
  if (!esPosterior(ultimoAviso.version, VERSION)) throw new Regla("Ya tenés la última versión.");
  if (process.platform !== "win32") throw new Regla("La actualización automática es solo para Windows.");

  const aviso = ultimoAviso;
  const zip = await bajar(aviso);

  const destino = path.join(carpetaDatos, "actualizaciones", aviso.version);
  if (fs.existsSync(destino)) fs.rmSync(destino, { recursive: true, force: true });

  await correr(["-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${destino}' -Force`]);

  const guion = path.join(destino, "actualizar.ps1");
  if (!fs.existsSync(guion)) {
    throw new Regla("El paquete que se bajó no trae el actualizador. No se cambió nada.");
  }

  // Se lanza a través de `start` y no con `detached` a secas.
  //
  // `detached` no alcanza: probado, el actualizador se moría junto con Visual App
  // apenas este se apagaba, y la actualización quedaba a mitad de camino —el
  // paquete bajado y verificado, y el programa sin reemplazar—. `start` crea un
  // proceso de verdad independiente, que es lo mismo que hace el lanzador de la
  // aplicación. El primer argumento vacío es el título de la ventana: sin él,
  // `start` toma la ruta entre comillas como título y no abre nada.
  //
  // Y `cwd` es obligatorio, no un detalle: sin él el actualizador hereda la
  // carpeta de trabajo de este proceso, que es la carpeta INSTALADA. Windows no
  // deja renombrar una carpeta que es el directorio actual de algún proceso, así
  // que el instalador moría con «no se puede cambiar el nombre ... porque está
  // en uso» y la actualización no se aplicaba nunca. El actualizador tiene que
  // pararse en la carpeta del paquete, que es la única que la instalación no
  // toca — es lo que su propio comentario decía y nadie estaba cumpliendo.
  spawn(
    "cmd.exe",
    [
      "/c",
      "start",
      "",
      "/b",
      "powershell.exe",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      guion,
      "-Paquete",
      destino,
    ],
    { cwd: destino, detached: true, stdio: "ignore" }
  ).unref();

  return { version: aviso.version };
}

/**
 * Mira si hay novedades al arrancar y una vez por día.
 *
 * El primer chequeo espera unos segundos: abrir el programa tiene que ser
 * instantáneo, y lo que pase con internet no puede demorar la primera pantalla.
 */
export function vigilarActualizaciones(): void {
  if (!CONFIGURADO) return;

  setTimeout(() => void revisar(), 8_000).unref();
  setInterval(() => void revisar(), 24 * 60 * 60 * 1000).unref();
}
