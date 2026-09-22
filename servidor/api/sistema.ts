import fs from "node:fs";
import path from "node:path";
import { inicial, nuevoId, Regla, type Almacen } from "../almacen.ts";
import { anfitrion } from "../anfitrion.ts";
import type { Ruteador } from "../http.ts";
import { lanzar } from "../lanzar.ts";
import { direccionesDeRed } from "../red.ts";
import { ajustarStock, efectivoDe, recortar, recortarObligatorio } from "../reglas.ts";
import type { BaseDatos, Caja, Cliente, Pedido } from "../tipos.ts";
import { estaEscuchandoEnRed, puertoDeEscucha } from "../vida.ts";

/**
 * El archivo de datos y lo que se puede hacer con él.
 *
 * Es lo que reemplaza a la pantalla de "estado de la base": acá no hay conexión
 * que probar ni migración que aplicar, hay un archivo que se puede abrir,
 * copiar y llevarse en un pendrive.
 */
export function rutasSistema(r: Ruteador, a: Almacen): void {
  /**
   * Dónde vive la información y cómo viene.
   *
   * Lo pide toda pantalla, porque el nombre del negocio va arriba de la
   * columna. Para un empleado eso es lo único que vuelve: dónde está el
   * archivo, cuánto hay cargado de cada cosa y cómo viene la copia de
   * seguridad son cuentas del negocio, no de quien atiende el mostrador.
   */
  r.get("/sistema", ({ usuario }) =>
    a.leer((d) => {
      const basico = {
        // La de `package.json`: es la misma que muestra Windows en "Aplicaciones
        // instaladas" y la que compara la actualización automática.
        programa: anfitrion().version,
        config: { negocio: d.config.negocio, detalle: d.config.detalle },
      };

      if (usuario && usuario.rol !== "dueno") return basico;

      return {
        ...basico,
        archivo: a.archivo,
        carpeta: path.dirname(a.archivo),
        carpetaCopias: a.carpetaCopias,
        tamano: a.tamano(),
        version: d.version,
        config: d.config,
        conteos: {
          categorias: d.categorias.length,
          productos: d.productos.length,
          movimientos: d.movimientos.length,
          pedidos: d.pedidos.length,
          clientes: d.clientes.length,
          gastos: d.gastos.length,
          cajas: d.cajas.length,
          cambiosPrecio: d.cambiosPrecio.length,
        },
        copias: copias(a),
        resguardo: resguardo(a, d.config.resguardo),
      };
    })
  );

  r.put("/sistema/config", ({ cuerpo }) =>
    a.escribir((d) => {
      d.config.negocio = recortarObligatorio(
        cuerpo.negocio as string,
        80,
        "Poné un nombre para el negocio."
      );
      d.config.detalle = recortar(cuerpo.detalle as string, 160);
      return d.config;
    }), "dueno");

  r.post("/sistema/copia", () => {
    const ruta = a.copiar();
    return { archivo: ruta, nombre: path.basename(ruta) };
  }, "dueno");

  /**
   * Vuelve a una copia guardada.
   *
   * Se podía hacer una copia pero no restaurarla: el único camino de vuelta era
   * cerrar el programa, abrir la carpeta y renombrar archivos a mano — justo en
   * el momento en que la persona está asustada y no quiere tocar nada.
   *
   * Se pide escribir VOLVER por la misma razón que vaciar pide BORRAR: esto
   * reemplaza todo lo cargado desde esa copia, y un botón con "¿estás seguro?"
   * se acepta sin leerlo. El estado actual se guarda como copia antes de
   * reemplazarlo, así que restaurar la copia equivocada tampoco es definitivo.
   */
  r.post("/sistema/restaurar", ({ cuerpo }) => {
    if (String(cuerpo.confirmacion ?? "").trim().toUpperCase() !== "VOLVER") {
      throw new Regla("Escribí VOLVER para confirmar.");
    }

    const nombre = String(cuerpo.nombre ?? "").trim();
    if (!nombre) throw new Regla("Elegí una copia.");

    // `afuera` dice que la copia está en el pendrive y no en esta computadora.
    // Es el camino de la computadora nueva: instalar, elegir la carpeta donde
    // estaba la copia, y volver.
    if (cuerpo.afuera === true) {
      const carpeta = a.leer((d) => d.config.resguardo);
      if (!carpeta) throw new Regla("No hay ninguna carpeta de copia de seguridad elegida.");
      return a.restaurar(nombre, carpeta);
    }

    return a.restaurar(nombre);
  }, "dueno");

  /**
   * Elige la carpeta de afuera donde dejar la copia de cada día, o la saca.
   *
   * La carpeta se PRUEBA antes de guardarla: se escribe y se vuelve a leer un
   * archivo de prueba. Aceptar una ruta mal escrita y descubrirlo recién el
   * día que hace falta la copia sería exactamente el problema que esto viene a
   * resolver.
   *
   * Y se hace la primera copia en el momento, para que quien la configura vea
   * el archivo aparecer en su pendrive en vez de confiar en que mañana pase.
   */
  r.put("/sistema/resguardo", ({ cuerpo }) => {
    const carpeta = recortar(cuerpo.carpeta as string, 400);

    if (!carpeta) {
      a.escribir((d) => {
        d.config.resguardo = null;
      });
      return { resguardo: null, copia: null };
    }

    const problema = a.probarDestino(carpeta);
    if (problema) throw new Regla(problema);

    a.escribir((d) => {
      d.config.resguardo = carpeta;
    });

    return { resguardo: carpeta, copia: a.resguardar(carpeta) };
  }, "dueno");

  /**
   * Abre el buscador de carpetas de Windows y devuelve la que se eligió.
   *
   * Escribir `C:\Users\...\OneDrive\Documentos` sin equivocarse no es
   * razonable para pedírselo a nadie, y una ruta mal escrita acá significa
   * creer que hay copia de seguridad cuando no la hay.
   *
   * El cuadro es el nativo de Windows y lo abre la aplicación de escritorio.
   * Sin ella —el servidor corriendo solo, o el pedido llegando desde un
   * celular, donde no hay a quién mostrarle un cuadro— queda el campo para
   * escribirla, que sigue funcionando.
   */
  r.post("/sistema/elegir-carpeta", async () => {
    const elegir = anfitrion().elegirCarpeta;
    if (!elegir) throw new Regla("Escribí la ruta de la carpeta a mano.");
    return { carpeta: await elegir() };
  }, "dueno");

  /**
   * Prender o apagar el acceso desde el celular.
   *
   * Sin usuarios creados no se puede prender, y no es una formalidad: abrir el
   * programa al wifi del local sin contraseña deja entrar a cualquiera que
   * esté conectado, incluido un cliente si el local tiene wifi para clientes.
   *
   * El cambio pide cerrar y abrir el programa. El servidor ya está escuchando
   * donde arrancó, y cambiar eso en caliente significaría soltar la conexión
   * de quien esté cobrando en ese momento.
   */
  r.put(
    "/sistema/red",
    ({ cuerpo }) => {
      const prender = cuerpo.enRed === true;

      if (prender && !a.leer((d) => d.usuarios.some((u) => u.activo))) {
        throw new Regla(
          "Primero creá usuarios con contraseña. Sin eso, cualquiera conectado al wifi entraría."
        );
      }

      a.escribir((d) => {
        d.config.enRed = prender;
      });

      return estadoDeRed(a);
    },
    "dueno"
  );

  /** Por dónde se llega desde el local, para mostrarlo y armar el QR. */
  r.get("/sistema/red", () => estadoDeRed(a), "dueno");

  /** Fuerza la copia de afuera ahora, sin esperar a mañana. */
  r.post("/sistema/resguardo/copia", () => {
    const carpeta = a.leer((d) => d.config.resguardo);
    if (!carpeta) throw new Regla("Todavía no elegiste una carpeta para la copia de seguridad.");

    // `resguardar` devuelve null si la de hoy ya estaba. Acá se pidió a mano,
    // así que se hace igual: quien aprieta el botón quiere una copia de lo de
    // recién, no que le digan que ya hay una de esta mañana.
    return { archivo: a.resguardar(carpeta, true) };
  }, "dueno");

  r.post("/sistema/carpeta", () => {
    // Abrir el explorador en la carpeta de datos es la forma más simple de que
    // alguien copie su archivo a un pendrive sin explicarle dónde queda
    // "AppData".
    const carpeta = path.dirname(a.archivo);

    const abrir = anfitrion().abrirCarpeta;
    if (abrir) abrir(carpeta);
    else if (process.platform === "win32") lanzar("explorer.exe", [carpeta]);
    else if (process.platform === "darwin") lanzar("open", [carpeta]);
    else lanzar("xdg-open", [carpeta]);

    return { carpeta };
  }, "dueno");

  r.post("/sistema/vaciar", ({ cuerpo }) => {
    // Vaciar la base borra todo lo cargado. Se pide escribir la palabra
    // completa: un botón con "¿estás seguro?" se acepta sin leerlo.
    if (String(cuerpo.confirmacion ?? "").trim().toUpperCase() !== "BORRAR") {
      throw new Regla("Escribí BORRAR para confirmar.");
    }

    a.vaciar();
    return { ok: true };
  }, "dueno");

  r.post("/sistema/apagar", () => {
    // Se contesta primero y se apaga después: si el proceso se fuera acá mismo,
    // la ventana vería la conexión cortada y mostraría un error justo cuando
    // todo salió bien.
    const apagar = anfitrion().apagar ?? (() => process.exit(0));
    setTimeout(apagar, 250).unref();
    return { ok: true };
  }, "dueno");

  r.post("/sistema/ejemplo", () => {
    const vacia = a.leer((d) => d.productos.length === 0 && d.pedidos.length === 0);
    if (!vacia) throw new Regla("Los datos de ejemplo solo se pueden cargar sobre una base vacía.");

    a.reemplazar(armarEjemplo());
    return { ok: true };
  }, "dueno");
}

