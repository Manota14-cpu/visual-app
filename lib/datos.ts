"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErrorApi } from "@/lib/api";

/**
 * Traer datos del backend y saber en qué estado está la pantalla.
 *
 * Devuelve también `recargar`, que es lo que se llama después de guardar: la
 * pantalla vuelve a pedir lo que muestra en vez de intentar adivinar cómo
 * quedó la lista. Con una operación que toca stock, caja y pedidos a la vez,
 * adivinar sale mal enseguida.
 */
export function useDatos<T>(ruta: string | null, opciones?: { silencioso?: boolean }) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(ruta !== null);
  const [error, setError] = useState<string | null>(null);

  // Una respuesta vieja no puede pisar a una nueva: al tipear en el buscador
  // salen varios pedidos y no siempre vuelven en orden.
  const pedidoActual = useRef(0);

  const traer = useCallback(async () => {
    if (ruta === null) {
      setDatos(null);
      setCargando(false);
      return;
    }

    const numero = ++pedidoActual.current;
    if (!opciones?.silencioso) setCargando(true);

    try {
      const respuesta = await api.get<T>(ruta);
      if (numero !== pedidoActual.current) return;
      setDatos(respuesta);
      setError(null);
    } catch (e) {
      if (numero !== pedidoActual.current) return;
      setError(e instanceof ErrorApi ? e.message : "No se pudieron traer los datos.");
    } finally {
      if (numero === pedidoActual.current) setCargando(false);
    }
    // `opciones` se arma nuevo en cada render; solo importa la ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta]);

  useEffect(() => {
    // Este es el caso que el efecto existe para cubrir: sincronizar la pantalla
    // con un sistema externo —el backend— cuando cambia lo que hay que pedirle.
    // La regla apunta a los efectos que derivan estado de otro estado; acá el
    // dato no se puede derivar de nada, hay que ir a buscarlo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void traer();
  }, [traer]);

  return { datos, cargando, error, recargar: traer, setDatos };
}

/**
 * Espera a que se deje de escribir antes de buscar.
 *
 * Sin esto, escribir "servilletas" son once consultas de las que solo importa
 * la última.
 */
export function useEspera<T>(valor: T, ms = 280): T {
  const [esperado, setEsperado] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setEsperado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);

  return esperado;
}
