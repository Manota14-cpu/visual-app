import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import { noEncontrado, type Ruteador } from "../http.ts";
import { esDueno } from "../usuarios.ts";
import { buscarCodigoMundial, nombreSugerido } from "../codigos-mundiales.ts";
import { cantidadDeEtiqueta, leerEtiqueta, productoDelPlu } from "../balanza.ts";
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

/** Lo que necesita la caja de un producto para agregarlo al carrito. */
function productoBuscado(p: Producto) {
  return {
    id: p.id,
    nombre: p.nombre,
    sku: p.sku,
    // Para la etiqueta: si el producto ya tiene código de fábrica, se
    // imprime ese y no el SKU interno, o el lector del mostrador leería
    // uno y el catálogo tendría el otro.
    codigoBarras: p.codigoBarras,
    precio: p.precioVenta,
    stock: p.stock,
    unidadMedida: p.unidadMedida,
    porPeso: p.porPeso,
  };
}

/**
 * Lo que más se vendió en los últimos treinta días, para tenerlo a un toque
 * en la caja.
 *
 * Se cuenta en cuántas ventas apareció cada producto y no cuántas unidades
 * salieron: el pan por peso suma miles de gramos por venta y taparía todo lo
 * demás, y lo que interesa es qué se pide seguido, que es lo que conviene no
 * tener que buscar. Las devoluciones y lo cancelado no cuentan; lo que se
 * dio de baja, tampoco.
 */
