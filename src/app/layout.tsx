import type { Metadata, Viewport } from "next";
import "./globals.css";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: `${config.appName} · Programas de lealtad para restaurantes y cafeterías`, template: `%s · ${config.appName}` },
  description:
    "Crea tu programa de lealtad con tarjetas digitales para Apple Wallet y Google Wallet: sellos, puntos o monedero, cupones y notificaciones.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#ea580c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
