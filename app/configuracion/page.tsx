"use client";

import { useState } from "react";
import { Marco } from "@/components/marco";
import { Boton, Campo, Cargando, Dialogo, Etiqueta, Hoja } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { useDatos } from "@/lib/datos";
import { api, ErrorApi } from "@/lib/api";
import { fechaHora, numero, peso } from "@/lib/formato";
import type { Actualizacion, Sistema } from "@/lib/tipos";

/**
 * Dónde vive la información y qué se puede hacer con ella.
 *
 * No hay base de datos ni servidor: hay un archivo JSON en esta computadora.
 * Esta pantalla existe para que eso sea visible —la ruta, el tamaño, cuántas
 * cosas tiene adentro— y para poder copiarlo sin depender de nadie.
 */
export default function PaginaConfiguracion() {
  const avisos = useAvisos();
  const { datos, cargando, recargar } = useDatos<Sistema>("/sistema");

  const [copiando, setCopiando] = useState(false);
  const [vaciando, setVaciando] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [apagando, setApagando] = useState(false);
  // La copia que se está por restaurar, y la palabra que lo confirma.
  const [volviendoA, setVolviendoA] = useState<string | null>(null);
  const [confirmaVolver, setConfirmaVolver] = useState("");
  const [restaurando, setRestaurando] = useState(false);

  /**
   * Apaga el programa y cierra la ventana.
   *
   * El servidor contesta antes de irse, así que el pedido no falla; lo que sí
   * puede fallar es cerrar la ventana, porque un navegador solo deja hacerlo
   * cuando la abrió él. En modo aplicación la abrió él, así que se cierra.
   */
  async function apagar() {
    setApagando(true);
    try {
      await api.post("/sistema/apagar");
      setTimeout(() => window.close(), 400);
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cerrar.");
      setApagando(false);
    }
  }

  async function copiar() {
    setCopiando(true);
    try {
      const r = await api.post<{ nombre: string }>("/sistema/copia");
      avisos.exito(`Copia guardada como ${r.nombre}.`);
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo copiar.");
    } finally {
      setCopiando(false);
    }
  }

  /**
   * Vuelve a una copia guardada.
   *
   * Reemplaza todo lo cargado desde esa fecha, así que se pide escribir la
   * palabra completa igual que para vaciar. El servidor guarda el estado
   * actual como copia antes de pisarlo: si alguien elige la copia equivocada,
   * todavía hay camino de vuelta.
   */
  async function restaurar() {
    if (!volviendoA) return;
    setRestaurando(true);
    try {
      const r = await api.post<{ respaldoPrevio: string }>("/sistema/restaurar", {
        nombre: volviendoA,
        confirmacion: confirmaVolver,
      });
      avisos.exito(`Se volvió a ${volviendoA}. Lo anterior quedó guardado en ${r.respaldoPrevio}.`);
      setVolviendoA(null);
      setConfirmaVolver("");
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo restaurar.");
    } finally {
      setRestaurando(false);
    }
  }

  async function abrirCarpeta() {
    try {
      await api.post("/sistema/carpeta");
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo abrir la carpeta.");
    }
  }

  async function cargarEjemplo() {
    try {
      await api.post("/sistema/ejemplo");
      avisos.exito("Datos de ejemplo cargados.");
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudieron cargar.");
    }
  }

  async function vaciar() {
    try {
      await api.post("/sistema/vaciar", { confirmacion });
      avisos.exito("La base quedó vacía. Antes se guardó una copia.");
      setVaciando(false);
      setConfirmacion("");
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo vaciar.");
    }
  }

  const sinDatos =
    datos !== null &&
    datos.conteos.productos === 0 &&
    datos.conteos.pedidos === 0 &&
    datos.conteos.gastos === 0;

  return (
    <Marco titulo="Configuración" descripcion="El negocio, el archivo de datos y sus copias.">
      {cargando && !datos && <Cargando filas={6} />}

      {datos && (
        <div className="grid gap-4 xl:grid-cols-2">
          <FormularioNegocio config={datos.config} onGuardado={() => void recargar()} />

          <Hoja
            titulo="Archivo de datos"
            accion={<Etiqueta tono="dato">{peso(datos.tamano)}</Etiqueta>}
          >
            <div className="flex flex-col gap-4">
              <div>
                <p className="etiqueta-campo">Dónde está</p>
                <p className="mt-1 break-all rounded border border-linea bg-lienzo px-3 py-2 font-mono text-chico">
                  {datos.archivo}
                </p>
                <p className="mt-2 text-chico text-tinta-suave">
                  Es un archivo de texto común. Copiarlo a un pendrive es todo el respaldo que hace
                  falta; ponerlo en otra computadora con Visual App instalado es toda la mudanza.
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-base sm:grid-cols-3">
                <Conteo rotulo="Productos" valor={datos.conteos.productos} />
                <Conteo rotulo="Categorías" valor={datos.conteos.categorias} />
                <Conteo rotulo="Movimientos" valor={datos.conteos.movimientos} />
                <Conteo rotulo="Ventas" valor={datos.conteos.pedidos} />
                <Conteo rotulo="Clientes" valor={datos.conteos.clientes} />
                <Conteo rotulo="Gastos" valor={datos.conteos.gastos} />
                <Conteo rotulo="Turnos de caja" valor={datos.conteos.cajas} />
                <Conteo rotulo="Cambios de precio" valor={datos.conteos.cambiosPrecio} />
              </dl>

              <div className="flex flex-wrap gap-2">
                <Boton icono="copiar" onClick={() => void copiar()} disabled={copiando}>
                  {copiando ? "Copiando…" : "Hacer una copia"}
                </Boton>
                <Boton icono="carpeta" onClick={() => void abrirCarpeta()}>
                  Abrir la carpeta
                </Boton>
              </div>
            </div>
          </Hoja>

          <Hoja titulo="Copias guardadas" cuerpo="p-0">
            {datos.copias.length === 0 ? (
              <p className="px-4 py-6 text-center text-base text-tinta-suave">
                Todavía no hay ninguna copia.
              </p>
            ) : (
              <>
                <p className="border-b border-linea px-4 py-2.5 text-chico text-tinta-suave">
                  Se guarda una copia sola al abrir el programa cada día y otra al cerrar cada
                  turno de caja. Se conservan las últimas veinte.
                </p>
                <ul>
                  {datos.copias.map((copia) => (
                    <li
                      key={copia.nombre}
                      className="flex items-center justify-between gap-3 border-b border-linea px-4 py-2.5 last:border-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-chico">{copia.nombre}</span>
                        <span className="block text-chico text-tinta-suave">
                          {fechaHora(copia.fecha)} · {peso(copia.tamano)}
                        </span>
                      </span>
                      <Boton
                        icono="recargar"
                        onClick={() => {
                          setVolviendoA(copia.nombre);
                          setConfirmaVolver("");
                        }}
                      >
                        Volver a esta
                      </Boton>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Hoja>

          <Hoja titulo="Empezar de nuevo">
            <div className="flex flex-col gap-4">
              {sinDatos && (
                <div className="flex flex-col gap-2 rounded-md border border-linea bg-lienzo p-3">
                  <p className="text-base">
                    La base está vacía. Se pueden cargar datos de ejemplo para mirar cómo funciona
                    todo —un catálogo, un turno de caja cerrado, clientes y gastos— y borrarlos
                    después.
                  </p>
                  <div>
                    <Boton onClick={() => void cargarEjemplo()}>Cargar datos de ejemplo</Boton>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <p className="text-base text-tinta-suave">
                  Vaciar borra todo: catálogo, ventas, clientes, gastos y turnos. Antes se guarda
                  una copia en la carpeta de copias.
                </p>
                <div>
                  <Boton tono="peligro" icono="borrar" onClick={() => setVaciando(true)}>
                    Vaciar la base
                  </Boton>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-linea pt-4">
                <p className="text-base text-tinta-suave">
                  Cerrar la ventana también apaga Visual App, pero tarda un minuto en darse cuenta.
                  Con este botón se apaga en el momento.
                </p>
                <div>
                  <Boton icono="salir" onClick={() => void apagar()} disabled={apagando}>
                    {apagando ? "Cerrando…" : "Cerrar Visual App"}
                  </Boton>
                </div>
              </div>

              <div className="border-t border-linea pt-3 text-chico text-tinta-suave">
                <p>Visual App {datos.programa} · formato de datos v{datos.version}</p>
                <p className="mt-1">
                  © {new Date().getFullYear()} Visual Solution. Todos los derechos reservados.
                </p>
                <p className="mt-0.5">
                  {/* Se abre afuera a propósito: la aplicación vive en una ventana sin
                      barra de direcciones, y sin esto el sitio la reemplazaría y no
                      habría cómo volver. */}
                  <a
                    href="https://visual-solution.vercel.app"
                    target="_blank"
                    rel="noreferrer"
                    className="text-acento hover:underline"
                  >
                    visual-solution.vercel.app
                  </a>
                </p>
              </div>
            </div>
          </Hoja>

          <Actualizaciones />
        </div>
      )}

      <Dialogo
        abierto={vaciando}
        onCerrar={() => setVaciando(false)}
        titulo="Vaciar la base"
        descripcion="Esto no se puede deshacer desde la aplicación."
        ancho="max-w-md"
        pie={
          <>
            <Boton onClick={() => setVaciando(false)}>Cancelar</Boton>
            <Boton
              tono="peligro"
              onClick={() => void vaciar()}
              disabled={confirmacion.trim().toUpperCase() !== "BORRAR"}
            >
              Vaciar
            </Boton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-base text-tinta-media">
            Se borra todo lo cargado. Queda una copia fechada en la carpeta de copias, por si esto
            fue un error.
          </p>
          <Campo
            etiqueta="Escribí BORRAR para confirmar"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder="BORRAR"
          />
        </div>
      </Dialogo>

      <Dialogo
        abierto={volviendoA !== null}
        onCerrar={() => setVolviendoA(null)}
        titulo="Volver a una copia"
        descripcion="Reemplaza todo lo cargado desde esa fecha."
        ancho="max-w-md"
        pie={
          <>
            <Boton onClick={() => setVolviendoA(null)}>Cancelar</Boton>
            <Boton
              tono="peligro"
              onClick={() => void restaurar()}
              disabled={restaurando || confirmaVolver.trim().toUpperCase() !== "VOLVER"}
            >
              {restaurando ? "Volviendo…" : "Volver a esta copia"}
            </Boton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="break-all rounded border border-linea bg-lienzo px-3 py-2 font-mono text-chico">
            {volviendoA}
          </p>
          <p className="text-base text-tinta-media">
            El catálogo, las ventas, los clientes y los turnos quedan como estaban en esa copia.
            Todo lo que se cargó después desaparece de la aplicación — pero antes de reemplazar
            nada se guarda una copia del estado actual, así que también se puede volver de acá.
          </p>
          <Campo
            etiqueta="Escribí VOLVER para confirmar"
            value={confirmaVolver}
            onChange={(e) => setConfirmaVolver(e.target.value)}
            placeholder="VOLVER"
          />
        </div>
      </Dialogo>
    </Marco>
  );
}

/**
 * El nombre del negocio.
 *
 * Vive en su propio componente y se monta recién cuando llegaron los datos: así
 * los campos arrancan con lo guardado sin que después nada los pise mientras
 * alguien está escribiendo.
 */
function FormularioNegocio({
  config,
  onGuardado,
}: {
  config: Sistema["config"];
  onGuardado: () => void;
}) {
  const avisos = useAvisos();
  const [negocio, setNegocio] = useState(config.negocio);
  const [detalle, setDetalle] = useState(config.detalle ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await api.put("/sistema/config", { negocio, detalle });
      avisos.exito("Guardado.");
      onGuardado();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja titulo="El negocio">
      <div className="flex flex-col gap-4">
        <Campo
          etiqueta="Nombre"
          value={negocio}
          onChange={(e) => setNegocio(e.target.value)}
          ayuda="Aparece en la barra lateral y en los comprobantes."
        />
        <Campo
          etiqueta="Debajo del nombre"
          placeholder="Descartables y packaging"
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          ayuda="Opcional: rubro, dirección, teléfono."
        />
        <div>
          <Boton tono="principal" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

/**
 * Las novedades del programa.
 *
 * Buscar no cambia nada y se puede hacer cuando se quiera. Aplicar cierra
 * Visual App y lo vuelve a abrir, así que nunca pasa solo: esto es una caja
 * registradora, y una actualización que arranca sola a mitad de un turno es lo
 * peor que puede pasar por más buena que sea la versión nueva.
 */
function Actualizaciones() {
  const avisos = useAvisos();
  const { datos, recargar } = useDatos<Actualizacion>("/actualizacion");
  const [buscando, setBuscando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  async function buscar() {
    setBuscando(true);
    try {
      // La respuesta ya trae el estado nuevo; recargar es para que lo tome la
      // pantalla, no para enterarse del resultado.
      const nuevo = await api.post<Actualizacion>("/actualizacion/revisar");
      await recargar();
      if (!nuevo.hay && !nuevo.error) avisos.exito("Ya tenés la última versión.");
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo buscar.");
    } finally {
      setBuscando(false);
    }
  }

  async function actualizar() {
    setAplicando(true);
    try {
      await api.post("/actualizacion/aplicar");
      // A partir de acá el programa se apaga y el actualizador toma la posta.
      // No hay nada más que hacer desde la pantalla que decirlo.
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo actualizar.");
      setAplicando(false);
    }
  }

  if (!datos) return null;

  if (!datos.configurado) {
    return (
      <Hoja titulo="Actualizaciones">
        <p className="text-base text-tinta-suave">
          Esta copia no tiene configurado un lugar del que bajar versiones nuevas, así que se
          actualiza a mano: se copia la carpeta del programa y se ejecuta el instalador.
        </p>
      </Hoja>
    );
  }

  if (aplicando) {
    return (
      <Hoja titulo="Actualizaciones">
        <div className="flex flex-col gap-2">
          <p className="text-base">Bajando e instalando la versión {datos.ultima?.version}…</p>
          <p className="text-base text-tinta-suave">
            Visual App se va a cerrar y volver a abrir solo. No cierres esta ventana a mano; tus datos
            no se tocan.
          </p>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja
      titulo="Actualizaciones"
      accion={
        datos.hay ? <Etiqueta tono="exito">hay una nueva</Etiqueta> : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {datos.hay && datos.ultima ? (
          <div className="flex flex-col gap-2 rounded-md border border-linea bg-lienzo p-3">
            <p className="text-base">
              Está disponible la versión <strong>{datos.ultima.version}</strong>
              {datos.ultima.tamano ? ` (${peso(datos.ultima.tamano)})` : ""}. Tenés la{" "}
              {datos.instalada}.
            </p>
            {datos.ultima.notas && (
              <p className="text-base text-tinta-suave">{datos.ultima.notas}</p>
            )}
            <p className="text-chico text-tinta-suave">
              Se cierra y se vuelve a abrir solo, en menos de un minuto. Tus datos no se tocan.
              Conviene hacerlo con la caja cerrada.
            </p>
            <div>
              <Boton tono="principal" icono="listo" onClick={() => void actualizar()}>
                Actualizar a {datos.ultima.version}
              </Boton>
            </div>
          </div>
        ) : (
          <p className="text-base text-tinta-suave">
            Tenés la versión {datos.instalada}, que es la última.
          </p>
        )}

        {datos.error && (
          <p className="text-chico text-tinta-tenue">
            La última búsqueda no pudo consultar: {datos.error}. Si la computadora está sin internet
            es normal.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Boton icono="recargar" onClick={() => void buscar()} disabled={buscando || datos.buscando}>
            {buscando || datos.buscando ? "Buscando…" : "Buscar actualizaciones"}
          </Boton>
          {datos.revisadoEn && (
            <span className="text-chico text-tinta-tenue">
              Última vez: {fechaHora(datos.revisadoEn)}
            </span>
          )}
        </div>
      </div>
    </Hoja>
  );
}

function Conteo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex justify-between gap-2 border-b border-linea py-1">
      <dt className="text-tinta-suave">{rotulo}</dt>
      <dd className="cifra font-medium">{numero(valor)}</dd>
    </div>
  );
}
