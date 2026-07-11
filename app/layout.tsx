import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL || "http://localhost:3000"),
  title: "YITA Iceberg — Jewelry Trading & Secure Inventory Control",
  description:
    "Premium jewelry trading platform with controlled inventory, payment verification, release approval, branch oversight, and audit-ready reporting.",
  openGraph: {
    title: "YITA Iceberg — Jewelry Trading & Secure Inventory Control",
    description:
      "Luxury jewelry trading with secure inventory, payment verification, release approval, and branch oversight.",
    images: ["/brand/yita-iceberg-logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "YITA Iceberg — Jewelry Trading & Secure Inventory Control",
    description:
      "Premium jewelry trading platform with secure operational control.",
    images: ["/brand/yita-iceberg-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
