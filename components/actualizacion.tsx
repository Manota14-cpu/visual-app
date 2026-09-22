"use client";

import { useEffect, useState } from "react";
import { Boton, Etiqueta, Hoja } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { escritorio, type EstadoActualizacion } from "@/lib/escritorio";
import { fechaHora } from "@/lib/formato";

/**
 * Las actualizaciones, vistas desde la interfaz.
 *
 * Quien busca, baja e instala es el programa (`electron/main.js`, con
 * electron-updater contra GitHub Releases). Acá solo se muestra en qué anda y
 * se le pasan los botones que toca el dueño.
 */
export function useActualizacion() {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null);

  useEffect(() => {
    const puente = escritorio();
    if (!puente) return;

    let vigente = true;
    void puente.actualizacion.estado().then((inicial) => {
      if (vigente && inicial) setEstado(inicial);
    });
    const dejar = puente.actualizacion.alCambiar((nuevo) => setEstado(nuevo));

    return () => {
      vigente = false;
      dejar();
    };
  }, []);

  const puente = escritorio();
  return {
    estado,
    buscar: () => void puente?.actualizacion.buscar(),
    descargar: () => void puente?.actualizacion.descargar(),
    instalar: () => void puente?.actualizacion.instalar(),
  };
}

/** "Más tarde" dura hasta que se cierra el programa: al volver a abrirlo, avisa de nuevo. */
const CLAVE_MAS_TARDE = "actualizacion-mas-tarde";

function leerMasTarde(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_MAS_TARDE);
  } catch {
    return null;
  }
}

/**
 * El aviso de versión nueva, arriba de cada pantalla.
 *
 * Solo para el dueño: quien atiende el mostrador no tiene por qué decidir
 * reiniciar el programa en medio de un turno. Y solo cuando hay algo que
 * decidir: sin versión nueva, no ocupa lugar.
 */
export function AvisoActualizacion() {
  const { estado, descargar, instalar } = useActualizacion();
  const [masTarde, setMasTarde] = useState<string | null>(() => leerMasTarde());

  if (!estado) return null;

  const { fase, actual, nueva, progreso } = estado;
  const pendiente = fase === "disponible" && nueva !== null;
  if (!pendiente && fase !== "descargando" && fase !== "lista") return null;
  if (pendiente && masTarde === nueva) return null;

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-dato-linea bg-dato-fondo px-4 py-3.5 text-base"
    >
      <Icono
        nombre={fase === "lista" ? "listo" : "recargar"}
        tamano={18}
        className="shrink-0 text-acento"
      />

      <div className="min-w-0 flex-1">
        {fase === "disponible" && (
          <>
            <p className="font-medium text-tinta">Hay una nueva versión disponible.</p>
            <p className="text-chico text-tinta-suave">
              Versión actual: {actual} · Nueva versión: {nueva}
            </p>
          </>
        )}

        {fase === "descargando" && (
          <>
            <p className="font-medium text-tinta">
              Descargando actualización… <span className="cifra">{progreso}%</span>
            </p>
            <div
              className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-acento/15"
              role="progressbar"
              aria-valuenow={progreso}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-acento transition-[width] duration-300 ease-suave"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </>
        )}

        {fase === "lista" && (
          <>
            <p className="font-medium text-tinta">La actualización está lista.</p>
            <p className="text-chico text-tinta-suave">
              Se instala al reiniciar, en menos de un minuto. Si preferís seguir, se instala sola la
              próxima vez que cierres el programa.
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {fase === "disponible" && (
          <>
            <Boton
              onClick={() => {
                try {
                  sessionStorage.setItem(CLAVE_MAS_TARDE, nueva ?? "");
                } catch {
                  // Sin almacenamiento, "más tarde" dura hasta la próxima pantalla.
                }
                setMasTarde(nueva);
              }}
            >
              Más tarde
            </Boton>
            <Boton tono="principal" onClick={descargar}>
              Actualizar ahora
            </Boton>
          </>
        )}
        {fase === "lista" && (
          <Boton tono="principal" icono="recargar" onClick={instalar}>
            Reiniciar y actualizar
          </Boton>
        )}
      </div>
    </div>
  );
}

/** La tarjeta de Configuración → Programa. */
export function TarjetaActualizaciones() {
  const { estado, buscar, descargar, instalar } = useActualizacion();

  if (!escritorio()) {
    return (
      <Hoja titulo="Actualizaciones">
        <p className="text-base text-tinta-suave">
          Las actualizaciones se hacen desde la computadora del negocio, en el programa instalado.
        </p>
      </Hoja>
    );
  }

  if (!estado) return null;

  const { fase, actual, nueva, notas, progreso, error, revisadaEn } = estado;

  return (
    <Hoja
      titulo="Actualizaciones"
      accion={
        fase === "disponible" || fase === "lista" ? (
          <Etiqueta tono="exito">hay una nueva</Etiqueta>
        ) : fase === "al-dia" ? (
          <Etiqueta tono="neutral">al día</Etiqueta>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base">
          Versión actual: <strong className="cifra">{actual}</strong>
          {nueva && fase !== "al-dia" && (
            <>
              {" "}
              · Nueva versión: <strong className="cifra">{nueva}</strong>
            </>
          )}
        </p>

        {fase === "disponible" && notas && (
          <p className="max-h-40 overflow-y-auto whitespace-pre-line rounded-md border border-linea bg-lienzo p-3 text-chico text-tinta-media">
            {notas}
          </p>
        )}

        {fase === "descargando" && (
          <div>
            <p className="text-base">
              Descargando actualización… <span className="cifra">{progreso}%</span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-acento/15">
              <div
                className="h-full rounded-full bg-acento transition-[width] duration-300 ease-suave"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </div>
        )}

        {fase === "lista" && (
          <p className="text-base text-tinta-suave">
            La actualización está lista. Conviene reiniciar con la caja cerrada; si no, se instala
            sola la próxima vez que cierres el programa. Tus datos no se tocan.
          </p>
        )}

        {fase === "al-dia" && (
          <p className="text-base text-tinta-suave">Tenés la última versión.</p>
        )}

        {error && <p className="text-chico text-tinta-tenue">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          {fase === "disponible" && (
            <Boton tono="principal" onClick={descargar}>
              Actualizar ahora
            </Boton>
          )}
          {fase === "error" && nueva && (
            <Boton tono="principal" onClick={descargar}>
              Reintentar la descarga
            </Boton>
          )}
          {fase === "lista" && (
            <Boton tono="principal" icono="recargar" onClick={instalar}>
              Reiniciar y actualizar
            </Boton>
          )}
          {fase !== "descargando" && fase !== "lista" && fase !== "no-disponible" && (
            <Boton icono="recargar" onClick={buscar} disabled={fase === "buscando"}>
              {fase === "buscando" ? "Buscando…" : "Buscar actualizaciones"}
            </Boton>
          )}
          {revisadaEn && (
            <span className="text-chico text-tinta-tenue">Última vez: {fechaHora(revisadaEn)}</span>
          )}
        </div>
      </div>
    </Hoja>
  );
}
