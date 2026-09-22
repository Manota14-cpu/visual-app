"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Marco } from "@/components/marco";
import { Boton, Campo, Cargando, Dialogo, Etiqueta, Hoja } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAvisos } from "@/components/avisos";
import { useDatos } from "@/lib/datos";
import { useSesion } from "@/lib/sesion";
import { api, ErrorApi } from "@/lib/api";
import { fechaHora, numero, tamano } from "@/lib/formato";
import type { Actualizacion, Sistema } from "@/lib/tipos";
import { Usuarios } from "./usuarios";
import { AccesoDesdeElCelular } from "./red";

/**
 * Las pestañas.
 *
 * Eran ocho tarjetas en una sola columna de un metro y medio: para llegar a la
 * copia de seguridad había que pasar por los usuarios, el nombre del negocio y
 * el archivo. Separadas por tema, cada pestaña entra en una pantalla y la que
 * se busca está a un clic.
 */
const PESTANAS = [
  { id: "negocio", nombre: "Negocio" },
  { id: "usuarios", nombre: "Usuarios" },
  { id: "datos", nombre: "Copias y datos" },
  { id: "programa", nombre: "Programa" },
] as const;

type IdPestana = (typeof PESTANAS)[number]["id"];

/**
 * Dónde vive la información y qué se puede hacer con ella.
 *
 * No hay base de datos ni servidor: hay un archivo JSON en esta computadora.
 * Esta pantalla existe para que eso sea visible —la ruta, el tamaño, cuántas
 * cosas tiene adentro— y para poder copiarlo sin depender de nadie.
 */