/**
 * Cómo viene el acceso desde el celular.
 *
 * `direcciones` puede traer más de una —wifi y cable a la vez es lo normal— y
 * no hay forma de saber cuál va a usar el celular. Se muestran todas.
 */
function estadoDeRed(a: Almacen) {
  const enRed = a.leer((d) => d.config.enRed);
  const hayUsuarios = a.leer((d) => d.usuarios.some((u) => u.activo));

  return {
    enRed,
    hayUsuarios,
    puerto: puertoDeEscucha(),
    direcciones: enRed ? direccionesDeRed() : [],
    // Lo que de verdad está escuchando ahora, que puede no coincidir con lo
    // configurado: el cambio recién se aplica al reabrir el programa.
    escuchandoEnRed: estaEscuchandoEnRed(),
  };
}

/**
 * Cómo viene la copia de afuera: cuándo fue la última y si el destino responde.
 *
 * `dias` es lo que la pantalla necesita para decidir si avisar. Se cuenta
 * contra la fecha que trae el nombre del archivo, que es la única que sobrevive
 * a que alguien copie los archivos de un pendrive a otro.
 */
function resguardo(a: Almacen, carpeta: string | null) {
  if (!carpeta) return { carpeta: null, ultima: null, dias: null, copias: 0, error: null };

  const estado = a.estadoResguardo(carpeta);

  // datos-aaaa-mm-dd-hhmmss.json
  const fecha = estado.ultima?.slice(6, 16) ?? null;
  const dias = fecha ? diasDesde(fecha) : null;

  return {
    carpeta,
    ultima: fecha,
    dias,
    copias: estado.copias,
    error: estado.error,
    // Los nombres, para poder ofrecer volver a una sin tener que abrir la
    // carpeta y copiar archivos a mano.
    archivos: a.listarCopiasDe(carpeta).map((nombre) => ({
      nombre,
      fecha: fechaDeCopia(nombre),
    })),
  };
}

