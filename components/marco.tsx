"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icono } from "@/components/iconos";
import { CONFIGURACION, EN_LA_BARRA, grupos, secciones, type Seccion } from "@/components/secciones";
import { AvisoActualizacion } from "@/components/actualizacion";
import { Boton, Dialogo, Tecla } from "@/components/ui";
import { Paleta } from "@/components/paleta";
import { SelectorTema } from "@/components/tema";
import { useDatos } from "@/lib/datos";
import { useSesion } from "@/lib/sesion";
import type { Sistema } from "@/lib/tipos";

/**
 * La marca, arriba de la columna.
 *
 * Es el mismo archivo que usa la pestaña del navegador y del que sale el ícono
 * del programa, no un dibujo parecido hecho aparte. Que la marca sea idéntica
 * en la barra de tareas, en el escritorio y arriba de la columna es la mitad de
 * lo que hace que un programa se vea terminado.
 *
 * Va como imagen y no como SVG escrito acá adentro justamente por eso: el
 * contorno vive en un solo lugar, `public/marca.svg`, y lo genera
 * `herramientas/marca-derivada.mjs` desde el arte. Copiado a mano se
 * desincroniza al primer retoque del logo.
 *
 * Decorativa: el nombre del programa está escrito al lado, así que un lector de
 * pantalla que además lea la imagen lo diría dos veces.
 */
function Marca() {
  return (
    // Y como imagen suelta y no con <Image>: es un SVG de un kilo y medio que
    // sirve el propio programa desde el disco, sin internet de por medio. No
    // hay nada que optimizar, y Next no toca los SVG de todos modos.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/marca.svg"
      alt=""
      aria-hidden="true"
      className="h-9 w-9 shrink-0"
      draggable={false}
    />
  );
}

/**
 * Un renglón de la columna.
 *
 * El elegido se pinta con el azul del logo: un fondo apenas teñido, la letra y
 * el ícono en azul, y una raya a la izquierda que se ve de reojo sin tener que
 * leer. Los demás van en gris y se tiñen apenas al pasar el mouse, del mismo
 * azul, para que el que está por elegirse ya se parezca al elegido.
 */
function Renglon({ seccion, activa }: { seccion: Seccion; activa: boolean }) {
  return (
    <Link
      href={seccion.href}
      aria-current={activa ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-base transition-colors duration-200 ease-suave",
        activa
          ? "bg-acento-suave font-medium text-acento-texto before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-acento"
          : "text-tinta-media hover:bg-acento-suave/60 hover:text-tinta"
      )}
    >
      <Icono
        nombre={seccion.icono}
        tamano={17}
        className={
          activa ? "text-acento" : "text-tinta-tenue transition-colors group-hover:text-acento/80"
        }
      />
      {seccion.nombre}
    </Link>
  );
}

/**
 * El marco de todas las pantallas: la navegación y el encabezado.
 *
 * La columna y la barra de arriba son de vidrio esmerilado: el contenido pasa
 * por detrás al desplazarse y se ve difuminado, que es lo que le da profundidad
 * a la pantalla sin dibujar una sola línea de más.
 *
 * En el escritorio la navegación es una columna fija; en un teléfono o una
 * tablet apoyada en el mostrador, una barra abajo, que es donde llega el pulgar.
 */
