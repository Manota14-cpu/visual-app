import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import { armarCsv, leerCsv, separadorDe } from "../csv.ts";
import type { Ruteador } from "../http.ts";
import {
  ajustarStock,
  normalizar,
  numeroDeTexto,
  recortar,
  registrarPrecio,
  soloAlfanumerico,
} from "../reglas.ts";
import type { BaseDatos, Producto } from "../tipos.ts";
import { aplicarFormulario } from "./catalogo.ts";

/**
 * Sacar el catálogo a una planilla y volver a meterlo.
 *
 * Existe para mudarse: pasar el stock a otra computadora, cargar por primera
 * vez una lista que ya estaba en Excel, o corregir doscientos precios sentado
 * en una planilla en vez de producto por producto.
 *
 * Dos decisiones que valen para todo lo que sigue:
 *
 * 1. **El stock no se escribe, se ajusta.** La columna del archivo dice cuánto
 *    tiene que quedar; el programa calcula la diferencia y la mueve con
 *    `ajustarStock`, que deja el movimiento con su motivo. Escribir el número
 *    derecho sería más corto y dejaría el historial mintiendo: la estantería
 *    diría 40 y los movimientos no sabrían de dónde salieron.
 *
 * 2. **Primero se mira, después se aplica.** Un archivo de trescientas filas
 *    que se aplica solo es una forma cara de romper un catálogo. La pantalla
 *    muestra fila por fila qué va a pasar —cuál es nueva, cuál cambia de precio,
 *    cuál no se entiende— y recién ahí hay un botón.
 */
export function rutasTraspaso(r: Ruteador, a: Almacen): void {
  r.get("/catalogo/exportar", ({ consulta }) =>
    a.leer((d) => {
      const todos = consulta.get("todos") === "si";
      const productos = d.productos
        .filter((p) => todos || p.activo)
        .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));

      const filas: (string | number | null)[][] = [
        [...COLUMNAS],
        ...productos.map((p) => [
          p.sku,
          p.nombre,
          d.categorias.find((c) => c.id === p.categoriaId)?.nombre ?? "",
          p.unidadMedida,
          p.codigoBarras,
          p.precioCosto ?? "",
          p.precioVenta,
          p.stock,
          p.stockMinimo,
          p.descripcion,
        ]),
      ];

      const hoy = new Date();
      const dos = (n: number) => String(n).padStart(2, "0");
      const sello = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;

      return {
        nombre: `catalogo-${sello}.csv`,
        contenido: armarCsv(filas),
        productos: productos.length,
      };
    }), "dueno");

  r.post("/catalogo/importar", ({ cuerpo }) => a.leer((d) => planificar(d, cuerpo)), "dueno");

  r.post("/catalogo/importar/aplicar", ({ cuerpo }) =>
    a.escribir((d) => {
      const plan = planificar(d, cuerpo);
      const crearFaltantes = cuerpo.crearFaltantes !== false;

      // Las categorías nombradas en el archivo se crean primero: si no, cada
      // producto nuevo caería en la primera categoría alfabética y habría que
      // reacomodar el catálogo a mano después de importarlo.
      //
      // Solo las que va a usar alguna fila que de verdad entra: con las altas
      // apagadas, una categoría que nombra únicamente un producto nuevo quedaría
      // creada y vacía.
      const usadas = new Set(
        plan.filas
          .filter((f) => f.accion !== "error" && (f.accion !== "nuevo" || crearFaltantes))
          .map((f) => (f.categoria ? normalizar(f.categoria) : ""))
      );

      const categorias = new Map<string, string>();
      for (const c of d.categorias) categorias.set(normalizar(c.nombre), c.id);

      const creadas = plan.categoriasNuevas.filter((n) => usadas.has(normalizar(n)));

      for (const nombre of creadas) {
        const categoria = {
          id: nuevoId(),
          nombre,
          color: null,
          creadaEn: new Date().toISOString(),
        };
        d.categorias.push(categoria);
        categorias.set(normalizar(nombre), categoria.id);
      }

      let creados = 0;
      let actualizados = 0;
      let movidos = 0;

      for (const fila of plan.filas) {
        if (fila.accion === "error") continue;
        if (fila.accion === "nuevo" && !crearFaltantes) continue;

        let producto = fila.productoId
          ? d.productos.find((p) => p.id === fila.productoId)
          : undefined;

        const nuevo = producto === undefined;
        if (nuevo) {
          const ahora = new Date().toISOString();
          producto = {
            id: nuevoId(),
            categoriaId: null,
            nombre: "",
            descripcion: null,
            sku: null,
            codigoBarras: null,
            unidadMedida: "unidad",
            porPeso: false,
            precioCosto: null,
            precioVenta: 0,
            precioMayorista: null,
            cantidadMayoristaMin: null,
            stock: 0,
            stockMinimo: 0,
            activo: true,
            creadoEn: ahora,
            actualizadoEn: ahora,
          };
          d.productos.push(producto);
        }

        const precioAnterior = producto!.precioVenta;
        const costoAnterior = producto!.precioCosto;

        aplicarFormulario(d, producto!, formularioDe(fila, producto!, categorias));
        registrarPrecio(d, producto!, precioAnterior, costoAnterior, "Importación de catálogo");

        // El stock del archivo es el que tiene que quedar, no el que se suma.
        if (fila.stockNuevo !== null) {
          const diferencia = fila.stockNuevo - producto!.stock;
          if (diferencia !== 0) {
            ajustarStock(
              d,
              producto!.id,
              diferencia,
              "Importación de catálogo",
              diferencia > 0 ? "entrada" : "salida"
            );
            movidos++;
          }
        }

        if (nuevo) creados++;
        else actualizados++;
      }

      return {
        creados,
        actualizados,
        movidos,
        categorias: creadas.length,
        omitidos: plan.resumen.errores + (crearFaltantes ? 0 : plan.resumen.nuevos),
      };
    }), "dueno");
}

