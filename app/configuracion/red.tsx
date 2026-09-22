"use client";

import { useMemo, useState } from "react";
import { Boton, Etiqueta, Hoja } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { useDatos } from "@/lib/datos";
import { matrizQr } from "@/lib/qr";

/**
 * Entrar desde el celular del mostrador.
 *
 * El programa escucha en 127.0.0.1 y ahí no llega nadie de afuera. Prender
 * esto lo pone a escuchar en la red del local: el celular y la tablet entran
 * por wifi, con su usuario y su contraseña.
 *
 * Nunca sale a internet. El servidor solo acepta direcciones privadas —las que
 * reparte el router puertas adentro—, así que esto es el wifi del local y nada
 * más.
 */
export function AccesoDesdeElCelular() {
  const avisos = useAvisos();
  const { datos, recargar } = useDatos<{
    enRed: boolean;
    hayUsuarios: boolean;
    puerto: number;
    direcciones: string[];
    escuchandoEnRed: boolean;
  }>("/sistema/red");

  const [cambiando, setCambiando] = useState(false);

  async function cambiar(enRed: boolean) {
    setCambiando(true);
    try {
      await api.put("/sistema/red", { enRed });
      avisos.exito(
        enRed
          ? "Listo. Cerrá y volvé a abrir el programa para que empiece a atender al celular."
          : "El celular ya no va a poder entrar. Cerrá y volvé a abrir el programa."
      );
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cambiar.");
    } finally {
      setCambiando(false);
    }
  }

  if (!datos) return null;

  const direccion = datos.direcciones[0]
    ? `http://${datos.direcciones[0]}:${datos.puerto}`
    : null;

  // Lo configurado y lo que está pasando pueden no coincidir: el cambio recién
  // se aplica al reabrir. Decirlo evita que alguien pruebe desde el celular,
  // no funcione, y crea que está roto.
  const faltaReabrir = datos.enRed !== datos.escuchandoEnRed;

  return (
    <Hoja
      titulo="Entrar desde el celular"
      accion={
        <Etiqueta tono={datos.escuchandoEnRed ? "exito" : "neutral"}>
          {datos.escuchandoEnRed ? "Prendido" : "Apagado"}
        </Etiqueta>
      }
    >
      <div className="flex flex-col gap-4">
        {!datos.enRed ? (
          <>
            <p className="text-base text-tinta-suave">
              Podés cobrar desde el celular o una tablet conectados al wifi del local: la misma
              caja, el mismo stock. Cada uno entra con su usuario.
            </p>
            <p className="text-base text-tinta-suave">
              No sale a internet. El programa solo atiende direcciones de la red del local; desde
              afuera sigue sin poder entrar nadie.
            </p>

            {!datos.hayUsuarios ? (
              // Sin contraseña esto no se puede prender, y el servidor lo
              // rechaza igual. Decirlo acá evita apretar un botón que falla.
              <div className="rounded-md border border-aviso-linea bg-aviso-fondo px-3 py-2.5 text-base text-aviso-texto">
                <strong>Primero creá los usuarios.</strong> Sin contraseña, cualquiera conectado al
                wifi —incluido un cliente— entraría a la caja.
              </div>
            ) : (
              <div>
                <Boton
                  tono="principal"
                  icono="clientes"
                  onClick={() => void cambiar(true)}
                  disabled={cambiando}
                >
                  Permitir el celular
                </Boton>
              </div>
            )}
          </>
        ) : (
          <>
            {faltaReabrir && (
              <div className="rounded-md border border-aviso-linea bg-aviso-fondo px-3 py-2.5 text-base text-aviso-texto">
                <strong>Falta cerrar y volver a abrir el programa.</strong> Recién ahí empieza a
                atender al celular.
              </div>
            )}

            {direccion && !faltaReabrir && (
              <div className="flex flex-col items-center gap-3 rounded-md border border-linea bg-lienzo p-4">
                <p className="text-center text-base text-tinta-suave">
                  Apuntá la cámara del celular, conectado al wifi del local.
                </p>
                <Qr texto={direccion} />
                <p className="cifra break-all text-center text-base font-medium">{direccion}</p>
              </div>
            )}

            {datos.direcciones.length > 1 && (
              <div>
                <p className="etiqueta-campo">Si esa no anda, probá con</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {datos.direcciones.slice(1).map((ip) => (
                    <li key={ip} className="cifra text-base text-tinta-suave">
                      http://{ip}:{datos.puerto}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-chico text-tinta-suave">
                  Aparece más de una cuando la computadora está por wifi y por cable a la vez.
                </p>
              </div>
            )}

            {datos.direcciones.length === 0 && (
              <p className="rounded-md border border-alerta-linea bg-alerta-fondo px-3 py-2.5 text-base text-alerta-texto">
                Esta computadora no está conectada a ninguna red. Conectala al wifi del local.
              </p>
            )}

            <p className="text-chico text-tinta-suave">
              La primera vez, Windows puede preguntar si permitís el acceso en redes privadas.
              Decile que sí, o el celular no va a llegar.
            </p>

            <div>
              <Boton onClick={() => void cambiar(false)} disabled={cambiando}>
                Dejar de permitirlo
              </Boton>
            </div>
          </>
        )}
      </div>
    </Hoja>
  );
}

/**
 * El código, dibujado como SVG.
 *
 * Un `rect` por módulo negro y nada más. A este tamaño son unos cientos de
 * rectángulos: el navegador ni se entera, y sale nítido a cualquier zoom, que
 * es lo que una cámara necesita.
 */
function Qr({ texto }: { texto: string }) {
  const matriz = useMemo(() => {
    try {
      return matrizQr(texto);
    } catch {
      return null;
    }
  }, [texto]);

  if (!matriz) return null;

  // El margen blanco alrededor no es decorativo: sin él los lectores no
  // encuentran dónde empieza el código. La norma pide cuatro módulos.
  const margen = 4;
  const lado = matriz.length + margen * 2;

  return (
    <svg
      viewBox={`0 0 ${lado} ${lado}`}
      className="h-52 w-52"
      role="img"
      aria-label={`Código para entrar a ${texto}`}
    >
      <rect width={lado} height={lado} fill="#FFFFFF" />
      {matriz.map((fila, y) =>
        fila.map((negro, x) =>
          negro ? (
            <rect key={`${x}-${y}`} x={x + margen} y={y + margen} width={1} height={1} fill="#1D1D1F" />
          ) : null
        )
      )}
    </svg>
  );
}