/**
 * La fecha que trae el nombre de la copia, en ISO.
 *
 * Se lee del nombre y no de la fecha del archivo: copiar un pendrive a otro, o
 * bajarlo de la nube, le pone la fecha de la copia y no la del día que se
 * guardó. El nombre viaja con el archivo.
 */
function fechaDeCopia(nombre: string): string | null {
  // datos-aaaa-mm-dd-hhmmss.json
  const partes = /^datos-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(nombre);
  if (!partes) return null;

  const [a, m, d, h, min, seg] = partes.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return new Date(a, m - 1, d, h, min, seg).toISOString();
}

/** Días entre una fecha aaaa-mm-dd y hoy, contando en días del calendario. */
function diasDesde(fecha: string): number | null {
  const [a, m, d] = fecha.split("-").map(Number);
  if (!a || !m || !d) return null;

  // A mediodía las dos: así el cambio de horario de verano —una hora de más o
  // de menos— no corre la cuenta un día entero.
  const entonces = new Date(a, m - 1, d, 12).getTime();
  const hoy = new Date();
  const ahora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12).getTime();

  return Math.round((ahora - entonces) / 86_400_000);
}

/** Las copias que ya se hicieron, de la más nueva a la más vieja. */
function copias(a: Almacen) {
  if (!fs.existsSync(a.carpetaCopias)) return [];

  return fs
    .readdirSync(a.carpetaCopias)
    .filter((nombre) => nombre.endsWith(".json"))
    .map((nombre) => {
      const info = fs.statSync(path.join(a.carpetaCopias, nombre));
      return { nombre, tamano: info.size, fecha: info.mtime.toISOString() };
    })
    .sort((x, y) => y.fecha.localeCompare(x.fecha))
    .slice(0, 10);
}