// ──────────────────────────────  El archivo  ──────────────────────────────

/** Las columnas que escribe la exportación, en orden. */
const COLUMNAS = [
  "sku",
  "nombre",
  "categoria",
  "unidad",
  "codigo_barras",
  "costo",
  "precio",
  "stock",
  "stock_minimo",
  "descripcion",
] as const;

/**
 * Cómo se puede llamar cada columna.
 *
 * El archivo que vuelve rara vez es el que salió: pasó por Excel, por las manos
 * de alguien y por el nombre que a esa persona le pareció obvio. Reconocer
 * "código", "cod" y "sku" como la misma cosa evita que la importación falle por
 * un encabezado.
 */
const ALIAS: Record<string, string> = {
  sku: "sku",
  codigo: "sku",
  cod: "sku",
  codigointerno: "sku",
  nombre: "nombre",
  producto: "nombre",
  articulo: "nombre",
  detalle: "nombre",
  categoria: "categoria",
  rubro: "categoria",
  unidad: "unidad",
  unidadmedida: "unidad",
  medida: "unidad",
  presentacion: "unidad",
  codigobarras: "codigoBarras",
  barras: "codigoBarras",
  ean: "codigoBarras",
  costo: "costo",
  preciocosto: "costo",
  compra: "costo",
  preciocompra: "costo",
  precio: "precio",
  precioventa: "precio",
  venta: "precio",
  publico: "precio",
  preciopublico: "precio",
  stock: "stock",
  cantidad: "stock",
  cant: "stock",
  existencia: "stock",
  existencias: "stock",
  stockminimo: "stockMinimo",
  minimo: "stockMinimo",
  reponer: "stockMinimo",
  descripcion: "descripcion",
  observaciones: "descripcion",
  notas: "descripcion",
};