export function Marco({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  const ruta = usePathname();
  const { datos: sistema } = useDatos<Sistema>("/sistema");
  const { usuario, exigeIngreso, cargando, esDueno } = useSesion();
  const [masAbierto, setMasAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const cerrarBusqueda = useCallback(() => setBuscando(false), []);

  // Ctrl+K (⌘K en una Mac) abre el buscador desde cualquier pantalla. Con otro
  // diálogo abierto no: un cobro a medio hacer no se tapa con otra cosa.
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      // El autocompletado del navegador manda teclas sin nombre.
      if (evento.key?.toLowerCase() !== "k" || !(evento.ctrlKey || evento.metaKey)) return;
      if (document.querySelector("dialog[open]")) return;
      evento.preventDefault();
      setBuscando(true);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  // Sin sesión no se dibuja nada y se va a la pantalla de ingreso. Entrar por
  // la dirección escrita a mano es el caso normal —un acceso directo guardado,
  // la pestaña de ayer— y sin esto se vería una pantalla armada con errores en
  // cada tarjeta, que no explica nada.
  const falta = exigeIngreso && !usuario;

  useEffect(() => {
    // Igual que al salir: recarga entera. Lo que se hubiera cargado antes de
    // descubrir que falta la sesión no puede quedar en memoria.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (falta) window.location.href = "/ingresar";
  }, [falta]);

  if (cargando || falta) {
    return (
      <div className="flex min-h-screen items-center justify-center text-base text-tinta-suave">
        Un momento…
      </div>
    );
  }

  const puede = (s: Seccion) => !s.soloDueno || esDueno;
  const visibles = grupos
    .map((g) => ({ ...g, secciones: g.secciones.filter(puede) }))
    .filter((g) => g.secciones.length > 0);

  // Lo que no entra en la barra del teléfono va en "Más", con los mismos
  // grupos que la columna: quien usa las dos no tiene que aprender dos mapas.
  const enLaBarra = secciones.filter((s) => EN_LA_BARRA.includes(s.href));
  const enMas = [
    ...visibles.map((g) => ({
      ...g,
      secciones: g.secciones.filter((s) => !EN_LA_BARRA.includes(s.href)),
    })),
    { titulo: "Programa", secciones: [CONFIGURACION].filter(puede) },
  ].filter((g) => g.secciones.length > 0);
  const masActiva = !enLaBarra.some((s) => ruta.startsWith(s.href));

  // Escribir la dirección a mano llega igual: la columna esconde el renglón,
  // pero no la URL. El servidor devuelve 403 y sin esto la pantalla quedaba en
  // blanco —protegida, pero sin decir por qué—, que es un callejón sin salida.
  const vedada =
    !esDueno &&
    [...secciones.filter((s) => s.soloDueno).map((s) => s.href), CONFIGURACION.href].some(
      (href) => ruta.startsWith(href)
    );

  return (
    <div className="flex min-h-screen">
      <aside
        className="sin-imprimir vidrio sticky top-0 z-30 hidden h-screen w-[236px] shrink-0 flex-col border-r border-contraste/[0.06] px-3 py-5 lg:flex"
        aria-label="Navegación principal"
      >
        <Link href="/panel" className="mb-5 flex items-center gap-2.5 px-2">
          <Marca />
          <span className="min-w-0">
            <span className="block truncate font-titulo text-medio font-semibold leading-5">Visual App</span>
            <span className="block truncate text-micro text-tinta-tenue">
              {sistema?.config.negocio ?? " "}
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setBuscando(true)}
          className="mb-4 flex h-9 items-center gap-2 rounded-md border border-contraste/[0.06] bg-papel/70 px-2.5 text-base text-tinta-tenue shadow-apoyo transition-colors duration-200 ease-suave hover:border-acento/25 hover:text-tinta-suave"
        >
          <Icono nombre="buscar" tamano={15} />
          <span className="flex-1 text-left">Buscar…</span>
          <Tecla>Ctrl K</Tecla>
        </button>

        {/* En una pantalla baja —una notebook de 768 de alto— la lista entera
            no entra: se desplaza ella sola y la marca y la sesión quedan fijas. */}
        <nav className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
          {visibles.map((grupo, i) => (
            <div key={grupo.titulo} className={cn("flex flex-col gap-0.5", i > 0 && "mt-4")}>
              <p className="etiqueta-campo px-2.5 pb-1">{grupo.titulo}</p>
              {grupo.secciones.map((seccion) => (
                <Renglon
                  key={seccion.href}
                  seccion={seccion}
                  activa={ruta.startsWith(seccion.href)}
                />
              ))}
            </div>
          ))}
        </nav>

        {esDueno && (
          <div className="mt-2">
            <Renglon seccion={CONFIGURACION} activa={ruta.startsWith(CONFIGURACION.href)} />
          </div>
        )}

        <SelectorTema className="mx-1 mt-2" />

        {usuario && <QuienEsta />}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* En el teléfono el encabezado es alto —título, descripción y
            botones— y la lista pasa por debajo a pocos píxeles del texto: con
            el vidrio fino se leían las dos cosas encimadas. Ahí va opaco. */}
        <header className="sin-imprimir vidrio sticky top-0 z-20 border-b border-contraste/[0.06] px-4 py-4 max-lg:bg-lienzo lg:px-8 lg:py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-titulo text-titulo font-semibold">{titulo}</h1>
              {descripcion && (
                <p className="mt-1 max-w-2xl text-base text-tinta-suave">{descripcion}</p>
              )}
            </div>
            {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
          </div>
        </header>

        {/* Cada pantalla entra con un fundido corto: el cambio se nota sin
            que el contenido salte de golpe. */}
        <main className="flex-1 animate-aparecer px-4 pb-28 pt-5 lg:px-8 lg:pb-12">
          {/* La versión nueva se le ofrece al dueño, arriba de cualquier pantalla. */}
          {esDueno && <AvisoActualizacion />}
          {vedada ? <SoloElDueno /> : children}
        </main>

        {/* Casi opaca: el vidrio fino dejaba pasar los números de la lista por
            debajo de los rótulos, y a un rótulo de once píxeles eso lo vuelve
            ilegible. Queda un rastro de desenfoque para que no parezca pegada. */}
        <nav
          className="sin-imprimir fixed bottom-0 left-0 right-0 z-30 flex items-stretch justify-between border-t border-contraste/[0.08] bg-papel/[0.96] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.12)] backdrop-blur-xl lg:hidden"
          aria-label="Secciones"
        >
          {enLaBarra.map((seccion) => {
            const activa = ruta.startsWith(seccion.href);
            return (
              <Link
                key={seccion.href}
                href={seccion.href}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2 text-micro transition-colors",
                  activa ? "font-medium text-acento" : "text-tinta-suave"
                )}
              >
                <Icono nombre={seccion.icono} tamano={20} />
                {seccion.nombre}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMasAbierto(true)}
            aria-haspopup="dialog"
            className={cn(
              "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2 text-micro transition-colors",
              masActiva ? "font-medium text-acento" : "text-tinta-suave"
            )}
          >
            <Icono nombre="puntos" tamano={20} />
            Más
          </button>
        </nav>

        <Dialogo
          abierto={masAbierto}
          onCerrar={() => setMasAbierto(false)}
          titulo="Todas las secciones"
          descripcion={sistema?.config.negocio}
          ancho="max-w-md"
          pie={usuario ? <QuienEstaEnElTelefono /> : undefined}
        >
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => {
                setMasAbierto(false);
                setBuscando(true);
              }}
              className="flex h-11 items-center gap-2.5 rounded-md bg-lienzo px-3.5 text-base text-tinta-tenue"
            >
              <Icono nombre="buscar" tamano={17} />
              Buscar productos, clientes…
            </button>
            <div>
              <p className="etiqueta-campo mb-2">Pantalla</p>
              <SelectorTema conNombres className="[&_span]:max-[380px]:hidden" />
            </div>
            {enMas.map((grupo) => (
              <div key={grupo.titulo}>
                <p className="etiqueta-campo mb-2">{grupo.titulo}</p>
                <div className="grid grid-cols-3 gap-2">
                  {grupo.secciones.map((seccion) => {
                    const activa = ruta.startsWith(seccion.href);
                    return (
                      <Link
                        key={seccion.href}
                        href={seccion.href}
                        onClick={() => setMasAbierto(false)}
                        aria-current={activa ? "page" : undefined}
                        className={cn(
                          "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-md px-1 py-2.5 text-center text-chico transition-colors",
                          activa
                            ? "bg-acento-suave font-medium text-acento-texto"
                            : "bg-lienzo text-tinta-media active:bg-acento-suave"
                        )}
                      >
                        <Icono
                          nombre={seccion.icono}
                          tamano={22}
                          className={activa ? "text-acento" : "text-tinta-suave"}
                        />
                        {seccion.nombre}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Dialogo>

        {buscando && <Paleta onCerrar={cerrarBusqueda} />}
      </div>
    </div>
  );
}

/**
 * Quién tiene el programa abierto, al pie de la columna.
 *
 * Va abajo de todo y no arriba a propósito: es lo que menos se mira y lo que
 * más molesta si compite con la marca. Pero tiene que estar a la vista, porque
 * en un mostrador donde se turnan dos personas, cobrar con la sesión del otro
 * es un error fácil y silencioso.
 */
function QuienEsta() {
  const { usuario, salir } = useSesion();
  const [saliendo, setSaliendo] = useState(false);

  if (!usuario) return null;

  return (
    <div className="mt-2 border-t border-contraste/[0.06] px-2.5 pt-3">
      <p className="truncate text-base font-medium leading-5">{usuario.nombre}</p>
      <p className="text-micro text-tinta-tenue">
        {usuario.rol === "dueno" ? "Dueño" : "Atiende"}
      </p>
      <button
        type="button"
        onClick={() => {
          setSaliendo(true);
          void salir();
        }}
        disabled={saliendo}
        className="mt-1.5 flex items-center gap-1.5 text-chico text-tinta-suave transition-colors hover:text-tinta"
      >
        <Icono nombre="salir" tamano={14} />
        {saliendo ? "Saliendo…" : "Salir"}
      </button>
    </div>
  );
}

/**
 * Lo mismo, al pie de "Más" en el teléfono.
 *
 * Antes no había forma de salir desde un teléfono: la columna, que es donde
 * está el botón, no se muestra en pantallas chicas. Con un teléfono que queda
 * en el mostrador, eso era dejar la sesión del dueño abierta para cualquiera.
 */
function QuienEstaEnElTelefono() {
  const { usuario, salir } = useSesion();
  const [saliendo, setSaliendo] = useState(false);

  if (!usuario) return null;

  return (
    <>
      <div className="mr-auto min-w-0">
        <p className="truncate text-base font-medium leading-5">{usuario.nombre}</p>
        <p className="text-micro text-tinta-tenue">
          {usuario.rol === "dueno" ? "Dueño" : "Atiende"}
        </p>
      </div>
      <Boton
        icono="salir"
        disabled={saliendo}
        onClick={() => {
          setSaliendo(true);
          void salir();
        }}
      >
        {saliendo ? "Saliendo…" : "Salir"}
      </Boton>
    </>
  );
}

/**
 * Lo que ve quien atiende si llega a una pantalla del dueño.
 *
 * Explica y ofrece una salida. Un "403" o una pantalla en blanco dejan a la
 * persona pensando que el programa se rompió, y la siguiente llamada es al que
 * lo vendió.
 */
function SoloElDueno() {
  return (
    <div className="hoja mx-auto max-w-md p-6 text-center">
      <p className="text-base font-medium">Esta pantalla es del dueño.</p>
      <p className="mt-1.5 text-base text-tinta-suave">
        Acá están los costos, las ganancias y los números del negocio. Con tu usuario podés cobrar,
        hacer devoluciones, cargar stock y ver el catálogo y los clientes.
      </p>
      <Link
        href="/caja"
        className="mt-4 inline-flex items-center gap-1.5 text-base font-medium text-acento hover:underline"
      >
        <Icono nombre="caja" tamano={16} />
        Ir a la caja
      </Link>
    </div>
  );
}
