import type { Config } from "tailwindcss";

/**
 * El sistema visual.
 *
 * Superficies blancas apoyadas sobre un gris muy claro, capas de sombra
 * difusas en vez de bordes marcados, vidrio esmerilado en lo que flota
 * —barra lateral, encabezado, diálogos— y un solo azul para lo accionable.
 * La tipografía es la del sistema: SF en Mac, Segoe Variable en Windows.
 *
 * Los nombres de los tokens son los mismos de siempre (lienzo, papel, tinta,
 * línea): cambia lo que valen, no dónde se usan.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // El gris de fondo de Apple. Las tarjetas blancas encima se despegan
        // sin necesidad de un borde oscuro.
        lienzo: "#F5F5F7",
        papel: "#FFFFFF",
        // Un negro absoluto vibra sobre blanco; este es el gris casi negro
        // que usa macOS para el texto.
        tinta: "#1D1D1F",
        "tinta-media": "#424245",
        "tinta-suave": "#6E6E73",
        "tinta-tenue": "#86868B",
        // Las separaciones son de un pelo, no una raya.
        linea: "#EBEBED",
        "linea-fuerte": "#D2D2D7",
        // El azul del logo. Es más profundo que el azul de sistema que había
        // antes: sobre blanco contrasta 6,9 a 1 (el otro, 4,7), así que el
        // texto azul chico se lee sin esfuerzo. Al pasar el mouse se oscurece
        // en vez de aclararse, que con un azul así de saturado se nota más.
        acento: {
          DEFAULT: "#0050CE",
          fuerte: "#0044B0",
          suave: "#EBF1FB",
          texto: "#0050CE",
        },
        exito: { fondo: "#E8F8EC", texto: "#1D7F35", linea: "#C6EBD0" },
        aviso: { fondo: "#FFF4E0", texto: "#8A5A00", linea: "#F5DFB4" },
        alerta: { fondo: "#FFEDEC", texto: "#C2231A", linea: "#F7CFCC" },
        dato: { fondo: "#EBF1FB", texto: "#0050CE", linea: "#CCDCF5" },
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
        apoyo: "0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)",
        tarjeta: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(0,0,0,0.10)",
        elevada: "0 2px 6px rgba(0,0,0,0.05), 0 16px 40px -16px rgba(0,0,0,0.16)",
        flotante: "0 8px 20px rgba(0,0,0,0.08), 0 32px 64px -24px rgba(0,0,0,0.28)",
        boton: "0 1px 2px rgba(0,0,0,0.06)",
        acento: "0 1px 2px rgba(0,80,206,0.24), 0 6px 16px -8px rgba(0,80,206,0.42)",
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
