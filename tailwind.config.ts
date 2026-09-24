import type { Config } from "tailwindcss";

/** Un color del tema, con la opacidad que pida la clase (`bg-acento/40`). */
const color = (nombre: string) => `rgb(var(--${nombre}) / <alpha-value>)`;

/**
 * El sistema visual.
 *
 * Superficies blancas apoyadas sobre un gris muy claro, capas de sombra
 * difusas en vez de bordes marcados, vidrio esmerilado en lo que flota
 * —barra lateral, encabezado, diálogos— y un solo azul para lo accionable.
 * La tipografía es la del sistema: SF en Mac, Segoe Variable en Windows.
 *
 * Hay un tema oscuro con la misma lógica: gris casi negro de fondo y
 * tarjetas un escalón más claras. Los valores de los dos están en
 * app/globals.css.
 *
 * Los nombres de los tokens son los mismos de siempre (lienzo, papel, tinta,
 * línea): cambia lo que valen, no dónde se usan.
 */
const config: Config = {
  // `dark:` para lo poco que no se resuelve con los colores del tema: vale
  // cuando `<html>` tiene `data-tema="oscuro"` (ver lib/tema.ts).
  darkMode: ["selector", '[data-tema="oscuro"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cada color es una variable de app/globals.css con su valor claro y
        // su valor oscuro: la pantalla cambia de tema sin que ningún
        // componente sepa que existe. Los nombres son los de siempre.
        //
        // El gris de fondo de Apple. Las tarjetas blancas encima se despegan
        // sin necesidad de un borde oscuro.
        lienzo: color("lienzo"),
        papel: color("papel"),
        // Un negro absoluto vibra sobre blanco; este es el gris casi negro
        // que usa macOS para el texto.
        tinta: color("tinta"),
        "tinta-media": color("tinta-media"),
        "tinta-suave": color("tinta-suave"),
        "tinta-tenue": color("tinta-tenue"),
        // Las separaciones son de un pelo, no una raya.
        linea: color("linea"),
        "linea-fuerte": color("linea-fuerte"),
        // Lo que antes era "negro al 4%" para un borde o un fondo apenas
        // marcado. En el tema oscuro es blanco al 4%: el mismo pelo de
        // contraste, del lado que corresponde.
        contraste: color("contraste"),
        // El azul del logo. Es más profundo que el azul de sistema que había
        // antes: sobre blanco contrasta 6,9 a 1 (el otro, 4,7), así que el
        // texto azul chico se lee sin esfuerzo. Al pasar el mouse se oscurece
        // en vez de aclararse, que con un azul así de saturado se nota más.
        // En el tema oscuro es un punto más claro, o no se leería sobre gris.
        acento: {
          DEFAULT: color("acento"),
          fuerte: color("acento-fuerte"),
          suave: color("acento-suave"),
          texto: color("acento-texto"),
        },
        exito: { fondo: color("exito-fondo"), texto: color("exito-texto"), linea: color("exito-linea") },
        aviso: { fondo: color("aviso-fondo"), texto: color("aviso-texto"), linea: color("aviso-linea") },
        alerta: { fondo: color("alerta-fondo"), texto: color("alerta-texto"), linea: color("alerta-linea") },
        dato: { fondo: color("dato-fondo"), texto: color("dato-texto"), linea: color("dato-linea") },
      },
      fontFamily: {
        // Fuentes del sistema: la aplicación funciona sin internet, así que no
        // puede depender de una tipografía que se descarga.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Segoe UI Variable Text",
          "Segoe UI",
          "system-ui",
          "Helvetica Neue",
          "sans-serif",
        ],
        // Los títulos son la misma familia en su corte ancho, más apretados.
        titulo: [
          "SF Pro Display",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI Variable Display",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        mono: ["SF Mono", "Cascadia Mono", "Consolas", "ui-monospace", "monospace"],
      },
      fontSize: {
        micro: ["11px", { lineHeight: "14px", letterSpacing: "0.02em" }],
        chico: ["12.5px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "21px", letterSpacing: "-0.005em" }],
        medio: ["16px", { lineHeight: "23px", letterSpacing: "-0.01em" }],
        titulo: ["28px", { lineHeight: "34px", letterSpacing: "-0.021em" }],
        cifra: ["30px", { lineHeight: "36px", letterSpacing: "-0.025em" }],
      },
      borderRadius: {
        DEFAULT: "10px",
        md: "12px",
        lg: "16px",
        xl: "20px",
      },
      boxShadow: {
        // Sombras en capas y muy abiertas: una cerca para apoyar el objeto y
        // otra lejos para separarlo del fondo. Nunca una sola sombra dura.
        // Sobre fondo oscuro tienen que ser mucho más negras para verse.
        apoyo: "var(--sombra-apoyo)",
        tarjeta: "var(--sombra-tarjeta)",
        elevada: "var(--sombra-elevada)",
        flotante: "var(--sombra-flotante)",
        boton: "var(--sombra-boton)",
        acento: "var(--sombra-acento)",
      },
      keyframes: {
        entrar: {
          from: { opacity: "0", transform: "translateY(8px) scale(0.99)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        aparecer: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // El brillo que recorre los bloques mientras se espera: dice que algo
        // está pasando sin agregar un cartel más.
        brillo: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        // La curva de las transiciones de iOS: sale rápido y frena suave.
        entrar: "entrar 320ms cubic-bezier(0.32, 0.72, 0, 1) both",
        aparecer: "aparecer 200ms ease-out both",
        brillo: "brillo 1.6s linear infinite",
      },
      transitionTimingFunction: {
        suave: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
