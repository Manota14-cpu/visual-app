import { nuevoId, Regla, type Almacen } from "../almacen.ts";
import { noEncontrado, type Ruteador } from "../http.ts";
import { contiene, normalizar, recortar, recortarObligatorio, soloDigitos } from "../reglas.ts";
import type { BaseDatos, Cliente } from "../tipos.ts";
import { paginar } from "./catalogo.ts";

/**
 * La agenda de clientes, con lo que compró cada uno.
 *
 * Las compras no se guardan en el cliente: se cuentan desde los pedidos. Un
 * contador guardado se desincroniza el día que alguien cancela una venta, y
 * entonces la ficha dice una cosa y el historial otra.
 */
export function rutasClientes(r: Ruteador, a: Almacen): void {
  r.get("/clientes", ({ consulta }) =>
    a.leer((d) => {
      const estado = consulta.get("estado") ?? "activos";
      let clientes = d.clientes.filter((c) =>
        estado === "archivados" ? !c.activo : estado === "todos" ? true : c.activo
      );

      const q = consulta.get("q");
      if (q) {
        const termino = normalizar(q);
        const digitos = soloDigitos(q);
        clientes = clientes.filter(
          (c) =>
            contiene(c.nombre, termino) ||
            contiene(c.razonSocial, termino) ||
            contiene(c.ciudad, termino) ||
            contiene(c.email, termino) ||
            contiene(c.dniCuit, termino) ||
            (digitos.length >= 4 && soloDigitos(c.telefono).includes(digitos))
        );
      }

      clientes.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));

      return paginar(clientes, consulta, 30, (c) => vista(d, c));
    })
  );

  r.get("/clientes/buscar", ({ consulta }) =>
    a.leer((d) => {
      const q = consulta.get("q");
      const termino = normalizar(q);
      const digitos = soloDigitos(q);
      if (termino.length < 2 && digitos.length < 3) return [];

      return d.clientes
        .filter(
          (c) =>
            c.activo &&
            (contiene(c.nombre, termino) ||
              contiene(c.razonSocial, termino) ||
              (digitos.length >= 3 && soloDigitos(c.telefono).includes(digitos)))
        )
        .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))
        .slice(0, 8)
        .map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono, ciudad: c.ciudad }));
    })
  );

  r.get("/clientes/:id", ({ params }) =>
    a.leer((d) => {
      const cliente = d.clientes.find((c) => c.id === params.id);
      return cliente ? vista(d, cliente) : noEncontrado("Ese cliente ya no existe.");
    })
  );

  r.get("/clientes/:id/compras", ({ params }) =>
    a.leer((d) =>
      d.pedidos
        .filter((p) => p.clienteId === params.id)
        .sort((x, y) => y.numero - x.numero)
        .slice(0, 60)
        .map((p) => ({
          id: p.id,
          numero: p.numero,
          canal: p.canal,
          estado: p.estado,
          total: p.total,
          creadoEn: p.creadoEn,
          renglones: p.items.length,
        }))
    )
  );

  r.post("/clientes", ({ cuerpo }) =>
    a.escribir((d) => {
      const cliente: Cliente = {
        id: nuevoId(),
        nombre: "",
        telefono: null,
        email: null,
        ciudad: null,
        direccion: null,
        dniCuit: null,
        razonSocial: null,
        notas: null,
        activo: true,
        creadoEn: new Date().toISOString(),
      };

      aplicar(d, cliente, cuerpo);
      d.clientes.push(cliente);
      return vista(d, cliente);
    })
  );

  r.put("/clientes/:id", ({ params, cuerpo }) =>
    a.escribir((d) => {
      const cliente = d.clientes.find((c) => c.id === params.id);
      if (!cliente) throw new Regla("Ese cliente ya no existe.");
      aplicar(d, cliente, cuerpo);
      return vista(d, cliente);
    })
  );

  r.borrar("/clientes/:id", ({ params }) =>
    a.escribir((d) => {
      const cliente = d.clientes.find((c) => c.id === params.id);
      if (!cliente) throw new Regla("Ese cliente ya no existe.");

      // Archivar, no borrar: sus compras lo nombran, y borrarlo dejaría ventas
      // viejas apuntando a alguien que no existe.
      cliente.activo = false;
      return { ok: true };
    })
  );

  r.post("/clientes/:id/restaurar", ({ params }) =>
    a.escribir((d) => {
      const cliente = d.clientes.find((c) => c.id === params.id);
      if (!cliente) throw new Regla("Ese cliente ya no existe.");
      cliente.activo = true;
      return vista(d, cliente);
    })
  );
}

// ──────────────────────────────  Ayudas  ──────────────────────────────

function aplicar(d: BaseDatos, cliente: Cliente, cuerpo: Record<string, unknown>): void {
  cliente.nombre = recortarObligatorio(cuerpo.nombre as string, 160, "El nombre es obligatorio.");
  cliente.telefono = recortar(cuerpo.telefono as string, 40);
  cliente.ciudad = recortar(cuerpo.ciudad as string, 80);
  cliente.direccion = recortar(cuerpo.direccion as string, 200);
  cliente.dniCuit = recortar(cuerpo.dniCuit as string, 20);
  cliente.razonSocial = recortar(cuerpo.razonSocial as string, 160);
  cliente.notas = recortar(cuerpo.notas as string, 600);

  const email = recortar(cuerpo.email as string, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Regla("Ese correo no parece válido.");
  }
  cliente.email = email;

  // El mismo teléfono anotado dos veces es la misma persona cargada dos veces:
  // se avisa antes de que la agenda se llene de duplicados.
  const digitos = soloDigitos(cliente.telefono);
  if (digitos.length >= 6) {
    const repetido = d.clientes.find(
      (c) => c.id !== cliente.id && c.activo && soloDigitos(c.telefono) === digitos
    );
    if (repetido) throw new Regla(`Ese teléfono ya está en la ficha de ${repetido.nombre}.`);
  }
}

export function vista(d: BaseDatos, c: Cliente) {
  const compras = d.pedidos.filter((p) => p.clienteId === c.id && p.estado !== "cancelado");

  return {
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    email: c.email,
    ciudad: c.ciudad,
    direccion: c.direccion,
    dniCuit: c.dniCuit,
    razonSocial: c.razonSocial,
    notas: c.notas,
    activo: c.activo,
    creadoEn: c.creadoEn,
    compras: compras.length,
    // Las devoluciones vienen con total negativo, así que restan solas.
    gastado: compras.reduce((s, p) => s + p.total, 0),
    ultimaCompra:
      compras.length === 0
        ? null
        : compras.reduce((ultima, p) => (p.creadoEn > ultima ? p.creadoEn : ultima), compras[0]!.creadoEn),
  };
}
