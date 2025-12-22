import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import MobileDebug from "@/components/MobileDebug";

export const metadata: Metadata = {
  title: "PhotoBooze",
  description: "Party photo sharing with QR code guest access",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Suspense fallback={null}>
          <MobileDebug />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
