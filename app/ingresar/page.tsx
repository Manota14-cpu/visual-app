"use client";

import { useState } from "react";
import { Boton, Campo, Hoja } from "@/components/ui";
import { api, ErrorApi } from "@/lib/api";
import { useSesion } from "@/lib/sesion";

/**
 * La pantalla de ingreso.
 *
 * Va fuera del `Marco`: la columna con las secciones no tiene sentido antes de
 * entrar, y mostrarla ofrece puertas que todavía están cerradas.
 *
 * Tiene dos caras según el estado del negocio:
 *
 * - **Todavía no hay usuarios.** Se ofrece crear el primero, que queda de
 *   dueño. Es el camino de quien prende la llave por primera vez.
 * - **Ya hay.** Se pide usuario y contraseña.
 */
export default function PaginaIngresar() {
  const { exigeIngreso, cargando } = useSesion();

  return (
    <div className="flex min-h-screen items-center justify-center bg-lienzo px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca.svg" alt="" aria-hidden="true" className="h-14 w-14" draggable={false} />
          <span>
            <span className="block font-titulo text-grande font-semibold">Visual App</span>
            <span className="block text-base text-tinta-suave">
              Stock, caja y ventas del negocio
            </span>
          </span>
        </div>

        {cargando ? (
          <Hoja titulo="">
            <p className="py-4 text-center text-base text-tinta-suave">Un momento…</p>
          </Hoja>
        ) : exigeIngreso ? (
          <Entrar />
        ) : (
          <PrimerUsuario />
        )}
      </div>
    </div>
  );
}

/** El formulario de todos los días. */
function Entrar() {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setError(null);

    try {
      await api.post("/usuarios/ingresar", { usuario, clave });
      // Recarga entera en vez de navegar: así todas las pantallas arrancan
      // pidiendo sus datos con la sesión nueva, sin nada de antes en memoria.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/panel";
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo entrar.");
      setEntrando(false);
    }
  }

  return (
    <Hoja titulo="Entrar">
      <form className="flex flex-col gap-4" onSubmit={(e) => void entrar(e)}>
        <Campo
          etiqueta="Usuario"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          autoComplete="current-password"
        />

        {error && (
          <p className="rounded-md border border-alerta-linea bg-alerta-fondo px-3 py-2 text-base text-alerta-texto">
            {error}
          </p>
        )}

        <Boton tono="principal" type="submit" disabled={entrando || !usuario || !clave}>
          {entrando ? "Entrando…" : "Entrar"}
        </Boton>
      </form>
    </Hoja>
  );
}

/**
 * El alta del primero, cuando el negocio todavía no tiene ninguno.
 *
 * Queda de dueño siempre. Y el texto dice qué pasa después de apretar, porque
 * esto cambia cómo se usa el programa de acá en más: hasta ahora se abría y
 * listo.
 */
function PrimerUsuario() {
  const { refrescar } = useSesion();
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();

    if (clave !== repetida) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setCreando(true);
    setError(null);

    try {
      await api.post("/usuarios/primero", { nombre, usuario, clave });
      await refrescar();
      // Igual que al entrar: arrancar de cero con la sesión ya abierta.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/panel";
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo crear el usuario.");
      setCreando(false);
    }
  }

  return (
    <Hoja titulo="Crear el primer usuario">
      <form className="flex flex-col gap-4" onSubmit={(e) => void crear(e)}>
        <p className="text-base text-tinta-suave">
          Vas a quedar como <strong className="text-tinta">dueño</strong>: ves y tocás todo. Después
          podés dar de alta a quien atiende, que cobra y ve el stock pero no ve los costos, los
          márgenes ni los informes.
        </p>

        <Campo
          etiqueta="Tu nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
          placeholder="Como querés que aparezca"
        />
        <Campo
          etiqueta="Usuario"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Con esto vas a entrar"
          ayuda="Sin espacios ni acentos. Por ejemplo: joaco"
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          autoComplete="new-password"
        />
        <Campo
          etiqueta="Repetila"
          type="password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          autoComplete="new-password"
          // Escribirla dos veces no es burocracia: si la primera tiene un dedazo
          // y nadie más la sabe, no hay forma de entrar nunca más.
          ayuda="Si la perdés, no hay forma de recuperarla."
        />

        {error && (
          <p className="rounded-md border border-alerta-linea bg-alerta-fondo px-3 py-2 text-base text-alerta-texto">
            {error}
          </p>
        )}

        <Boton
          tono="principal"
          type="submit"
          disabled={creando || !nombre || !usuario || !clave || !repetida}
        >
          {creando ? "Creando…" : "Crear y entrar"}
        </Boton>
      </form>
    </Hoja>
  );
}
