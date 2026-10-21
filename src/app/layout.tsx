import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "@/components/toaster";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Secret Santa tra amici", template: "%s · Secret Santa" },
  description: "Organizza il Secret Santa con i tuoi amici: estrazione, esclusioni e link personali.",
};

export const viewport: Viewport = {
  themeColor: "#0d2f1d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
