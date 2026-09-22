"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ErrorApi } from "@/lib/api";
import type { Rol, UsuarioSesion } from "@/lib/tipos";

/**
 * Quién tiene la aplicación abierta.
 *
 * Se pregunta una sola vez al arrancar y queda acá, para que cada pantalla
 * sepa qué mostrar sin volver a pedirlo. Lo que se esconde en la interfaz es
 * para no ofrecer lo que no se puede hacer; quien de verdad lo impide es el
 * servidor, que comprueba el permiso en cada ruta.
 */

interface Estado {
  /** Null mientras se está preguntando. */
  usuario: UsuarioSesion | null;
  /** Falso mientras el negocio no cargó ningún usuario. */
  exigeIngreso: boolean;
  cargando: boolean;
  /** Atajo: sin usuarios cargados, todo el mundo puede todo. */
  esDueno: boolean;
  refrescar: () => Promise<void>;
  salir: () => Promise<void>;
}

const Contexto = createContext<Estado | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [exigeIngreso, setExigeIngreso] = useState(false);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      const r = await api.get<{ exigeIngreso: boolean; usuario: UsuarioSesion | null }>(
        "/usuarios/yo"
      );
      setUsuario(r.usuario);
      setExigeIngreso(r.exigeIngreso);
    } catch {
      // Si el programa no contesta, no hay nada que decidir: la pantalla ya
      // muestra su propio error de "no se puede hablar con el programa".
      setUsuario(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refrescar();
  }, [refrescar]);

  const salir = useCallback(async () => {
    try {
      await api.post("/usuarios/salir");
    } catch {
      // Que el pedido falle no puede dejar a alguien encerrado adentro: la
      // pantalla va a la de ingreso igual.
    }
    setUsuario(null);

    // Recarga entera y no una navegación de Next, a propósito: al salir hay
    // que tirar TODO lo que quedó en memoria del que se va —el catálogo con
    // sus costos, los informes, el carrito a medio armar—. Con `router.push`
    // eso sobrevive en las cachés de React y el siguiente que entra se
    // encuentra con datos del anterior.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/ingresar";
  }, []);

  return (
    <Contexto.Provider
      value={{
        usuario,
        exigeIngreso,
        cargando,
        // Sin usuarios cargados la aplicación funciona como siempre: todo
        // visible, como antes de que esto existiera.
        esDueno: !exigeIngreso || usuario?.rol === "dueno",
        refrescar,
        salir,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useSesion(): Estado {
  const estado = useContext(Contexto);
  if (!estado) throw new Error("useSesion necesita estar adentro de ProveedorSesion.");
  return estado;
}

/** ¿Este rol alcanza para esto? */
export function alcanza(rol: Rol | undefined, necesario: Rol): boolean {
  if (necesario === "empleado") return true;
  return rol === "dueno";
}

/**
 * Manda a la pantalla de ingreso cuando el servidor contesta que hace falta.
 *
 * Se mira el error y no un estado propio porque la sesión se vence del lado
 * del servidor: la pantalla puede creer que sigue adentro doce horas después,
 * y recién se entera cuando pide algo.
 */
export function esFaltaDeSesion(error: unknown): boolean {
  return error instanceof ErrorApi && error.estado === 401;
}
