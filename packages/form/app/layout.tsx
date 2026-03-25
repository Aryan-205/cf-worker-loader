import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orcratration Forms",
  description: "Fill out and submit forms securely",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        <div className="min-h-screen relative">
          {/* Subtle gradient backdrop */}
          <div
            className="fixed inset-0 -z-10"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.08), transparent)",
            }}
          />
          {children}
        </div>
      </body>
    </html>
  );
}
