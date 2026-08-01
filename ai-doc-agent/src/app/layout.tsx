import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "TEK-DOK-MIND — Your Ultimate AI Agent for Any Documentation Generation",
  description:
    "Create, organize, and refine technical documentation in one secure AI workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
