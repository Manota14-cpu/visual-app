"use client";

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { Icono, type NombreIcono } from "@/components/iconos";

/**
 * Las piezas con las que está hecha toda la interfaz.
 *
 * Están juntas a propósito: son quince componentes chicos que se miran unos a
 * otros para mantener el mismo alto, el mismo radio y la misma sombra.
 * Repartidos en quince archivos, la primera diferencia aparece a la semana.
 */

// ─────────────────────────────  Botones  ─────────────────────────────

type Tono = "principal" | "suave" | "fantasma" | "peligro";

const tonos: Record<Tono, string> = {
  // El azul del logo, con su propia sombra teñida: es lo único que se
  // presenta como "apretame".
  principal:
    "bg-acento text-white border-transparent shadow-acento hover:bg-acento-fuerte active:scale-[0.97]",
  suave:
    "bg-papel text-tinta border-linea-fuerte/70 shadow-boton hover:bg-[#FAFAFC] active:scale-[0.97]",
  fantasma: "bg-transparent text-tinta-suave border-transparent hover:bg-black/[0.04] hover:text-tinta",
  peligro:
    "bg-papel text-alerta-texto border-alerta-linea shadow-boton hover:bg-alerta-fondo active:scale-[0.97]",
};

export function Boton({
  tono = "suave",
  chico,
  icono,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tono?: Tono;
  chico?: boolean;
  icono?: NombreIcono;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 rounded border font-medium",
        "transition-all duration-200 ease-suave disabled:pointer-events-none disabled:opacity-40",
        chico ? "h-8 px-2.5 text-chico" : "h-9 px-3.5 text-base",
        tonos[tono],
        className
      )}
      {...props}
    >
      {icono && <Icono nombre={icono} tamano={chico ? 14 : 16} />}
      {children}
    </button>
  );
}

// ────────────────────────────  Formulario  ────────────────────────────

function Envoltorio({
  etiqueta,
  ayuda,
  error,
  htmlFor,
  className,
  children,
}: {
  etiqueta?: string;
  ayuda?: string;
  error?: string | null;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {etiqueta && (
        <label htmlFor={htmlFor} className="etiqueta-campo">
          {etiqueta}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-chico text-alerta-texto">{error}</p>
      ) : ayuda ? (
        <p className="text-chico text-tinta-tenue">{ayuda}</p>
      ) : null}
    </div>
  );
}

/**
 * Un campo: fondo blanco, contorno de un pelo y, al enfocarlo, el anillo azul
 * del sistema. El anillo se dibuja con `ring` en vez de con el borde para que
 * el campo no se mueva medio píxel al recibir el foco.
 */
const campoBase =
  "h-9 w-full rounded border border-linea-fuerte/80 bg-papel px-3 text-base text-tinta shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)] " +
  "placeholder:text-tinta-tenue transition-all duration-200 ease-suave " +
  "focus:border-acento focus:outline-none focus:ring-[3px] focus:ring-acento/25 " +
  "disabled:bg-lienzo disabled:text-tinta-tenue";

export function Campo({
  etiqueta,
  ayuda,
  error,
  className,
  contenedor,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  etiqueta?: string;
  ayuda?: string;
  error?: string | null;
  contenedor?: string;
}) {
  const id = useId();
  return (
    <Envoltorio etiqueta={etiqueta} ayuda={ayuda} error={error} htmlFor={id} className={contenedor}>
      <input
        id={id}
        className={cn(campoBase, error && "border-alerta-linea focus:ring-alerta-linea/40", className)}
        {...props}
      />
    </Envoltorio>
  );
}

export function Area({
  etiqueta,
  ayuda,
  error,
  className,
  contenedor,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  etiqueta?: string;
  ayuda?: string;
  error?: string | null;
  contenedor?: string;
}) {
  const id = useId();
  return (
    <Envoltorio etiqueta={etiqueta} ayuda={ayuda} error={error} htmlFor={id} className={contenedor}>
      <textarea
        id={id}
        rows={3}
        className={cn(campoBase, "h-auto py-2 leading-6", error && "border-alerta-linea", className)}
        {...props}
      />
    </Envoltorio>
  );
}

