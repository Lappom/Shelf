import type { Metadata } from "next";
import { Cormorant_Garamond, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { getAppNameFromEnv, getDefaultLocaleFromEnv } from "@/lib/env/server";

// DESIGN.md body/UI font. To use licensed Waldenburg files instead, switch to next/font/local under public/fonts.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Waldenburg substitute: light display (300) + 400 for rare UI (e.g. uppercaseCta). 700 unused in app → omitted to avoid unused preload warnings.
const cormorantDisplay = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400"],
  // Display loads with CSS when headings render; avoids Chrome "preloaded but not used" on routes that only need body (Inter) above the fold.
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  // Mono is for code/technical UI; preloading on every route triggers unused preload warnings on catalogue, etc.
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const appName = getAppNameFromEnv();
  return {
    title: appName,
    applicationName: appName,
    description: "Bibliothèque personnelle self-hosted avec reader EPUB.",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/pwa/icon.svg", type: "image/svg+xml" },
        { url: "/pwa/maskable.svg", type: "image/svg+xml", rel: "icon" },
      ],
      apple: [{ url: "/pwa/icon.svg" }],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = getDefaultLocaleFromEnv();
  return (
    <html
      lang={lang}
      className={`${inter.variable} ${cormorantDisplay.variable} ${geistMono.variable} h-full antialiased`}
      style={
        {
          // Alias for components that reference a “display bold” token (same family as --font-display).
          "--font-display-bold": "var(--font-display)",
        } as React.CSSProperties
      }
      suppressHydrationWarning
    >
      <body className="font-sans flex min-h-full flex-col">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
