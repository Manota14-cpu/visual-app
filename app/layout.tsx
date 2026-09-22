import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Avisos } from "@/components/avisos";
import { ProveedorSesion } from "@/lib/sesion";
import "./globals.css";

export const metadata: Metadata = {
  title: "Visual Solution",
  description: "Stock, caja y ventas del negocio, en tu computadora.",
  applicationName: "Visual Solution",
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
  themeColor: "#FBFBFA",
  width: "device-width",
  initialScale: 1,
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ProveedorSesion>
          <Avisos>{children}</Avisos>
        </ProveedorSesion>
      </body>
    </html>
  );
}
