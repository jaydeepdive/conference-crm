import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mining Summit CRM",
  description: "Recruitment, payments, and scheduling for the Mining Summit",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
