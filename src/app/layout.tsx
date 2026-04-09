import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { getAppNameFromEnv, getDefaultLocaleFromEnv } from "@/lib/env/server";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
