"use client";

import { useSyncExternalStore } from "react";

/**
 * Claro, oscuro o lo que diga Windows.
 *
 * La elección es de cada computadora y cada celular, no del negocio: quien
 * cierra la caja de noche puede querer la pantalla oscura, y el celular del
 * mostrador sigue el tema del teléfono. Por eso no va en el archivo de datos.
 *
 * Se guarda en una cookie y no en `localStorage`: el almacenamiento del
 * navegador es por puerto, y si el programa arranca en otro puerto porque el
 * de siempre estaba ocupado, la elección se perdía. Las cookies no distinguen
 * puertos.
 *
 * Lo que decide el color es el atributo `data-tema` de `<html>`, que vale
 * siempre "claro" u "oscuro" —ya resuelto—. Lo pone `SCRIPT_TEMA` antes de
 * que se dibuje nada, para que la pantalla no arranque blanca y se oscurezca
 * un instante después.
 */
export type Tema = "automatico" | "claro" | "oscuro";

const COOKIE = "visualapp-tema";

/**
 * El fondo de cada tema (`--lienzo` en app/globals.css), para la barra del
 * navegador del celular: la que viene de fábrica sigue al sistema, y con un
 * tema elegido a mano quedaba una barra negra sobre una pantalla clara.
 */
const FONDO = { claro: "#F5F5F7", oscuro: "#101012" };

/**
 * Lo mismo que `aplicarTema`, escrito para ir suelto en el `<head>`: corre
 * antes que React y que cualquier estilo, y sigue escuchando si Windows cambia
 * de tema con el programa abierto.
 */
export const SCRIPT_TEMA = `(function(){
  var m = window.matchMedia("(prefers-color-scheme: dark)");
  function elegido(){ var c = document.cookie.match(/(?:^|; )${COOKIE}=(claro|oscuro|automatico)/); return c ? c[1] : "automatico"; }
  function aplicar(){
    var t = elegido(), oscuro = t === "automatico" ? m.matches : t === "oscuro";
    document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", oscuro ? "${FONDO.oscuro}" : "${FONDO.claro}");
  }
  aplicar();
  document.addEventListener("DOMContentLoaded", aplicar);
  m.addEventListener("change", aplicar);
})();`;

export function leerTema(): Tema {
  if (typeof document === "undefined") return "automatico";
  const guardado = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=(claro|oscuro|automatico)`));
  return (guardado?.[1] as Tema | undefined) ?? "automatico";
}

export function aplicarTema(tema: Tema): void {
  const oscuro =
    tema === "oscuro" || (tema === "automatico" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", oscuro ? FONDO.oscuro : FONDO.claro));
}

const oyentes = new Set<() => void>();

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

/** El tema elegido y cómo cambiarlo. Cambiarlo se ve al instante en toda la ventana. */
export function useTema(): [Tema, (tema: Tema) => void] {
  // En el armado estático no hay cookies: la página sale "automático" y se
  // corrige al abrirla, sin que React proteste por la diferencia.
  const tema = useSyncExternalStore(suscribir, leerTema, () => "automatico" as Tema);

  function elegir(nuevo: Tema) {
    document.cookie = `${COOKIE}=${nuevo}; path=/; max-age=${60 * 60 * 24 * 365 * 5}; samesite=lax`;
    aplicarTema(nuevo);
    oyentes.forEach((avisar) => avisar());
  }

  return [tema, elegir];
}
