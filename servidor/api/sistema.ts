import fs from "node:fs";
import path from "node:path";
import { inicial, nuevoId, Regla, type Almacen } from "../almacen.ts";
import type { Ruteador } from "../http.ts";
import { lanzar } from "../lanzar.ts";
import { ajustarStock, efectivoDe, recortar, recortarObligatorio } from "../reglas.ts";
import type { BaseDatos, Caja, Cliente, Pedido } from "../tipos.ts";
import { latir } from "../vida.ts";

export const VERSION = "1.6.0";

/**
 * El archivo de datos y lo que se puede hacer con él.
 *
 * Es lo que reemplaza a la pantalla de "estado de la base": acá no hay conexión
 * que probar ni migración que aplicar, hay un archivo que se puede abrir,
 * copiar y llevarse en un pendrive.
 */
export function rutasSistema(r: Ruteador, a: Almacen): void {
  r.get("/sistema", () =>
    a.leer((d) => ({
      archivo: a.archivo,
      carpeta: path.dirname(a.archivo),
      carpetaCopias: a.carpetaCopias,
      tamano: a.tamano(),
      version: d.version,
      config: d.config,
      programa: VERSION,
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
    }))
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
    })
  );

  r.post("/sistema/copia", () => {
    const ruta = a.copiar();
    return { archivo: ruta, nombre: path.basename(ruta) };
  });

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

    return a.restaurar(nombre);
  });

  r.post("/sistema/carpeta", () => {
    // Abrir el explorador en la carpeta de datos es la forma más simple de que
    // alguien copie su archivo a un pendrive sin explicarle dónde queda
    // "AppData".
    const carpeta = path.dirname(a.archivo);

    if (process.platform === "win32") lanzar("explorer.exe", [carpeta]);
    else if (process.platform === "darwin") lanzar("open", [carpeta]);
    else lanzar("xdg-open", [carpeta]);

    return { carpeta };
  });

  r.post("/sistema/vaciar", ({ cuerpo }) => {
    // Vaciar la base borra todo lo cargado. Se pide escribir la palabra
    // completa: un botón con "¿estás seguro?" se acepta sin leerlo.
    if (String(cuerpo.confirmacion ?? "").trim().toUpperCase() !== "BORRAR") {
      throw new Regla("Escribí BORRAR para confirmar.");
    }

    a.vaciar();
    return { ok: true };
  });

  // La ventana avisa cada veinte segundos que sigue abierta. Sin esto, el
  // servidor no tendría forma de saber que ya nadie lo está mirando.
  r.post("/sistema/latido", () => {
    latir();
    return { ok: true };
  });

  r.post("/sistema/apagar", () => {
    // Se contesta primero y se apaga después: si el proceso se fuera acá mismo,
    // el navegador vería la conexión cortada y mostraría un error justo cuando
    // todo salió bien.
    setTimeout(() => process.exit(0), 250).unref();
    return { ok: true };
  });

  r.post("/sistema/ejemplo", () => {
    const vacia = a.leer((d) => d.productos.length === 0 && d.pedidos.length === 0);
    if (!vacia) throw new Regla("Los datos de ejemplo solo se pueden cargar sobre una base vacía.");

    a.reemplazar(armarEjemplo());
    return { ok: true };
  });
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
    ["Vasos", "#0A84FF"],
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
