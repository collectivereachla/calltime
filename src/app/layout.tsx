import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calltime.",
  description: "Production management for theatre artists.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
