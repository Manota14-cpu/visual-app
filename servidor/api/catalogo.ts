import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import { noEncontrado, type Ruteador } from "../http.ts";
import {
  ajustarStock,
  contiene,
  entero,
  margenSobreCosto,
  margenSobreVenta,
  monto,
  normalizar,
  nuevoPrecio,
  recortar,
  recortarObligatorio,
  registrarPrecio,
  sugerirSku,
} from "../reglas.ts";
import type { BaseDatos, Producto } from "../tipos.ts";

/** Productos y categorías: el catálogo y su stock. */
export function rutasCatalogo(r: Ruteador, a: Almacen): void {
  // ─────────────────────────────  Categorías  ─────────────────────────────

  r.get("/categorias", () =>
    a.leer((d) =>
      [...d.categorias]
        .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          color: c.color,
          productos: d.productos.filter((p) => p.categoriaId === c.id && p.activo).length,
        }))
    )
  );

  r.post("/categorias", ({ cuerpo }) =>
    a.escribir((d) => {
      const nombre = recortarObligatorio(
        cuerpo.nombre as string,
        80,
        "El nombre de la categoría es obligatorio."
      );
      if (d.categorias.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
        throw new Regla(`Ya existe una categoría llamada "${nombre}".`);
      }

      const categoria = {
        id: nuevoId(),
        nombre,
        color: colorValido(cuerpo.color as string),
        creadaEn: new Date().toISOString(),
      };
      d.categorias.push(categoria);
      return categoria;
    })
  );

  r.put("/categorias/:id", ({ params, cuerpo }) =>
    a.escribir((d) => {
      const categoria = d.categorias.find((c) => c.id === params.id);
      if (!categoria) throw new Regla("Esa categoría ya no existe.");

      const nombre = recortarObligatorio(
        cuerpo.nombre as string,
        80,
        "El nombre de la categoría es obligatorio."
      );
      if (
        d.categorias.some((c) => c.id !== params.id && c.nombre.toLowerCase() === nombre.toLowerCase())
      ) {
        throw new Regla(`Ya existe una categoría llamada "${nombre}".`);
      }

      categoria.nombre = nombre;
      categoria.color = colorValido(cuerpo.color as string);
      return categoria;
    })
  );

  r.borrar("/categorias/:id", ({ params }) =>
    a.escribir((d) => {
      const indice = d.categorias.findIndex((c) => c.id === params.id);
      if (indice < 0) throw new Regla("Esa categoría ya no existe.");

      // Borrar la categoría dejaría a sus productos colgando de un id que ya no
      // existe, y en la pantalla aparecerían sin categoría sin que nadie haya
      // decidido eso.
      const cuantos = d.productos.filter((p) => p.categoriaId === params.id).length;
      if (cuantos > 0) {
        throw new Regla(
          cuantos === 1
            ? "Hay un producto en esta categoría. Movelo a otra antes de borrarla."
            : `Hay ${cuantos} productos en esta categoría. Movelos a otra antes de borrarla.`
        );
      }

      d.categorias.splice(indice, 1);
      return { ok: true };
    })
  );

  // ─────────────────────────────  Productos  ─────────────────────────────

  r.get("/productos", ({ consulta }) =>
    a.leer((d) => {
      const estado = consulta.get("estado") ?? "activos";
      let productos = d.productos.filter((p) => {
        switch (estado) {
          case "eliminados":
            return !p.activo;
          case "bajo":
            return p.activo && p.stock <= p.stockMinimo && p.stock > 0;
          case "sin":
            return p.activo && p.stock === 0;
          case "sincosto":
            return p.activo && (p.precioCosto ?? 0) === 0;
          case "todos":
            return true;
          default:
            return p.activo;
        }
      });

      const categoria = consulta.get("categoria");
      if (categoria) productos = productos.filter((p) => p.categoriaId === categoria);

      const q = consulta.get("q");
      if (q) {
        const termino = normalizar(q);
        productos = productos.filter(
          (p) =>
            contiene(p.nombre, termino) ||
            contiene(p.sku, termino) ||
            contiene(p.codigoBarras, termino) ||
            contiene(p.descripcion, termino)
        );
      }

      switch (consulta.get("orden")) {
        case "stock":
          productos.sort((x, y) => x.stock - y.stock || x.nombre.localeCompare(y.nombre, "es"));
          break;
        case "precio":
          productos.sort(
            (x, y) => y.precioVenta - x.precioVenta || x.nombre.localeCompare(y.nombre, "es")
          );
          break;
        case "reciente":
          productos.sort((x, y) => y.actualizadoEn.localeCompare(x.actualizadoEn));
          break;
        default:
          productos.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
      }

      return paginar(productos, consulta, 30, (p) => vista(d, p));
    })
  );

  r.get("/productos/buscar", ({ consulta }) =>
    a.leer((d) => {
      const termino = normalizar(consulta.get("q"));
      if (termino.length < 2) return [];

      return d.productos
        .filter(
          (p) =>
            p.activo &&
            (contiene(p.nombre, termino) ||
              contiene(p.sku, termino) ||
              contiene(p.codigoBarras, termino))
        )
        // Lo que no tiene stock va al final: encontrarlo no sirve si no se
        // puede entregar, pero verlo explica por qué no aparece.
        .sort(
          (x, y) =>
            Number(x.stock === 0) - Number(y.stock === 0) ||
            x.nombre.localeCompare(y.nombre, "es")
        )
        .slice(0, 12)
        .map((p) => ({
          id: p.id,
          nombre: p.nombre,
          sku: p.sku,
          precio: p.precioVenta,
          stock: p.stock,
          unidadMedida: p.unidadMedida,
        }));
    })
  );

  r.get("/productos/sin-costo", () =>
    a.leer((d) =>
      d.productos
        .filter((p) => p.activo && (p.precioCosto ?? 0) === 0)
        .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))
        .slice(0, 200)
        .map((p) => ({
          id: p.id,
          nombre: p.nombre,
          sku: p.sku,
          precio: p.precioVenta,
          categoria: nombreCategoria(d, p.categoriaId),
        }))
    )
  );

  r.get("/productos/codigo/:codigo", ({ params }) =>
    a.leer((d) => {
      const codigo = params.codigo!.trim();
      const producto = d.productos.find(
        (p) => p.activo && (p.codigoBarras === codigo || p.sku === codigo)
      );
      return producto
        ? vista(d, producto)
        : noEncontrado("Ningún producto tiene ese código.");
    })
  );

  r.get("/productos/:id", ({ params }) =>
    a.leer((d) => {
      const producto = d.productos.find((p) => p.id === params.id);
      return producto ? vista(d, producto) : noEncontrado("Ese producto ya no existe.");
    })
  );

  r.get("/productos/:id/precios", ({ params }) =>
    a.leer((d) =>
      d.cambiosPrecio
        .filter((c) => c.productoId === params.id)
        .sort((x, y) => y.creadoEn.localeCompare(x.creadoEn))
        .slice(0, 60)
    )
  );

  r.post("/productos", ({ cuerpo }) =>
    a.escribir((d) => {
      const ahora = new Date().toISOString();
      const producto: Producto = {
        id: nuevoId(),
        categoriaId: null,
        nombre: "",
        descripcion: null,
        sku: null,
        codigoBarras: null,
        unidadMedida: "unidad",
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

      aplicarFormulario(d, producto, cuerpo);
      d.productos.push(producto);

      const inicial = Math.max(entero(cuerpo.stock, 0), 0);
      if (inicial > 0) {
        ajustarStock(d, producto.id, inicial, "Carga inicial", "creacion");
      }

      return vista(d, producto);
    })
  );

  r.put("/productos/:id", ({ params, cuerpo }) =>
    a.escribir((d) => {
      const producto = d.productos.find((p) => p.id === params.id);
      if (!producto) throw new Regla("Ese producto ya no existe.");

      const precioAnterior = producto.precioVenta;
      const costoAnterior = producto.precioCosto;

      // El stock que viene en el formulario se ignora a propósito: solo cambia
      // por un movimiento con motivo, que es lo que hace que el historial cierre
      // con lo que hay en la estantería.
      aplicarFormulario(d, producto, cuerpo);
      registrarPrecio(
        d,
        producto,
        precioAnterior,
        costoAnterior,
        recortar(cuerpo.motivoPrecio as string, 200) ?? "Edición del producto"
      );

      return vista(d, producto);
    })
  );

  r.borrar("/productos/:id", ({ params }) =>
    a.escribir((d) => {
      const producto = d.productos.find((p) => p.id === params.id);
      if (!producto) throw new Regla("Ese producto ya no existe.");

      // Eliminar es reversible: el historial y las ventas viejas siguen
      // apuntando a este producto, y borrarlo de verdad los dejaría sin nombre.
      producto.activo = false;
      producto.actualizadoEn = new Date().toISOString();
      return { ok: true };
    })
  );

  r.post("/productos/:id/restaurar", ({ params }) =>
    a.escribir((d) => {
      const producto = d.productos.find((p) => p.id === params.id);
      if (!producto) throw new Regla("Ese producto ya no existe.");
      producto.activo = true;
      producto.actualizadoEn = new Date().toISOString();
      return vista(d, producto);
    })
  );

  r.post("/productos/:id/stock", ({ params, cuerpo }) =>
    a.escribir((d) => {
      const cantidad = entero(cuerpo.cantidad, 0);
      if (cantidad === 0) throw new Regla("La cantidad no puede ser cero.");
      if (Math.abs(cantidad) > 1_000_000) throw new Regla("La cantidad es demasiado grande.");

      const motivo = recortarObligatorio(
        cuerpo.motivo as string,
        200,
        "Indicá un motivo del ajuste."
      );

      const stock = ajustarStock(
        d,
        params.id!,
        cantidad,
        motivo,
        cantidad > 0 ? "entrada" : "salida"
      );
      return { stock };
    })
  );

  r.post("/productos/:id/codigo", ({ params, cuerpo }) =>
    a.escribir((d) => {
      const producto = d.productos.find((p) => p.id === params.id);
      if (!producto) throw new Regla("Ese producto ya no existe.");

      const codigo = recortar(cuerpo.codigo as string, 60);
      if (codigo) {
        const otro = d.productos.find(
          (p) => p.id !== producto.id && p.codigoBarras?.toLowerCase() === codigo.toLowerCase()
        );
        if (otro) throw new Regla(`Ese código ya está en "${otro.nombre}".`);
      }

      producto.codigoBarras = codigo;
      producto.actualizadoEn = new Date().toISOString();
      return vista(d, producto);
    })
  );

  // ────────────────────  Acciones sobre muchos  ────────────────────

  r.post("/productos/precios/previsualizar", ({ cuerpo }) =>
    a.leer((d) => previsualizar(d, cuerpo))
  );

  r.post("/productos/precios/aplicar", ({ cuerpo }) =>
    a.escribir((d) => {
      const previa = previsualizar(d, cuerpo);
      const porcentaje = Number(cuerpo.porcentaje) || 0;
      const motivo =
        recortar(cuerpo.motivo as string, 200) ??
        `Ajuste masivo ${porcentaje > 0 ? "+" : ""}${porcentaje}%`;

      for (const fila of previa) {
        const producto = d.productos.find((p) => p.id === fila.id)!;
        const precioAnterior = producto.precioVenta;
        const costoAnterior = producto.precioCosto;

        producto.precioVenta = fila.precioNuevo;
        if (fila.costoNuevo !== null) producto.precioCosto = fila.costoNuevo;
        producto.actualizadoEn = new Date().toISOString();

        registrarPrecio(d, producto, precioAnterior, costoAnterior, motivo);
      }

      return { cambiados: previa.length };
    })
  );

  r.post("/productos/masivo", ({ cuerpo }) =>
    a.escribir((d) => {
      const ids = seleccion(cuerpo.ids);
      const categoriaId = recortar(cuerpo.categoriaId as string, 64);

      if (categoriaId && !d.categorias.some((c) => c.id === categoriaId)) {
        throw new Regla("Esa categoría ya no existe.");
      }

      let cambiados = 0;
      for (const id of ids) {
        const producto = d.productos.find((p) => p.id === id);
        if (!producto) continue;

        if (categoriaId) producto.categoriaId = categoriaId;
        if (typeof cuerpo.activo === "boolean") producto.activo = cuerpo.activo;
        producto.actualizadoEn = new Date().toISOString();
        cambiados++;
      }

      return { cambiados };
    })
  );

  r.post("/productos/costos", ({ cuerpo }) =>
    a.escribir((d) => {
      const costos = (cuerpo.costos ?? []) as { id: string; precioCosto: number }[];
      if (costos.length === 0) throw new Regla("No cargaste ningún costo.");

      let guardados = 0;
      for (const fila of costos) {
        const producto = d.productos.find((p) => p.id === fila.id);
        if (!producto) continue;

        const costo = monto(fila.precioCosto, "El costo");
        const precioAnterior = producto.precioVenta;
        const costoAnterior = producto.precioCosto;

        producto.precioCosto = costo === 0 ? null : costo;
        producto.actualizadoEn = new Date().toISOString();
        registrarPrecio(d, producto, precioAnterior, costoAnterior, "Carga de costos");
        guardados++;
      }

      return { guardados };
    })
  );

  r.post("/productos/skus/proponer", ({ cuerpo }) =>
    a.leer((d) => {
      const ids = Array.isArray(cuerpo.ids) ? (cuerpo.ids as string[]) : [];
      const usados = new Set(
        d.productos.filter((p) => p.sku).map((p) => p.sku!.toLowerCase())
      );

      const candidatos = (
        ids.length > 0
          ? d.productos.filter((p) => ids.includes(p.id))
          : d.productos.filter((p) => p.activo && !p.sku)
      ).sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));

      const propuestas: { id: string; nombre: string; sku: string }[] = [];
      for (const producto of candidatos) {
        if (producto.sku) continue;

        const categoria = nombreCategoria(d, producto.categoriaId) ?? "General";
        let n = 1;
        let sku = sugerirSku(categoria, producto.nombre, n);
        while (usados.has(sku.toLowerCase()) && n < 1000) {
          sku = sugerirSku(categoria, producto.nombre, ++n);
        }

        usados.add(sku.toLowerCase());
        propuestas.push({ id: producto.id, nombre: producto.nombre, sku });
      }

      return propuestas;
    })
  );

  r.post("/productos/skus/aplicar", ({ cuerpo }) =>
    a.escribir((d) => {
      const asignaciones = (cuerpo.asignaciones ?? []) as { id: string; sku: string }[];

      let aplicados = 0;
      for (const fila of asignaciones) {
        const producto = d.productos.find((p) => p.id === fila.id);
        if (!producto) continue;

        const sku = recortar(fila.sku, 40);
        if (!sku) continue;
        if (d.productos.some((p) => p.id !== producto.id && p.sku?.toLowerCase() === sku.toLowerCase())) {
          throw new Regla(`El código ${sku} ya lo usa otro producto.`);
        }

        producto.sku = sku;
        producto.actualizadoEn = new Date().toISOString();
        aplicados++;
      }

      return { aplicados };
    })
  );
}

