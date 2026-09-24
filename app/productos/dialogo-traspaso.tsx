"use client";

import { useRef, useState } from "react";
import { Aviso, Boton, Dialogo, Etiqueta } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { descargarTexto } from "@/lib/descargar";
import { numero, plata } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type {
  Exportacion,
  FilaImportada,
  PlanImportacion,
  ResultadoImportacion,
} from "@/lib/tipos";

/**
 * Sacar el catálogo a una planilla y volver a meterlo.
 *
 * Para mudarse a otra computadora, para cargar por primera vez una lista que ya
 * estaba en Excel, o para corregir doscientos precios sentado en una planilla.
 *
 * Nada se aplica sin verse antes. Un archivo de trescientas filas que entra
 * solo es una forma cara de romper un catálogo: primero se muestra fila por
 * fila qué va a pasar, y recién después aparece el botón.
 */
export function DialogoTraspaso({
  onCerrar,
  onImportado,
}: {
  onCerrar: () => void;
  onImportado: () => void;
}) {
  const avisos = useAvisos();
  const archivo = useRef<HTMLInputElement>(null);

  const [texto, setTexto] = useState<string | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [plan, setPlan] = useState<PlanImportacion | null>(null);
  const [crearFaltantes, setCrearFaltantes] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [exportando, setExportando] = useState(false);

  /**
   * Baja el archivo.
   *
   * El servidor arma el texto y el navegador lo guarda: no hace falta que el
   * programa escriba en el disco del usuario ni que le pregunte dónde. El
   * archivo cae en Descargas, como cualquier otro.
   */
  async function exportar(todos: boolean) {
    setExportando(true);
    try {
      const r = await api.get<Exportacion>(`/catalogo/exportar${todos ? "?todos=si" : ""}`);
      descargarTexto(r.nombre, r.contenido);

      avisos.exito(`${numero(r.productos)} productos en ${r.nombre}.`);
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  }

  async function elegir(entrada: HTMLInputElement) {
    const elegido = entrada.files?.[0];
    if (!elegido) return;

    setTrabajando(true);
    setPlan(null);
    try {
      const contenido = leerTexto(await elegido.arrayBuffer());
      setTexto(contenido);
      setNombreArchivo(elegido.name);
      setPlan(await api.post<PlanImportacion>("/catalogo/importar", { texto: contenido }));
    } catch (e) {
      setTexto(null);
      avisos.error(e instanceof ErrorApi || e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setTrabajando(false);
      // Sin esto, elegir el mismo archivo dos veces seguidas no dispara nada:
      // el campo ve el mismo valor y no avisa que cambió.
      entrada.value = "";
    }
  }

  async function aplicar() {
    if (!texto) return;
    setTrabajando(true);
    try {
      const r = await api.post<ResultadoImportacion>("/catalogo/importar/aplicar", {
        texto,
        crearFaltantes,
      });

      const partes = [];
      if (r.creados > 0) partes.push(`${numero(r.creados)} nuevos`);
      if (r.actualizados > 0) partes.push(`${numero(r.actualizados)} actualizados`);
      if (r.movidos > 0) partes.push(`${numero(r.movidos)} con el stock movido`);

      avisos.exito(partes.length > 0 ? `Listo: ${partes.join(", ")}.` : "No hubo nada que cambiar.");
      onImportado();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo importar.");
    } finally {
      setTrabajando(false);
    }
  }

  const aplicables = plan
    ? plan.resumen.actualiza + (crearFaltantes ? plan.resumen.nuevos : 0)
    : 0;

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo="Exportar e importar"
      descripcion="El catálogo como planilla: para mudarlo de computadora o cargarlo de una vez."
      ancho="max-w-3xl"
      pie={
        <>
          <Boton onClick={onCerrar} disabled={trabajando}>
            {plan ? "Cancelar" : "Cerrar"}
          </Boton>
          {plan && (
            <Boton
              tono="principal"
              icono="listo"
              onClick={() => void aplicar()}
              disabled={trabajando || aplicables === 0}
            >
              {trabajando ? "Importando…" : `Importar ${numero(aplicables)}`}
            </Boton>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="font-titulo text-medio">Sacar el catálogo</h3>
          <p className="text-base text-tinta-suave">
            Un archivo .csv que abre Excel: código, nombre, categoría, costo, precio y stock. Es lo
            que hay que llevar a la otra computadora — o la planilla sobre la que corregir precios
            para volver a cargarla acá.
          </p>
          <div className="flex flex-wrap gap-2">
            <Boton icono="copiar" onClick={() => void exportar(false)} disabled={exportando}>
              {exportando ? "Armando…" : "Descargar el catálogo"}
            </Boton>
            <Boton tono="fantasma" onClick={() => void exportar(true)} disabled={exportando}>
              Incluir los eliminados
            </Boton>
          </div>
        </section>

        <section className="flex flex-col gap-2 border-t border-linea pt-5">
          <h3 className="font-titulo text-medio">Cargar un archivo</h3>
          <p className="text-base text-tinta-suave">
            Sirve el archivo que salió de acá y también uno armado a mano. Se reconocen los
            encabezados habituales —«código», «producto», «cantidad»— y las columnas que falten se
            dejan como están.
          </p>

          <input
            ref={archivo}
            type="file"
            // Los .xlsx entran a propósito: no se pueden leer, pero es el
            // archivo que Excel guarda por omisión, y verlo gris en el
            // selector no explica nada. Elegirlo da un aviso que sí.
            accept=".csv,.txt,.tsv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={(e) => void elegir(e.currentTarget)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Boton icono="carpeta" onClick={() => archivo.current?.click()} disabled={trabajando}>
              Elegir archivo
            </Boton>
            {nombreArchivo && (
              <span className="text-chico text-tinta-suave">{nombreArchivo}</span>
            )}
          </div>
        </section>

        {trabajando && !plan && <p className="text-base text-tinta-suave">Leyendo el archivo…</p>}

        {plan && (
          <section className="flex flex-col gap-3 border-t border-linea pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <Etiqueta tono="exito">{numero(plan.resumen.nuevos)} nuevos</Etiqueta>
              <Etiqueta tono="dato">{numero(plan.resumen.actualiza)} cambian</Etiqueta>
              {plan.resumen.iguales > 0 && (
                <Etiqueta>{numero(plan.resumen.iguales)} ya están igual</Etiqueta>
              )}
              {plan.resumen.errores > 0 && (
                <Etiqueta tono="alerta">{numero(plan.resumen.errores)} con problemas</Etiqueta>
              )}
            </div>

            {/* Qué entendió del encabezado. Es lo primero que hay que mirar
                cuando el archivo entra pero no hace lo que uno esperaba. */}
            <p className="text-chico text-tinta-suave">
              Columnas leídas: {plan.columnas.map((c) => ROTULO_COLUMNA[c] ?? c).join(", ")}
              {plan.ignoradas.length > 0 && (
                <>
                  {" · "}
                  <span className="text-tinta-tenue">
                    sin usar: {plan.ignoradas.join(", ")}
                  </span>
                </>
              )}
            </p>

            {!plan.traeStock && (
              <Aviso tono="aviso">
                El archivo no trae una columna de stock, así que el stock queda como está. Si querés
                cargarlo, agregale una columna llamada <strong>stock</strong> —también sirve «stock
                actual», «cantidad» o «existencias»— con las unidades que tiene que quedar cada
                producto.
              </Aviso>
            )}

            {plan.categoriasNuevas.length > 0 && (
              <Aviso>
                Se van a crear {plan.categoriasNuevas.length === 1 ? "la categoría" : "las categorías"}{" "}
                {plan.categoriasNuevas.join(", ")}.
              </Aviso>
            )}

            {plan.resumen.errores > 0 && (
              <Aviso tono="alerta">
                Las filas con problemas se saltean; el resto entra igual. Están marcadas abajo con el
                motivo.
              </Aviso>
            )}

            <label className="flex items-center gap-2 text-base">
              <input
                type="checkbox"
                checked={crearFaltantes}
                onChange={(e) => setCrearFaltantes(e.target.checked)}
                className="h-4 w-4 accent-acento"
              />
              Crear los productos que no estén en el catálogo
            </label>

            <div className="max-h-72 overflow-y-auto rounded-md border border-linea">
              <table className="w-full text-base">
                <tbody>
                  {plan.filas.map((fila) => (
                    <Renglon key={fila.linea} fila={fila} />
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-chico text-tinta-suave">
              El stock del archivo es el que va a quedar, no el que se suma: la diferencia se anota
              como un movimiento con su motivo, igual que un ajuste hecho a mano.
            </p>
          </section>
        )}
      </div>
    </Dialogo>
  );
}

/**
 * Convierte los bytes del archivo en texto, adivinando cómo está escrito.
 *
 * Hace falta adivinar porque Excel en Windows, con «Guardar como → CSV», no
 * escribe UTF-8: escribe la codificación vieja de Windows. Leyéndolo como UTF-8
 * —que es lo que hace el navegador solo— cada acento se convierte en un rombo
 * negro. Y como el archivo igual se entiende, la importación no fallaba: entraba
 * y renombraba el catálogo a «Bandeja pl�stica», o creaba la categoría
 * «Almac�n» al lado de la que ya estaba.
 *
 * El truco es que UTF-8 tiene reglas estrictas: casi ningún texto escrito en la
 * codificación vieja pasa por un decodificador de UTF-8 exigente. Si pasa, era
 * UTF-8; si no, era lo otro.
 */
function leerTexto(bytes: ArrayBuffer): string {
  const datos = new Uint8Array(bytes);

  // Un .xlsx es un ZIP disfrazado, y empieza con estas cuatro letras. Vale la
  // pena reconocerlo: es el archivo que Excel guarda por omisión, y el error de
  // "no se entiende el encabezado" no le dice a nadie qué hacer.
  if (datos[0] === 0x50 && datos[1] === 0x4b && datos[2] === 0x03 && datos[3] === 0x04) {
    throw new Error(
      "Eso es un archivo de Excel (.xlsx), no una planilla de texto. Abrilo en Excel y usá «Guardar como» eligiendo «CSV UTF-8»."
    );
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(datos);
  } catch {
    return new TextDecoder("windows-1252").decode(datos);
  }
}

/** Los campos, escritos como se llaman en la pantalla y no como en el código. */
const ROTULO_COLUMNA: Record<string, string> = {
  sku: "código",
  nombre: "nombre",
  categoria: "categoría",
  unidad: "unidad",
  codigoBarras: "código de barras",
  costo: "costo",
  precio: "precio",
  stock: "stock",
  stockMinimo: "stock mínimo",
  descripcion: "descripción",
};

const TONO: Record<FilaImportada["accion"], string> = {
  nuevo: "text-exito-texto",
  actualiza: "text-acento",
  igual: "text-tinta-tenue",
  error: "text-alerta-texto",
};

const ROTULO: Record<FilaImportada["accion"], string> = {
  nuevo: "nuevo",
  actualiza: "cambia",
  igual: "igual",
  error: "no entra",
};

function Renglon({ fila }: { fila: FilaImportada }) {
  return (
    <tr className="border-b border-linea last:border-0">
      <td className="w-12 px-3 py-2 align-top text-chico text-tinta-tenue tabular-nums">
        {fila.linea}
      </td>
      <td className="px-1 py-2 align-top">
        <span className="block truncate">{fila.nombre || "(sin nombre)"}</span>
        <span className="block text-chico text-tinta-suave">{fila.detalle}</span>
      </td>
      <td className="w-24 px-3 py-2 text-right align-top">
        {fila.precio !== null && <span className="cifra block">{plata(fila.precio)}</span>}
        {fila.stockNuevo !== null && (
          <span className="cifra block text-chico text-tinta-suave">
            {fila.stockActual !== null && fila.stockActual !== fila.stockNuevo
              ? `${numero(fila.stockActual)} → ${numero(fila.stockNuevo)}`
              : `${numero(fila.stockNuevo)} u.`}
          </span>
        )}
      </td>
      <td className={cn("w-20 px-3 py-2 text-right align-top text-chico", TONO[fila.accion])}>
        {ROTULO[fila.accion]}
      </td>
    </tr>
  );
}
