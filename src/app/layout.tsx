import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  icons: { icon: "/mettacitta-logo.png", apple: "/mettacitta-logo.png" },
  title: "MettaCitta | Quản lý thiện pháp",
  description: "MettaCitta — Quản lý thiện pháp và phân loại sao kê VIB.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="preload"
          href="/transaction-devas-bg-v2.jpg"
          as="image"
          type="image/jpeg"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
