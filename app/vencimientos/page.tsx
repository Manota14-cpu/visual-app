"use client";

import { useState } from "react";
import { Marco } from "@/components/marco";
import {
  Area,
  Boton,
  Campo,
  Cargando,
  Dialogo,
  Etiqueta,
  Hoja,
  Selector,
  Vacio,
} from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { useDatos } from "@/lib/datos";
import { api, ErrorApi } from "@/lib/api";
import { cantidadEscrita, dia, numero } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { BuscadorProductos } from "../caja/buscador-productos";

/**
 * Qué se vence y cuándo.
 *
 * En una panadería o un kiosco esto es plata que se va a la basura si nadie la
 * mira a tiempo. La lista va de lo que vence primero a lo que vence último,
 * que es el único orden que sirve: lo que importa es lo de mañana.
 */

interface Partida {
  id: string;
  productoId: string;
  nombre: string;
  fecha: string;
  cantidad: number;
  porPeso: boolean;
  notas: string | null;
  usuario: string | null;
  /** Negativo si ya se venció. */
  dias: number;
  stock: number | null;
}

export default function PaginaVencimientos() {
  const avisos = useAvisos();
  const [estado, setEstado] = useState("todos");
  const [cargandoPartida, setCargandoPartida] = useState(false);
  const [tirando, setTirando] = useState<Partida | null>(null);

  const { datos, cargando, recargar } = useDatos<{
    items: Partida[];
    vencidos: number;
    porVencer: number;
  }>(`/vencimientos${estado === "urgentes" ? "?estado=urgentes" : ""}`);

  async function sacar(p: Partida) {
    try {
      await api.borrar(`/vencimientos/${p.id}`);
      avisos.exito("Partida sacada de la lista. El stock quedó como estaba.");
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo.");
    }
  }

  return (
    <Marco
      titulo="Vencimientos"
      descripcion="Lo que se vence, para sacarlo antes de tener que tirarlo."
      acciones={
        <Boton tono="principal" icono="mas" onClick={() => setCargandoPartida(true)}>
          Anotar vencimiento
        </Boton>
      }
    >
      <div className="flex flex-col gap-4">
        {datos && (datos.vencidos > 0 || datos.porVencer > 0) && (
          <div className="flex flex-wrap gap-2">
            {datos.vencidos > 0 && (
              <Etiqueta tono="alerta">
                {numero(datos.vencidos)} {datos.vencidos === 1 ? "vencido" : "vencidos"}
              </Etiqueta>
            )}
            {datos.porVencer > 0 && (
              <Etiqueta tono="aviso">
                {numero(datos.porVencer)} {datos.porVencer === 1 ? "por vencer" : "por vencer"}
              </Etiqueta>
            )}
          </div>
        )}

        <Selector value={estado} onChange={(e) => setEstado(e.target.value)} contenedor="max-w-xs">
          <option value="todos">Todo</option>
          <option value="urgentes">Solo lo urgente</option>
        </Selector>

        {cargando && !datos && <Cargando filas={6} />}

        {datos && datos.items.length === 0 && (
          <Vacio
            titulo="Nada anotado"
            detalle="Anotá la fecha de lo que se vence y el programa te avisa antes."
          />
        )}

        {datos && datos.items.length > 0 && (
          <Hoja titulo="Partidas" cuerpo="p-0">
            <ul>
              {datos.items.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-3 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{p.nombre}</span>
                      <Cuando dias={p.dias} />
                    </span>
                    <span className="mt-0.5 block truncate text-chico text-tinta-suave">
                      {cantidadEscrita(p.cantidad, p.porPeso)} · vence {dia(p.fecha)}
                      {p.stock !== null ? ` · quedan ${cantidadEscrita(p.stock, p.porPeso)}` : ""}
                      {p.notas ? ` · ${p.notas}` : ""}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-wrap gap-1.5">
                    <Boton chico tono="peligro" icono="borrar" onClick={() => setTirando(p)}>
                      Tirar
                    </Boton>
                    <Boton chico onClick={() => void sacar(p)}>
                      Se vendió
                    </Boton>
                  </span>
                </li>
              ))}
            </ul>
          </Hoja>
        )}
      </div>

      {cargandoPartida && (
        <DialogoPartida
          onCerrar={() => setCargandoPartida(false)}
          onGuardada={async () => {
            setCargandoPartida(false);
            await recargar();
          }}
        />
      )}

      {tirando && (
        <DialogoTirar
          partida={tirando}
          onCerrar={() => setTirando(null)}
          onTirada={async () => {
            setTirando(null);
            await recargar();
          }}
        />
      )}
    </Marco>
  );
}

