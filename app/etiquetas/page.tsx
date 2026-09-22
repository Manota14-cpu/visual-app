"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Marco } from "@/components/marco";
import { Aviso, Boton, Campo, Dialogo, Hoja, Selector, Vacio } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { useDatos } from "@/lib/datos";
import { api, consulta } from "@/lib/api";
import { numero, plata } from "@/lib/formato";
import { barrasDe, sePuedeDibujar } from "@/lib/codigo-barras";
import type { Categoria, PlanillaRecuento } from "@/lib/tipos";
import { BuscadorProductos } from "../caja/buscador-productos";

/**
 * Etiquetas para pegarle a la mercadería propia.
 *
 * Un negocio que hace sus productos —el pan, las facturas, la torta— no tiene
 * código de fábrica para pegarles, así que el lector del mostrador no sirve
 * para la mitad del catálogo y hay que buscar todo tecleando.
 *
 * La hoja se arma en pantalla y se imprime con el navegador: no hay que
 * instalar nada ni configurar una impresora especial. Sale en cualquier
 * impresora común, en hoja A4.
 */

interface Renglon {
  id: string;
  nombre: string;
  precio: number;
  codigo: string;
  cantidad: number;
}

/** El código que el programa le daría a un producto que no tiene ninguno. */
interface Propuesta {
  id: string;
  nombre: string;
  sku: string;
}

/** Cuántas de las propuestas se muestran antes de aplicarlas. */
const MUESTRA = 8;

/** Cuántas etiquetas entran a lo ancho de una hoja A4. */
const POR_FILA = 3;

