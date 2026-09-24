"use client";

import { useMemo, useState } from "react";
import { Marco } from "@/components/marco";
import {
  Boton,
  Buscador,
  Cargando,
  CuerpoTabla,
  EncabezadoTabla,
  Etiqueta,
  Hoja,
  Selector,
  Tabla,
  Vacio,
} from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { useDatos } from "@/lib/datos";
import { api, consulta, ErrorApi } from "@/lib/api";
import { cantidadEscrita, dia, fechaHora, leerNumero, numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Categoria, PlanillaRecuento, ResumenRecuento } from "@/lib/tipos";

/**
 * Contar la góndola y conciliar.
 *
 * Hasta ahora, si la estantería decía 37 y el sistema 40, había que entrar al
 * producto, ajustarlo y escribir un motivo — por cada diferencia. Con veinte
 * no lo hace nadie, y el stock se va quedando lejos de la realidad hasta que
 * deja de servir.
 *
 * Lo que se cuenta se escribe en la columna de la derecha y listo. La pantalla
 * no pide contar todo: lo que se deja vacío no se toca, así se puede contar
 * una categoría un día y otra al siguiente.
 */
export default function PaginaRecuento() {
  const avisos = useAvisos();

  const [categoriaId, setCategoriaId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [contado, setContado] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const { datos: categorias } = useDatos<Categoria[]>("/categorias");
  const { datos: planilla, cargando } = useDatos<PlanillaRecuento>(
    `/recuento/planilla${consulta({ categoria: categoriaId })}`
  );
  const { datos: historial, recargar: recargarHistorial } =
    useDatos<ResumenRecuento[]>("/recuento");

  const productos = useMemo(() => {
    const todos = planilla?.productos ?? [];
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return todos;
    return todos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(termino) ||
        (p.sku ?? "").toLowerCase().includes(termino)
    );
  }, [planilla, busqueda]);

  // Solo lo que alguien escribió. Un campo vacío no es "hay cero": es "esto
  // todavía no lo conté", y confundirlos pondría en cero medio depósito.
  //
  // El número se lee como se escribe acá: "1.200" son mil doscientos. Con
  // `Number` era 1,2 —el stock quedaba en 1— y cualquier cosa que no fuera un
  // número llegaba como cero. Lo que no se entiende no se manda.
  //
  // Va con lo que decía la planilla al contar (`esperado`): si mientras se
  // cuenta la caja sigue vendiendo, el servidor ajusta por la diferencia y no
  // pisa el stock, que borraría esas ventas.
  const lineas = useMemo(() => {
    const porId = new Map((planilla?.productos ?? []).map((p) => [p.id, p]));
    return Object.entries(contado)
      .filter(([, v]) => v.trim() !== "")
      .map(([productoId, v]) => ({
        productoId,
        contado: leerNumero(v),
        esperado: porId.get(productoId)?.esperado ?? null,
      }))
      .filter((l): l is { productoId: string; contado: number; esperado: number | null } =>
        l.contado !== null && Number.isInteger(l.contado) && l.contado >= 0
      );
  }, [contado, planilla]);

  // Lo escrito que no es un número entero: se marca para que se corrija.
  const malEscritos = useMemo(
    () =>
      Object.entries(contado).filter(([, v]) => {
        if (v.trim() === "") return false;
        const n = leerNumero(v);
        return n === null || !Number.isInteger(n) || n < 0;
      }).length,
    [contado]
  );

  const diferencias = useMemo(() => {
    const porId = new Map((planilla?.productos ?? []).map((p) => [p.id, p]));
    return lineas.filter((l) => {
      const p = porId.get(l.productoId);
      return p !== undefined && l.contado !== p.esperado;
    }).length;
  }, [lineas, planilla]);

  async function aplicar() {
    setGuardando(true);
    try {
      const r = await api.post<ResumenRecuento>("/recuento", {
        categoriaId: categoriaId || undefined,
        lineas,
      });

      avisos.exito(
        r.faltantes + r.sobrantes === 0
          ? `Recuento guardado: los ${numero(r.contados)} coincidían.`
          : `Recuento aplicado: ${numero(r.faltantes)} con faltante y ${numero(r.sobrantes)} con sobrante.`
      );
      setContado({});
      await recargarHistorial();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo aplicar el recuento.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Marco
      titulo="Recuento de stock"
      descripcion="Contá lo que hay en la estantería y el sistema se acomoda solo."
      acciones={
        <Boton
          tono="principal"
          icono="listo"
          onClick={() => void aplicar()}
          disabled={guardando || lineas.length === 0 || malEscritos > 0}
        >
          {guardando
            ? "Aplicando…"
            : lineas.length === 0
              ? "Aplicar recuento"
              : `Aplicar ${numero(lineas.length)} contados`}
        </Boton>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <span className="min-w-[220px] flex-1">
            <Buscador
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar el producto que estás contando"
            />
          </span>
          <Selector value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Todo el depósito</option>
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        </div>

        {malEscritos > 0 && (
          <p className="rounded-md border border-alerta-linea bg-alerta-fondo px-3 py-2 text-base text-alerta-texto">
            {malEscritos === 1
              ? "Hay una cantidad que no es un número entero. Corregila para poder aplicar."
              : `Hay ${numero(malEscritos)} cantidades que no son números enteros. Corregilas para poder aplicar.`}
          </p>
        )}

        {lineas.length > 0 && (
          <div className="hoja flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-base">
              Contaste <strong>{numero(lineas.length)}</strong> de{" "}
              {numero(planilla?.productos.length ?? 0)}.{" "}
              {diferencias === 0 ? (
                <span className="text-exito-texto">Hasta ahora coincide todo.</span>
              ) : (
                <span className="text-aviso-texto">
                  {numero(diferencias)} {diferencias === 1 ? "no coincide" : "no coinciden"}.
                </span>
              )}
            </span>
            <Boton onClick={() => setContado({})}>Empezar de nuevo</Boton>
          </div>
        )}

        {cargando && !planilla && <Cargando filas={8} />}

        {planilla && productos.length === 0 && (
          <Vacio titulo="Nada para contar" detalle="No hay productos activos con ese filtro." />
        )}

        {productos.length > 0 && (
          <div className="hoja p-0">
            <Tabla className="min-w-[680px]">
              <EncabezadoTabla>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Dice el sistema</th>
                  <th className="w-36 text-right">Contaste</th>
                  <th className="text-right">Diferencia</th>
                </tr>
              </EncabezadoTabla>
              <CuerpoTabla>
                {productos.map((p) => {
                  const escrito = contado[p.id] ?? "";
                  const hayValor = escrito.trim() !== "";
                  const diferencia = hayValor ? Number(escrito) - p.esperado : 0;

                  return (
                    <tr key={p.id} className="border-b border-linea last:border-0">
                      <td>
                        <span className="block truncate font-medium">{p.nombre}</span>
                        <span className="block truncate text-chico text-tinta-suave">
                          {[p.categoria, p.sku].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </td>
                      {/* Para un producto por peso, las dos columnas hablan en
                          GRAMOS, que es lo que espera el campo. Mostrar "5,5 kg"
                          al lado de un campo que pide gramos invita a escribir
                          5,5 y descontar cinco kilos de más: es el mismo factor
                          de mil que ya mordió en la caja. El kilo va abajo,
                          para poder leerlo. */}
                      <td className="whitespace-nowrap text-right text-tinta-suave">
                        <span className="cifra block">
                          {numero(p.esperado)}
                          {p.porPeso ? " g" : ""}
                        </span>
                        {p.porPeso && (
                          <span className="block text-chico text-tinta-tenue">
                            {cantidadEscrita(p.esperado, true)}
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <input
                          inputMode="numeric"
                          value={escrito}
                          onChange={(e) =>
                            setContado((previo) => ({
                              ...previo,
                              [p.id]: e.target.value.replace(/[^\d]/g, ""),
                            }))
                          }
                          placeholder={p.porPeso ? "gramos" : "unidades"}
                          aria-label={`Contado de ${p.nombre}`}
                          className="w-full min-w-0 rounded border border-linea-fuerte px-2 py-1.5 text-right text-base tabular-nums focus:border-acento focus:outline-none"
                        />
                      </td>
                      <td className="text-right">
                        {!hayValor ? (
                          <span className="text-tinta-tenue">—</span>
                        ) : diferencia === 0 ? (
                          <Etiqueta tono="exito">coincide</Etiqueta>
                        ) : (
                          <span
                            className={cn(
                              "cifra font-medium",
                              diferencia < 0 ? "text-alerta-texto" : "text-aviso-texto"
                            )}
                          >
                            {diferencia > 0 ? "+" : "−"}
                            {numero(Math.abs(diferencia))}
                            {p.porPeso ? " g" : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </CuerpoTabla>
            </Tabla>
          </div>
        )}

        <Hoja titulo="Recuentos anteriores" cuerpo="p-0">
          {!historial || historial.length === 0 ? (
            <p className="px-4 py-6 text-center text-base text-tinta-suave">
              Todavía no hiciste ninguno.
            </p>
          ) : (
            <ul>
              {historial.map((rec) => (
                <li
                  key={rec.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-3 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {dia(rec.fecha)}
                      {rec.categoria ? ` · ${rec.categoria}` : " · todo el depósito"}
                    </span>
                    <span className="block text-chico text-tinta-suave">
                      {numero(rec.contados)} contados · {numero(rec.coinciden)} coincidían
                      {rec.usuario ? ` · ${rec.usuario}` : ""} · {fechaHora(rec.creadoEn)}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {rec.faltantes > 0 && (
                      <Etiqueta tono="alerta">
                        {numero(rec.faltantes)} faltó {plata(rec.valorFaltante)}
                      </Etiqueta>
                    )}
                    {rec.sobrantes > 0 && (
                      <Etiqueta tono="aviso">
                        {numero(rec.sobrantes)} sobró {plata(rec.valorSobrante)}
                      </Etiqueta>
                    )}
                    {rec.faltantes === 0 && rec.sobrantes === 0 && (
                      <Etiqueta tono="exito">cuadró</Etiqueta>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Hoja>
      </div>
    </Marco>
  );
}
