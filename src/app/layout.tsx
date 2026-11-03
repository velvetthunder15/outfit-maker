import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Outfit Maker — your wardrobe, styled by AI", template: "%s · Outfit Maker" },
  description:
    "Photograph your clothes, jewellery and accessories once. Outfit Maker styles them for your mood, where you're going and the weather there.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  openGraph: { images: ["/hero-flatlay.webp"] },
};

export const viewport: Viewport = { themeColor: "#EAE6DE", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
