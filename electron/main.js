"use strict";

// =====================================================================
// Visual Solution — la aplicación de escritorio.
//
// Este es el proceso principal de Electron. Hace cuatro cosas:
//
//   1. Arranca el servidor de Visual Solution adentro de este mismo
//      proceso: la API, los datos y la interfaz compilada. No hay una
//      consola, ni un Node aparte, ni un navegador.
//   2. Muestra la ventana del programa contra ese servidor, con una
//      pantalla de "Cargando…" mientras tanto.
//   3. Le presta al servidor lo que necesita de Windows: el cuadro de
//      elegir carpeta, abrir el explorador, cerrarse.
//   4. Se actualiza desde GitHub Releases con electron-updater.
//
// La interfaz no ve nada de Node. Lo único que cruza hacia la página es lo
// que `preload.js` expone —las actualizaciones— y pasa por mensajes que
// este proceso valida uno por uno.
// =====================================================================

const { app, BrowserWindow, dialog, ipcMain, Menu, screen, session, shell } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const NOMBRE = "Visual Solution";
const DESARROLLO = !app.isPackaged;
const RAIZ = path.join(__dirname, "..");

// El AppUserModelID agrupa las ventanas en la barra de tareas y es el que usan
// las notificaciones de Windows. Tiene que coincidir con el `appId` de
// electron-builder.yml, que es el que queda en el acceso directo.
app.setAppUserModelId("com.visualsolution.app");

// Una sola copia abierta. Dos procesos escribiendo el mismo archivo de datos lo
// dejarían con lo que guardó el último: un doble clic de más no puede costar
// las ventas de un turno. El segundo intento solo trae al frente el primero.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!ventana) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.show();
    ventana.focus();
  });

  app.whenReady().then(arrancar).catch((error) => fallar("No se pudo abrir Visual Solution.", error));
}

/** @type {BrowserWindow | null} */
let ventana = null;
/** @type {BrowserWindow | null} */
let carga = null;
/** @type {{ puerto: number, cerrar: () => Promise<void> } | null} */
let servidor = null;
/** @type {import("node:child_process").ChildProcess | null} */
let interfazDeDesarrollo = null;
/** El origen de la interfaz: lo único a lo que la ventana puede navegar. */
let origen = "";
/** Dónde están `datos.json` y sus copias. */
let carpetaDatos = "";

// ─────────────────────────────  Arranque  ─────────────────────────────

async function arrancar() {
  // Sin menú: "Archivo / Editar / Ver" no tiene nada que hacer en una caja
  // registradora, y el de Electron trae "Recargar" y "Herramientas de
  // desarrollo", que no son para quien atiende el mostrador.
  Menu.setApplicationMenu(null);
  endurecerSesion();

  carga = mostrarCarga();

  const { iniciarServidor, carpetaDeDatos, usarAnfitrion, OtraCopiaAbierta } = await import(
    pathToFileURL(
      DESARROLLO
        ? path.join(RAIZ, "servidor", "aplicacion.ts")
        : path.join(RAIZ, "compilado", "servidor", "aplicacion.js")
    ).href
  );

  usarAnfitrion({
    version: app.getVersion(),
    elegirCarpeta: elegirCarpeta,
    abrirCarpeta: (carpeta) => {
      void shell.openPath(carpeta);
    },
    apagar: () => app.quit(),
  });

  carpetaDatos = carpetaDeDatos(argumento("--datos") ?? process.env.VISUALAPP_DATOS);

  try {
    servidor = await iniciarServidor({
      carpeta: carpetaDatos,
      sitio: path.join(RAIZ, "out"),
    });
  } catch (error) {
    if (error instanceof OtraCopiaAbierta) {
      cerrarCarga();
      await dialog.showMessageBox({
        type: "warning",
        title: NOMBRE,
        message: "Visual Solution ya está abierto.",
        detail:
          "Hay otra copia del programa abierta, que puede ser la versión anterior (Visual App). " +
          "Cerrala y volvé a abrir Visual Solution.\n\n" +
          "No se abren dos a la vez porque las dos escribirían el mismo archivo de datos.",
      });
      app.quit();
      return;
    }
    throw error;
  }

  const direccion = DESARROLLO
    ? await levantarInterfazDeDesarrollo(servidor.puerto)
    : `http://127.0.0.1:${servidor.puerto}`;
  origen = new URL(direccion).origin;

  ventana = crearVentana(direccion);
  prepararActualizaciones();
}