/**
 * Para los encabezados que no están en la lista de arriba.
 *
 * Nadie escribe «stock» a secas: escribe «Stock actual», «Cantidad en stock»,
 * «Existencia disponible». Mantener una lista con todas las combinaciones es una
 * carrera que se pierde, así que lo que no coincide palabra por palabra se
 * resuelve buscando el pedazo que lo delata.
 *
 * **El orden es la regla.** Se prueba de lo más específico a lo más general, y
 * gana el primero: «stock mínimo» tiene que caer en el mínimo antes de que la
 * palabra «stock» se lo lleve, y «precio de costo» en el costo antes de que se
 * lo lleve «precio». Mover una fila de acá cambia lo que entiende el programa.
 */
const PARECIDOS: [string, string][] = [
  // Primero lo que contiene una palabra que también aparece en otro campo.
  ["minimo", "stockMinimo"],
  ["minima", "stockMinimo"],
  ["reponer", "stockMinimo"],
  ["reposicion", "stockMinimo"],
  ["barra", "codigoBarras"],
  ["ean", "codigoBarras"],
  ["costo", "costo"],
  ["compra", "costo"],
  ["descripcion", "descripcion"],
  ["observacion", "descripcion"],

  // Después lo general.
  ["stock", "stock"],
  ["existencia", "stock"],
  ["cantidad", "stock"],
  ["disponible", "stock"],
  ["venta", "precio"],
  ["publico", "precio"],
  ["precio", "precio"],
  ["categoria", "categoria"],
  ["rubro", "categoria"],
  ["familia", "categoria"],
  ["unidad", "unidad"],
  ["medida", "unidad"],
  ["presentacion", "unidad"],
  ["sku", "sku"],
  ["codigo", "sku"],
  ["nombre", "nombre"],
  ["producto", "nombre"],
  ["articulo", "nombre"],
];

/** A qué campo apunta un encabezado, y si lo dijo con todas las letras. */
function reconocer(texto: string): { campo: string; exacta: boolean } | null {
  const clave = claveDe(texto);
  if (!clave) return null;

  const exacto = ALIAS[clave];
  if (exacto) return { campo: exacto, exacta: true };

  for (const [pedazo, campo] of PARECIDOS) {
    if (clave.includes(pedazo)) return { campo, exacta: false };
  }

  return null;
}

/**
 * Qué columna del archivo es cada campo.
 *
 * Cuando dos columnas apuntan al mismo campo —«Stock» y «Stock actual» en la
 * misma planilla— gana la que lo dijo con todas las letras, y no la que venía
 * primero. Quedarse con la primera hacía que una columna auxiliar le ganara a
 * la buena por estar más a la izquierda.
 */
export function mapearEncabezado(celdas: string[]): string[] {
  const leidas = celdas.map(reconocer);

  const elegida = new Map<string, number>();
  leidas.forEach((columna, i) => {
    if (!columna) return;
    const actual = elegida.get(columna.campo);
    if (actual === undefined) {
      elegida.set(columna.campo, i);
    } else if (columna.exacta && !leidas[actual]!.exacta) {
      elegida.set(columna.campo, i);
    }
  });

  return leidas.map((columna, i) =>
    columna && elegida.get(columna.campo) === i ? columna.campo : ""
  );
}

interface Fila {
  linea: number;
  accion: "nuevo" | "actualiza" | "igual" | "error";
  detalle: string;
  productoId: string | null;
  sku: string | null;
  nombre: string;
  categoria: string | null;
  unidad: string | null;
  codigoBarras: string | null;
  descripcion: string | null;
  costo: number | null;
  precio: number | null;
  stockNuevo: number | null;
  stockMinimo: number | null;
  stockActual: number | null;
  precioActual: number | null;
}

