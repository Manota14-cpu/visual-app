"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icono, type NombreIcono } from "@/components/iconos";
import { useDatos, useLatido } from "@/lib/datos";
import type { Sistema } from "@/lib/tipos";

const secciones: { nombre: string; href: string; icono: NombreIcono }[] = [
  { nombre: "Panel", href: "/panel", icono: "panel" },
  { nombre: "Caja", href: "/caja", icono: "caja" },
  { nombre: "Productos", href: "/productos", icono: "productos" },
  { nombre: "Ventas", href: "/ventas", icono: "pedidos" },
  { nombre: "Clientes", href: "/clientes", icono: "clientes" },
  { nombre: "Gastos", href: "/gastos", icono: "gastos" },
  { nombre: "Informes", href: "/informes", icono: "informes" },
  { nombre: "Movimientos", href: "/movimientos", icono: "movimientos" },
];

/**
 * El monograma, dibujado con las mismas proporciones que el ícono del programa.
 *
 * Va suelto sobre el fondo, sin la baldosa que sí lleva el ícono: ahí la
 * baldosa existe para que la marca no se pierda sobre una barra de tareas
 * oscura, y acá el fondo es el de la aplicación y siempre es claro.
 *
 * Los trazos se recortan contra una franja horizontal para que los remates
 * queden planos, que es como es la marca.
 */
function Marca() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-9 w-9 shrink-0 text-tinta"
      aria-hidden="true"
      focusable="false"
    >
      <clipPath id="marca-franja">
        <rect x="0" y="18.56" width="64" height="28.16" />
      </clipPath>
      <g clipPath="url(#marca-franja)" stroke="currentColor" fill="none" strokeLinecap="butt">
        <g strokeWidth="8.06">
          <path d="M13.18 18.56 L23.55 46.72" />
          <path d="M33.92 18.56 L23.55 46.72" />
          <path d="M43.39 18.56 L34.43 46.72" />
          <path d="M43.39 18.56 L50.75 46.72" />
        </g>
        <path d="M36.29 41.28 L49.28 41.28" strokeWidth="7.09" />
      </g>
    </svg>
  );
}

/**
 * El marco de todas las pantallas: la navegación y el encabezado.
 *
 * La columna y la barra de arriba son de vidrio esmerilado: el contenido pasa
 * por detrás al desplazarse y se ve difuminado, que es lo que le da profundidad
 * a la pantalla sin dibujar una sola línea de más.
 *
 * En el escritorio la navegación es una columna fija; en un teléfono o una
 * tablet apoyada en el mostrador, una barra abajo, que es donde llega el pulgar.
 */
export function Marco({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  const ruta = usePathname();
  const { datos: sistema } = useDatos<Sistema>("/sistema");

  // Mientras haya una pantalla abierta, el programa sabe que sigue en uso.
  useLatido();

  return (
    <div className="flex min-h-screen">
      <aside
        className="sin-imprimir vidrio sticky top-0 z-30 hidden h-screen w-[236px] shrink-0 flex-col border-r border-black/[0.06] px-3 py-5 lg:flex"
        aria-label="Navegación principal"
      >
        <Link href="/panel" className="mb-7 flex items-center gap-2.5 px-2">
          <Marca />
          <span className="min-w-0">
            <span className="block truncate font-titulo text-medio font-semibold leading-5">Visual App</span>
            <span className="block truncate text-micro text-tinta-tenue">
              {sistema?.config.negocio ?? " "}
            </span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5">
          {secciones.map((seccion) => {
            const activa = ruta.startsWith(seccion.href);
            return (
              <Link
                key={seccion.href}
                href={seccion.href}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded px-2.5 py-2 text-base transition-all duration-200 ease-suave",
                  activa
                    ? "bg-papel font-medium text-tinta shadow-apoyo"
                    : "text-tinta-suave hover:bg-black/[0.035] hover:text-tinta"
                )}
              >
                <Icono
                  nombre={seccion.icono}
                  tamano={17}
                  className={activa ? "text-acento" : undefined}
                />
                {seccion.nombre}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/configuracion"
          aria-current={ruta.startsWith("/configuracion") ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded px-2.5 py-2 text-base transition-all duration-200 ease-suave",
            ruta.startsWith("/configuracion")
              ? "bg-papel font-medium text-tinta shadow-apoyo"
              : "text-tinta-suave hover:bg-black/[0.035] hover:text-tinta"
          )}
        >
          <Icono
            nombre="ajustes"
            tamano={17}
            className={ruta.startsWith("/configuracion") ? "text-acento" : undefined}
          />
          Configuración
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sin-imprimir vidrio sticky top-0 z-20 border-b border-black/[0.06] px-4 py-4 lg:px-8 lg:py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-titulo text-titulo font-semibold">{titulo}</h1>
              {descripcion && (
                <p className="mt-1 max-w-2xl text-base text-tinta-suave">{descripcion}</p>
              )}
            </div>
            {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-12">{children}</main>

        <nav
          className="sin-imprimir vidrio-denso fixed bottom-0 left-0 right-0 z-30 flex items-stretch justify-between border-t border-black/[0.07] pb-[env(safe-area-inset-bottom)] lg:hidden"
          aria-label="Secciones"
        >
          {[...secciones.slice(0, 5), { nombre: "Ajustes", href: "/configuracion", icono: "ajustes" as const }].map(
            (seccion) => {
              const activa = ruta.startsWith(seccion.href);
              return (
                <Link
                  key={seccion.href}
                  href={seccion.href}
                  aria-current={activa ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2 text-micro transition-colors",
                    activa ? "text-acento" : "text-tinta-tenue"
                  )}
                >
                  <Icono nombre={seccion.icono} tamano={20} />
                  {seccion.nombre}
                </Link>
              );
            }
          )}
        </nav>
      </div>
    </div>
  );
}
