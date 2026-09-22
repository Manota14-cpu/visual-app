import type { Almacen } from "../almacen.ts";
import type { Ruteador } from "../http.ts";
import {
  adeudadoDe,
  cuentaEnResultado,
  deudaTotal,
  entero,
  contarRenglones,
  etiquetaGasto,
  importeRenglon,
  margenSobreCosto,
  margenSobreVenta,
} from "../reglas.ts";
import { diaLocal } from "./panel.ts";

/**
 * Los números del negocio, no los del inventario.
 *
 * El panel dice cómo está el stock hoy. Esto dice qué pasó: qué se vendió, qué
 * dejó margen, qué lleva meses ocupando lugar sin moverse y cuánto costó tener
 * abierto.
 */
export function rutasInformes(r: Ruteador, a: Almacen): void {
  r.get("/informes", ({ consulta }) =>
    a.leer((d) => {
      // 0 significa "desde el principio".
      const pedido = entero(consulta.get("dias"), 30);
      const periodo = [7, 30, 90, 0].includes(pedido) ? pedido : 30;

      // Un solo corte para todo el informe: el dia del calendario local.
      //
      // Antes las ventas se filtraban por un instante exacto —N x 24 h atras,
      // en UTC— y los gastos por el dia local. Eran dos ventanas distintas para
      // el mismo periodo: el informe incluia gastos de un dia cuyas ventas no
      // incluia, y como el Resultado es vendido menos costo menos gastos, el
      // sesgo iba siempre para el mismo lado. Ademas el corte de ventas corria
      // con el reloj, asi que el informe de "30 dias" cambiaba hora a hora.
      const desdeFecha = (() => {
        if (periodo === 0) return "";
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - periodo);
        return diaLocal(fecha);
      })();

      const enPeriodo = (iso: string) => desdeFecha === "" || diaLocal(new Date(iso)) >= desdeFecha;

      const ventas = d.pedidos.filter((p) => p.estado !== "cancelado" && enPeriodo(p.creadoEn));
      const renglones = ventas.flatMap((p) => p.items);

      // El costo sale del renglon, que lo guardo el dia de la venta. Para los
      // renglones viejos —los de antes de que eso existiera— se vuelve a
      // estimar con el costo actual, que es lo unico que se puede saber.
      const costoDe = (item: { productoId: string | null; costo?: number | null }) =>
        item.costo ?? d.productos.find((p) => p.id === item.productoId)?.precioCosto ?? 0;

      // Los renglones a precio de lista, y lo que se regaló en descuentos.
      // El ingreso de verdad es la resta: sumar los renglones a secas haría
      // que el informe cobrara de más y que el margen saliera mejor de lo que
      // fue, justamente en el negocio que más descuentos hace.
      const aPrecioDeLista = renglones.reduce(
        (s, i) => s + importeRenglon(i.precio, i.cantidad, i.porPeso),
        0
      );
      const descuentos = ventas.reduce((s, p) => s + (p.descuento ?? 0), 0);
      const ingreso = aPrecioDeLista - descuentos;
      const costo = renglones.reduce(
        (s, i) => s + importeRenglon(costoDe(i), i.cantidad, i.porPeso),
        0
      );

      // 1 - Cuantas unidades se vendieron sin ningun costo con que compararlas.
      //
      // Un producto sin costo cargado entra al informe como ganancia pura: el
      // margen sube y el Resultado miente, sin que nada avise. El aviso de
      // "costo dudoso" que ya existia no lo agarraba, porque filtra los que
      // tienen costo mayor a cero — justamente al reves del caso mas comun,
      // que es no haberlo cargado nunca.
      const unidadesSinCosto = renglones
        .filter((i) => i.cantidad > 0 && costoDe(i) <= 0)
        .reduce((s, i) => s + i.cantidad, 0);

      const ingresoSinCosto = renglones
        .filter((i) => i.cantidad > 0 && costoDe(i) <= 0)
        .reduce((s, i) => s + importeRenglon(i.precio, i.cantidad, i.porPeso), 0);

      // El costo se acumula renglon por renglon, con el que cada uno guardo el
      // dia de su venta. Multiplicar el costo de hoy por el total de unidades
      // seria promediar meses distintos a un solo precio.
      const porProducto = new Map<
        string,
        { nombre: string; unidades: number; porPeso: boolean; ingreso: number; costo: number }
      >();
      for (const item of renglones) {
        const clave = item.productoId ?? item.nombre;
        const actual = porProducto.get(clave) ?? {
          nombre: d.productos.find((p) => p.id === item.productoId)?.nombre ?? item.nombre,
          unidades: 0,
          // Lo dice el renglón, que lo copió el día de la venta. Sin esto la
          // pantalla mostraba "5.050 unidades" de pan francés: eran gramos.
          porPeso: item.porPeso ?? false,
          ingreso: 0,
          costo: 0,
        };

        actual.unidades += item.cantidad;
        actual.ingreso += importeRenglon(item.precio, item.cantidad, item.porPeso);
        actual.costo += importeRenglon(costoDe(item), item.cantidad, item.porPeso);
        porProducto.set(clave, actual);
      }

      const productos = [...porProducto.entries()]
        .map(([clave, v]) => {
          const producto = d.productos.find((p) => p.id === clave);
          const costoProducto = v.costo;

          return {
            productoId: producto?.id ?? null,
            nombre: v.nombre,
            unidades: v.unidades,
            porPeso: v.porPeso,
            ingreso: v.ingreso,
            costo: costoProducto,
            // Por la funcion compartida y no a mano: el mismo calculo
            // escrito dos veces en dos archivos es el mismo calculo hasta que
            // alguien corrige uno solo.
            margen: margenSobreVenta(v.ingreso, costoProducto),
            margenCosto: margenSobreCosto(v.ingreso, costoProducto),
          };
        })
        .sort((x, y) => y.ingreso - x.ingreso)
        .slice(0, 50);

      // Capital dormido: lo que está en la estantería sin moverse. La carga
      // inicial no cuenta como movimiento; si contara, todo el catálogo
      // parecería recién tocado el día que se cargó.
      const vendidos = new Set(
        renglones.filter((i) => i.productoId).map((i) => i.productoId as string)
      );

      const inmovilizado = d.productos
        .filter((p) => p.activo && p.stock > 0 && !vendidos.has(p.id))
        .map((p) => {
          const ultimo = d.movimientos
            .filter((m) => m.productoId === p.id && m.tipo !== "creacion")
            .sort((x, y) => y.creadoEn.localeCompare(x.creadoEn))[0];

          return {
            id: p.id,
            nombre: p.nombre,
            categoria: d.categorias.find((c) => c.id === p.categoriaId)?.nombre ?? null,
            stock: p.stock,
            unidadMedida: p.unidadMedida,
            porPeso: p.porPeso,
            capital: importeRenglon(p.precioCosto ?? 0, p.stock, p.porPeso),
            diasQuieto: ultimo
              ? Math.floor((Date.now() - new Date(ultimo.creadoEn).getTime()) / 86_400_000)
              : null,
          };
        })
        .sort((x, y) => y.capital - x.capital)
        .slice(0, 25);

      const gastos = d.gastos.filter((g) => g.fecha >= desdeFecha);

      let gastadoTotal = 0;
      let gastadoOperativo = 0;
      let gastadoMercaderia = 0;
      const gastosPorCategoria = new Map<string, { total: number; cantidad: number }>();

      for (const g of gastos) {
        gastadoTotal += g.monto;
        if (cuentaEnResultado(g.categoria)) gastadoOperativo += g.monto;
        else gastadoMercaderia += g.monto;

        const actual = gastosPorCategoria.get(g.categoria) ?? { total: 0, cantidad: 0 };
        gastosPorCategoria.set(g.categoria, {
          total: actual.total + g.monto,
          cantidad: actual.cantidad + 1,
        });
      }

      const movimientos = new Map<string, number>();
      for (const m of d.movimientos) {
        if (!enPeriodo(m.creadoEn) || m.tipo === "creacion") continue;
        movimientos.set(m.tipo, (movimientos.get(m.tipo) ?? 0) + m.cantidad);
      }

      const canales = new Map<string, { pedidos: number; ingreso: number }>();
      for (const p of ventas) {
        const actual = canales.get(p.canal) ?? { pedidos: 0, ingreso: 0 };
        canales.set(p.canal, { pedidos: actual.pedidos + 1, ingreso: actual.ingreso + p.total });
      }

      return {
        dias: periodo,

        ventas: {
          pedidos: ventas.length,
          unidades: contarRenglones(renglones).unidades,
          gramos: contarRenglones(renglones).gramos,
          ingreso,
          /** A precio de lista, antes de descuentos. */
          aPrecioDeLista,
          descuentos,
          costo,
          margen: margenSobreVenta(ingreso, costo),
          margenCosto: margenSobreCosto(ingreso, costo),
          ticketPromedio: ventas.length > 0 ? Math.round(ingreso / ventas.length) : 0,
        },

        // Lo que el informe no puede medir, dicho en vez de escondido.
        sinCosto: { unidades: unidadesSinCosto, ingreso: ingresoSinCosto },

        // Vendido no es cobrado. Lo fiado ya esta contado arriba como venta
        // —la mercaderia salio— pero esa plata todavia no entro.
        fiado: {
          enElPeriodo: ventas.reduce((s, p) => s + (p.clienteId ? adeudadoDe(p) : 0), 0),
          total: deudaTotal(d),
        },

        porProducto: productos,
        inmovilizado,
        capitalQuieto: inmovilizado.reduce((s, p) => s + p.capital, 0),

        movimientos: [...movimientos.entries()]
          .map(([tipo, cantidad]) => ({ tipo, cantidad }))
          .sort((x, y) => y.cantidad - x.cantidad),

        // Desde que existe la caja hay dos formas de vender; sin separarlas no
        // se puede saber cuál sostiene el negocio.
        // Quién vendió qué. Cada venta guarda quién la hizo; esto es lo que
        // hace que tener usuarios sirva para algo más que cerrar puertas: el
        // dueño ve cuánto cobró cada uno, cuánto descontó y cuánto devolvió.
        porUsuario: porUsuario(ventas),

        porCanal: [...canales.entries()]
          .map(([canal, v]) => ({ canal, pedidos: v.pedidos, ingreso: v.ingreso }))
          .sort((x, y) => y.ingreso - x.ingreso),

        // Un costo que deja más del 85% de margen no es un costo: es un
        // relleno. El informe lo dice en vez de presentar el porcentaje como si
        // fuera un hallazgo.
        ventasConCostoDudoso: new Set(
          renglones
            .map((i) => d.productos.find((p) => p.id === i.productoId))
            .filter(
              (p) =>
                p && p.precioVenta > 0 && (p.precioCosto ?? 0) > 0 && p.precioCosto! < p.precioVenta * 0.15
            )
            .map((p) => p!.id)
        ).size,

        gastos: {
          total: gastadoTotal,
          operativos: gastadoOperativo,
          mercaderia: gastadoMercaderia,
          cantidad: gastos.length,
          porCategoria: [...gastosPorCategoria.entries()]
            .map(([categoria, v]) => ({
              categoria,
              etiqueta: etiquetaGasto(categoria),
              total: v.total,
              cantidad: v.cantidad,
            }))
            .sort((x, y) => y.total - x.total),
        },

        // Lo vendido, menos lo que costó, menos lo que costó tener abierto.
        // Nulo sin ventas: un resultado negativo puro de gastos no es
        // información, es un período sin actividad.
        resultado: ventas.length > 0 ? ingreso - costo - gastadoOperativo : null,
      };
    }), "dueno");
}

/**
 * Las ventas del período agrupadas por quien las hizo.
 *
 * Las devoluciones van aparte y en positivo: sumarlas como ventas negativas
 * escondería que alguien devuelve mucho detrás de que vende mucho.
 */
function porUsuario(
  ventas: { usuario: string | null; total: number; descuento?: number; canal: string }[]
) {
  const grupos = new Map<
    string,
    { usuario: string; ventas: number; vendido: number; descuentos: number; devoluciones: number; devuelto: number }
  >();

  for (const v of ventas) {
    // Lo anterior a los usuarios no tiene autor, y se dice así en vez de
    // repartirlo entre alguien.
    const quien = v.usuario ?? "Sin identificar";
    const g = grupos.get(quien) ?? {
      usuario: quien,
      ventas: 0,
      vendido: 0,
      descuentos: 0,
      devoluciones: 0,
      devuelto: 0,
    };

    if (v.canal === "devolucion" || v.total < 0) {
      g.devoluciones++;
      g.devuelto += Math.abs(v.total);
    } else {
      g.ventas++;
      g.vendido += v.total;
      g.descuentos += v.descuento ?? 0;
    }
    grupos.set(quien, g);
  }

  return [...grupos.values()].sort((x, y) => y.vendido - x.vendido);
}
