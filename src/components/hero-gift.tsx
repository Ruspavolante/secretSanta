/**
 * Pacco regalo animato della home: il coperchio ogni tanto si solleva e lascia
 * uscire un bagliore, mentre intorno brillano delle stelline. Solo SVG + CSS.
 */
const SPARKLES = [
  { x: 22, y: 58, size: 1, delay: "0s" },
  { x: 176, y: 44, size: 0.8, delay: "0.7s" },
  { x: 182, y: 128, size: 0.6, delay: "1.3s" },
  { x: 14, y: 140, size: 0.7, delay: "1.9s" },
  { x: 150, y: 14, size: 0.55, delay: "1.1s" },
];

// Stella a quattro punte centrata in (0, 0).
const STAR = "M0 -10 C1.5 -2.5 2.5 -1.5 10 0 C2.5 1.5 1.5 2.5 0 10 C-1.5 2.5 -2.5 1.5 -10 0 C-2.5 -1.5 -1.5 -2.5 0 -10Z";

export function HeroGift({ className }: { className?: string }) {
  return (
    <svg viewBox="0 -24 200 224" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="hero-glow">
          <stop offset="0%" style={{ stopColor: "var(--color-gold-300)", stopOpacity: 0.55 }} />
          <stop offset="100%" style={{ stopColor: "var(--color-gold-300)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="hero-box" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--color-berry-500)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-berry-700)" }} />
        </linearGradient>
        <linearGradient id="hero-ribbon" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: "var(--color-gold-300)" }} />
          <stop offset="50%" style={{ stopColor: "var(--color-gold-200)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-gold-400)" }} />
        </linearGradient>
        <linearGradient id="hero-beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" style={{ stopColor: "var(--color-gold-200)", stopOpacity: 0.95 }} />
          <stop offset="100%" style={{ stopColor: "var(--color-gold-200)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      <circle cx="100" cy="112" r="92" fill="url(#hero-glow)" className="animate-shine" />

      <g className="animate-float">
        {/* Bagliore che esce quando il coperchio si alza */}
        <polygon points="58,100 142,100 180,-20 20,-20" fill="url(#hero-beam)" className="animate-beam opacity-0" />

        {/* Scatola */}
        <rect x="40" y="98" width="120" height="86" rx="10" fill="url(#hero-box)" />
        <rect x="91" y="98" width="18" height="86" fill="url(#hero-ribbon)" />
        <rect x="40" y="98" width="120" height="10" fill="black" opacity="0.18" />

        {/* Coperchio con fiocco */}
        <g className="animate-lid-peek [transform-box:fill-box] origin-bottom-left">
          <rect x="32" y="76" width="136" height="26" rx="7" fill="url(#hero-box)" />
          <rect x="91" y="76" width="18" height="26" fill="url(#hero-ribbon)" />
          <ellipse cx="80" cy="66" rx="20" ry="11" transform="rotate(-24 80 66)" fill="none" stroke="url(#hero-ribbon)" strokeWidth="8" />
          <ellipse cx="120" cy="66" rx="20" ry="11" transform="rotate(24 120 66)" fill="none" stroke="url(#hero-ribbon)" strokeWidth="8" />
          <circle cx="100" cy="72" r="9" fill="var(--color-gold-400)" />
        </g>
      </g>

      {SPARKLES.map((sparkle) => (
        <g key={`${sparkle.x}-${sparkle.y}`} transform={`translate(${sparkle.x} ${sparkle.y}) scale(${sparkle.size})`}>
          <path
            d={STAR}
            fill="var(--color-gold-200)"
            className="animate-twinkle opacity-0 [transform-box:fill-box] origin-center"
            style={{ animationDelay: sparkle.delay }}
          />
        </g>
      ))}
    </svg>
  );
}
