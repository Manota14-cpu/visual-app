"use client";

import { useMemo, useState } from "react";
import { Boton, Campo } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { useAvisos } from "@/components/avisos";
import { api, consulta, ErrorApi } from "@/lib/api";
import { useDatos, useEspera } from "@/lib/datos";
import { normalizarTexto, plata } from "@/lib/formato";

/** Un cliente de la agenda, como lo necesita la caja. */
export interface ClienteElegido {
  id: string;
  nombre: string;
  /** Lo que debe hoy. */
  debe: number;
}

/**
 * A quién se le vende, o quién devuelve.
 *
 * Se puede escribir un nombre suelto —la mayoría de las ventas de mostrador no
 * tienen ficha— o engancharlo a un cliente de la agenda, que es lo que hace que
 * aparezca en su historial y en su cuenta.
 *
 * Si el nombre escrito no está en la agenda, se lo puede agregar ahí mismo.
 * Antes había que cancelar la venta, ir a Clientes, crearlo y volver a armar el
 * carrito, con el cliente esperando del otro lado del mostrador. Alcanza con el
 * nombre: el teléfono y lo demás se completan después, en Clientes.
 *
 * Lo usan el cobro y la devolución.
 */
export function SelectorCliente({
  nombre,
  onNombre,
  cliente,
  onCliente,
  ayuda = "Escribí un nombre, o buscá uno de la agenda para que le quede en su historial.",
}: {
  nombre: string;
  onNombre: (valor: string) => void;
  cliente: ClienteElegido | null;
  onCliente: (cliente: ClienteElegido | null) => void;
  ayuda?: string;
}) {
  const avisos = useAvisos();
  const [texto, setTexto] = useState("");
  const [creando, setCreando] = useState(false);
  const termino = useEspera(texto, 220);

  const { datos } = useDatos<
    { id: string; nombre: string; telefono: string | null; ciudad: string | null; debe: number }[]
  >(!cliente && termino.trim().length >= 2 ? `/clientes/buscar${consulta({ q: termino })}` : null, {
    silencioso: true,
  });

  const sugerencias = useMemo(() => datos ?? [], [datos]);

  // Se ofrece crearlo solo si lo escrito no es exactamente alguien que ya
  // está: dos "Juan Pérez" en la agenda son dos cuentas, y la deuda de uno
  // termina anotada en el otro.
  const escrito = texto.trim();
  const yaEsta = sugerencias.some((c) => normalizarTexto(c.nombre) === normalizarTexto(escrito));
  const puedeCrear = escrito.length >= 2 && !yaEsta;

  async function crear() {
    setCreando(true);
    try {
      const nuevo = await api.post<{ id: string; nombre: string }>("/clientes", { nombre: escrito });
      onCliente({ id: nuevo.id, nombre: nuevo.nombre, debe: 0 });
      onNombre(nuevo.nombre);
      setTexto("");
      avisos.exito(`${nuevo.nombre} quedó en la agenda.`);
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo agregar el cliente.");
    } finally {
      setCreando(false);
    }
  }

  if (cliente) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-linea bg-lienzo px-3 py-2">
        <span className="min-w-0">
          <span className="etiqueta-campo">Cliente</span>
          <span className="block truncate">{cliente.nombre}</span>
          {cliente.debe > 0 && (
            <span className="block text-chico text-aviso-texto">Debe {plata(cliente.debe)}</span>
          )}
        </span>
        <Boton
          chico
          tono="fantasma"
          onClick={() => {
            onCliente(null);
            onNombre("");
            setTexto("");
          }}
        >
          Quitar
        </Boton>
      </div>
    );
  }

  const abierto = escrito.length >= 2 && (sugerencias.length > 0 || puedeCrear);

  return (
    <div className="relative">
      <Campo
        etiqueta="Cliente"
        placeholder="Mostrador"
        ayuda={ayuda}
        value={nombre}
        onChange={(e) => {
          onNombre(e.target.value);
          setTexto(e.target.value);
        }}
      />

      {abierto && (
        <ul className="vidrio-menu absolute left-0 right-0 top-[62px] z-30 max-h-60 animate-entrar overflow-y-auto rounded-md py-1 shadow-elevada ring-1 ring-contraste/[0.07]">
          {sugerencias.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onCliente({ id: c.id, nombre: c.nombre, debe: c.debe });
                  onNombre(c.nombre);
                  setTexto("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors hover:bg-acento/[0.08]"
              >
                <span className="min-w-0">
                  <span className="block truncate">{c.nombre}</span>
                  <span className="block truncate text-chico text-tinta-suave">
                    {[c.telefono, c.ciudad].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {c.debe > 0 && (
                  <span className="shrink-0 text-chico text-aviso-texto">debe {plata(c.debe)}</span>
                )}
              </button>
            </li>
          ))}

          {puedeCrear && (
            <li className={sugerencias.length > 0 ? "mt-1 border-t border-linea pt-1" : undefined}>
              <button
                type="button"
                onClick={() => void crear()}
                disabled={creando}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-acento-texto transition-colors hover:bg-acento/[0.08] disabled:opacity-50"
              >
                <Icono nombre="mas" tamano={15} />
                <span className="min-w-0 truncate">
                  {creando ? "Agregando…" : `Agregar «${escrito}» como cliente nuevo`}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