/**
 * Datos de ejemplo para poder mirar la aplicación funcionando antes de cargar
 * el catálogo de verdad.
 *
 * Se arman con las mismas reglas que usa el programa —el stock se mueve con
 * `ajustarStock`— así que el historial y los informes cierran igual que con
 * datos reales.
 */
function armarEjemplo(): BaseDatos {
  const d = inicial();
  d.categorias = [];
  d.config = { ...d.config, negocio: "Distribuidora del Centro", detalle: "Descartables y packaging" };

  const categorias = [
    ["Bandejas", "#5E5CE6"],
    ["Vasos", "#0050CE"],
    ["Bolsas", "#30D158"],
    ["Servilletas", "#FF9F0A"],
  ].map(([nombre, color]) => ({
    id: nuevoId(),
    nombre: nombre!,
    color: color!,
    creadaEn: new Date().toISOString(),
  }));

  d.categorias.push(...categorias);

  const catalogo: [string, number, string, number, number, number, number, string][] = [
    ["Bandeja plástica N°2 negra", 0, "x100u", 6200, 9900, 48, 12, "BAN-BAN-001"],
    ["Bandeja plástica N°5 negra", 0, "x100u", 8400, 13500, 9, 10, "BAN-BAN-002"],
    ["Bandeja de cartón kraft chica", 0, "x50u", 4100, 6900, 26, 8, "BAN-BAN-003"],
    ["Vaso plástico 180cc", 1, "x100u", 2300, 3900, 120, 24, "VAS-VAS-001"],
    ["Vaso plástico 300cc", 1, "x100u", 3100, 5200, 64, 20, "VAS-VAS-002"],
    ["Vaso térmico 240cc con tapa", 1, "x50u", 7600, 12400, 0, 6, "VAS-VAS-003"],
    ["Bolsa camiseta 30x40", 2, "x100u", 1900, 3400, 210, 40, "BOL-BOL-001"],
    ["Bolsa camiseta 45x50", 2, "x100u", 2700, 4600, 84, 30, "BOL-BOL-002"],
    ["Bolsa de papel kraft con manija", 2, "x25u", 5400, 8900, 15, 10, "BOL-BOL-003"],
    ["Servilleta blanca 20x20", 3, "x500u", 2100, 3600, 96, 20, "SER-SER-001"],
    ["Servilleta tissue doble hoja", 3, "x200u", 3300, 5500, 32, 12, "SER-SER-002"],
    ["Rollo de cocina industrial", 3, "x6u", 4800, 7900, 18, 6, "SER-SER-003"],
  ];

  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

  for (const [nombre, cat, unidad, costo, venta, stock, minimo, sku] of catalogo) {
    const producto = {
      id: nuevoId(),
      categoriaId: categorias[cat]!.id,
      nombre,
      descripcion: null,
      sku,
      codigoBarras: null,
      unidadMedida: unidad,
      porPeso: false,
      precioCosto: costo,
      precioVenta: venta,
      precioMayorista: null,
      cantidadMayoristaMin: null,
      stock: 0,
      stockMinimo: minimo,
      activo: true,
      creadoEn: hace(40),
      actualizadoEn: hace(40),
    };

    d.productos.push(producto);
    if (stock > 0) ajustarStock(d, producto.id, stock, "Carga inicial", "creacion");
  }

  for (const [nombre, telefono, ciudad] of [
    ["Rotisería La Esquina", "3492 30-1333", "Rafaela"],
    ["Kiosco Belgrano", "3492 41-8820", "Rafaela"],
    ["Panadería San Martín", "3492 52-6104", "Sunchales"],
    ["Bar Los Tilos", "3492 44-9075", "Rafaela"],
  ]) {
    d.clientes.push({
      id: nuevoId(),
      nombre: nombre!,
      telefono: telefono!,
      email: null,
      ciudad: ciudad!,
      direccion: null,
      dniCuit: null,
      razonSocial: null,
      notas: null,
      activo: true,
      creadoEn: hace(35),
    } satisfies Cliente);
  }

  // Un turno de caja ya cerrado, con tres ventas: alcanza para que el panel,
  // los informes y el historial tengan algo que mostrar.
  const caja: Caja = {
    id: nuevoId(),
    numero: ++d.contadores.caja,
    estado: "cerrada",
    fondo: 20000,
    contado: null,
    nota: "Turno de ejemplo",
    abrioId: null,
    abrio: null,
    cerroId: null,
    cerro: null,
    abiertaEn: hace(2.4),
    cerradaEn: hace(2),
    movimientos: [],
  };
  d.cajas.push(caja);

  vender(d, caja, d.clientes[0]!, [[0, 2], [3, 4]], "efectivo", 3);
  vender(d, caja, d.clientes[1]!, [[6, 6], [9, 2]], "transferencia", 2);
  vender(d, caja, null, [[4, 1], [10, 1]], "efectivo", 2);

  caja.contado = caja.fondo + efectivoDe(d, caja.id);

  const dia = (desplazamiento: number) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + desplazamiento);
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    return `${fecha.getFullYear()}-${mes}-${String(fecha.getDate()).padStart(2, "0")}`;
  };

  for (const [fecha, categoria, concepto, monto] of [
    [dia(-3), "mercaderia", "Compra a Plásticos del Litoral", 184000],
    [dia(-3), "envios", "Flete de la compra", 22000],
    [dia(-8), "servicios", "Luz del local", 61500],
    [dia(-12), "alquiler", "Alquiler del depósito", 320000],
    [dia(-15), "insumos", "Artículos de limpieza", 18400],
    [dia(-20), "transporte", "Combustible reparto", 45000],
  ] as [string, string, string, number][]) {
    d.gastos.push({
      id: nuevoId(),
      fecha,
      categoria,
      concepto,
      monto,
      metodoPago: categoria === "mercaderia" ? "transferencia" : "efectivo",
      proveedor: null,
      proveedorId: null,
      comprobante: null,
      notas: null,
      cajaId: null,
      movimientoCajaId: null,
      creadoEn: hace(3),
    });
  }

  return d;
}

