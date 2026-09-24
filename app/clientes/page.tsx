"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCambioDeDireccion, useOlvidarAlta } from "@/lib/direccion";
import Link from "next/link";
import { Marco } from "@/components/marco";
import {
  Boton,
  Buscador,
  Cargando,
  Confirmar,
  CuerpoTabla,
  Dialogo,
  EncabezadoTabla,
  Etiqueta,
  Paginacion,
  Selector,
  Tabla,
  Vacio,
} from "@/components/ui";
import { Icono } from "@/components/iconos";
import { DialogoCuenta } from "./dialogo-cuenta";
import { useAvisos } from "@/components/avisos";
import { useDatos, useEspera } from "@/lib/datos";
import { api, consulta, ErrorApi } from "@/lib/api";
import { fecha, hace, numero, plata } from "@/lib/formato";
import type { Cliente, CompraCliente, Pagina } from "@/lib/tipos";
import { DialogoCliente } from "./dialogo-cliente";

export default function PaginaClientes() {
  return (
    <Suspense fallback={<Marco titulo="Clientes"><Cargando filas={6} /></Marco>}>
      <Agenda />
    </Suspense>
  );
}

function Agenda() {
  const avisos = useAvisos();
  const parametros = useSearchParams();

  // `?q=` y `?nuevo=1` llegan del buscador de todo el programa (Ctrl+K).
  const [busqueda, setBusqueda] = useState(parametros.get("q") ?? "");
  const [estado, setEstado] = useState("activos");
  const [pagina, setPagina] = useState(1);

  const [creando, setCreando] = useState(parametros.get("nuevo") === "1");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [viendo, setViendo] = useState<Cliente | null>(null);
  const [archivando, setArchivando] = useState<Cliente | null>(null);
  const [cobrando, setCobrando] = useState<Cliente | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const olvidarAlta = useOlvidarAlta();
  useCambioDeDireccion(parametros, (pedido) => {
    const q = pedido.get("q");
    if (q !== null) {
      setBusqueda(q);
      setPagina(1);
    }
    if (pedido.get("nuevo") === "1") setCreando(true);
  });

  const termino = useEspera(busqueda);

  const ruta = useMemo(
    () => `/clientes${consulta({ q: termino, estado, pagina, porPagina: 25 })}`,
    [termino, estado, pagina]
  );

  const { datos, cargando, recargar } = useDatos<Pagina<Cliente>>(ruta);


  const clientes = datos?.items ?? [];

  /** Cambiar un filtro vuelve a la primera página: la 7 ya no existe. */
  function filtrar(aplicar: () => void) {
    aplicar();
    setPagina(1);
  }

  async function archivar() {
    if (!archivando) return;
    setTrabajando(true);
    try {
      await api.borrar(`/clientes/${archivando.id}`);
      avisos.exito(`${archivando.nombre} se archivó.`);
      setArchivando(null);
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo archivar.");
    } finally {
      setTrabajando(false);
    }
  }

  async function restaurar(cliente: Cliente) {
    try {
      await api.post(`/clientes/${cliente.id}/restaurar`);
      avisos.exito(`${cliente.nombre} volvió a la agenda.`);
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo restaurar.");
    }
  }

  return (
    <Marco
      titulo="Clientes"
      descripcion="La agenda, con lo que compró cada uno."
      acciones={
        <Boton tono="principal" icono="mas" onClick={() => setCreando(true)}>
          Cliente nuevo
        </Boton>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          <Buscador
            placeholder="Buscar por nombre, teléfono o ciudad"
            value={busqueda}
            onChange={(e) => filtrar(() => setBusqueda(e.target.value))}
          />
          <Selector value={estado} onChange={(e) => filtrar(() => setEstado(e.target.value))} aria-label="Estado">
            <option value="activos">En la agenda</option>
            <option value="archivados">Archivados</option>
            <option value="todos">Todos</option>
          </Selector>
        </div>

        <div className="hoja overflow-hidden">
          {cargando && !datos ? (
            <Cargando filas={7} />
          ) : clientes.length === 0 ? (
            <Vacio
              titulo="No hay clientes que mostrar"
              detalle={
                termino
                  ? `Nada coincide con «${termino}».`
                  : "Agregá el primero, o enganchá una venta a un cliente desde la caja."
              }
              accion={
                !termino ? (
                  <Boton tono="principal" icono="mas" onClick={() => setCreando(true)}>
                    Cliente nuevo
                  </Boton>
                ) : undefined
              }
            />
          ) : (
            <>
              <Tabla className="min-w-[720px]">
                <EncabezadoTabla>
                  <tr>
                    <th>Cliente</th>
                    <th>Contacto</th>
                    <th className="text-right">Compras</th>
                    <th className="text-right">Gastado</th>
                    <th className="text-right">Debe</th>
                    <th>Última</th>
                    <th className="w-20" />
                  </tr>
                </EncabezadoTabla>

                <CuerpoTabla>
                  {clientes.map((cliente) => (
                    <tr key={cliente.id} className="transition-colors hover:bg-contraste/[0.02]">
                      <td className="max-w-[260px]">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left font-medium hover:underline"
                          onClick={() => setViendo(cliente)}
                        >
                          {cliente.nombre}
                        </button>
                        <span className="block truncate text-chico text-tinta-suave">
                          {[cliente.ciudad, cliente.razonSocial].filter(Boolean).join(" · ") || "—"}
                        </span>
                        {!cliente.activo && (
                          <Etiqueta tono="neutral" className="mt-1">
                            archivado
                          </Etiqueta>
                        )}
                      </td>
                      <td className="text-tinta-suave">
                        <span className="block">{cliente.telefono ?? "—"}</span>
                        {cliente.email && <span className="block text-chico">{cliente.email}</span>}
                      </td>
                      <td className="cifra text-right">{numero(cliente.compras)}</td>
                      <td className="cifra text-right font-medium">{plata(cliente.gastado)}</td>
                      <td className="text-right">
                        {cliente.debe > 0 ? (
                          <button
                            type="button"
                            title={`Cobrarle a ${cliente.nombre}`}
                            onClick={() => setCobrando(cliente)}
                            className="cifra font-medium text-aviso-texto underline decoration-aviso-linea underline-offset-4 transition-colors hover:text-tinta"
                          >
                            {plata(cliente.debe)}
                          </button>
                        ) : (
                          <span className="cifra text-tinta-tenue">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-tinta-suave">
                        {cliente.ultimaCompra ? hace(cliente.ultimaCompra) : "nunca"}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            title="Editar"
                            aria-label={`Editar ${cliente.nombre}`}
                            className="rounded p-1.5 text-tinta-suave transition-colors hover:bg-contraste/[0.05] hover:text-tinta"
                            onClick={() => setEditando(cliente)}
                          >
                            <Icono nombre="editar" tamano={16} />
                          </button>
                          {cliente.activo ? (
                            <button
                              type="button"
                              title="Archivar"
                              aria-label={`Archivar ${cliente.nombre}`}
                              className="rounded p-1.5 text-tinta-suave transition-colors hover:bg-contraste/[0.05] hover:text-alerta-texto"
                              onClick={() => setArchivando(cliente)}
                            >
                              <Icono nombre="borrar" tamano={16} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Restaurar"
                              aria-label={`Restaurar ${cliente.nombre}`}
                              className="rounded p-1.5 text-tinta-suave transition-colors hover:bg-contraste/[0.05] hover:text-tinta"
                              onClick={() => void restaurar(cliente)}
                            >
                              <Icono nombre="recargar" tamano={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </CuerpoTabla>
              </Tabla>

              <Paginacion
                pagina={datos!.pagina}
                porPagina={datos!.porPagina}
                total={datos!.total}
                onCambiar={setPagina}
              />
            </>
          )}
        </div>
      </div>

      {(creando || editando !== null) && (
        <DialogoCliente
          key={editando?.id ?? "nuevo"}
          abierto
          cliente={editando}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
            olvidarAlta();
          }}
          onGuardado={() => void recargar()}
        />
      )}

      <FichaCliente
        cliente={viendo}
        onCerrar={() => setViendo(null)}
        onEditar={(cliente) => {
          setViendo(null);
          setEditando(cliente);
        }}
      />

      <DialogoCuenta
        cliente={cobrando}
        onCerrar={() => setCobrando(null)}
        onCobrado={() => void recargar()}
      />

      <Confirmar
        abierto={archivando !== null}
        titulo="Archivar cliente"
        detalle={
          archivando
            ? `${archivando.nombre} deja de aparecer en la agenda y en el buscador de la caja. Sus compras se conservan y se puede restaurar cuando quieras.`
            : ""
        }
        confirmar="Archivar"
        peligroso
        trabajando={trabajando}
        onCerrar={() => setArchivando(null)}
        onConfirmar={() => void archivar()}
      />
    </Marco>
  );
}

/** La ficha: los datos de contacto y todo lo que compró. */
function FichaCliente({
  cliente,
  onCerrar,
  onEditar,
}: {
  cliente: Cliente | null;
  onCerrar: () => void;
  onEditar: (cliente: Cliente) => void;
}) {
  const { datos: compras, cargando } = useDatos<CompraCliente[]>(
    cliente ? `/clientes/${cliente.id}/compras` : null
  );

  if (!cliente) return null;

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo={cliente.nombre}
      descripcion={[cliente.ciudad, cliente.telefono].filter(Boolean).join(" · ")}
      pie={
        <>
          <Boton onClick={onCerrar}>Cerrar</Boton>
          <Boton tono="principal" icono="editar" onClick={() => onEditar(cliente)}>
            Editar
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-linea px-3 py-2">
            <p className="etiqueta-campo">Compras</p>
            <p className="cifra font-titulo text-titulo">{numero(cliente.compras)}</p>
          </div>
          <div className="rounded-md border border-linea px-3 py-2">
            <p className="etiqueta-campo">Gastado</p>
            <p className="cifra font-titulo text-titulo">{plata(cliente.gastado)}</p>
          </div>
          <div className="rounded-md border border-linea px-3 py-2">
            <p className="etiqueta-campo">Última</p>
            <p className="font-titulo text-titulo">
              {cliente.ultimaCompra ? fecha(cliente.ultimaCompra) : "—"}
            </p>
          </div>
        </div>

        {(cliente.direccion || cliente.email || cliente.dniCuit || cliente.razonSocial) && (
          <dl className="grid gap-1.5 rounded-md border border-linea bg-lienzo px-3 py-2.5 text-base">
            {cliente.razonSocial && <Dato rotulo="Razón social" valor={cliente.razonSocial} />}
            {cliente.dniCuit && <Dato rotulo="DNI / CUIT" valor={cliente.dniCuit} />}
            {cliente.direccion && <Dato rotulo="Dirección" valor={cliente.direccion} />}
            {cliente.email && <Dato rotulo="Correo" valor={cliente.email} />}
          </dl>
        )}

        {cliente.notas && (
          <p className="rounded border border-linea px-3 py-2 text-base text-tinta-media">
            {cliente.notas}
          </p>
        )}

        <div>
          <p className="etiqueta-campo mb-2">Compras</p>
          {cargando && <Cargando filas={3} />}
          {compras && compras.length === 0 && (
            <p className="rounded border border-linea px-3 py-6 text-center text-base text-tinta-suave">
              Todavía no le vendiste nada.
            </p>
          )}
          {compras && compras.length > 0 && (
            <ul className="rounded-md border border-linea">
              {compras.map((compra) => (
                <li
                  key={compra.id}
                  className="flex items-center justify-between gap-3 border-b border-linea px-3 py-2 last:border-0"
                >
                  <span className="min-w-0">
                    <Link href={`/comprobante?venta=${compra.id}`} className="font-medium hover:underline">
                      #{compra.numero}
                    </Link>
                    <span className="block text-chico text-tinta-suave">
                      {fecha(compra.creadoEn)} · {numero(compra.renglones)} renglones · {compra.estado}
                    </span>
                  </span>
                  <span className="cifra shrink-0 font-medium">{plata(compra.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialogo>
  );
}

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-tinta-suave">{rotulo}</dt>
      <dd className="text-right">{valor}</dd>
    </div>
  );
}
