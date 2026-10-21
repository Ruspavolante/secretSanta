import type { NextConfig } from "next";

const securityHeaders = [
  // Le pagine non possono essere incorporate in iframe di altri siti (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Nessun Referer verso siti esterni: evita di propagare URL interni.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Le foto arrivano da Supabase Storage: nessuna ottimizzazione Vercel
    // (evita di consumare la quota gratuita di trasformazioni immagini).
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Le foto vengono ridimensionate nel browser; il server accetta al massimo 2 MB per file.
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/(admin|p)(.*)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