export default function PaginaConfiguracion() {
  const avisos = useAvisos();
  const { esDueno } = useSesion();
  const { datos, cargando, recargar } = useDatos<Sistema>("/sistema");

  const [copiando, setCopiando] = useState(false);
  const [vaciando, setVaciando] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [apagando, setApagando] = useState(false);
  // La copia que se está por restaurar, y la palabra que lo confirma.
  const [volviendoA, setVolviendoA] = useState<string | null>(null);
  // Si la copia elegida esta en el pendrive y no en esta computadora.
  const [volviendoDeAfuera, setVolviendoDeAfuera] = useState(false);
  const [confirmaVolver, setConfirmaVolver] = useState("");
  const [restaurando, setRestaurando] = useState(false);
  const [pestana, setPestana] = useState<IdPestana>("negocio");

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
        afuera: volviendoDeAfuera,
      });
      avisos.exito(`Se volvió a ${volviendoA}. Lo anterior quedó guardado en ${r.respaldoPrevio}.`);
      setVolviendoA(null);
      setVolviendoDeAfuera(false);
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
    datos?.conteos !== undefined &&
    datos.conteos.productos === 0 &&
    datos.conteos.pedidos === 0 &&
    datos.conteos.gastos === 0;

  return (
    <Marco titulo="Configuración" descripcion="El negocio, el archivo de datos y sus copias.">
      {cargando && !datos && <Cargando filas={6} />}

      {/* Un empleado puede escribir la dirección y llegar hasta acá. No ve
          nada: el servidor ni siquiera le manda los datos, así que esto es
          para explicarlo en vez de mostrar una pantalla vacía y rota. */}
      {datos && !esDueno && (
        <Hoja titulo="Configuración">
          <p className="text-base text-tinta-suave">
            Esta pantalla es del dueño: acá se configura el negocio, la copia de seguridad y quién
            usa el programa. Si necesitás algo de acá, pedíselo.
          </p>
        </Hoja>
      )}

      {/* Todo esto solo llega cuando el que mira es el dueño, así que se
          comprueba una vez y adentro se usa con confianza. */}
      {datos && esDueno && datos.conteos && datos.copias && datos.resguardo && (
        <div className="flex flex-col gap-4">
          <Pestanas
            actual={pestana}
            onCambiar={setPestana}
            // Un punto sobre "Copias y datos" cuando la copia de afuera no está
            // funcionando: es lo único de esta pantalla que no puede esperar a
            // que alguien entre a esa pestaña por casualidad.
            conAviso={!datos.resguardo.carpeta || datos.resguardo.error ? ["datos"] : []}
          />

          <div
            role="tabpanel"
            id={`panel-${pestana}`}
            aria-labelledby={`pestana-${pestana}`}
            className="grid items-start gap-4 xl:grid-cols-2"
          >
            {pestana === "negocio" && (
              <>
                <FormularioNegocio config={datos.config} onGuardado={() => void recargar()} />
              </>
            )}

            {pestana === "usuarios" && (
              <>
                <Usuarios />

                <AccesoDesdeElCelular />
              </>
            )}

            {pestana === "datos" && (
              <>
                <CopiaDeSeguridad
                  estado={datos.resguardo}
                  onCambio={() => void recargar()}
                  onVolverA={(nombre) => {
                    setVolviendoA(nombre);
                    setVolviendoDeAfuera(true);
                    setConfirmaVolver("");
                  }}
                />

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
                                {fechaHora(copia.fecha)} · {tamano(copia.tamano)}
                              </span>
                            </span>
                            <Boton
                              icono="recargar"
                              onClick={() => {
                                setVolviendoA(copia.nombre);
                                setVolviendoDeAfuera(false);
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

                <Hoja
                  titulo="Archivo de datos"
                  accion={<Etiqueta tono="dato">{tamano(datos.tamano ?? 0)}</Etiqueta>}
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
                  </div>
                </Hoja>
              </>
            )}

            {pestana === "programa" && (
              <>
                <Actualizaciones />

                <Hoja titulo="Visual App">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
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
              </>
            )}
          </div>
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
 * La fila de pestañas.
 *
 * Con el patrón de pestañas del navegador: las flechas se mueven entre ellas y
 * Tab salta directo al contenido, así que con el teclado no hay que pasar por
 * las cuatro para llegar a lo que se eligió. En un teléfono las cuatro no
 * entran en un renglón, y una fila que se desplaza de costado escondía la
 * última: van de a dos.
 */
function Pestanas({
  actual,
  onCambiar,
  conAviso,
}: {
  actual: IdPestana;
  onCambiar: (id: IdPestana) => void;
  conAviso: IdPestana[];
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    const i = PESTANAS.findIndex((p) => p.id === actual);
    const destino =
      e.key === "ArrowRight"
        ? (i + 1) % PESTANAS.length
        : e.key === "ArrowLeft"
          ? (i - 1 + PESTANAS.length) % PESTANAS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? PESTANAS.length - 1
              : null;
    if (destino === null) return;
    e.preventDefault();
    onCambiar(PESTANAS[destino]!.id);
    botones.current[destino]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Secciones de la configuración"
        onKeyDown={alTeclear}
        className="grid grid-cols-2 gap-1 rounded-md bg-black/[0.045] p-1 sm:inline-flex"
      >
        {PESTANAS.map((p, i) => {
          const elegida = p.id === actual;
          return (
            <button
              key={p.id}
              ref={(el) => {
                botones.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`pestana-${p.id}`}
              aria-selected={elegida}
              aria-controls={`panel-${p.id}`}
              tabIndex={elegida ? 0 : -1}
              onClick={() => onCambiar(p.id)}
              className={cn(
                "flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded px-3.5 text-base sm:min-h-9 transition-all duration-200 ease-suave",
                elegida
                  ? "bg-papel font-medium text-acento-texto shadow-apoyo"
                  : "text-tinta-suave hover:text-tinta"
              )}
            >
              {p.nombre}
              {conAviso.includes(p.id) && (
                <span className="h-1.5 w-1.5 rounded-full bg-aviso-texto">
                  <span className="sr-only">, pide atención</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
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
              {datos.ultima.tamano ? ` (${tamano(datos.ultima.tamano)})` : ""}. Tenés la{" "}
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

/**
 * La copia fuera de la computadora.
 *
 * Las copias de la tarjeta de al lado viven en el mismo disco que el archivo
 * que protegen: sirven para volver atrás de un error, no para el día que el
 * disco no arranca. Ahí se van con él.
 *
 * Por eso esta tarjeta insiste cuando está sin configurar, en vez de esperar
 * que alguien la descubra. Es lo único que separa al negocio de perder años de
 * ventas, y no hay servidor de nadie donde queden por las dudas.
 */
function CopiaDeSeguridad({
  estado,
  onCambio,
  onVolverA,
}: {
  // Sin `null`: la tarjeta solo se dibuja cuando el servidor mandó el estado,
  // que es cuando quien mira es el dueño.
  estado: NonNullable<Sistema["resguardo"]>;
  onCambio: () => void;
  onVolverA: (nombre: string) => void;
}) {
  const avisos = useAvisos();
  const [ruta, setRuta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [copiando, setCopiando] = useState(false);

  async function elegirCarpeta() {
    setEligiendo(true);
    try {
      const r = await api.post<{ carpeta: string | null }>("/sistema/elegir-carpeta");
      if (r.carpeta) await guardar(r.carpeta);
    } catch {
      // Sin cuadro de Windows queda el campo para escribir la ruta, que es
      // exactamente lo que ya está en pantalla. No hace falta alarmar.
    } finally {
      setEligiendo(false);
    }
  }

  async function guardar(carpeta: string) {
    setGuardando(true);
    try {
      const r = await api.put<{ copia: string | null }>("/sistema/resguardo", { carpeta });
      avisos.exito(
        r.copia ? "Listo. La primera copia ya está en la carpeta." : "Carpeta guardada."
      );
      setRuta("");
      onCambio();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar la carpeta.");
    } finally {
      setGuardando(false);
    }
  }

  async function copiarAhora() {
    setCopiando(true);
    try {
      await api.post("/sistema/resguardo/copia");
      avisos.exito("Copia guardada en la carpeta.");
      onCambio();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo copiar.");
    } finally {
      setCopiando(false);
    }
  }

  async function sacar() {
    setGuardando(true);
    try {
      await api.put("/sistema/resguardo", { carpeta: "" });
      avisos.exito("Se dejó de copiar a esa carpeta.");
      onCambio();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo sacar la carpeta.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja
      titulo="Copia de seguridad"
      accion={
        estado.carpeta ? (
          <Etiqueta tono={estado.error ? "alerta" : estado.dias !== null && estado.dias > 3 ? "aviso" : "exito"}>
            {estado.error
              ? "Sin acceso"
              : estado.dias === null
                ? "Sin copias"
                : estado.dias === 0
                  ? "Al día"
                  : `Hace ${numero(estado.dias)} ${estado.dias === 1 ? "día" : "días"}`}
          </Etiqueta>
        ) : (
          <Etiqueta tono="aviso">Sin configurar</Etiqueta>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {!estado.carpeta ? (
          <>
            <p className="text-base text-tinta-suave">
              Las copias de acá abajo se guardan en esta misma computadora. Si el disco deja de
              arrancar, se van con él. Elegí una carpeta <strong className="text-tinta">afuera</strong>{" "}
              —un pendrive que quede enchufado, la carpeta de OneDrive o Drive, una carpeta de la
              red— y el programa va a dejar ahí una copia por día, solo.
            </p>

            <div className="flex flex-wrap items-end gap-2">
              <span className="min-w-[220px] flex-1">
                <Campo
                  etiqueta="Carpeta"
                  value={ruta}
                  onChange={(e) => setRuta(e.target.value)}
                  placeholder="D:\ o la carpeta que uses"
                />
              </span>
              <Boton
                tono="principal"
                icono="carpeta"
                onClick={() => void elegirCarpeta()}
                disabled={eligiendo || guardando}
              >
                {eligiendo ? "Elegí en la ventana…" : "Buscar carpeta"}
              </Boton>
              {ruta.trim() && (
                <Boton onClick={() => void guardar(ruta.trim())} disabled={guardando}>
                  Usar esta
                </Boton>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="etiqueta-campo">Dónde se copia</p>
              <p className="mt-1 break-all rounded border border-linea bg-lienzo px-3 py-2 font-mono text-chico">
                {estado.carpeta}
              </p>
            </div>

            {estado.error ? (
              // Que no se llegue al destino no es un detalle: mientras dure, no
              // hay copia de seguridad, aunque la carpeta siga configurada.
              <div className="rounded-md border border-alerta-linea bg-alerta-fondo px-3 py-2.5 text-base text-alerta-texto">
                <strong>No se está copiando.</strong> {estado.error}
              </div>
            ) : (
              <p className="text-base text-tinta-suave">
                {estado.copias === 0
                  ? "Todavía no hay ninguna copia en esa carpeta."
                  : `Hay ${numero(estado.copias)} ${estado.copias === 1 ? "copia guardada" : "copias guardadas"}. ` +
                    (estado.dias === 0
                      ? "La última es de hoy."
                      : `La última es de hace ${numero(estado.dias ?? 0)} ${estado.dias === 1 ? "día" : "días"}.`)}{" "}
                Se guarda una por día al abrir el programa.
              </p>
            )}

            {estado.archivos.length > 0 && (
              <div>
                <p className="etiqueta-campo">Volver a una de estas</p>
                {/* Este es el camino del día malo: la computadora vieja no
                    arranca, en la nueva se instala Visual App, se elige el
                    pendrive y se vuelve. Sin esto la copia estaba pero había
                    que meterla a mano en la carpeta correcta, justo cuando
                    nadie quiere tocar nada. */}
                <ul className="mt-1.5 max-h-52 overflow-y-auto rounded-md border border-linea">
                  {estado.archivos.map((copia) => (
                    <li
                      key={copia.nombre}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-3 py-2 last:border-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-chico">{copia.nombre}</span>
                        {copia.fecha && (
                          <span className="block text-chico text-tinta-suave">
                            {fechaHora(copia.fecha)}
                          </span>
                        )}
                      </span>
                      <Boton icono="recargar" onClick={() => onVolverA(copia.nombre)}>
                        Volver a esta
                      </Boton>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Boton icono="copiar" onClick={() => void copiarAhora()} disabled={copiando}>
                {copiando ? "Copiando…" : "Copiar ahora"}
              </Boton>
              <Boton
                icono="carpeta"
                onClick={() => void elegirCarpeta()}
                disabled={eligiendo || guardando}
              >
                Cambiar carpeta
              </Boton>
              <Boton onClick={() => void sacar()} disabled={guardando}>
                Dejar de copiar
              </Boton>
            </div>
          </>
        )}
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