// ──────────────────────────────  Ayudas  ──────────────────────────────

/** Corta una lista en páginas, con el mismo formato en todas las pantallas. */
export function paginar<T, S>(
  lista: T[],
  consulta: URLSearchParams,
  porDefecto: number,
  vista: (item: T) => S
) {
  const tamano = Math.min(Math.max(entero(consulta.get("porPagina"), porDefecto), 5), 200);
  const pagina = Math.max(entero(consulta.get("pagina"), 1), 1);

  return {
    items: lista.slice((pagina - 1) * tamano, pagina * tamano).map(vista),
    total: lista.length,
    pagina,
    porPagina: tamano,
  };
}

function seleccion(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length === 0) throw new Regla("No seleccionaste ningún producto.");
  if (ids.length > 500) throw new Regla("No se pueden procesar más de 500 productos a la vez.");
  return ids as string[];
}

function nombreCategoria(d: BaseDatos, categoriaId: string | null): string | null {
  if (!categoriaId) return null;
  return d.categorias.find((c) => c.id === categoriaId)?.nombre ?? null;
}

function colorValido(color: string | undefined): string | null {
  const limpio = recortar(color, 7);
  if (!limpio) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(limpio)) throw new Regla("Ese color no es válido.");
  return limpio;
}

/** El producto tal como lo muestra la interfaz, con su categoría y su margen. */
export function vista(d: BaseDatos, p: Producto) {
  const categoria = p.categoriaId ? d.categorias.find((c) => c.id === p.categoriaId) : undefined;

  return {
    id: p.id,
    categoriaId: p.categoriaId,
    categoria: categoria?.nombre ?? null,
    categoriaColor: categoria?.color ?? null,
    nombre: p.nombre,
    descripcion: p.descripcion,
    sku: p.sku,
    codigoBarras: p.codigoBarras,
    unidadMedida: p.unidadMedida,
    precioCosto: p.precioCosto,
    precioVenta: p.precioVenta,
    precioMayorista: p.precioMayorista,
    cantidadMayoristaMin: p.cantidadMayoristaMin,
    stock: p.stock,
    stockMinimo: p.stockMinimo,
    activo: p.activo,
    margen: margenSobreVenta(p.precioVenta, p.precioCosto),
    margenCosto: margenSobreCosto(p.precioVenta, p.precioCosto),
    creadoEn: p.creadoEn,
    actualizadoEn: p.actualizadoEn,
  };
}

