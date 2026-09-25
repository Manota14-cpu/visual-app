"use client";

import { useState } from "react";
import { Boton, Campo, Casilla, Hoja, Selector } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { cantidadEscrita, plata } from "@/lib/formato";
import { useSesion } from "@/lib/sesion";
import type { ConfigBalanza, PermisosEmpleados } from "@/lib/tipos";

const BALANZA_INICIAL: ConfigBalanza = { activa: true, prefijo: "20", digitosPlu: 5, contenido: "importe" };

interface Prueba {
  ok: boolean;
  mensaje?: string;
  plu?: number;
  valor?: number;
  contenido?: "importe" | "peso";
  producto?: { nombre: string; precio: number } | null;
  cantidad?: number | null;
  aviso?: string | null;
}

/**
 * Cómo leer las etiquetas de la balanza.
 *
 * Cada marca reparte los dígitos a su manera y nadie se sabe el formato de
 * memoria. Por eso la tarjeta tiene un campo para escanear una etiqueta de
 * verdad: muestra qué producto y qué importe entendió, y se ajustan los largos
 * hasta que coincida con lo que dice el papel.
 */
export function Balanza({ config, onGuardado }: { config?: ConfigBalanza; onGuardado: () => void }) {
  const avisos = useAvisos();
  const [balanza, setBalanza] = useState<ConfigBalanza>(config ?? BALANZA_INICIAL);
  const [etiqueta, setEtiqueta] = useState("");
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = (cambios: Partial<ConfigBalanza>) => {
    setBalanza((b) => ({ ...b, ...cambios }));
    setPrueba(null);
  };

  const digitosValor = 12 - balanza.prefijo.length - balanza.digitosPlu;

  async function probar() {
    try {
      setPrueba(await api.post<Prueba>("/sistema/balanza/probar", { codigo: etiqueta.trim(), balanza }));
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo probar la etiqueta.");
    }
  }

  async function guardar() {
    setGuardando(true);
    try {
      await api.put("/sistema/mostrador", { balanza });
      avisos.exito("Balanza guardada.");
      onGuardado();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja titulo="Balanza">
      <div className="flex flex-col gap-4">
        <p className="text-base text-tinta-suave">
          Para cobrar el fiambre, el queso o la verdura escaneando la etiqueta que imprime la balanza.
          En cada producto de la balanza poné como <strong className="font-medium text-tinta">código interno</strong>{" "}
          el mismo número que tiene en la balanza (el PLU), y marcalo como que se vende por peso.
        </p>

        <Casilla
          etiqueta="Leer las etiquetas de la balanza en la caja"
          checked={balanza.activa}
          onChange={(e) => cambiar({ activa: e.target.checked })}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo
            etiqueta="Empieza con"
            inputMode="numeric"
            maxLength={2}
            value={balanza.prefijo}
            onChange={(e) => cambiar({ prefijo: e.target.value.replace(/\D/g, "") })}
            ayuda="Casi siempre 20 o 2."
          />
          <Selector
            etiqueta="Dígitos del PLU"
            value={balanza.digitosPlu}
            onChange={(e) => cambiar({ digitosPlu: Number(e.target.value) })}
          >
            {[4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Selector>
          <Selector
            etiqueta="El resto es"
            value={balanza.contenido}
            onChange={(e) => cambiar({ contenido: e.target.value as ConfigBalanza["contenido"] })}
            ayuda={digitosValor > 0 ? `${digitosValor} dígitos` : undefined}
          >
            <option value="importe">El importe en pesos</option>
            <option value="peso">El peso en gramos</option>
          </Selector>
        </div>

        <div className="rounded-md border border-dashed border-linea-fuerte p-3">
          <p className="etiqueta-campo mb-2">Probar con una etiqueta</p>
          <form
            className="flex flex-wrap items-end gap-2"
            // data-lector: el lector de la caja no escucha acá, este campo
            // recibe la lectura como un teclado común.
            data-lector="propio"
            onSubmit={(e) => {
              e.preventDefault();
              void probar();
            }}
          >
            <Campo
              contenedor="min-w-[200px] flex-1"
              inputMode="numeric"
              placeholder="Escaneá una etiqueta de la balanza"
              value={etiqueta}
              onChange={(e) => {
                setEtiqueta(e.target.value);
                setPrueba(null);
              }}
            />
            <Boton type="submit" disabled={etiqueta.trim().length === 0}>
              Probar
            </Boton>
          </form>

          {prueba && (
            <div className="mt-3 text-base">
              {!prueba.ok ? (
                <p className="text-alerta-texto">{prueba.mensaje}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  <p>
                    Producto <span className="cifra font-medium">{prueba.plu}</span>
                    {prueba.producto ? (
                      <>
                        : <span className="font-medium">{prueba.producto.nombre}</span>
                      </>
                    ) : null}
                    {" · "}
                    {prueba.contenido === "peso" ? (
                      <span className="cifra">{cantidadEscrita(prueba.valor ?? 0, true)}</span>
                    ) : (
                      <span className="cifra">{plata(prueba.valor ?? 0)}</span>
                    )}
                    {prueba.cantidad != null && prueba.contenido === "importe" && (
                      <span className="text-tinta-suave"> ({cantidadEscrita(prueba.cantidad, true)})</span>
                    )}
                  </p>
                  {prueba.aviso && <p className="text-chico text-aviso-texto">{prueba.aviso}</p>}
                  <p className="text-chico text-tinta-suave">
                    Si no coincide con lo que dice el papel, cambiá los dígitos de arriba y probá de nuevo.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <Boton tono="principal" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

const MINUTOS = [0, 2, 5, 10, 15, 30, 60];

/**
 * Lo que pueden hacer los empleados y cuándo se bloquea la pantalla.
 *
 * Los permisos arrancan apagados: un descuento o una venta anulada es plata
 * que sale del negocio, y eso lo decide el dueño.
 */
export function PermisosYBloqueo({
  empleados,
  bloqueoMinutos,
  onGuardado,
}: {
  empleados?: PermisosEmpleados;
  bloqueoMinutos?: number;
  onGuardado: () => void;
}) {
  const avisos = useAvisos();
  const { exigeIngreso, refrescar } = useSesion();
  const [permisos, setPermisos] = useState<PermisosEmpleados>(
    empleados ?? { descuentos: false, anularVentas: false }
  );
  const [minutos, setMinutos] = useState(bloqueoMinutos ?? 10);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await api.put("/sistema/mostrador", { empleados: permisos, bloqueoMinutos: minutos });
      avisos.exito("Guardado.");
      onGuardado();
      // La sesión guarda una copia de esto para cada pantalla.
      await refrescar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja titulo="Empleados y bloqueo">
      <div className="flex flex-col gap-4">
        {!exigeIngreso && (
          <p className="rounded border border-linea bg-lienzo px-3 py-2 text-chico text-tinta-suave">
            Esto empieza a valer cuando haya usuarios creados: sin contraseña, todos entran como dueño.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <p className="etiqueta-campo">Los empleados pueden</p>
          <Casilla
            etiqueta={
              <>
                Hacer descuentos al cobrar
                <span className="block text-chico text-tinta-suave">
                  Apagado, cobran siempre el precio de lista.
                </span>
              </>
            }
            checked={permisos.descuentos}
            onChange={(e) => setPermisos((p) => ({ ...p, descuentos: e.target.checked }))}
          />
          <Casilla
            etiqueta={
              <>
                Anular y reabrir ventas
                <span className="block text-chico text-tinta-suave">
                  Anular devuelve el stock y saca la venta de la caja. Editar o borrar una venta sigue siendo
                  solo tuyo.
                </span>
              </>
            }
            checked={permisos.anularVentas}
            onChange={(e) => setPermisos((p) => ({ ...p, anularVentas: e.target.checked }))}
          />
        </div>

        <Selector
          etiqueta="Bloquear la pantalla sin uso"
          value={minutos}
          onChange={(e) => setMinutos(Number(e.target.value))}
          ayuda="Pide la contraseña de nuevo. Lo que estaba abierto, como el carrito, sigue ahí."
        >
          {MINUTOS.map((m) => (
            <option key={m} value={m}>
              {m === 0 ? "Nunca" : `A los ${m} minutos`}
            </option>
          ))}
        </Selector>

        <div>
          <Boton tono="principal" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}
