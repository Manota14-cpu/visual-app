import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import { noEncontrado, type Ruteador } from "../http.ts";
import {
  comoPlata,
  contiene,
  deudaProveedor,
  deudaProveedores,
  monto,
  normalizar,
  recortar,
  recortarObligatorio,
} from "../reglas.ts";
import { selloDe } from "../usuarios.ts";
import type { BaseDatos, Compra, Gasto, Proveedor } from "../tipos.ts";
import { paginar } from "./catalogo.ts";

/**
 * A quién le compra el negocio, y cuánto le debe.
 *
 * Es el espejo exacto de clientes y fiado. La aplicación sabía con rigor lo que
 * le deben al negocio —deducido de las ventas menos los cobros, nunca un saldo
 * guardado— y no tenía nada para lo que el negocio debe: "proveedor" era un
 * campo de texto suelto adentro de un gasto.
 *
 * Dos piezas y nada más:
 *
 * - **Compra**: mercadería que entró y hay que pagar. Sube la deuda.
 * - **Gasto con proveedor**: plata que salió a esa cuenta. La baja.
 *
 * El pago no es una entidad nueva a propósito. Pagarle a un proveedor ya es un
 * gasto; anotarlo además como "pago" lo contaría dos veces en los informes.
 */
export function rutasProveedores(r: Ruteador, a: Almacen): void {
  // ─────────────────────────────  Proveedores  ─────────────────────────────

  r.get(
    "/proveedores",
    ({ consulta }) =>
      a.leer((d) => {
        const estado = consulta.get("estado") ?? "activos";
        let proveedores = d.proveedores.filter((p) =>
          estado === "eliminados" ? !p.activo : estado === "todos" ? true : p.activo
        );

        const q = consulta.get("q");
        if (q) {
          const termino = normalizar(q);
          proveedores = proveedores.filter(
            (p) =>
              contiene(p.nombre, termino) ||
              contiene(p.cuit, termino) ||
              contiene(p.telefono, termino) ||
              contiene(p.notas, termino)
          );
        }

        // Los que más se les debe, primero: es el orden en que a alguien le
        // importa mirarlos.
        const conDeuda = proveedores.map((p) => ({ p, deuda: deudaProveedor(d, p.id) }));
        conDeuda.sort(
          (x, y) => y.deuda - x.deuda || x.p.nombre.localeCompare(y.p.nombre, "es")
        );

        return {
          ...paginar(
            conDeuda.map((x) => x.p),
            consulta,
            30,
            (p) => vista(d, p)
          ),
          deudaTotal: deudaProveedores(d),
        };
      }),
    "dueno"
  );

  r.get(
    "/proveedores/:id",
    ({ params }) =>
      a.leer((d) => {
        const proveedor = d.proveedores.find((p) => p.id === params.id);
        return proveedor ? vista(d, proveedor) : noEncontrado("Ese proveedor ya no existe.");
      }),
    "dueno"
  );

  /**
   * El resumen de cuenta: qué se compró, qué se pagó y cuánto queda.
   *
   * Todo en una sola lista ordenada por fecha, no dos listas separadas. Una
   * cuenta corriente se lee de arriba abajo viendo cómo sube y cómo baja; con
   * las compras de un lado y los pagos del otro hay que ir cruzándolas a ojo.
   */
  r.get(
    "/proveedores/:id/cuenta",
    ({ params }) =>
      a.leer((d) => {
        const proveedor = d.proveedores.find((p) => p.id === params.id);
        if (!proveedor) return noEncontrado("Ese proveedor ya no existe.");

        const compras = d.compras
          .filter((c) => c.proveedorId === proveedor.id)
          .map((c) => ({
            tipo: "compra" as const,
            id: c.id,
            fecha: c.fecha,
            detalle: c.detalle,
            comprobante: c.comprobante,
            monto: c.total,
            usuario: c.usuario,
          }));

        const pagos = d.gastos
          .filter((g) => g.proveedorId === proveedor.id)
          .map((g) => ({
            tipo: "pago" as const,
            id: g.id,
            fecha: g.fecha,
            detalle: g.concepto,
            comprobante: g.comprobante,
            monto: g.monto,
            usuario: null,
          }));

        return {
          proveedor: vista(d, proveedor),
          // De la más nueva a la más vieja: lo de esta semana es lo que se
          // mira, lo del año pasado se busca.
          movimientos: [...compras, ...pagos].sort(
            (x, y) => y.fecha.localeCompare(x.fecha) || x.tipo.localeCompare(y.tipo)
          ),
          comprado: compras.reduce((s, c) => s + c.monto, 0),
          pagado: pagos.reduce((s, p) => s + p.monto, 0),
          deuda: deudaProveedor(d, proveedor.id),
        };
      }),
    "dueno"
  );

  r.post(
    "/proveedores",
    ({ cuerpo }) =>
      a.escribir((d) => {
        const proveedor: Proveedor = {
          id: nuevoId(),
          nombre: "",
          telefono: null,
          email: null,
          direccion: null,
          cuit: null,
          notas: null,
          activo: true,
          creadoEn: new Date().toISOString(),
        };

        aplicarFormulario(d, proveedor, cuerpo);
        d.proveedores.push(proveedor);
        return vista(d, proveedor);
      }),
    "dueno"
  );

  r.put(
    "/proveedores/:id",
    ({ params, cuerpo }) =>
      a.escribir((d) => {
        const proveedor = d.proveedores.find((p) => p.id === params.id);
        if (!proveedor) throw new Regla("Ese proveedor ya no existe.");

        aplicarFormulario(d, proveedor, cuerpo);
        return vista(d, proveedor);
      }),
    "dueno"
  );

  r.borrar(
    "/proveedores/:id",
    ({ params }) =>
      a.escribir((d) => {
        const proveedor = d.proveedores.find((p) => p.id === params.id);
        if (!proveedor) throw new Regla("Ese proveedor ya no existe.");

        // Con deuda abierta no se archiva: dejaría plata que el negocio debe
        // fuera de la vista, que es peor que el desorden de tenerlo en la lista.
        const deuda = deudaProveedor(d, proveedor.id);
        if (deuda > 0) {
          throw new Regla(
            `A ${proveedor.nombre} todavía le debés ${comoPlata(deuda)}. Saldá la cuenta antes de archivarlo.`
          );
        }

        proveedor.activo = false;
        return vista(d, proveedor);
      }),
    "dueno"
  );

  r.post(
    "/proveedores/:id/restaurar",
    ({ params }) =>
      a.escribir((d) => {
        const proveedor = d.proveedores.find((p) => p.id === params.id);
        if (!proveedor) throw new Regla("Ese proveedor ya no existe.");
        proveedor.activo = true;
        return vista(d, proveedor);
      }),
    "dueno"
  );

  // ───────────────────────────────  Compras  ───────────────────────────────

  r.post(
    "/compras",
    ({ cuerpo, usuario }) =>
      a.escribir((d) => {
        const proveedorId = String(cuerpo.proveedorId ?? "");
        const proveedor = d.proveedores.find((p) => p.id === proveedorId && p.activo);
        if (!proveedor) throw new Regla("Elegí un proveedor.");

        const compra: Compra = {
          id: nuevoId(),
          proveedorId: proveedor.id,
          fecha: fechaValida(cuerpo.fecha),
          comprobante: recortar(cuerpo.comprobante as string, 40),
          detalle: recortarObligatorio(
            cuerpo.detalle as string,
            120,
            "Escribí qué compraste."
          ),
          total: monto(cuerpo.total, "El total de la compra"),
          notas: recortar(cuerpo.notas as string, 300),
          ...selloDe(usuario),
          creadoEn: new Date().toISOString(),
        };

        if (compra.total === 0) throw new Regla("Poné cuánto salió la compra.");
        d.compras.push(compra);

        // Si además pagó algo en el momento, eso es un gasto a esa cuenta. Es
        // el mismo camino que una venta fiada con entrega: no hay dos formas
        // de registrar lo mismo.
        const entrega = monto(cuerpo.entrega, "La entrega");
        if (entrega > 0) {
          if (entrega > compra.total) {
            throw new Regla("La entrega no puede ser mayor que el total de la compra.");
          }
          d.gastos.push(gastoDePago(proveedor, entrega, cuerpo, compra));
        }

        return { compra, deuda: deudaProveedor(d, proveedor.id) };
      }),
    "dueno"
  );

  r.borrar(
    "/compras/:id",
    ({ params }) =>
      a.escribir((d) => {
        const i = d.compras.findIndex((c) => c.id === params.id);
        if (i < 0) throw new Regla("Esa compra ya no existe.");

        const [compra] = d.compras.splice(i, 1);
        return { ok: true, deuda: deudaProveedor(d, compra!.proveedorId) };
      }),
    "dueno"
  );

  /**
   * Pagarle a un proveedor.
   *
   * Crea un GASTO, no una entidad nueva. La plata que sale a pagar mercadería
   * es un gasto del negocio — anotarlo además como "pago de proveedor" lo
   * contaría dos veces en los informes, y el día que los dos números no
   * coincidan nadie va a saber cuál creer.
   */
  r.post(
    "/proveedores/:id/pagar",
    ({ params, cuerpo }) =>
      a.escribir((d) => {
        const proveedor = d.proveedores.find((p) => p.id === params.id);
        if (!proveedor) throw new Regla("Ese proveedor ya no existe.");

        const importe = monto(cuerpo.monto, "El pago");
        if (importe === 0) throw new Regla("Poné cuánto le pagaste.");
        const deuda = deudaProveedor(d, proveedor.id);
        if (importe > deuda) {
          throw new Regla(
            `Le debés ${comoPlata(deuda)} a ${proveedor.nombre}. No se puede pagar de más.`
          );
        }

        const gasto = gastoDePago(proveedor, importe, cuerpo, null);
        d.gastos.push(gasto);

        return { gasto, deuda: deudaProveedor(d, proveedor.id) };
      }),
    "dueno"
  );
}

