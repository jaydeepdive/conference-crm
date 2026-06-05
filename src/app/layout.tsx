import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mining Summit CRM",
  description: "Recruitment + scheduling for Conference 2026",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