/**
 * Lee el archivo y arma el plan, sin tocar nada.
 *
 * Lo llaman las dos rutas con el mismo texto: la que muestra la vista previa y
 * la que aplica. Es la misma función a propósito — si fueran dos, un día una
 * diría una cosa y la otra haría otra, que es la peor forma de romper un
 * catálogo.
 */
function planificar(d: BaseDatos, cuerpo: Record<string, unknown>) {
  const texto = typeof cuerpo.texto === "string" ? cuerpo.texto : "";
  if (!texto.trim()) throw new Regla("El archivo está vacío.");

  // El rombo negro (U+FFFD) es lo que deja un texto leído con la codificación
  // equivocada. La pantalla ya se encarga de adivinarla bien; si algo llegó
  // igual con rombos, entró mal, y dejarlo pasar renombraría el catálogo a
  // «Bandeja pl�stica» sin que nada avise. Se rechaza el archivo entero: si una
  // fila está mal leída, lo están todas.
  if (texto.includes("�")) {
    throw new Regla(
      "El archivo tiene caracteres que no se pudieron leer, así que está guardado con otra codificación. Abrilo en Excel y usá «Guardar como» eligiendo «CSV UTF-8»."
    );
  }

  const filasCrudas = leerCsv(texto, separadorDe(texto));
  if (filasCrudas.length < 2) {
    throw new Regla("El archivo tiene el encabezado pero ninguna fila con datos.");
  }
  if (filasCrudas.length > 3001) {
    throw new Regla("El archivo tiene más de 3000 filas. Partilo en varios.");
  }

  const celdasEncabezado = filasCrudas[0] ?? [];
  const encabezado = mapearEncabezado(celdasEncabezado);

  // Las que no se entendieron se nombran tal como venían: si alguien esperaba
  // que su columna de stock entrara y no entró, esto es lo único que se lo dice.
  const ignoradas = celdasEncabezado
    .map((celda, i) => (encabezado[i] === "" ? celda.trim() : ""))
    .filter((celda) => celda !== "");
  if (!encabezado.includes("nombre") && !encabezado.includes("sku")) {
    throw new Regla(
      "No se reconoce ninguna columna. La primera fila tiene que ser el encabezado, con al menos «nombre» o «sku». Exportá el catálogo para ver el formato."
    );
  }

  const columna = (fila: string[], nombre: string): string | null => {
    const i = encabezado.indexOf(nombre);
    if (i < 0) return null;
    const valor = (fila[i] ?? "").trim();
    return valor === "" ? null : valor;
  };

  const filas: Fila[] = [];
  const vistos = new Set<string>();
  const categoriasNuevas: string[] = [];
  const conocidas = new Set(d.categorias.map((c) => normalizar(c.nombre)));

  for (let i = 1; i < filasCrudas.length; i++) {
    const cruda = filasCrudas[i]!;
    const sku = recortar(columna(cruda, "sku"), 40);
    const nombre = recortar(columna(cruda, "nombre"), 160);
    const codigoBarras = recortar(columna(cruda, "codigoBarras"), 60);

    const base: Fila = {
      linea: i + 1,
      accion: "error",
      detalle: "",
      productoId: null,
      sku,
      nombre: nombre ?? sku ?? "",
      categoria: recortar(columna(cruda, "categoria"), 80),
      unidad: recortar(columna(cruda, "unidad"), 24),
      codigoBarras,
      descripcion: recortar(columna(cruda, "descripcion"), 600),
      costo: entero(columna(cruda, "costo")),
      precio: entero(columna(cruda, "precio")),
      stockNuevo: entero(columna(cruda, "stock")),
      stockMinimo: entero(columna(cruda, "stockMinimo")),
      stockActual: null,
      precioActual: null,
    };

    const producto = buscar(d, sku, codigoBarras, nombre);
    base.productoId = producto?.id ?? null;
    base.stockActual = producto?.stock ?? null;
    base.precioActual = producto?.precioVenta ?? null;

    // La misma clave dos veces en un archivo es un error de quien lo armó, y
    // aplicarlo sin decir nada dejaría al segundo pisando al primero.
    const clave = normalizar(sku ?? codigoBarras ?? nombre ?? String(i));
    if (vistos.has(clave)) {
      filas.push({ ...base, accion: "error", detalle: "Repetido en el archivo" });
      continue;
    }
    vistos.add(clave);

    if (!producto && !nombre) {
      filas.push({ ...base, accion: "error", detalle: "Sin nombre y sin producto que coincida" });
      continue;
    }

    const problema = revisar(d, base, producto);
    if (problema) {
      filas.push({ ...base, accion: "error", detalle: problema });
      continue;
    }

    if (base.categoria && !conocidas.has(normalizar(base.categoria))) {
      conocidas.add(normalizar(base.categoria));
      categoriasNuevas.push(base.categoria);
    }

    if (!producto) {
      filas.push({ ...base, accion: "nuevo", detalle: descripcionDeAlta(base) });
      continue;
    }

    const cambios = comparar(base, producto);
    filas.push({
      ...base,
      accion: cambios.length > 0 ? "actualiza" : "igual",
      detalle: cambios.length > 0 ? cambios.join(" · ") : "Ya está igual",
    });
  }

  const cuenta = (accion: Fila["accion"]) => filas.filter((f) => f.accion === accion).length;

  return {
    columnas: encabezado.filter(Boolean),
    ignoradas,
    // Sin columna de stock la importación no lo toca. Es una decisión correcta
    // —no hay dato, no se inventa— pero es exactamente lo contrario de lo que
    // espera quien trajo el archivo para cargar el stock de una vez, así que se
    // dice en la pantalla en vez de dejarlo pasar en silencio.
    traeStock: encabezado.includes("stock"),
    filas,
    categoriasNuevas,
    resumen: {
      total: filas.length,
      nuevos: cuenta("nuevo"),
      actualiza: cuenta("actualiza"),
      iguales: cuenta("igual"),
      errores: cuenta("error"),
    },
  };
}

