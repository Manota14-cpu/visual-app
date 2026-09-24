import type { NombreIcono } from "@/components/iconos";

export type Seccion = { nombre: string; href: string; icono: NombreIcono; soloDueno?: boolean };

/**
 * Las secciones, agrupadas por cuándo se usan, con quien puede entrar a cada una.
 *
 * Doce renglones seguidos son una lista que hay que leer entera para encontrar
 * algo. En tres grupos se busca primero el grupo y después el renglón: lo de
 * todos los días arriba, lo del depósito en el medio y los números del negocio
 * abajo, que es también el orden en que se usan a lo largo de la semana.
 *
 * `soloDueno` esconde el renglón; no es lo que lo impide. Lo que de verdad lo
 * impide es el servidor, que comprueba el permiso en cada ruta. Esto existe
 * para no ofrecerle a alguien una puerta que le va a dar en la cara.
 */
export const grupos: { titulo: string; secciones: Seccion[] }[] = [
  {
    titulo: "Día a día",
    secciones: [
      { nombre: "Panel", href: "/panel", icono: "panel" },
      { nombre: "Caja", href: "/caja", icono: "caja" },
      { nombre: "Ventas", href: "/ventas", icono: "pedidos" },
      { nombre: "Clientes", href: "/clientes", icono: "clientes" },
    ],
  },
  {
    titulo: "Depósito",
    secciones: [
      { nombre: "Productos", href: "/productos", icono: "productos" },
      { nombre: "Movimientos", href: "/movimientos", icono: "movimientos" },
      { nombre: "Vencimientos", href: "/vencimientos", icono: "reloj" },
      { nombre: "Recuento", href: "/recuento", icono: "recuento", soloDueno: true },
      { nombre: "Etiquetas", href: "/etiquetas", icono: "etiqueta", soloDueno: true },
    ],
  },
  {
    titulo: "Negocio",
    secciones: [
      { nombre: "Proveedores", href: "/proveedores", icono: "camion", soloDueno: true },
      { nombre: "Gastos", href: "/gastos", icono: "gastos", soloDueno: true },
      { nombre: "Informes", href: "/informes", icono: "informes", soloDueno: true },
    ],
  },
];

export const secciones = grupos.flatMap((g) => g.secciones);

export const CONFIGURACION: Seccion = {
  nombre: "Configuración",
  href: "/configuracion",
  icono: "ajustes",
  soloDueno: true,
};

/**
 * Las que van siempre a la vista en la barra del teléfono.
 *
 * Son las cuatro que se abren con el cliente adelante; el resto está a un
 * toque, en "Más". Antes la barra mostraba las cinco primeras de la lista y un
 * "Ajustes" que a quien atiende le daba una pantalla prohibida: vencimientos,
 * movimientos y todo lo del dueño no se podían abrir desde el teléfono.
 */
export const EN_LA_BARRA = ["/panel", "/caja", "/productos", "/ventas"];
