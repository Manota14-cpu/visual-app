import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Los íconos, dibujados acá adentro.
 *
 * Son unos treinta trazos: traer una biblioteca entera para eso agrega un paquete
 * más al instalador y, sobre todo, le da a la aplicación el mismo dibujo que
 * tienen todas. Un grosor único (1.6) y una grilla de 24 alcanzan para que se
 * vean como un juego.
 */
export type NombreIcono =
  | "panel"
  | "productos"
  | "caja"
  | "pedidos"
  | "clientes"
  | "gastos"
  | "informes"
  | "movimientos"
  | "ajustes"
  | "mas"
  | "menos"
  | "buscar"
  | "cerrar"
  | "editar"
  | "borrar"
  | "listo"
  | "alerta"
  | "flecha-derecha"
  | "flecha-izquierda"
  | "flecha-abajo"
  | "selector"
  | "imprimir"
  | "copiar"
  | "carpeta"
  | "recargar"
  | "archivo"
  | "etiqueta"
  | "reloj"
  | "salir"
  | "camion"
  | "recuento"
  | "puntos"
  | "codigo"
  | "camara"
  | "sol"
  | "luna"
  | "automatico"
  | "mensaje";

const trazos: Record<NombreIcono, ReactNode> = {
  panel: (
    <>
      <rect x="3" y="3" width="7.5" height="8.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5" />
    </>
  ),
  productos: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </>
  ),
  caja: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7.5Z" />
      <path d="M3 8h13" />
      <circle cx="17" cy="13" r="1.2" />
    </>
  ),
  pedidos: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14.5 3v4.5H19" />
      <path d="M9.5 12.5h6M9.5 16h4" />
    </>
  ),
  clientes: (
    <>
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 14.9c1.9.6 3 2.2 3 4.1" />
    </>
  ),
  gastos: (
    <>
      <path d="M5.5 3.5h13v17l-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4-2.1-1.4-2.2 1.4z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  informes: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16.5v-4M12.5 16.5V7.5M17 16.5v-6.5" />
    </>
  ),
  movimientos: (
    <>
      <path d="M3.5 8.5h13l-3-3M20.5 15.5h-13l3 3" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </>
  ),
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  buscar: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </>
  ),
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  editar: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),
  borrar: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4h5v2.5" />
      <path d="M6.5 6.5 7.5 20h9l1-13.5" />
      <path d="M10.5 10v6M13.5 10v6" />
    </>
  ),
  listo: <path d="m5 12.5 4.5 4.5L19 7" />,
  alerta: (
    <>
      <path d="M12 4 2.8 20h18.4L12 4Z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  "flecha-derecha": <path d="M5 12h14m-5-5 5 5-5 5" />,
  "flecha-izquierda": <path d="M19 12H5m5 5-5-5 5-5" />,
  "flecha-abajo": <path d="M12 5v14m5-5-5 5-5-5" />,
  // Los dos galones de un desplegable del sistema: arriba y abajo, sin caja.
  selector: <path d="m8 10 4-4 4 4M8 14l4 4 4-4" />,
  imprimir: (
    <>
      <path d="M7 9V3.5h10V9" />
      <path d="M5 9h14a2 2 0 0 1 2 2v5h-4v4.5H7V16H3v-5a2 2 0 0 1 2-2Z" />
      <path d="M7 16h10" />
    </>
  ),
  copiar: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 5.5v-.5a1.5 1.5 0 0 0-1.5-1.5H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 15.5h.5" />
    </>
  ),
  carpeta: (
    <>
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-11Z" />
    </>
  ),
  recargar: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.5 4v4.5H16" />
    </>
  ),
  archivo: (
    <>
      <path d="M6 3h8l4.5 4.5V21H6z" />
      <path d="M13.5 3v5H19" />
    </>
  ),
  etiqueta: (
    <>
      <path d="M3.5 11.5V5A1.5 1.5 0 0 1 5 3.5h6.5L21 13l-8 8-9.5-9.5Z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  reloj: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  // Proveedores: el que trae la mercadería. Antes compartían el dibujo de
  // clientes, y en la columna eran dos renglones con la misma cara.
  camion: (
    <>
      <path d="M13.5 17V5.5H4a1 1 0 0 0-1 1V16a1 1 0 0 0 1 1h1.1M8.9 17h6.2" />
      <path d="M13.5 9h4l3 3.6V16a1 1 0 0 1-1 1h-.6" />
      <circle cx="7" cy="17" r="1.9" />
      <circle cx="17" cy="17" r="1.9" />
    </>
  ),
  // Recuento: la planilla con el tilde de "contado".
  recuento: (
    <>
      <path d="M8.5 4.5h-2A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5h-2" />
      <rect x="8.5" y="3" width="7" height="3" rx="1" />
      <path d="m9 13.5 2.2 2.2 4.3-4.5" />
    </>
  ),
  // El lector de códigos: barras de distinto ancho entre dos esquinas.
  codigo: (
    <>
      <path d="M3.5 7.5v-2a1 1 0 0 1 1-1h2M17.5 4.5h2a1 1 0 0 1 1 1v2M20.5 16.5v2a1 1 0 0 1-1 1h-2M6.5 19.5h-2a1 1 0 0 1-1-1v-2" />
      <path d="M7.5 8v8M10 8v8M12.5 8v8M15.5 8v8" />
      <path d="M16.8 8v8" strokeWidth={0.9} />
    </>
  ),
  camara: (
    <>
      <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.6l1.5-2.2h5.8L16.4 7H19a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  // "Más", en la barra del teléfono: los tres puntos de siempre.
  puntos: (
    <>
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </>
  ),
  // Los tres del tema: claro, oscuro y "el que diga el sistema", que es el
  // círculo mitad lleno de siempre.
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v1.9M12 19.3v1.9M5.5 5.5l1.35 1.35M17.15 17.15l1.35 1.35M2.8 12h1.9M19.3 12h1.9M5.5 18.5l1.35-1.35M17.15 6.85l1.35-1.35" />
    </>
  ),
  luna: <path d="M19.8 14.6A8.2 8.2 0 0 1 9.4 4.2a8.2 8.2 0 1 0 10.4 10.4Z" />,
  automatico: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" />
    </>
  ),
  // Un globo de conversación: el recordatorio que se manda por mensaje.
  mensaje: (
    <>
      <path d="M20.2 11.6a8.1 8.1 0 0 1-11.9 7.2L3.8 20l1.3-4.2a8.1 8.1 0 1 1 15.1-4.2Z" />
      <path d="M8.6 11.8h.01M12.1 11.8h.01M15.6 11.8h.01" strokeWidth={2.4} />
    </>
  ),
  salir: (
    <>
      <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="M17.5 8.5 21 12l-3.5 3.5M21 12h-9" />
    </>
  ),
};

export function Icono({
  nombre,
  className,
  tamano = 18,
}: {
  nombre: NombreIcono;
  className?: string;
  tamano?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {trazos[nombre]}
    </svg>
  );
}
