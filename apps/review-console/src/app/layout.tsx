import type { Metadata } from "next";
import { AppProviders } from "../components/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Review & Audit Console",
  description: "Unified Org Workspace — Review & Audit Console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/devchauhann/fonts@v1.1.0/cdn/v1/css/all.css"
        />
      </head>
      <body className="bg-surface font-sans text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
