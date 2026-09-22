import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import type { Ruteador } from "../http.ts";
import {
  cajaAbierta,
  CATEGORIAS_GASTO,
  categoriaGastoValida,
  contiene,
  cuentaEnResultado,
  entero,
  etiquetaGasto,
  exigirFecha,
  normalizar,
  recortar,
  recortarObligatorio,
} from "../reglas.ts";
import { MEDIOS_PAGO, type BaseDatos, type Gasto } from "../tipos.ts";
import { diaLocal } from "./panel.ts";

/**
 * Lo que sale: proveedores, alquiler, fletes, servicios.
 *
 * Un gasto pagado con la plata del cajón deja además su retiro en la caja. Si
 * el gasto se guardara y el retiro fallara, el cierre marcaría un faltante que
 * nadie podría explicar — y la diferencia del arqueo es el único número por el
 * que vale la pena abrir un turno. Acá son la misma operación: se guardan las
 * dos cosas o ninguna.
 */
export function rutasGastos(r: Ruteador, a: Almacen): void {
  r.get("/gastos", ({ consulta }) =>
    a.leer((d) => {
      let gastos = [...d.gastos];

      const dias = entero(consulta.get("dias"), 0);
      if (dias > 0) {
        const desde = new Date();
        desde.setDate(desde.getDate() - dias);
        const limite = diaLocal(desde);
        gastos = gastos.filter((g) => g.fecha >= limite);
      }

      const categoria = consulta.get("categoria");
      if (categoria && categoria !== "todas") gastos = gastos.filter((g) => g.categoria === categoria);

      const q = consulta.get("q");
      if (q) {
        const termino = normalizar(q);
        gastos = gastos.filter(
          (g) =>
            contiene(g.concepto, termino) ||
            contiene(g.proveedor, termino) ||
            contiene(g.comprobante, termino) ||
            contiene(g.notas, termino)
        );
      }

      gastos.sort((x, y) => y.fecha.localeCompare(x.fecha) || y.creadoEn.localeCompare(x.creadoEn));

      let total = 0;
      let operativos = 0;
      let mercaderia = 0;
      const porCategoria = new Map<string, { total: number; cantidad: number }>();

      for (const g of gastos) {
        total += g.monto;
        if (cuentaEnResultado(g.categoria)) operativos += g.monto;
        else mercaderia += g.monto;

        const actual = porCategoria.get(g.categoria) ?? { total: 0, cantidad: 0 };
        porCategoria.set(g.categoria, {
          total: actual.total + g.monto,
          cantidad: actual.cantidad + 1,
        });
      }

      const caja = cajaAbierta(d);

      return {
        items: gastos.slice(0, 400).map((g) => vista(d, g)),
        resumen: {
          total,
          // Lo operativo deja afuera la compra de mercadería a propósito: esos
          // pesos no se perdieron, se cambiaron por stock, y se vuelven costo
          // recién cuando ese stock se vende.
          operativos,
          mercaderia,
          cantidad: gastos.length,
          porCategoria: [...porCategoria.entries()]
            .map(([categoria, v]) => ({ categoria, total: v.total, cantidad: v.cantidad }))
            .sort((x, y) => y.total - x.total),
        },
        categorias: CATEGORIAS_GASTO,
        cajaAbierta: caja ? { id: caja.id, numero: caja.numero } : null,
      };
    }), "dueno");

  r.post("/gastos", ({ cuerpo }) =>
    a.escribir((d) => {
      const gasto: Gasto = {
        id: nuevoId(),
        fecha: "",
        categoria: "otro",
        concepto: "",
        monto: 0,
        metodoPago: "efectivo",
        proveedor: null,
      proveedorId: null,
        comprobante: null,
        notas: null,
        cajaId: null,
        movimientoCajaId: null,
        creadoEn: new Date().toISOString(),
      };

      aplicar(d, gasto, cuerpo, true);
      d.gastos.push(gasto);
      return vista(d, gasto);
    }), "dueno");

  r.put("/gastos/:id", ({ params, cuerpo }) =>
    a.escribir((d) => {
      const gasto = d.gastos.find((g) => g.id === params.id);
      if (!gasto) throw new Regla("Ese gasto ya no existe.");

      exigirCajaEditable(d, gasto);
      aplicar(d, gasto, cuerpo, false);
      return vista(d, gasto);
    }), "dueno");

  r.borrar("/gastos/:id", ({ params }) =>
    a.escribir((d) => {
      const indice = d.gastos.findIndex((g) => g.id === params.id);
      if (indice < 0) throw new Regla("Ese gasto ya no existe.");
      const gasto = d.gastos[indice]!;

      exigirCajaEditable(d, gasto);

      // El retiro se va con el gasto: son la misma plata anotada en dos
      // lugares, y dejarlo suelto haría que el cierre descuente algo que ya no
      // existe.
      quitarRetiro(d, gasto);
      d.gastos.splice(indice, 1);
      return { ok: true };
    }), "dueno");
}

