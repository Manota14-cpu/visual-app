import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import type { Ruteador } from "../http.ts";
import { ajustarStock, entero, importeRenglon, recortar } from "../reglas.ts";
import { selloDe } from "../usuarios.ts";
import type { LineaRecuento, Recuento } from "../tipos.ts";

/**
 * Contar la góndola y conciliar.
 *
 * Todo negocio cuenta el depósito cada tanto. Hasta ahora la única forma de
 * arreglar las diferencias era entrar a cada producto y ajustarlo a mano,
 * escribiendo un motivo en cada uno: con veinte diferencias eso no lo hace
 * nadie, y el stock del sistema se va quedando cada vez más lejos del de la
 * estantería hasta que deja de servir para nada.
 *
 * Se cuenta todo de una y se aplica de una. Los renglones que coinciden no
 * generan movimiento —no pasó nada— pero sí quedan guardados en el recuento:
 * sin ellos no se sabe si se contó el depósito entero o solo lo que fallaba.
 */
export function rutasRecuento(r: Ruteador, a: Almacen): void {
  /**
   * La planilla para contar: todo lo que hay que mirar, sin paginar.
   *
   * Sin paginar a propósito. Un recuento se hace con la planilla en la mano
   * recorriendo la estantería; de a treinta por página, se pierde la cuenta.
   */
  r.get(
    "/recuento/planilla",
    ({ consulta }) =>
      a.leer((d) => {
        const categoriaId = consulta.get("categoria");

        const productos = d.productos
          .filter((p) => p.activo && (!categoriaId || p.categoriaId === categoriaId))
          .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));

        return {
          categoria: categoriaId
            ? (d.categorias.find((c) => c.id === categoriaId)?.nombre ?? null)
            : null,
          productos: productos.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            sku: p.sku,
            codigoBarras: p.codigoBarras,
            precio: p.precioVenta,
            categoria: p.categoriaId
              ? (d.categorias.find((c) => c.id === p.categoriaId)?.nombre ?? null)
              : null,
            unidadMedida: p.unidadMedida,
            porPeso: p.porPeso,
            esperado: p.stock,
          })),
        };
      }),
    "dueno"
  );

  /** Los recuentos que ya se hicieron, del más nuevo al más viejo. */
  r.get(
    "/recuento",
    () =>
      a.leer((d) =>
        [...d.recuentos]
          .sort((x, y) => y.creadoEn.localeCompare(x.creadoEn))
          .slice(0, 60)
          .map((rec) => resumen(rec))
      ),
    "dueno"
  );

  r.get(
    "/recuento/:id",
    ({ params }) =>
      a.leer((d) => {
        const rec = d.recuentos.find((x) => x.id === params.id);
        if (!rec) throw new Regla("Ese recuento no existe.");
        return { ...rec, ...resumen(rec) };
      }),
    "dueno"
  );

  /**
   * Aplica el recuento: ajusta lo que no coincide y guarda lo que se contó.
   *
   * El ajuste pasa por `ajustarStock` como cualquier otro, así que cada
   * diferencia deja su movimiento con motivo y queda en el historial. No hay
   * una puerta de atrás para tocar el stock.
   */
  r.post(
    "/recuento",
    ({ cuerpo, usuario }) =>
      a.escribir((d) => {
        const entradas = (cuerpo.lineas ?? []) as { productoId: string; contado: unknown }[];
        if (!Array.isArray(entradas) || entradas.length === 0) {
          throw new Regla("No contaste ningún producto.");
        }
        if (entradas.length > 5000) throw new Regla("El recuento es demasiado grande.");

        const categoriaId = recortar(cuerpo.categoriaId as string, 40);
        const categoria = categoriaId
          ? (d.categorias.find((c) => c.id === categoriaId)?.nombre ?? null)
          : null;

        const fecha = fechaDeHoy();
        const lineas: LineaRecuento[] = [];

        for (const entrada of entradas) {
          const producto = d.productos.find((p) => p.id === entrada.productoId);
          if (!producto) continue;

          const contado = entero(entrada.contado, 0);
          if (contado < 0) throw new Regla(`No se puede contar en negativo: "${producto.nombre}".`);
          if (contado > 100_000_000) {
            throw new Regla(`La cantidad contada de "${producto.nombre}" es demasiado grande.`);
          }

          lineas.push({
            productoId: producto.id,
            nombre: producto.nombre,
            porPeso: producto.porPeso,
            esperado: producto.stock,
            contado,
            costo: producto.precioCosto,
          });
        }

        if (lineas.length === 0) throw new Regla("Ninguno de esos productos existe.");

        const rec: Recuento = {
          id: nuevoId(),
          fecha,
          categoriaId: categoriaId ?? null,
          categoria,
          lineas,
          notas: recortar(cuerpo.notas as string, 300),
          ...selloDe(usuario),
          creadoEn: new Date().toISOString(),
        };

        // Recién ahora se toca el stock. Si alguna línea fuera inválida, el
        // `escribir` del almacén revierte todo y no queda nada a medias.
        for (const linea of lineas) {
          const diferencia = linea.contado - linea.esperado;
          if (diferencia === 0) continue;

          ajustarStock(
            d,
            linea.productoId,
            diferencia,
            `Recuento del ${fecha}`,
            "ajuste",
            usuario
          );
        }

        d.recuentos.push(rec);
        return { ...rec, ...resumen(rec) };
      }),
    "dueno"
  );
}

/**
 * Los números que resumen un recuento.
 *
 * `valorFaltante` es lo que importa de verdad. "Faltaron 14 unidades" no dice
 * si son catorce caramelos o catorce tortas, y esa es la diferencia entre un
 * error de conteo y algo que hay que mirar.
 */
function resumen(rec: Recuento) {
  let sobrantes = 0;
  let faltantes = 0;
  let coinciden = 0;
  let valorFaltante = 0;
  let valorSobrante = 0;

  for (const l of rec.lineas) {
    const diferencia = l.contado - l.esperado;
    if (diferencia === 0) {
      coinciden++;
      continue;
    }

    // Por peso, la diferencia viene en gramos y el costo es por kilo: es la
    // misma regla que cobrar medio kilo de pan.
    const valor = importeRenglon(l.costo ?? 0, Math.abs(diferencia), l.porPeso);

    if (diferencia > 0) {
      sobrantes++;
      valorSobrante += valor;
    } else {
      faltantes++;
      valorFaltante += valor;
    }
  }

  return {
    id: rec.id,
    fecha: rec.fecha,
    categoria: rec.categoria,
    usuario: rec.usuario,
    contados: rec.lineas.length,
    coinciden,
    faltantes,
    sobrantes,
    valorFaltante,
    valorSobrante,
    creadoEn: rec.creadoEn,
  };
}

function fechaDeHoy(): string {
  const hoy = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
}
