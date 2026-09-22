"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * La entrada.
 *
 * El sitio se compila estático, así que la redirección no la puede hacer el
 * servidor: la hace el navegador apenas carga. Nadie ve esta pantalla más de
 * un parpadeo.
 */
export default function Inicio() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/panel");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="font-titulo text-medio text-tinta-suave">Abriendo Visual Solution…</p>
    </main>
  );
}
