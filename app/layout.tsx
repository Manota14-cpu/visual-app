import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Avisos } from "@/components/avisos";
import { ProveedorSesion } from "@/lib/sesion";
import { SCRIPT_TEMA } from "@/lib/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: "Visual App",
  description: "Stock, caja y ventas del negocio, en tu computadora.",
  applicationName: "Visual App",
  authors: [{ name: "Visual Solution", url: "https://visual-solution.vercel.app" }],
  creator: "Visual Solution",
  publisher: "Visual Solution",
  // La ventana de la aplicación y la barra de tareas toman el ícono de acá: el
  // SVG no les alcanza, necesitan un PNG con tamaño declarado.
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  // La barra del navegador del celular, del color del fondo en cada tema.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F7" },
    { media: "(prefers-color-scheme: dark)", color: "#101012" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    // `data-tema` lo pone el script de abajo antes de que React llegue: la
    // diferencia con lo que armó el servidor es a propósito.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Antes que cualquier otra cosa, para que la pantalla no arranque
            clara y se oscurezca un instante después. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <ProveedorSesion>
          <Avisos>{children}</Avisos>
        </ProveedorSesion>
      </body>
    </html>
  );
}
