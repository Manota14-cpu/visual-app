"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icono, type NombreIcono } from "@/components/iconos";
import { Etiqueta, Tecla } from "@/components/ui";
import { CONFIGURACION, grupos } from "@/components/secciones";
import { api, consulta } from "@/lib/api";
import { useEspera } from "@/lib/datos";
import { cantidadEscrita, normalizarTexto, plata } from "@/lib/formato";
import { useSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import type { ProductoBuscado } from "@/lib/tipos";

interface ClienteBuscado {
  id: string;
  nombre: string;
  telefono: string | null;
  ciudad: string | null;
  debe: number;
}

interface Resultado {
  clave: string;
  grupo: string;
  icono: NombreIcono;
  titulo: string;
  detalle?: string;
  extra?: ReactNode;
  ir: string;
}

const ACCIONES: (Resultado & { soloDueno?: boolean })[] = [
  { clave: "a-caja", grupo: "Acciones", icono: "caja", titulo: "Cobrar en la caja", ir: "/caja" },
  // Dar de alta un producto es del dueño: el servidor se lo niega a quien
  // atiende, así que ni se le ofrece.
  { clave: "a-producto", grupo: "Acciones", icono: "mas", titulo: "Producto nuevo", ir: "/productos?nuevo=1", soloDueno: true },
  { clave: "a-cliente", grupo: "Acciones", icono: "clientes", titulo: "Cliente nuevo", ir: "/clientes?nuevo=1" },
];

/**
 * El buscador de todo el programa: Ctrl+K desde cualquier pantalla.
 *
 * Con doce secciones, un catálogo y una agenda, "¿cuánto sale la bandeja N°5?"
 * eran tres clics y una búsqueda. Acá es escribir "band" y Enter. Busca
 * secciones, productos y clientes a la vez, y ofrece lo que más se hace sin
 * escribir nada. Se maneja entero con el teclado: flechas, Enter y Escape.
 *
 * Es un `<dialog>` modal como los demás: el lector de códigos no escucha
 * mientras está abierto, así que un producto pasado por el lector no se mezcla
 * con lo que se está escribiendo.
 */
export function Paleta({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const { esDueno } = useSesion();
  const dialogo = useRef<HTMLDialogElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState(0);
  const [productos, setProductos] = useState<ProductoBuscado[]>([]);
  const [clientes, setClientes] = useState<ClienteBuscado[]>([]);
  const termino = useEspera(texto.trim(), 160);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (!d.open) d.showModal();
    campo.current?.focus();
    const alCerrar = () => onCerrar();
    d.addEventListener("close", alCerrar);
    return () => d.removeEventListener("close", alCerrar);
  }, [onCerrar]);

  // Productos y clientes se piden juntos; si mientras tanto se siguió
  // escribiendo, la respuesta vieja se descarta.
  useEffect(() => {
    let vigente = true;
    if (termino.length < 2) return;
    void Promise.all([
      api.get<ProductoBuscado[]>(`/productos/buscar${consulta({ q: termino })}`).catch(() => []),
      api.get<ClienteBuscado[]>(`/clientes/buscar${consulta({ q: termino })}`).catch(() => []),
    ]).then(([p, c]) => {
      if (!vigente) return;
      setProductos(p.slice(0, 6));
      setClientes(c.slice(0, 4));
    });
    return () => {
      vigente = false;
    };
  }, [termino]);

  const buscado = normalizarTexto(texto);
  // Con menos de dos letras no se busca, y lo que quedó de la búsqueda
  // anterior no se muestra: serían resultados de algo que ya no se busca.
  const productosVisibles = termino.length < 2 ? [] : productos;
  const clientesVisibles = termino.length < 2 ? [] : clientes;
  const puede = (soloDueno?: boolean) => !soloDueno || esDueno;

  const secciones: Resultado[] = [...grupos.flatMap((g) => g.secciones), CONFIGURACION]
    .filter((s) => puede(s.soloDueno) && (!buscado || normalizarTexto(s.nombre).includes(buscado)))
    .map((s) => ({ clave: s.href, grupo: "Ir a", icono: s.icono, titulo: s.nombre, ir: s.href }));

  const acciones = ACCIONES.filter(
    (a) => puede(a.soloDueno) && (!buscado || normalizarTexto(a.titulo).includes(buscado))
  );

  const resultados: Resultado[] = [
    ...(buscado ? [] : acciones),
    ...productosVisibles.map((p) => ({
      clave: `p-${p.id}`,
      grupo: "Productos",
      icono: "productos" as const,
      titulo: p.nombre,
      detalle: [p.sku, p.codigoBarras].filter(Boolean).join(" · ") || undefined,
      extra: (
        <span className="flex shrink-0 items-center gap-2">
          <span className="cifra font-medium">
            {plata(p.precio)}
            {p.porPeso && <span className="font-normal text-tinta-tenue"> el kilo</span>}
          </span>
          <Etiqueta tono={p.stock <= 0 ? "alerta" : "neutral"}>
            {p.stock <= 0 ? "sin stock" : cantidadEscrita(p.stock, p.porPeso)}
          </Etiqueta>
        </span>
      ),
      ir: `/productos${consulta({ q: p.nombre })}`,
    })),
    ...clientesVisibles.map((c) => ({
      clave: `c-${c.id}`,
      grupo: "Clientes",
      icono: "clientes" as const,
      titulo: c.nombre,
      detalle: [c.telefono, c.ciudad].filter(Boolean).join(" · ") || undefined,
      extra:
        c.debe > 0 ? (
          <Etiqueta tono="aviso" className="cifra normal-case tracking-normal">
            debe {plata(c.debe)}
          </Etiqueta>
        ) : undefined,
      ir: `/clientes${consulta({ q: c.nombre })}`,
    })),
    ...secciones,
    ...(buscado ? acciones : []),
  ];

  const actual = Math.min(elegido, Math.max(resultados.length - 1, 0));

  function ir(resultado: Resultado | undefined) {
    if (!resultado) return;
    dialogo.current?.close();
    // Un `vez=` distinto en cada salto con pedido: elegir dos veces "Producto
    // nuevo" estando en Productos tiene que abrirlo las dos veces (ver
    // lib/direccion.ts).
    const conPedido = resultado.ir.includes("?");
    router.push(conPedido ? `${resultado.ir}&vez=${Date.now()}` : resultado.ir);
  }

  function alTeclear(evento: KeyboardEvent) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (resultados.length === 0) return;
      const paso = evento.key === "ArrowDown" ? 1 : -1;
      const siguiente = (actual + paso + resultados.length) % resultados.length;
      setElegido(siguiente);
      lista.current?.querySelector(`[data-indice="${siguiente}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      ir(resultados[actual]);
    }
  }

  return (
    <dialog
      ref={dialogo}
      aria-label="Buscar en Visual App"
      className={cn(
        "mx-auto mb-auto mt-[12vh] w-[calc(100vw-2rem)] max-w-xl overflow-hidden rounded-xl border-0 bg-papel p-0 text-tinta shadow-flotante",
        "ring-1 ring-contraste/[0.06] backdrop:bg-black/25 backdrop:backdrop-blur-[3px] open:animate-entrar"
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogo.current?.close();
      }}
    >
      <div className="pelo flex items-center gap-3 px-4">
        <Icono nombre="buscar" tamano={19} className="text-tinta-tenue" />
        <input
          ref={campo}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setElegido(0);
          }}
          onKeyDown={alTeclear}
          placeholder="Buscar productos, clientes o secciones…"
          aria-label="Qué buscar"
          role="combobox"
          aria-expanded="true"
          aria-controls="paleta-resultados"
          aria-activedescendant={resultados[actual] ? `paleta-${resultados[actual]!.clave}` : undefined}
          // Sin el anillo azul de siempre: es el único campo del diálogo y
          // tiene el cursor desde que se abre; el anillo lo recortaba contra
          // el borde de arriba.
          className="h-14 min-w-0 flex-1 bg-transparent text-medio outline-none placeholder:text-tinta-tenue focus-visible:shadow-none"
          autoComplete="off"
          spellCheck={false}
        />
        <Tecla>Esc</Tecla>
      </div>

      <ul ref={lista} id="paleta-resultados" role="listbox" className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
        {resultados.length === 0 && (
          <li className="px-3 py-8 text-center text-base text-tinta-suave">
            {termino.length < 2 ? "Escribí para buscar." : `Nada coincide con «${texto.trim()}».`}
          </li>
        )}
        {resultados.map((r, i) => (
          <li key={r.clave} role="presentation">
            {(i === 0 || resultados[i - 1]!.grupo !== r.grupo) && (
              <p className="etiqueta-campo px-3 pb-1.5 pt-2.5">{r.grupo}</p>
            )}
            <button
              type="button"
              id={`paleta-${r.clave}`}
              role="option"
              aria-selected={i === actual}
              data-indice={i}
              onMouseMove={() => i !== actual && setElegido(i)}
              onClick={() => ir(r)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150",
                i === actual ? "bg-acento-suave" : "hover:bg-contraste/[0.03]"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] transition-colors",
                  i === actual ? "bg-acento text-white shadow-acento" : "bg-lienzo text-tinta-suave"
                )}
              >
                <Icono nombre={r.icono} tamano={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate", i === actual && "font-medium text-acento-texto")}>
                  {r.titulo}
                </span>
                {r.detalle && <span className="block truncate text-chico text-tinta-suave">{r.detalle}</span>}
              </span>
              {r.extra}
              {i === actual && <Icono nombre="flecha-derecha" tamano={15} className="text-acento" />}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-4 border-t border-contraste/[0.06] px-4 py-2.5 text-micro text-tinta-tenue">
        <span className="flex items-center gap-1.5">
          <Tecla>↑</Tecla>
          <Tecla>↓</Tecla>
          para elegir
        </span>
        <span className="flex items-center gap-1.5">
          <Tecla>Enter</Tecla>
          para abrir
        </span>
      </div>
    </dialog>
  );
}