/**
 * A qué producto se refiere una fila.
 *
 * Por SKU primero, que es el código que alguien eligió a propósito; después por
 * código de barras; y recién al final por nombre exacto, que es el más frágil
 * —"Bandeja N°2" y "Bandeja N2" no son iguales para una computadora— pero es lo
 * único que trae una lista escrita a mano.
 */
function buscar(
  d: BaseDatos,
  sku: string | null,
  codigoBarras: string | null,
  nombre: string | null
): Producto | undefined {
  if (sku) {
    const porSku = d.productos.find((p) => p.sku && p.sku.toLowerCase() === sku.toLowerCase());
    if (porSku) return porSku;
  }

  if (codigoBarras) {
    const porBarras = d.productos.find(
      (p) => p.codigoBarras && p.codigoBarras.toLowerCase() === codigoBarras.toLowerCase()
    );
    if (porBarras) return porBarras;
  }

  if (nombre) {
    const buscado = normalizar(nombre);
    return d.productos.find((p) => normalizar(p.nombre) === buscado);
  }

  return undefined;
}

/** Lo que hace que una fila no se pueda usar. Null si está bien. */
function revisar(d: BaseDatos, fila: Fila, producto: Producto | undefined): string | null {
  for (const [valor, que] of [
    [fila.costo, "El costo"],
    [fila.precio, "El precio"],
    [fila.stockNuevo, "El stock"],
    [fila.stockMinimo, "El stock mínimo"],
  ] as [number | null, string][]) {
    if (valor === null) continue;
    if (valor < 0) return `${que} no puede ser negativo`;
    if (valor > 99_999_999) return `${que} es demasiado grande`;
  }

  if (!producto && fila.precio === null) return "Producto nuevo sin precio de venta";

  // Un código que ya usa OTRO producto no se puede escribir acá: son únicos, y
  // el catálogo dejaría de poder buscarse por ellos.
  const otroCon = (campo: (p: Producto) => string | null, valor: string) =>
    d.productos.find(
      (p) => p.id !== fila.productoId && campo(p)?.toLowerCase() === valor.toLowerCase()
    )?.nombre;

  if (fila.sku) {
    const otro = otroCon((p) => p.sku, fila.sku);
    if (otro) return `El código ${fila.sku} ya lo usa "${otro}"`;
  }
  if (fila.codigoBarras) {
    const otro = otroCon((p) => p.codigoBarras, fila.codigoBarras);
    if (otro) return `El código de barras ya está en "${otro}"`;
  }

  return null;
}