// ──────────────────────────────  Ayudas  ──────────────────────────────

/**
 * Un gasto que salió de una caja YA CERRADA no se toca: su arqueo se hizo con
 * ese importe y alguien lo dio por bueno. Cambiarlo ahora reescribiría un
 * cierre pasado sin dejar rastro.
 */
function exigirCajaEditable(d: BaseDatos, gasto: Gasto): void {
  if (!gasto.movimientoCajaId || !gasto.cajaId) return;

  const caja = d.cajas.find((c) => c.id === gasto.cajaId);
  if (!caja || caja.estado !== "abierta") {
    throw new Regla(
      "Este gasto salió de una caja que ya se cerró y su arqueo lo contó. Anotá el ajuste como un gasto nuevo en vez de cambiar este."
    );
  }
}

function quitarRetiro(d: BaseDatos, gasto: Gasto): void {
  if (!gasto.movimientoCajaId) return;

  const caja = d.cajas.find((c) => c.id === gasto.cajaId);
  const indice = caja?.movimientos.findIndex((m) => m.id === gasto.movimientoCajaId) ?? -1;
  if (caja && indice >= 0) caja.movimientos.splice(indice, 1);

  gasto.movimientoCajaId = null;
  gasto.cajaId = null;
}

function aplicar(d: BaseDatos, gasto: Gasto, cuerpo: Record<string, unknown>, esNuevo: boolean): void {
  const monto = entero(cuerpo.monto, 0);
  if (monto <= 0) throw new Regla("El monto del gasto tiene que ser mayor a cero.");
  if (monto > 999_999_999) throw new Regla("Ese monto es demasiado grande.");

  const categoria = String(cuerpo.categoria ?? "");
  if (!categoriaGastoValida(categoria)) throw new Regla("Elegí una categoría.");

  gasto.fecha = exigirFecha(cuerpo.fecha as string);
  gasto.categoria = categoria;
  gasto.concepto = recortarObligatorio(cuerpo.concepto as string, 200, "Escribí qué se pagó.");
  gasto.monto = monto;
  gasto.metodoPago = (MEDIOS_PAGO as readonly string[]).includes(String(cuerpo.metodoPago))
    ? String(cuerpo.metodoPago)
    : "efectivo";
  gasto.proveedor = recortar(cuerpo.proveedor as string, 160);
  gasto.comprobante = recortar(cuerpo.comprobante as string, 60);
  gasto.notas = recortar(cuerpo.notas as string, 600);

  const nuevaCaja = recortar(cuerpo.cajaId as string, 64);

  if (!esNuevo) quitarRetiro(d, gasto);

  if (nuevaCaja) {
    const caja = d.cajas.find((c) => c.id === nuevaCaja);
    if (!caja) throw new Regla("Esa caja no existe.");
    if (caja.estado !== "abierta") {
      throw new Regla("La caja no está abierta, así que el gasto no puede salir de ella.");
    }

    const movimiento = {
      id: nuevoId(),
      tipo: "retiro" as const,
      monto: gasto.monto,
      motivo: `Gasto: ${gasto.concepto}`,
      creadoEn: new Date().toISOString(),
    };
    caja.movimientos.push(movimiento);

    gasto.cajaId = caja.id;
    gasto.movimientoCajaId = movimiento.id;
  }
}

export function vista(d: BaseDatos, g: Gasto) {
  const caja = g.cajaId ? d.cajas.find((c) => c.id === g.cajaId) : undefined;

  return {
    id: g.id,
    fecha: g.fecha,
    categoria: g.categoria,
    etiqueta: etiquetaGasto(g.categoria),
    concepto: g.concepto,
    monto: g.monto,
    metodoPago: g.metodoPago,
    proveedor: g.proveedor,
    // Cuando el gasto es un pago a una cuenta corriente, esto lo dice. Sin
    // esto la pantalla no puede distinguir "pagué al molino" de "pagué la luz".
    proveedorId: g.proveedorId,
    comprobante: g.comprobante,
    notas: g.notas,
    cajaId: g.cajaId,
    cajaNumero: caja?.numero ?? null,
    cajaAbierta: caja?.estado === "abierta",
    enResultado: cuentaEnResultado(g.categoria),
    creadoEn: g.creadoEn,
  };
}