export function productosFrecuentes(d: BaseDatos, ahora: Date, limite = 8) {
  // Se compara el texto de la fecha antes de convertirla: la caja pide esto
  // después de cada venta, y un negocio con años de historia tiene decenas de
  // miles de ventas que no hace falta leer.
  const desde = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const hasta = ahora.toISOString();
  const veces = new Map<string, { ventas: number; ultima: number }>();

  for (const pedido of d.pedidos) {
    if (pedido.creadoEn < desde || pedido.creadoEn > hasta) continue;
    if (pedido.estado === "cancelado" || pedido.canal === "devolucion") continue;
    const cuando = new Date(pedido.creadoEn).getTime();

    for (const id of new Set(pedido.items.map((i) => i.productoId))) {
      if (!id) continue;
      const previo = veces.get(id) ?? { ventas: 0, ultima: 0 };
      veces.set(id, { ventas: previo.ventas + 1, ultima: Math.max(previo.ultima, cuando) });
    }
  }

  return d.productos
    .filter((p) => p.activo && veces.has(p.id))
    .sort((x, y) => {
      const vx = veces.get(x.id)!, vy = veces.get(y.id)!;
      // A igual cantidad de ventas, lo que se vendió último: es lo que se
      // está pidiendo ahora.
      return vy.ventas - vx.ventas || vy.ultima - vx.ultima || x.nombre.localeCompare(y.nombre, "es");
    })
    .slice(0, limite)
    .map(productoBuscado);
}

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
    }), "dueno");

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
    }), "dueno");

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
    }), "dueno");

  // ─────────────────────────────  Productos  ─────────────────────────────

  r.get("/productos", ({ consulta, usuario }) =>
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

      // "ninguno" son los que todavía no tienen proveedor: los que faltan asignar.
      const proveedor = consulta.get("proveedor");
      if (proveedor === "ninguno") productos = productos.filter((p) => !p.proveedorId);
      else if (proveedor) productos = productos.filter((p) => p.proveedorId === proveedor);

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

      return paginar(productos, consulta, 30, (p) => vista(d, p, esDueno(usuario)));
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
        .map(productoBuscado);
    })
  );

  r.get("/productos/frecuentes", () => a.leer((d) => productosFrecuentes(d, new Date())));

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
    ), "dueno");

  r.get("/productos/codigo/:codigo", ({ params, usuario }) =>
    a.leer((d) => {
      // Sin distinguir mayúsculas: un lector con el Bloq Mayús cambiado, o
      // quien lo escribe a mano, manda "gen-lec-001" y es el mismo código.
      const codigo = params.codigo!.trim().toLowerCase();
      const producto = d.productos.find(
        (p) =>
          p.activo &&
          (p.codigoBarras?.toLowerCase() === codigo || p.sku?.toLowerCase() === codigo)
      );
      if (producto) return vista(d, producto, esDueno(usuario));

      // Lo que no está cargado puede ser una etiqueta de la balanza: trae
      // adentro el número del producto y el importe o el peso del paquete.
      // Va después de la búsqueda exacta, así un código interno que empiece
      // con 2 y esté cargado tal cual nunca se confunde con una etiqueta.
      const etiqueta = leerEtiqueta(codigo, d.config.balanza);
      if (etiqueta) {
        const delPlu = productoDelPlu(d, etiqueta.plu);
        if (!delPlu) {
          return noEncontrado(
            `Etiqueta de balanza con el producto ${etiqueta.plu}, que no está cargado. Poné ${etiqueta.plu} como código interno del producto.`
          );
        }
        return {
          ...vista(d, delPlu, esDueno(usuario)),
          balanza: cantidadDeEtiqueta(delPlu, etiqueta, d.config.balanza),
        };
      }

      return noEncontrado("Ningún producto tiene ese código.");
    })
  );

  // Lo que no está cargado se busca en la base mundial, para darlo de alta
  // desde la caja sin tipear el nombre.
  r.get("/productos/mundial/:codigo", async ({ params }) => {
    const codigo = params.codigo!.trim();
    const encontrado = await buscarCodigoMundial(codigo);
    return encontrado
      ? { encontrado: true, nombre: nombreSugerido(encontrado), fuente: encontrado.fuente }
      : { encontrado: false, nombre: null, fuente: null };
  });

  // El alta desde la caja: un producto escaneado que no estaba cargado. La
  // puede hacer cualquiera que atienda —el cliente está esperando—, pero solo
  // con lo que hace falta para venderlo: nombre, código, precio y stock. El
  // costo lo pone únicamente el dueño; lo demás se completa en Productos.
  r.post("/productos/desde-caja", ({ cuerpo, usuario }) =>
    a.escribir((d) => {
      const codigo = String(cuerpo.codigoBarras ?? "").trim();
      if (!/^\d{8,14}$/.test(codigo)) throw new Regla("Ese código de barras no es válido.");

      const ahora = new Date().toISOString();
      const producto: Producto = {
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
        proveedorId: null,
        activo: true,
        creadoEn: ahora,
        actualizadoEn: ahora,
      };

      aplicarFormulario(d, producto, {
        nombre: cuerpo.nombre,
        codigoBarras: codigo,
        precioVenta: cuerpo.precioVenta,
        precioCosto: esDueno(usuario) ? cuerpo.precioCosto : 0,
      });
      if (producto.precioVenta <= 0) throw new Regla("Escribí el precio de venta.");
      d.productos.push(producto);

      // Al menos uno: es el que se está vendiendo en este momento.
      const inicial = Math.max(entero(cuerpo.stock, 1), 1);
      ajustarStock(d, producto.id, inicial, "Carga inicial desde la caja", "creacion", usuario);

      return vista(d, producto, esDueno(usuario));
    })
  );

  r.get("/productos/:id", ({ params, usuario }) =>
    a.leer((d) => {
      const producto = d.productos.find((p) => p.id === params.id);
      return producto ? vista(d, producto, esDueno(usuario)) : noEncontrado("Ese producto ya no existe.");
    })
  );

  r.get("/productos/:id/precios", ({ params }) =>
    a.leer((d) =>
      d.cambiosPrecio
        .filter((c) => c.productoId === params.id)
        .sort((x, y) => y.creadoEn.localeCompare(x.creadoEn))
        .slice(0, 60)
    ), "dueno");

  r.post("/productos", ({ cuerpo, usuario }) =>
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
        porPeso: false,
        precioCosto: null,
        precioVenta: 0,
        precioMayorista: null,
        cantidadMayoristaMin: null,
        stock: 0,
        stockMinimo: 0,
        proveedorId: null,
        activo: true,
        creadoEn: ahora,
        actualizadoEn: ahora,
      };

      aplicarFormulario(d, producto, cuerpo);
      d.productos.push(producto);

      const inicial = Math.max(entero(cuerpo.stock, 0), 0);
      if (inicial > 0) {
        ajustarStock(d, producto.id, inicial, "Carga inicial", "creacion", usuario);
      }

      return vista(d, producto);
    }), "dueno");

  r.put("/productos/:id", ({ params, cuerpo, usuario }) =>
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
        recortar(cuerpo.motivoPrecio as string, 200) ?? "Edición del producto",
        usuario
      );

      return vista(d, producto);
    }), "dueno");

  r.borrar("/productos/:id", ({ params }) =>
    a.escribir((d) => {
      const producto = d.productos.find((p) => p.id === params.id);
      if (!producto) throw new Regla("Ese producto ya no existe.");

      // Eliminar es reversible: el historial y las ventas viejas siguen
      // apuntando a este producto, y borrarlo de verdad los dejaría sin nombre.
      producto.activo = false;
      producto.actualizadoEn = new Date().toISOString();
      return { ok: true };
    }), "dueno");

  r.post("/productos/:id/restaurar", ({ params }) =>
    a.escribir((d) => {
      const producto = d.productos.find((p) => p.id === params.id);
      if (!producto) throw new Regla("Ese producto ya no existe.");
      producto.activo = true;
      producto.actualizadoEn = new Date().toISOString();
      return vista(d, producto);
    }), "dueno");

  r.post("/productos/:id/stock", ({ params, cuerpo, usuario }) =>
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
        cantidad > 0 ? "entrada" : "salida",
        usuario
      );
      return { stock };
    })
  );

  r.post("/productos/:id/codigo", ({ params, cuerpo, usuario }) =>
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
      return vista(d, producto, esDueno(usuario));
    })
  );

  // ────────────────────  Acciones sobre muchos  ────────────────────

  r.post("/productos/precios/previsualizar", ({ cuerpo }) =>
    a.leer((d) => previsualizar(d, cuerpo)), "dueno");

  r.post("/productos/precios/aplicar", ({ cuerpo, usuario }) =>
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

        registrarPrecio(d, producto, precioAnterior, costoAnterior, motivo, usuario);
      }

      return { cambiados: previa.length };
    }), "dueno");

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
        if ("proveedorId" in cuerpo) producto.proveedorId = proveedorValido(d, cuerpo.proveedorId);
        if (typeof cuerpo.activo === "boolean") producto.activo = cuerpo.activo;
        producto.actualizadoEn = new Date().toISOString();
        cambiados++;
      }

      return { cambiados };
    }), "dueno");

  r.post("/productos/costos", ({ cuerpo, usuario }) =>
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
        registrarPrecio(d, producto, precioAnterior, costoAnterior, "Carga de costos", usuario);
        guardados++;
      }

      return { guardados };
    }), "dueno");

  r.post("/productos/skus/proponer", ({ cuerpo }) =>
    a.leer((d) => {
      const ids = Array.isArray(cuerpo.ids) ? (cuerpo.ids as string[]) : [];
      const usados = new Set(
        d.productos.filter((p) => p.sku).map((p) => p.sku!.toLowerCase())
      );

      // `soloSinCodigo` es para las etiquetas: un producto que ya trae el
      // código de fábrica se imprime con ese, y darle además uno interno
      // dejaría dos códigos para la misma cosa.
      const soloSinCodigo = cuerpo.soloSinCodigo === true;

      const candidatos = (
        ids.length > 0
          ? d.productos.filter((p) => ids.includes(p.id))
          : d.productos.filter((p) => p.activo && !p.sku && !(soloSinCodigo && p.codigoBarras))
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
    }), "dueno");

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
    }), "dueno");
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
export function vista(d: BaseDatos, p: Producto, verCostos = true) {
  const categoria = p.categoriaId ? d.categorias.find((c) => c.id === p.categoriaId) : undefined;

  // Lo que costó la mercadería y cuánto se gana con ella es del negocio, no de
  // quien atiende. Se corta ACÁ, que es el único lugar donde un producto se
  // convierte en JSON: filtrarlo en cada pantalla dejaría el dato viajando por
  // la red igual, y basta con mirar la respuesta del navegador para leerlo.
  const costo = verCostos ? p.precioCosto : null;

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
    porPeso: p.porPeso,
    precioCosto: costo,
    precioVenta: p.precioVenta,
    precioMayorista: verCostos ? p.precioMayorista : null,
    cantidadMayoristaMin: p.cantidadMayoristaMin,
    stock: p.stock,
    stockMinimo: p.stockMinimo,
    // A quién se le compra es del negocio, como el costo.
    proveedorId: verCostos ? p.proveedorId : null,
    proveedor: verCostos && p.proveedorId ? (d.proveedores.find((x) => x.id === p.proveedorId)?.nombre ?? null) : null,
    activo: p.activo,
    margen: verCostos ? margenSobreVenta(p.precioVenta, p.precioCosto) : null,
    margenCosto: verCostos ? margenSobreCosto(p.precioVenta, p.precioCosto) : null,
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

  // Se vende por peso: el precio pasa a ser por kilo y el stock a contarse en
  // gramos. Cambiar esto en un producto que ya tiene ventas no las toca —cada
  // renglón guardó su propia marca— pero sí cambia lo que significa su stock,
  // así que es una decisión para tomar al cargarlo, no después.
  //
  // Por eso no se deja cambiar con stock cargado: 10 unidades pasarían a ser
  // 10 gramos sin que nadie lo decida. La importación puede hacerlo si en la
  // misma fila trae el stock nuevo (`stockParaMarca`), que se escribe después.
  const porPeso = cuerpo.porPeso === true;
  if (
    porPeso !== producto.porPeso &&
    producto.stock !== 0 &&
    (cuerpo.stockParaMarca === undefined || cuerpo.stockParaMarca === null)
  ) {
    throw new Regla(
      porPeso
        ? `Tiene ${producto.stock} unidades en stock. Para venderlo por peso, primero ajustá el stock a cero y después cargalo en gramos.`
        : `Tiene ${producto.stock} gramos en stock. Para venderlo por unidad, primero ajustá el stock a cero y después cargalo en unidades.`
    );
  }
  producto.porPeso = porPeso;

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

  // Solo si viene: la importación y el alta desde la caja no lo mandan, y no
  // tienen por qué borrar el proveedor que ya tenía.
  if ("proveedorId" in cuerpo) producto.proveedorId = proveedorValido(d, cuerpo.proveedorId);

  producto.actualizadoEn = new Date().toISOString();
}

/** Un proveedor que existe, o null. Vacío es "sin proveedor". */
function proveedorValido(d: BaseDatos, valor: unknown): string | null {
  const id = recortar(valor as string, 64);
  if (!id) return null;
  if (!d.proveedores.some((p) => p.id === id)) throw new Regla("Ese proveedor ya no existe.");
  return id;
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

  const redondeo = [1, 10, 50, 100, 500, 1000].includes(Number(cuerpo.redondeo)) ? Number(cuerpo.redondeo) : 1;
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