/** Qué va a cambiar de un producto que ya existe. */
function comparar(fila: Fila, producto: Producto): string[] {
  const cambios: string[] = [];

  if (fila.nombre && normalizar(fila.nombre) !== normalizar(producto.nombre)) {
    cambios.push(`nombre → ${fila.nombre}`);
  }
  if (fila.precio !== null && fila.precio !== producto.precioVenta) {
    cambios.push(`precio ${producto.precioVenta} → ${fila.precio}`);
  }
  if (fila.costo !== null && fila.costo !== (producto.precioCosto ?? 0)) {
    cambios.push(`costo ${producto.precioCosto ?? 0} → ${fila.costo}`);
  }
  if (fila.stockNuevo !== null && fila.stockNuevo !== producto.stock) {
    cambios.push(`stock ${producto.stock} → ${fila.stockNuevo}`);
  }
  if (fila.sku && fila.sku !== producto.sku) cambios.push(`código → ${fila.sku}`);
  if (fila.codigoBarras && fila.codigoBarras !== producto.codigoBarras) {
    cambios.push("código de barras");
  }
  if (fila.unidad && fila.unidad !== producto.unidadMedida) cambios.push(`unidad → ${fila.unidad}`);
  if (fila.stockMinimo !== null && fila.stockMinimo !== producto.stockMinimo) {
    cambios.push(`mínimo ${producto.stockMinimo} → ${fila.stockMinimo}`);
  }

  return cambios;
}

function descripcionDeAlta(fila: Fila): string {
  const partes = [`precio ${fila.precio ?? 0}`];
  if (fila.stockNuevo !== null) partes.push(`stock ${fila.stockNuevo}`);
  if (fila.categoria) partes.push(fila.categoria);
  return `Se crea con ${partes.join(", ")}`;
}

/** El producto tal como lo espera el formulario del catálogo. */
function formularioDe(
  fila: Fila,
  producto: Producto,
  categorias: Map<string, string>
): Record<string, unknown> {
  return {
    nombre: fila.nombre || producto.nombre,
    descripcion: fila.descripcion ?? producto.descripcion,
    sku: fila.sku ?? producto.sku,
    codigoBarras: fila.codigoBarras ?? producto.codigoBarras,
    unidadMedida: fila.unidad ?? producto.unidadMedida,
    categoriaId: fila.categoria
      ? (categorias.get(normalizar(fila.categoria)) ?? producto.categoriaId)
      : producto.categoriaId,
    precioVenta: fila.precio ?? producto.precioVenta,
    precioCosto: fila.costo ?? producto.precioCosto ?? 0,
    precioMayorista: producto.precioMayorista ?? 0,
    cantidadMayoristaMin: producto.cantidadMayoristaMin ?? 0,
    stockMinimo: fila.stockMinimo ?? producto.stockMinimo,
  };
}

/** El encabezado, sin acentos, sin espacios y sin signos: "Código de barras" → "codigobarras". */
function claveDe(texto: string): string {
  return soloAlfanumerico(texto).toLowerCase();
}

/** Una celda numérica. Vacía es "no lo digo", no "cero". */
function entero(texto: string | null): number | null {
  if (texto === null) return null;
  const n = numeroDeTexto(texto);
  return n === null ? null : Math.round(n);
}