/**
 * La pantalla de "Cargando…".
 *
 * Aparece al instante, antes de que exista el servidor: sin ella, el doble
 * clic no mostraba nada durante uno o dos segundos y la gente volvía a hacer
 * doble clic. Es una página armada acá mismo con el logo del programa: no
 * depende del servidor, que todavía no arrancó.
 */
function mostrarCarga() {
  const logo = leerLogo();
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${NOMBRE}</title>
<style>
  html,body{margin:0;height:100%;background:#F5F5F7;font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;color:#1D1D1F;-webkit-user-select:none;user-select:none;cursor:default}
  main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
  img{width:84px;height:84px}
  h1{margin:6px 0 0;font:600 20px "Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;letter-spacing:-.01em}
  p{margin:0;font-size:13px;color:#6E6E73}
  .barra{width:120px;height:3px;border-radius:3px;background:#E3E3E8;overflow:hidden}
  .barra i{display:block;width:40%;height:100%;border-radius:3px;background:#0050CE;animation:ir 1.1s cubic-bezier(.32,.72,0,1) infinite}
  @keyframes ir{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
</style></head>
<body><main>
  ${logo ? `<img src="${logo}" alt="">` : ""}
  <h1>${NOMBRE}</h1>
  <div class="barra"><i></i></div>
  <p>Cargando…</p>
</main></body></html>`;

  const pantalla = new BrowserWindow({
    width: 360,
    height: 300,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    show: false,
    center: true,
    skipTaskbar: false,
    title: NOMBRE,
    icon: iconoDeVentana(),
    backgroundColor: "#F5F5F7",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
  });

  pantalla.once("ready-to-show", () => pantalla.show());
  void pantalla.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return pantalla;
}

function cerrarCarga() {
  if (carga && !carga.isDestroyed()) carga.destroy();
  carga = null;
}

/** El logo como `data:`, para la pantalla de carga. */
function leerLogo() {
  for (const ruta of [path.join(RAIZ, "out", "marca.svg"), path.join(RAIZ, "public", "marca.svg")]) {
    try {
      return `data:image/svg+xml;base64,${fs.readFileSync(ruta).toString("base64")}`;
    } catch {
      // El siguiente.
    }
  }
  return null;
}

/**
 * El ícono de la ventana.
 *
 * Instalado, Windows toma el del propio .exe, que electron-builder le pone
 * desde `build/icon.ico`. En desarrollo el .exe es el de Electron, y sin esto
 * la barra de tareas mostraría el átomo.
 */
function iconoDeVentana() {
  return DESARROLLO ? path.join(RAIZ, "build", "icon.ico") : undefined;
}

function crearVentana(direccion) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  // En una notebook de 1366 la ventana de 1280 queda justa y con los bordes
  // cortados: ahí conviene arrancar maximizada, como cualquier programa de caja.
  const chica = width < 1400 || height < 900;

  const nueva = new BrowserWindow({
    width: Math.min(1280, width),
    height: Math.min(860, height),
    minWidth: 800,
    minHeight: 560,
    center: true,
    show: false,
    title: NOMBRE,
    icon: iconoDeVentana(),
    // El mismo gris de fondo de la interfaz: sin esto, la ventana aparece
    // blanca un instante antes de pintar la primera pantalla.
    backgroundColor: "#F5F5F7",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // El título es el del programa, siempre. La página trae el suyo, pero la
  // barra de tareas no tiene por qué cambiar de nombre en cada pantalla.
  nueva.on("page-title-updated", (evento) => evento.preventDefault());

  nueva.once("ready-to-show", () => {
    if (chica) nueva.maximize();
    nueva.show();
    cerrarCarga();
  });

  // Si la interfaz no carga, que la pantalla de carga no quede para siempre.
  nueva.webContents.on("did-fail-load", (_e, codigo, descripcion, url, principal) => {
    if (!principal || codigo === -3) return; // -3: navegación cancelada, no es un error
    fallar("No se pudo mostrar Visual Solution.", new Error(`${descripcion} (${codigo}) en ${url}`));
  });

  protegerNavegacion(nueva);

  // Herramientas de desarrollo solo mientras se desarrolla. Instalado, F12 no
  // hace nada: no es algo que quien atiende tenga que encontrar por accidente.
  nueva.webContents.on("before-input-event", (evento, tecla) => {
    if (tecla.type !== "keyDown") return;
    if (DESARROLLO && tecla.key === "F12") nueva.webContents.toggleDevTools();
    // Sin menú tampoco hay atajos de zoom: se agregan a mano, porque hay
    // monitores de mostrador donde el tamaño de fábrica queda chico.
    if (tecla.control && (tecla.key === "+" || tecla.key === "=")) {
      nueva.webContents.setZoomLevel(Math.min(nueva.webContents.getZoomLevel() + 0.5, 3));
      evento.preventDefault();
    } else if (tecla.control && tecla.key === "-") {
      nueva.webContents.setZoomLevel(Math.max(nueva.webContents.getZoomLevel() - 0.5, -2));
      evento.preventDefault();
    } else if (tecla.control && tecla.key === "0") {
      nueva.webContents.setZoomLevel(0);
      evento.preventDefault();
    }
  });

  nueva.on("closed", () => {
    ventana = null;
  });

  void nueva.loadURL(direccion);
  return nueva;
}

// ─────────────────────────────  Seguridad  ─────────────────────────────

/**
 * La ventana solo muestra Visual Solution.
 *
 * Un enlace a un sitio —el de Visual Solution, en Configuración— se abre en
 * el navegador de la computadora, no adentro del programa: la ventana no
 * tiene barra de direcciones, y una página ajena ahí adentro no tendría forma
 * de volver. Todo lo demás se bloquea.
 */
function protegerNavegacion(nueva) {
  nueva.webContents.setWindowOpenHandler(({ url }) => {
    abrirAfuera(url);
    return { action: "deny" };
  });

  nueva.webContents.on("will-navigate", (evento, url) => {
    if (esDeLaApp(url)) return;
    evento.preventDefault();
    abrirAfuera(url);
  });

  // Nada de <webview> ni de marcos con otras páginas.
  nueva.webContents.on("will-attach-webview", (evento) => evento.preventDefault());
}

function esDeLaApp(url) {
  try {
    return new URL(url).origin === origen;
  } catch {
    return false;
  }
}

/** Solo direcciones https: nada de `file:`, `javascript:` ni programas locales. */
function abrirAfuera(url) {
  try {
    if (new URL(url).protocol === "https:") void shell.openExternal(url);
  } catch {
    // Una dirección que no se entiende no se abre.
  }
}

/**
 * Permisos del navegador: ninguno, salvo copiar al portapapeles.
 *
 * La interfaz no usa cámara, micrófono, ubicación ni notificaciones del
 * navegador. Denegarlos todos de entrada es lo que garantiza que nunca
 * aparezca un cartel pidiéndolos.
 */
function endurecerSesion() {
  const permitidos = new Set(["clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_contenido, permiso, responder) => {
    responder(permitidos.has(permiso));
  });
  session.defaultSession.setPermissionCheckHandler((_contenido, permiso) => permitidos.has(permiso));
}

/**
 * ¿El mensaje viene de la ventana del programa?
 *
 * La página es la de siempre, pero se comprueba igual: un mensaje que llegue
 * de cualquier otro origen no puede disparar una descarga ni un reinicio.
 */
function esDeLaVentana(evento) {
  return Boolean(ventana) && evento.sender === ventana.webContents && esDeLaApp(evento.senderFrame?.url ?? "");
}

// ─────────────────────────────  Anfitrión  ─────────────────────────────

/** El cuadro nativo de "elegir carpeta", para la copia de seguridad. */
async function elegirCarpeta() {
  const opciones = {
    title: "Elegí dónde dejar la copia de seguridad",
    buttonLabel: "Usar esta carpeta",
    properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
  };
  const resultado = ventana
    ? await dialog.showOpenDialog(ventana, opciones)
    : await dialog.showOpenDialog(opciones);
  return resultado.canceled ? null : (resultado.filePaths[0] ?? null);
}

// ─────────────────────────────  Actualizaciones  ─────────────────────────────

/**
 * Actualizarse desde GitHub Releases.
 *
 * Tres decisiones:
 *
 * 1. **Se pregunta antes de bajar.** Esto es una caja registradora: una
 *    actualización que arranca sola a mitad de un turno es lo peor que puede
 *    pasar. Se avisa, y baja cuando el dueño toca "Actualizar ahora".
 *
 * 2. **Si quedó bajada, se instala al cerrar.** Si el dueño bajó la versión
 *    pero eligió seguir trabajando, se instala sola la próxima vez que se
 *    cierra el programa, sin preguntar de nuevo.
 *
 * 3. **Se busca de a ratos, no todo el tiempo.** Al abrir y cada seis horas.
 */
const SEIS_HORAS = 6 * 60 * 60 * 1000;

/** @type {import("electron-updater").AppUpdater | null} */
let actualizador = null;

const actualizacion = {
  /** inactiva · buscando · disponible · al-dia · descargando · lista · error · no-disponible */
  fase: "inactiva",
  actual: app.getVersion(),
  nueva: null,
  notas: null,
  progreso: 0,
  error: null,
  revisadaEn: null,
};

function avisarActualizacion(cambios) {
  Object.assign(actualizacion, cambios);
  if (ventana && !ventana.isDestroyed()) {
    ventana.webContents.send("actualizacion:cambio", { ...actualizacion });
  }
}

function prepararActualizaciones() {
  ipcMain.handle("actualizacion:estado", (evento) => {
    if (!esDeLaVentana(evento)) return null;
    return { ...actualizacion };
  });

  ipcMain.handle("actualizacion:buscar", async (evento) => {
    if (!esDeLaVentana(evento)) return null;
    await buscarActualizacion();
    return { ...actualizacion };
  });

  ipcMain.handle("actualizacion:descargar", async (evento) => {
    if (!esDeLaVentana(evento) || !actualizador) return null;
    if (actualizacion.fase !== "disponible" && actualizacion.fase !== "error") return { ...actualizacion };
    avisarActualizacion({ fase: "descargando", progreso: 0, error: null });
    try {
      await actualizador.downloadUpdate();
    } catch (error) {
      avisarActualizacion({ fase: "error", error: mensajeDeError(error) });
    }
    return { ...actualizacion };
  });

  ipcMain.handle("actualizacion:instalar", async (evento) => {
    if (!esDeLaVentana(evento) || !actualizador || actualizacion.fase !== "lista") return null;
    // Se apaga el servidor antes de reemplazar el programa. Cada venta ya está
    // guardada en disco en el momento en que se cobra, así que no hay nada a
    // medio escribir; esto es para soltar el puerto y el archivo prolijamente.
    await apagarServidor();
    // isSilent: el instalador no muestra su asistente — es una actualización,
    // no una instalación nueva. isForceRunAfter: vuelve a abrir el programa.
    actualizador.quitAndInstall(true, true);
    return null;
  });

  if (DESARROLLO) {
    avisarActualizacion({
      fase: "no-disponible",
      error: "En desarrollo no se buscan actualizaciones: solo en el programa instalado.",
    });
    return;
  }

  const { autoUpdater } = require("electron-updater");
  actualizador = autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  // El instalador es completo, no uno "web" que baja el resto después.
  autoUpdater.disableWebInstaller = true;
  autoUpdater.logger = registroDeActualizaciones();

  autoUpdater.on("update-available", (info) => {
    avisarActualizacion({
      fase: "disponible",
      nueva: info.version,
      notas: textoDeNotas(info.releaseNotes),
      revisadaEn: new Date().toISOString(),
      error: null,
    });
  });
  autoUpdater.on("update-not-available", () => {
    avisarActualizacion({ fase: "al-dia", nueva: null, revisadaEn: new Date().toISOString(), error: null });
  });
  autoUpdater.on("download-progress", (progreso) => {
    avisarActualizacion({ fase: "descargando", progreso: Math.round(progreso.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    avisarActualizacion({ fase: "lista", nueva: info.version, progreso: 100 });
  });
  autoUpdater.on("error", (error) => {
    avisarActualizacion({ fase: "error", error: mensajeDeError(error) });
  });

  // Unos segundos después de abrir, para no competir con la primera pantalla.
  setTimeout(() => void buscarActualizacion(), 8000);
  setInterval(() => void buscarActualizacion(), SEIS_HORAS).unref();
}

async function buscarActualizacion() {
  if (!actualizador) return;
  // Mientras baja o ya está lista no se vuelve a preguntar: la respuesta
  // pisaría el estado y el botón de "Reiniciar y actualizar" desaparecería.
  if (["buscando", "descargando", "lista"].includes(actualizacion.fase)) return;

  avisarActualizacion({ fase: "buscando", error: null });
  try {
    await actualizador.checkForUpdates();
  } catch (error) {
    avisarActualizacion({ fase: "error", error: mensajeDeError(error) });
  }
}

/** Las notas de GitHub vienen en HTML: acá se muestran como texto. */
function textoDeNotas(notas) {
  const texto = Array.isArray(notas) ? notas.map((n) => n.note ?? "").join("\n") : (notas ?? "");
  return (
    String(texto)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 1200) || null
  );
}

/**
 * Un error que se pueda leer.
 *
 * Sin internet es lo más común y no es grave: se dice así, sin el detalle
 * técnico que trae electron-updater.
 */
function mensajeDeError(error) {
  const texto = String(error?.message ?? error ?? "");
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::ERR_/i.test(texto)) {
    return "No hay conexión a internet. Se vuelve a probar más tarde.";
  }
  if (/404/.test(texto)) return "Todavía no hay versiones publicadas para descargar.";
  if (/sha512|checksum/i.test(texto)) return "La descarga llegó dañada. Probá de nuevo.";
  return "No se pudo buscar o bajar la actualización. Se vuelve a probar más tarde.";
}

/**
 * El detalle técnico, en un archivo al lado de los datos.
 *
 * En pantalla va un mensaje que se entienda; el motivo real queda acá, que es
 * lo que se pide cuando alguien llama porque "no se actualiza".
 */
function registroDeActualizaciones() {
  const archivo = path.join(carpetaDatos || app.getPath("userData"), "actualizaciones.log");
  const anotar = (nivel) => (...partes) => {
    try {
      fs.appendFileSync(archivo, `${new Date().toISOString()} ${nivel} ${partes.join(" ")}\n`);
    } catch {
      // Sin registro no se frena nada.
    }
  };
  return { info: anotar("info"), warn: anotar("aviso"), error: anotar("error"), debug: () => {} };
}

// ─────────────────────────────  Desarrollo  ─────────────────────────────

/**
 * En desarrollo, la interfaz la sirve Next con recarga en caliente.
 *
 * `npm run dev` abre solo la aplicación: este proceso levanta `next dev`, le
 * dice en qué puerto quedó la API y espera a que conteste antes de mostrar la
 * ventana. Al cerrar la ventana, se lleva a Next con ella.
 */
async function levantarInterfazDeDesarrollo(puertoApi) {
  const PUERTO = 3000;
  const next = require.resolve("next/dist/bin/next", { paths: [RAIZ] });

  interfazDeDesarrollo = spawn(
    process.env.npm_node_execpath ?? "node",
    [next, "dev", "--port", String(PUERTO)],
    {
      cwd: RAIZ,
      env: { ...process.env, NEXT_PUBLIC_API: `http://localhost:${puertoApi}` },
      stdio: "inherit",
      windowsHide: true,
    }
  );
  interfazDeDesarrollo.on("exit", (codigo) => {
    interfazDeDesarrollo = null;
    if (codigo && codigo !== 0) console.error(`[desarrollo] next dev terminó con ${codigo}`);
  });

  const direccion = `http://localhost:${PUERTO}`;
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    try {
      const respuesta = await fetch(direccion, { signal: AbortSignal.timeout(2000) });
      if (respuesta.status < 500) return direccion;
    } catch {
      // Todavía no.
    }
    if (!interfazDeDesarrollo) throw new Error("next dev se cerró antes de arrancar.");
    await new Promise((listo) => setTimeout(listo, 400));
  }
  throw new Error("next dev no contestó en dos minutos.");
}

function apagarInterfazDeDesarrollo() {
  if (!interfazDeDesarrollo?.pid) return;
  // En Windows, `kill` cierra el proceso de Next pero no los que él abrió.
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(interfazDeDesarrollo.pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    interfazDeDesarrollo.kill();
  }
  interfazDeDesarrollo = null;
}

// ─────────────────────────────  Cierre  ─────────────────────────────

async function apagarServidor() {
  const enMarcha = servidor;
  servidor = null;
  if (enMarcha) await enMarcha.cerrar().catch(() => {});
}

// Cerrar la ventana es cerrar el programa, como cualquier aplicación.
app.on("window-all-closed", () => app.quit());

let saliendo = false;
app.on("before-quit", (evento) => {
  apagarInterfazDeDesarrollo();
  if (saliendo || !servidor) return;
  evento.preventDefault();
  saliendo = true;
  void apagarServidor().finally(() => app.quit());
});

function argumento(nombre) {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

/** Un error que no deja abrir: se dice en un cartel y se cierra prolijo. */
function fallar(titulo, error) {
  console.error(titulo, error);
  cerrarCarga();
  dialog.showErrorBox(NOMBRE, `${titulo}\n\n${error?.message ?? error}`);
  apagarInterfazDeDesarrollo();
  app.exit(1);
}