// ─────────────────────────────  Auxiliares  ─────────────────────────────

/** El gasto que representa una salida de plata hacia un proveedor. */
function gastoDePago(
  proveedor: Proveedor,
  importe: number,
  cuerpo: Record<string, unknown>,
  compra: Compra | null
): Gasto {
  return {
    id: nuevoId(),
    fecha: fechaValida(cuerpo.fecha),
    categoria: "mercaderia",
    concepto: compra
      ? `Pago a ${proveedor.nombre} — ${compra.detalle}`
      : `Pago a ${proveedor.nombre}`,
    monto: importe,
    metodoPago: metodoValido(cuerpo.metodo),
    proveedor: proveedor.nombre,
    proveedorId: proveedor.id,
    comprobante: recortar(cuerpo.comprobante as string, 40),
    notas: recortar(cuerpo.notas as string, 300),
    // No sale del cajón de la caja salvo que alguien lo diga: pagarle al
    // proveedor con la plata del turno es una decisión, no lo normal.
    cajaId: null,
    movimientoCajaId: null,
    creadoEn: new Date().toISOString(),
  };
}

/** aaaa-mm-dd, o el día de hoy. Igual que en gastos. */
function fechaValida(valor: unknown): string {
  const texto = String(valor ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  const hoy = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
}

function metodoValido(valor: unknown): string {
  const texto = String(valor ?? "efectivo");
  return ["efectivo", "transferencia", "tarjeta", "otro"].includes(texto) ? texto : "efectivo";
}

function aplicarFormulario(
  d: BaseDatos,
  proveedor: Proveedor,
  cuerpo: Record<string, unknown>
): void {
  const nombre = recortarObligatorio(cuerpo.nombre as string, 80, "Poné el nombre del proveedor.");

  const repetido = d.proveedores.find(
    (p) => p.id !== proveedor.id && p.nombre.toLowerCase() === nombre.toLowerCase()
  );
  if (repetido) throw new Regla(`Ya hay un proveedor llamado "${nombre}".`);

  proveedor.nombre = nombre;
  proveedor.telefono = recortar(cuerpo.telefono as string, 40);
  proveedor.email = recortar(cuerpo.email as string, 120);
  proveedor.direccion = recortar(cuerpo.direccion as string, 160);
  proveedor.cuit = recortar(cuerpo.cuit as string, 20);
  proveedor.notas = recortar(cuerpo.notas as string, 300);
}

function vista(d: BaseDatos, p: Proveedor) {
  const compras = d.compras.filter((c) => c.proveedorId === p.id);

  return {
    id: p.id,
    nombre: p.nombre,
    telefono: p.telefono,
    email: p.email,
    direccion: p.direccion,
    cuit: p.cuit,
    notas: p.notas,
    activo: p.activo,
    deuda: deudaProveedor(d, p.id),
    compras: compras.length,
    // Hace cuánto que no se le compra: sirve para ver quién quedó en el
    // camino y quién es el proveedor de todas las semanas.
    ultimaCompra: compras.map((c) => c.fecha).sort().at(-1) ?? null,
    creadoEn: p.creadoEn,
  };
}