export function Selector({
  etiqueta,
  ayuda,
  error,
  className,
  contenedor,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  etiqueta?: string;
  ayuda?: string;
  error?: string | null;
  contenedor?: string;
}) {
  const id = useId();
  return (
    <Envoltorio etiqueta={etiqueta} ayuda={ayuda} error={error} htmlFor={id} className={contenedor}>
      <div className="relative">
        <select
          id={id}
          className={cn(campoBase, "cursor-pointer appearance-none pr-9", className)}
          {...props}
        >
          {children}
        </select>
        <Icono
          nombre="selector"
          tamano={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-tinta-tenue"
        />
      </div>
    </Envoltorio>
  );
}

export function Buscador({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <div className={cn("relative", className)}>
      <Icono
        nombre="buscar"
        tamano={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-tenue"
      />
      <input ref={ref} className={cn(campoBase, "pl-9")} {...props} />
    </div>
  );
}

export function Casilla({
  etiqueta,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-base", className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-[6px] border border-linea-fuerte bg-papel shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] transition-all duration-150 checked:border-acento checked:bg-acento checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223.2%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m5 12.5 4.5 4.5L19 7%22/></svg>')] checked:bg-[length:13px] checked:bg-center checked:bg-no-repeat"
        {...props}
      />
      <span>{etiqueta}</span>
    </label>
  );
}

// ────────────────────────────  Superficies  ────────────────────────────

export function Hoja({
  titulo,
  accion,
  className,
  cuerpo,
  children,
}: {
  titulo?: ReactNode;
  accion?: ReactNode;
  className?: string;
  cuerpo?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("hoja overflow-hidden", className)}>
      {(titulo || accion) && (
        <header className="pelo flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="font-titulo text-medio font-semibold">{titulo}</h2>
          {accion}
        </header>
      )}
      <div className={cn(cuerpo ?? "p-4")}>{children}</div>
    </section>
  );
}

export function Metrica({
  rotulo,
  valor,
  pie,
  tono,
}: {
  rotulo: string;
  valor: ReactNode;
  pie?: ReactNode;
  tono?: "alerta" | "aviso" | "exito";
}) {
  return (
    <div className="hoja min-w-0 px-4 py-3.5 transition-shadow duration-300 ease-suave hover:shadow-elevada">
      <p className="etiqueta-campo truncate">{rotulo}</p>
      <p
        className={cn(
          // En el celular van de a dos: a 30px "$471.890" no entra en media
          // pantalla. Un escalón menos alcanza y sigue siendo el número grande.
          "cifra mt-1.5 break-words font-titulo text-[22px] font-semibold leading-7 sm:text-cifra",
          tono === "alerta" && "text-alerta-texto",
          tono === "aviso" && "text-aviso-texto",
          tono === "exito" && "text-exito-texto"
        )}
      >
        {valor}
      </p>
      {pie && <p className="mt-1 text-chico text-tinta-tenue">{pie}</p>}
    </div>
  );
}

const etiquetas = {
  neutral: "bg-black/[0.05] text-tinta-media border-transparent",
  exito: "bg-exito-fondo text-exito-texto border-exito-linea",
  aviso: "bg-aviso-fondo text-aviso-texto border-aviso-linea",
  alerta: "bg-alerta-fondo text-alerta-texto border-alerta-linea",
  dato: "bg-dato-fondo text-dato-texto border-dato-linea",
};

export function Etiqueta({
  tono = "neutral",
  className,
  children,
}: {
  tono?: keyof typeof etiquetas;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-semibold uppercase tracking-[0.03em]",
        etiquetas[tono],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Tabla({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className={cn("w-full min-w-[560px] text-base", className)}>{children}</table>
    </div>
  );
}

export function EncabezadoTabla({ children }: { children: ReactNode }) {
  return (
    <thead className="text-left [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-black/[0.06] [&_th]:px-3 [&_th]:py-2 [&_th]:text-micro [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.05em] [&_th]:text-tinta-tenue">
      {children}
    </thead>
  );
}

export function CuerpoTabla({ children }: { children: ReactNode }) {
  return (
    <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-b [&_tr]:border-black/[0.05] [&_tr:last-child]:border-0">
      {children}
    </tbody>
  );
}

export function Vacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="font-titulo text-medio font-semibold">{titulo}</p>
      {detalle && <p className="max-w-sm text-base text-tinta-suave">{detalle}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

export function Cargando({ filas = 5 }: { filas?: number }) {
  return (
    <div className="space-y-2 p-4" aria-label="Cargando" role="status">
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className="esperando h-9 rounded"
          style={{ opacity: 1 - i * 0.1, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function Aviso({
  tono = "aviso",
  children,
}: {
  tono?: "aviso" | "alerta" | "dato" | "exito";
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-base", etiquetas[tono])}>
      <Icono nombre={tono === "exito" ? "listo" : "alerta"} tamano={16} className="mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Paginacion({
  pagina,
  porPagina,
  total,
  onCambiar,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  onCambiar: (pagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-black/[0.05] px-4 py-2.5 text-chico text-tinta-suave">
      <span>
        {desde}–{hasta} de {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Boton
          chico
          tono="fantasma"
          icono="flecha-izquierda"
          disabled={pagina <= 1}
          onClick={() => onCambiar(pagina - 1)}
          aria-label="Página anterior"
        />
        <span className="tabular-nums">
          {pagina} / {paginas}
        </span>
        <Boton
          chico
          tono="fantasma"
          icono="flecha-derecha"
          disabled={pagina >= paginas}
          onClick={() => onCambiar(pagina + 1)}
          aria-label="Página siguiente"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────  Diálogos  ─────────────────────────────

/**
 * Una ventana modal.
 *
 * Usa el `<dialog>` del navegador en vez de armar una capa a mano: el foco
 * queda adentro, Escape cierra y el fondo deja de recibir clics sin escribir
 * nada de eso.
 *
 * El panel es blanco sólido y lo que se difumina es lo que queda detrás: así
 * la pantalla se hunde y la ventana se apoya encima, sin que el texto del
 * fondo se mezcle con el del formulario.
 */
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  ancho = "max-w-xl",
  pie,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  ancho?: string;
  pie?: ReactNode;
  children: ReactNode;
}) {
  const referencia = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = referencia.current;
    if (!dialogo) return;

    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  useEffect(() => {
    const dialogo = referencia.current;
    if (!dialogo) return;

    const alCerrar = () => onCerrar();
    dialogo.addEventListener("close", alCerrar);
    return () => dialogo.removeEventListener("close", alCerrar);
  }, [onCerrar]);

  return (
    <dialog
      ref={referencia}
      className={cn(
        "w-[calc(100vw-2rem)] rounded-xl border-0 bg-papel p-0 text-tinta shadow-flotante",
        "ring-1 ring-black/[0.06] backdrop:bg-black/25 backdrop:backdrop-blur-[3px] open:animate-entrar",
        ancho
      )}
      onClick={(e) => {
        // Solo el fondo cierra. Un clic sobre el fondo de un diálogo modal
        // llega con el propio <dialog> como destino; cualquier otra cosa —un
        // botón, un campo— vino de adentro y sube hasta acá por burbujeo.
        //
        // Mirar únicamente las coordenadas no alcanzaba: un clic que no lo hizo
        // el mouse llega en (0, 0), que siempre cae fuera del rectángulo. Con
        // eso, Enter sobre cualquier botón cerraba el diálogo, y apretar
        // «Elegir archivo» —que dispara un clic sobre un campo escondido— lo
        // cerraba justo antes de que se pudiera elegir nada.
        if (e.target !== e.currentTarget) return;

        const caja = e.currentTarget.getBoundingClientRect();
        const afuera =
          e.clientX < caja.left || e.clientX > caja.right ||
          e.clientY < caja.top || e.clientY > caja.bottom;
        if (afuera) onCerrar();
      }}
    >
      <div className="pelo flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="font-titulo text-medio font-semibold">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-chico text-tinta-suave">{descripcion}</p>}
        </div>
        <Boton tono="fantasma" chico icono="cerrar" onClick={onCerrar} aria-label="Cerrar" />
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

      {pie && (
        <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] px-5 py-3.5">
          {pie}
        </div>
      )}
    </dialog>
  );
}

export function Confirmar({
  abierto,
  titulo,
  detalle,
  confirmar = "Confirmar",
  peligroso,
  trabajando,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean;
  titulo: string;
  detalle?: string;
  confirmar?: string;
  peligroso?: boolean;
  trabajando?: boolean;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      ancho="max-w-md"
      pie={
        <>
          <Boton onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Boton>
          <Boton
            tono={peligroso ? "peligro" : "principal"}
            onClick={onConfirmar}
            disabled={trabajando}
          >
            {trabajando ? "Un momento…" : confirmar}
          </Boton>
        </>
      }
    >
      <p className="text-base text-tinta-media">{detalle}</p>
    </Dialogo>
  );
}

/**
 * Un grupo de opciones excluyentes, como el selector segmentado de iOS: la
 * elegida es una pastilla blanca que flota sobre un canal gris.
 */
export function Segmentado<T extends string | number>({
  opciones,
  valor,
  onCambiar,
  className,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onCambiar: (valor: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md bg-black/[0.05] p-[3px]", className)}>
      {opciones.map((opcion) => (
        <button
          key={String(opcion.valor)}
          type="button"
          onClick={() => onCambiar(opcion.valor)}
          className={cn(
            "rounded-[9px] px-3 py-1.5 text-chico font-medium transition-all duration-200 ease-suave",
            valor === opcion.valor
              ? "bg-papel text-tinta shadow-boton"
              : "text-tinta-suave hover:text-tinta"
          )}
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  );
}