/** Cuánto falta, dicho como lo diría una persona. */
function Cuando({ dias }: { dias: number }) {
  if (dias < 0) {
    return (
      <Etiqueta tono="alerta">
        vencido hace {numero(Math.abs(dias))} {Math.abs(dias) === 1 ? "día" : "días"}
      </Etiqueta>
    );
  }
  if (dias === 0) return <Etiqueta tono="alerta">vence hoy</Etiqueta>;
  if (dias === 1) return <Etiqueta tono="aviso">vence mañana</Etiqueta>;
  if (dias <= 7) return <Etiqueta tono="aviso">en {numero(dias)} días</Etiqueta>;
  return <Etiqueta tono="neutral">en {numero(dias)} días</Etiqueta>;
}

function DialogoPartida({
  onCerrar,
  onGuardada,
}: {
  onCerrar: () => void;
  onGuardada: () => Promise<void>;
}) {
  const avisos = useAvisos();
  const [producto, setProducto] = useState<{
    id: string;
    nombre: string;
    porPeso: boolean;
  } | null>(null);
  const [fecha, setFecha] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await api.post("/vencimientos", {
        productoId: producto?.id,
        fecha,
        cantidad: Number(cantidad),
        notas,
      });
      avisos.exito("Anotado.");
      await onGuardada();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo anotar.");
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto
      titulo="Anotar vencimiento"
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton
            tono="principal"
            onClick={() => void guardar()}
            disabled={guardando || !producto || !fecha || Number(cantidad) <= 0}
          >
            {guardando ? "Guardando…" : "Anotar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {producto ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-linea bg-lienzo px-3 py-2.5">
            <span className="truncate font-medium">{producto.nombre}</span>
            <Boton chico onClick={() => setProducto(null)}>
              Cambiar
            </Boton>
          </div>
        ) : (
          <BuscadorProductos
            autoFocus
            onElegir={(p) => setProducto({ id: p.id, nombre: p.nombre, porPeso: p.porPeso })}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Vence el"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          <Campo
            etiqueta={producto?.porPeso ? "Cuántos gramos" : "Cuántas unidades"}
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ""))}
          />
        </div>

        <Area
          etiqueta="Notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          ayuda="El lote, dónde está guardado, lo que sirva para encontrarlo."
        />
      </div>
    </Dialogo>
  );
}

/**
 * Tirar lo vencido.
 *
 * Descuenta el stock, porque es lo que pasó: si alguien tira la leche y el
 * sistema sigue creyendo que está en la heladera, el problema es el mismo de
 * antes pero al revés.
 */
function DialogoTirar({
  partida,
  onCerrar,
  onTirada,
}: {
  partida: Partida;
  onCerrar: () => void;
  onTirada: () => Promise<void>;
}) {
  const avisos = useAvisos();
  const [cantidad, setCantidad] = useState(String(partida.cantidad));
  const [guardando, setGuardando] = useState(false);

  async function tirar() {
    setGuardando(true);
    try {
      await api.post(`/vencimientos/${partida.id}/tirar`, { cantidad: Number(cantidad) });
      avisos.exito("Dado de baja. El stock quedó actualizado.");
      await onTirada();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo.");
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto
      titulo={`Tirar ${partida.nombre}`}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton
            tono="peligro"
            onClick={() => void tirar()}
            disabled={guardando || Number(cantidad) <= 0}
          >
            {guardando ? "Dando de baja…" : "Dar de baja"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base text-tinta-suave">
          Se descuenta del stock y queda el movimiento, igual que cualquier salida.
        </p>
        <Campo
          etiqueta={partida.porPeso ? "Cuántos gramos tirás" : "Cuántas unidades tirás"}
          inputMode="numeric"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ""))}
          autoFocus
          ayuda={`La partida tiene ${cantidadEscrita(partida.cantidad, partida.porPeso)}.`}
        />
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-base",
            "border-aviso-linea bg-aviso-fondo text-aviso-texto"
          )}
        >
          Si tirás menos de lo que tiene la partida, queda el resto anotado.
        </p>
      </div>
    </Dialogo>
  );
}
