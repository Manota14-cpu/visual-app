"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boton, Campo } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { api, ErrorApi } from "@/lib/api";
import { useSesion } from "@/lib/sesion";
import type { UsuarioSesion } from "@/lib/tipos";

/** Cada cuánto se mira el reloj. El bloqueo puede llegar hasta esto tarde. */
const CADA_MS = 15_000;

/**
 * La pantalla se bloquea sola cuando nadie la toca.
 *
 * El empleado que deja la caja abierta y se va deja entrar a cualquiera con
 * su usuario. Pasados los minutos que eligió el dueño sin tocar nada, se
 * cierra la sesión en el servidor —recargar la página no la devuelve— y se
 * pide la contraseña encima de lo que había.
 *
 * Lo que había no se pierde: el carrito a medio cobrar sigue ahí si vuelve la
 * misma persona. Si entra otra, se recarga todo, igual que al salir: no puede
 * encontrarse con los datos del anterior.
 *
 * Es un <dialog> modal y no un div encima: un modal abierto después queda
 * arriba de todo, incluso de un cobro que ya estaba abierto.
 */
export function Bloqueo() {
  const { usuario, exigeIngreso, bloqueoMinutos, refrescar } = useSesion();
  const activo = exigeIngreso && usuario !== null && bloqueoMinutos > 0;

  const [bloqueado, setBloqueado] = useState<UsuarioSesion | null>(null);
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const ultimoUso = useRef(0);
  const dialogo = useRef<HTMLDialogElement>(null);

  const bloquear = useCallback(() => {
    if (!usuario) return;
    setBloqueado(usuario);
    setNombre(usuario.usuario);
    setClave("");
    setError(null);
    // La sesión se cierra de verdad: sin esto, recargar la página alcanzaba
    // para saltearse la contraseña.
    void api.post("/usuarios/salir").catch(() => {});
  }, [usuario]);

  useEffect(() => {
    if (!activo || bloqueado) return;

    ultimoUso.current = Date.now();
    const uso = () => {
      ultimoUso.current = Date.now();
    };
    // El lector de códigos es un teclado: pasar productos cuenta como uso.
    const eventos = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const e of eventos) window.addEventListener(e, uso, { capture: true, passive: true });

    // Se compara con la hora y no con un temporizador de N minutos: una
    // computadora que se suspendió vuelve con el reloj adelantado y se
    // bloquea en la primera mirada, en vez de esperar otros N minutos.
    const reloj = setInterval(() => {
      if (Date.now() - ultimoUso.current >= bloqueoMinutos * 60_000) bloquear();
    }, CADA_MS);

    return () => {
      for (const e of eventos) window.removeEventListener(e, uso, { capture: true });
      clearInterval(reloj);
    };
  }, [activo, bloqueado, bloqueoMinutos, bloquear]);

  useEffect(() => {
    const d = dialogo.current;
    if (bloqueado && d && !d.open) {
      d.showModal();
      // El modal lleva el foco al primer campo, que es el usuario; quien
      // vuelve casi siempre es el mismo y lo que tiene que escribir es la clave.
      d.querySelector<HTMLInputElement>("input[type=password]")?.focus();
    }
  }, [bloqueado]);

  async function entrar() {
    if (!bloqueado) return;
    setEntrando(true);
    setError(null);
    try {
      const r = await api.post<{ usuario: UsuarioSesion }>("/usuarios/ingresar", {
        usuario: nombre,
        clave,
      });
      if (r.usuario.id !== bloqueado.id) {
        // Entró otra persona: se tira todo lo que quedó en memoria.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/";
        return;
      }
      dialogo.current?.close();
      setBloqueado(null);
      setClave("");
      await refrescar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo entrar.");
    } finally {
      setEntrando(false);
    }
  }

  if (!bloqueado) return null;

  return (
    <dialog
      ref={dialogo}
      aria-label="Pantalla bloqueada"
      // Escape no lo cierra: es justo lo que haría quien no sabe la contraseña.
      onCancel={(e) => e.preventDefault()}
      className="m-0 h-full max-h-none w-full max-w-none border-0 bg-lienzo/[0.97] p-0 text-tinta backdrop:bg-black/40 backdrop:backdrop-blur-md"
    >
      <div className="flex min-h-full items-center justify-center px-4 py-10">
        <form
          className="flex w-full max-w-sm animate-entrar flex-col gap-4 rounded-xl bg-papel p-6 shadow-flotante ring-1 ring-contraste/[0.06]"
          onSubmit={(e) => {
            e.preventDefault();
            void entrar();
          }}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-acento-suave text-acento">
              <Icono nombre="candado" tamano={22} />
            </span>
            <h2 className="font-titulo text-medio font-semibold">Pantalla bloqueada</h2>
            <p className="text-chico text-tinta-suave">
              Pasaron {bloqueoMinutos} {bloqueoMinutos === 1 ? "minuto" : "minutos"} sin uso. Escribí la
              contraseña para seguir: lo que estaba abierto sigue ahí.
            </p>
          </div>

          <Campo
            etiqueta="Usuario"
            autoComplete="username"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Campo
            etiqueta="Contraseña"
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            error={error}
          />

          <Boton type="submit" tono="principal" disabled={entrando || !clave}>
            {entrando ? "Entrando…" : "Desbloquear"}
          </Boton>
          <p className="text-center text-chico text-tinta-suave">
            Si entra otra persona, se empieza de cero: no ve lo que dejó abierto la anterior.
          </p>
        </form>
      </div>
    </dialog>
  );
}