export default function PaginaEtiquetas() {
  const avisos = useAvisos();
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [categoriaId, setCategoriaId] = useState("");

  const { datos: categorias } = useDatos<Categoria[]>("/categorias");
  const { datos: planilla, recargar: recargarPlanilla } = useDatos<PlanillaRecuento>(
    categoriaId ? `/recuento/planilla${consulta({ categoria: categoriaId })}` : null
  );

  const total = useMemo(() => renglones.reduce((s, r) => s + r.cantidad, 0), [renglones]);

  // Los productos que no tienen con qué imprimirse, con el código que el
  // programa les daría. Lo normal en un negocio que recién empieza es que no
  // tenga ninguno cargado, y la pantalla entera quedaba inservible hasta
  // inventarle un SKU a cada producto a mano.
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null);
  const [generando, setGenerando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const buscarPropuestas = useCallback(async () => {
    try {
      setPropuestas(
        await api.post<Propuesta[]>("/productos/skus/proponer", { soloSinCodigo: true })
      );
    } catch {
      setPropuestas([]);
    }
  }, []);

  useEffect(() => {
    // Igual que `useDatos`: ir a buscar al servidor algo que no se puede
    // derivar de nada que ya esté en pantalla. Es un POST solo porque la
    // ruta, que también usa Productos, recibe una lista.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscarPropuestas();
  }, [buscarPropuestas]);

  async function aplicarPropuestas() {
    if (!propuestas?.length) return;
    setAplicando(true);
    try {
      const { aplicados } = await api.post<{ aplicados: number }>("/productos/skus/aplicar", {
        asignaciones: propuestas.map((p) => ({ id: p.id, sku: p.sku })),
      });
      avisos.exito(
        `${numero(aplicados)} ${aplicados === 1 ? "producto ya tiene" : "productos ya tienen"} código.`
      );
      setGenerando(false);
      await Promise.all([buscarPropuestas(), recargarPlanilla()]);
    } catch (e) {
      avisos.error(e instanceof Error ? e.message : "No se pudieron guardar los códigos.");
    } finally {
      setAplicando(false);
    }
  }

  function agregar(p: {
    id: string;
    nombre: string;
    precio: number;
    sku: string | null;
    codigoBarras: string | null;
  }) {
    // El de fábrica primero: si el producto ya trae uno, imprimir el SKU
    // interno dejaría dos códigos distintos para la misma cosa. Sin ninguno de
    // los dos no hay nada que dibujar.
    const codigo = p.codigoBarras ?? p.sku ?? "";
    if (!codigo) {
      avisos.error(
        propuestas?.some((x) => x.id === p.id)
          ? `"${p.nombre}" no tiene código. Tocá "Generar códigos", arriba.`
          : `"${p.nombre}" no tiene código ni SKU. Cargáselo en Productos.`
      );
      return;
    }
    if (!sePuedeDibujar(codigo)) {
      avisos.error(`El código de "${p.nombre}" tiene caracteres que no se pueden imprimir.`);
      return;
    }

    setRenglones((previos) =>
      previos.some((r) => r.id === p.id)
        ? previos.map((r) => (r.id === p.id ? { ...r, cantidad: r.cantidad + 1 } : r))
        : [...previos, { id: p.id, nombre: p.nombre, precio: p.precio, codigo, cantidad: 1 }]
    );
  }

  function agregarCategoria() {
    const productos = planilla?.productos ?? [];
    let sinCodigo = 0;

    for (const p of productos) {
      const codigo = p.codigoBarras ?? p.sku ?? "";
      if (!codigo || !sePuedeDibujar(codigo)) {
        sinCodigo++;
        continue;
      }
      setRenglones((previos) =>
        previos.some((r) => r.id === p.id)
          ? previos
          : [...previos, { id: p.id, nombre: p.nombre, precio: p.precio, codigo, cantidad: 1 }]
      );
    }

    if (sinCodigo > 0) {
      avisos.error(
        `${numero(sinCodigo)} ${sinCodigo === 1 ? "producto quedó" : "productos quedaron"} afuera por no tener código ni SKU.`
      );
    }
  }

  // La hoja: cada renglón repetido tantas veces como etiquetas se pidieron.
  const etiquetas = useMemo(
    () => renglones.flatMap((r) => Array.from({ length: r.cantidad }, () => r)),
    [renglones]
  );

  return (
    <Marco
      titulo="Etiquetas"
      descripcion="Imprimí etiquetas con código de barras para lo que hacés vos."
      acciones={
        <Boton
          tono="principal"
          icono="imprimir"
          onClick={() => window.print()}
          disabled={etiquetas.length === 0}
        >
          Imprimir {etiquetas.length > 0 ? numero(etiquetas.length) : ""}
        </Boton>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="sin-imprimir flex flex-col gap-4">
          {propuestas && propuestas.length > 0 && (
            <Aviso tono="dato">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1">
                  <span className="font-medium">
                    {numero(propuestas.length)}{" "}
                    {propuestas.length === 1
                      ? "producto no tiene código"
                      : "productos no tienen código"}
                  </span>{" "}
                  para imprimir. El programa les puede dar uno interno, como{" "}
                  <span className="cifra">{propuestas[0]!.sku}</span>, y quedan listos para
                  etiquetar y para pasar por el lector.
                </p>
                <Boton tono="principal" chico onClick={() => setGenerando(true)}>
                  Generar códigos
                </Boton>
              </div>
            </Aviso>
          )}

          <Hoja titulo="Qué imprimir">
            <div className="flex flex-col gap-4">
              <BuscadorProductos onElegir={agregar} />

              <div className="flex flex-wrap items-end gap-2">
                <span className="min-w-[200px] flex-1">
                  <Selector
                    etiqueta="O toda una categoría"
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(e.target.value)}
                  >
                    <option value="">Elegí una…</option>
                    {(categorias ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Selector>
                </span>
                <Boton onClick={agregarCategoria} disabled={!planilla}>
                  Agregar la categoría
                </Boton>
              </div>
            </div>
          </Hoja>

          {renglones.length > 0 && (
            <Hoja
              titulo={`${numero(total)} ${total === 1 ? "etiqueta" : "etiquetas"}`}
              cuerpo="p-0"
              accion={<Boton chico onClick={() => setRenglones([])}>Vaciar</Boton>}
            >
              <ul>
                {renglones.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-2.5 last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.nombre}</span>
                      <span className="cifra block truncate text-chico text-tinta-suave">
                        {r.codigo}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Campo
                        aria-label={`Cuántas de ${r.nombre}`}
                        inputMode="numeric"
                        value={String(r.cantidad)}
                        onChange={(e) =>
                          setRenglones((previos) =>
                            previos.map((x) =>
                              x.id === r.id
                                ? { ...x, cantidad: Math.max(1, Number(e.target.value) || 1) }
                                : x
                            )
                          )
                        }
                        className="w-20 text-right"
                      />
                      <Boton
                        chico
                        icono="cerrar"
                        onClick={() => setRenglones((p) => p.filter((x) => x.id !== r.id))}
                      >
                        Sacar
                      </Boton>
                    </span>
                  </li>
                ))}
              </ul>
            </Hoja>
          )}

          {renglones.length === 0 && (
            <Vacio
              titulo="Sin etiquetas"
              detalle="Buscá el producto o elegí una categoría entera. Sale con el código de fábrica si lo tiene, o con el SKU."
            />
          )}
        </div>

        {etiquetas.length > 0 && (
          <div className="hoja p-4 sin-borde-al-imprimir">
            <p className="sin-imprimir etiqueta-campo mb-3">Así va a salir</p>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${POR_FILA}, minmax(0, 1fr))` }}
            >
              {etiquetas.map((e, i) => (
                <EtiquetaImpresa key={`${e.id}-${i}`} renglon={e} />
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialogo
        abierto={generando}
        onCerrar={() => setGenerando(false)}
        titulo="Generar códigos"
        descripcion="Salen de la categoría y el nombre. Se pueden cambiar después, desde Productos."
        ancho="max-w-lg"
        pie={
          <>
            <Boton onClick={() => setGenerando(false)} disabled={aplicando}>
              Cancelar
            </Boton>
            <Boton tono="principal" onClick={() => void aplicarPropuestas()} disabled={aplicando}>
              {aplicando
                ? "Guardando…"
                : `Dar código a ${numero(propuestas?.length ?? 0)}`}
            </Boton>
          </>
        }
      >
        <ul className="-my-1">
          {(propuestas ?? []).slice(0, MUESTRA).map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 border-b border-linea py-2 last:border-0"
            >
              <span className="min-w-0 truncate">{p.nombre}</span>
              <span className="cifra shrink-0 font-medium text-acento-texto">{p.sku}</span>
            </li>
          ))}
        </ul>
        {(propuestas?.length ?? 0) > MUESTRA && (
          <p className="mt-2 text-chico text-tinta-suave">
            Y {numero(propuestas!.length - MUESTRA)} más, con el mismo criterio.
          </p>
        )}
        <p className="mt-3 text-chico text-tinta-suave">
          Los que ya traen código de fábrica no se tocan: se imprimen con ese.
        </p>
      </Dialogo>
    </Marco>
  );
}

/** Una etiqueta: el nombre, el precio, las barras y el código escrito. */
function EtiquetaImpresa({ renglon }: { renglon: Renglon }) {
  const barras = useMemo(() => {
    try {
      return barrasDe(renglon.codigo);
    } catch {
      return null;
    }
  }, [renglon.codigo]);

  if (!barras) return null;

  const ancho = barras.reduce((s, n) => s + n, 0);
  const alto = 30;

  // Se dibuja una barra sí y una no, empezando por barra. Cada una arranca
  // donde terminó la anterior, así que la posición sale de sumar lo que vino
  // antes. El `viewBox` hace que ocupe lo que le den sin deformarse.
  const rectangulos = barras.reduce<{ x: number; ancho: number }[]>((acumulado, modulos, i) => {
    const desde = barras.slice(0, i).reduce((s, n) => s + n, 0);
    return i % 2 === 0 ? [...acumulado, { x: desde, ancho: modulos }] : acumulado;
  }, []);

  return (
    <div className="flex break-inside-avoid flex-col items-center gap-1 rounded border border-linea px-2 py-2 text-center">
      <span className="line-clamp-2 text-chico font-medium leading-tight">{renglon.nombre}</span>
      {renglon.precio > 0 && (
        <span className="cifra font-titulo text-medio font-semibold leading-none">
          {plata(renglon.precio)}
        </span>
      )}
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="none"
        className="h-9 w-full"
        role="img"
        aria-label={`Código de barras ${renglon.codigo}`}
      >
        {rectangulos.map((r) => (
          <rect key={r.x} x={r.x} y={0} width={r.ancho} height={alto} fill="#000000" />
        ))}
      </svg>
      <span className="cifra text-micro tracking-wide text-tinta-suave">{renglon.codigo}</span>
    </div>
  );
}