/**
 * Vuelca el formulario sobre el producto, validando cada campo.
 *
 * La importación de catálogo también pasa por acá: así los códigos repetidos,
 * las categorías inexistentes y los precios fuera de rango se rechazan con las
 * mismas reglas que el formulario, y no con una copia que se despega.
 */
export function aplicarFormulario(d: BaseDatos, producto: Producto, cuerpo: Record<string, unknown>): void {
  producto.nombre = recortarObligatorio(
    cuerpo.nombre as string,
    160,
    "El nombre del producto es obligatorio."
  );
  producto.descripcion = recortar(cuerpo.descripcion as string, 600);
  producto.unidadMedida = recortar(cuerpo.unidadMedida as string, 24) ?? "unidad";

  const sku = recortar(cuerpo.sku as string, 40);
  if (sku && d.productos.some((p) => p.id !== producto.id && p.sku?.toLowerCase() === sku.toLowerCase())) {
    throw new Regla(`El código ${sku} ya lo usa otro producto.`);
  }
  producto.sku = sku;

  const codigo = recortar(cuerpo.codigoBarras as string, 60);
  if (
    codigo &&
    d.productos.some(
      (p) => p.id !== producto.id && p.codigoBarras?.toLowerCase() === codigo.toLowerCase()
    )
  ) {
    throw new Regla("Ese código de barras ya está cargado en otro producto.");
  }
  producto.codigoBarras = codigo;

  const categoriaId = recortar(cuerpo.categoriaId as string, 64);
  if (categoriaId) {
    if (!d.categorias.some((c) => c.id === categoriaId)) throw new Regla("Esa categoría ya no existe.");
    producto.categoriaId = categoriaId;
  } else if (!producto.categoriaId) {
    // Sin categoría elegida se usa la primera: un producto sin categoría
    // desaparece de los filtros y nadie lo vuelve a ver.
    const primera = [...d.categorias].sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))[0];
    if (!primera) throw new Regla("Creá una categoría antes de cargar productos.");
    producto.categoriaId = primera.id;
  }

  producto.precioVenta = monto(cuerpo.precioVenta, "El precio de venta");

  // Un costo en cero es "todavía no lo sé", no "vale cero".
  const costo = monto(cuerpo.precioCosto, "El costo");
  producto.precioCosto = costo === 0 ? null : costo;

  const mayorista = monto(cuerpo.precioMayorista, "El precio mayorista");
  producto.precioMayorista = mayorista === 0 ? null : mayorista;

  const desde = entero(cuerpo.cantidadMayoristaMin, 0);
  producto.cantidadMayoristaMin = desde === 0 ? null : desde;

  const minimo = entero(cuerpo.stockMinimo, 0);
  if (minimo < 0) throw new Regla("El stock mínimo no puede ser negativo.");
  producto.stockMinimo = minimo;

  producto.actualizadoEn = new Date().toISOString();
}

