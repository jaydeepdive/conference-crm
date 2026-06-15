import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Mining Summit CRM · internal",
  description: "Recruitment, payments, and event coordination for the Mining Summit — internal tool.",
  appleWebApp: {
    capable: true,
    title: "MS CRM",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#C8102E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;700;900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
