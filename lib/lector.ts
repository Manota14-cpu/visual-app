"use client";

import { useEffect, useRef } from "react";

/**
 * El lector de códigos de barras, escuchado en toda la pantalla.
 *
 * Un lector USB es un teclado: escribe el código de corrido y aprieta Enter.
 * Lo que escribe cae donde esté el cursor. En la caja eso era el problema: si
 * el cursor no estaba en el buscador —se había tocado el carrito, un botón, la
 * cantidad de un renglón— la lectura se perdía, o peor, terminaba escrita en
 * el campo de cantidad y el renglón pasaba a pedir 7.790.895.000.997 unidades.
 *
 * Se distingue al lector de una persona por la velocidad: el lector manda cada
 * tecla a pocos milisegundos de la anterior; nadie escribe así a mano.
 *
 *   - Con el cursor fuera de cualquier campo, la ráfaga se toma entera.
 *   - Con el cursor en un campo que no es el buscador, se deja escribir (no hay
 *     forma de saber que es una ráfaga hasta la segunda tecla) y al Enter se
 *     devuelve el campo a lo que tenía antes de la ráfaga.
 *   - El buscador de productos (`data-lector="propio"`) se maneja solo: ahí
 *     el Enter ya busca el código.
 *
 * Con un diálogo abierto no escucha: el cobro, la devolución y el cierre
 * tienen su propio buscador o no reciben productos.
 */

/** Más que esto entre teclas ya es una persona escribiendo. */
const ENTRE_TECLAS_MS = 45;
/** Lo mínimo para ser un código: hay códigos internos cortos, de estantería. */
const LARGO_MINIMO = 4;

export function useLectorDeCodigos(alLeer: (codigo: string) => void, activo = true): void {
  // La función cambia en cada dibujo; el oyente se registra una sola vez.
  const funcion = useRef(alLeer);
  useEffect(() => {
    funcion.current = alLeer;
  });

  useEffect(() => {
    if (!activo) return;

    let texto = "";
    let ultima = 0;
    // El campo donde cayó la ráfaga y lo que tenía antes, para devolvérselo.
    let campo: HTMLInputElement | HTMLTextAreaElement | null = null;
    let valorPrevio = "";

    const reiniciar = () => {
      texto = "";
      campo = null;
    };

    const alTeclear = (evento: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return reiniciar();
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return reiniciar();

      const destino = evento.target as HTMLElement | null;
      if (destino?.closest("[data-lector='propio']")) return reiniciar();

      const ahora = performance.now();
      const seguida = ahora - ultima <= ENTRE_TECLAS_MS;
      ultima = ahora;

      if (evento.key === "Enter") {
        const codigo = texto.trim();
        const eraRafaga = seguida && codigo.length >= LARGO_MINIMO;
        const donde = campo;
        const antes = valorPrevio;
        reiniciar();
        if (!eraRafaga) return;

        evento.preventDefault();
        if (donde) devolver(donde, antes);
        funcion.current(codigo);
        return;
      }

      // `key` llega vacío cuando el navegador autocompleta un campo.
      if (evento.key?.length !== 1) return;

      if (!seguida) {
        // Primera tecla de lo que puede ser una ráfaga.
        texto = "";
        const editable =
          destino instanceof HTMLInputElement || destino instanceof HTMLTextAreaElement
            ? destino
            : null;
        campo = editable;
        valorPrevio = editable?.value ?? "";
      }
      texto += evento.key;
    };

    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, [activo]);
}

/**
 * Le devuelve a un campo el valor que tenía, avisándole a React.
 *
 * Asignar `value` a mano no dispara el `onChange` de React, y el estado
 * quedaría con el código pegado. Se usa el `setter` nativo y un evento
 * `input`, que es lo que React escucha.
 */
function devolver(campo: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const prototipo = campo instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const asignar = Object.getOwnPropertyDescriptor(prototipo, "value")?.set;
  asignar?.call(campo, valor);
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Un pitido corto, como el de cualquier lector de supermercado.
 *
 * Quien pasa productos no mira la pantalla en cada uno: el sonido dice si
 * entró o no. Uno agudo y corto si entró; dos graves si el código no existe.
 */
let audio: AudioContext | null = null;

export function pitido(tipo: "ok" | "error"): void {
  try {
    audio ??= new AudioContext();
    const tonos = tipo === "ok" ? [[1760, 0, 0.07]] : [[330, 0, 0.12], [262, 0.16, 0.16]];
    for (const [frecuencia, desde, dura] of tonos as [number, number, number][]) {
      const oscilador = audio.createOscillator();
      const volumen = audio.createGain();
      oscilador.type = "square";
      oscilador.frequency.value = frecuencia;
      const t = audio.currentTime + desde;
      volumen.gain.setValueAtTime(0.0001, t);
      volumen.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
      volumen.gain.exponentialRampToValueAtTime(0.0001, t + dura);
      oscilador.connect(volumen).connect(audio.destination);
      oscilador.start(t);
      oscilador.stop(t + dura + 0.02);
    }
  } catch {
    // Sin sonido no se frena nada.
  }
}