function vender(
  d: BaseDatos,
  caja: Caja,
  cliente: Cliente | null,
  renglones: [number, number][],
  metodo: string,
  diasAtras: number
): void {
  const pedido: Pedido = {
    id: nuevoId(),
    numero: ++d.contadores.pedido,
    canal: "mostrador",
    estado: "entregado",
    nombre: cliente?.nombre ?? "Mostrador",
    clienteId: cliente?.id ?? null,
    usuarioId: null,
    usuario: null,
    descuento: 0,
    notas: null,
    total: 0,
    metodoPago: metodo,
    recibido: null,
    cajaId: caja.id,
    pagos: [],
    items: [],
    creadoEn: new Date(Date.now() - diasAtras * 86_400_000).toISOString(),
  };

  for (const [indice, cantidad] of renglones) {
    const producto = d.productos[indice]!;
    pedido.items.push({
      id: nuevoId(),
      productoId: producto.id,
      nombre: producto.nombre,
      unidadMedida: producto.unidadMedida,
      precio: producto.precioVenta,
      costo: producto.precioCosto,
      porPeso: producto.porPeso,
      cantidad,
    });

    pedido.total += producto.precioVenta * cantidad;
    ajustarStock(d, producto.id, -cantidad, `Venta mostrador #${pedido.numero}`, "venta");
  }

  pedido.pagos.push({ metodo, monto: pedido.total });
  d.pedidos.push(pedido);
}