interface FilaPrecio {
  id: string;
  nombre: string;
  precioActual: number;
  precioNuevo: number;
  costoActual: number | null;
  costoNuevo: number | null;
  margenNuevo: number | null;
  margenCostoNuevo: number | null;
}

function previsualizar(d: BaseDatos, cuerpo: Record<string, unknown>): FilaPrecio[] {
  const ids = seleccion(cuerpo.ids);
  const porcentaje = Number(cuerpo.porcentaje);

  if (!Number.isFinite(porcentaje) || porcentaje === 0) throw new Regla("Un 0% no cambiaría nada.");
  if (porcentaje < -90) throw new Regla("No se puede bajar más del 90%.");
  if (porcentaje > 500) throw new Regla("No se puede subir más del 500%.");

  const redondeo = [1, 10, 50, 100].includes(Number(cuerpo.redondeo)) ? Number(cuerpo.redondeo) : 1;
  const aplicarA =
    cuerpo.aplicarA === "costo" || cuerpo.aplicarA === "ambos" ? cuerpo.aplicarA : "venta";

  const filas: FilaPrecio[] = [];
  for (const id of ids) {
    const p = d.productos.find((x) => x.id === id);
    if (!p) continue;

    const precioNuevo =
      aplicarA === "costo" ? p.precioVenta : nuevoPrecio(p.precioVenta, porcentaje, redondeo);

    const costoNuevo =
      (aplicarA === "costo" || aplicarA === "ambos") && p.precioCosto && p.precioCosto > 0
        ? nuevoPrecio(p.precioCosto, porcentaje, redondeo)
        : null;

    if (precioNuevo === p.precioVenta && costoNuevo === null) continue;

    filas.push({
      id: p.id,
      nombre: p.nombre,
      precioActual: p.precioVenta,
      precioNuevo,
      costoActual: p.precioCosto,
      costoNuevo,
      margenNuevo: margenSobreVenta(precioNuevo, costoNuevo ?? p.precioCosto),
      margenCostoNuevo: margenSobreCosto(precioNuevo, costoNuevo ?? p.precioCosto),
    });
  }

  return filas;
}

