import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PostHogProvider } from "@/components/posthog-provider";

export const metadata: Metadata = {
  title: "Calltime.",
  description: "Production management for theatre artists.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Calltime",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#C4522D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
