import type { Metadata } from "next";
import "./globals.css";
import { Providers } from '@/components/fangpt/providers';

export const metadata: Metadata = {
  title: "FanGpt — Ruang untuk ide besarmu",
  description: "Teman berpikir dengan Gemini. Jelajahi ide, tulis lebih baik, dan pahami gambar bersama FanGpt.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased"><Providers>{children}</Providers></body>
    </html>
  );
}
