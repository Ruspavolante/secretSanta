import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { AVATARS, isAvatarKey } from "@/lib/avatars";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-berry-600 text-white shadow-sm hover:bg-berry-700 focus-visible:outline-berry-600",
  secondary: "bg-pine-700 text-white shadow-sm hover:bg-pine-800 focus-visible:outline-pine-700",
  ghost: "border border-pine-200 bg-white text-pine-800 hover:bg-pine-50 focus-visible:outline-pine-600",
  danger: "border border-berry-200 bg-white text-berry-700 hover:bg-berry-50 focus-visible:outline-berry-600",
  gold: "bg-gold-400 text-pine-950 shadow-sm hover:bg-gold-300 focus-visible:outline-gold-500",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: "sm" | "md" | "lg" = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" && "px-3 py-1.5 text-sm",
    size === "md" && "px-5 py-2.5 text-sm",
    size === "lg" && "px-7 py-3.5 text-base",
    BUTTON_VARIANTS[variant],
  );
}

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cx("rounded-3xl border border-gold-200/70 bg-snow p-5 shadow-[0_8px_30px_-12px_rgb(13_47_29/0.25)] sm:p-7", className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ icon, title, description }: { icon: string; title: string; description?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-pine-900">
        <span aria-hidden="true">{icon}</span>
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
    </div>
  );
}

const STATUS_LABELS = {
  DRAFT: { label: "In preparazione", className: "bg-gold-100 text-gold-700 ring-gold-300" },
  DRAWN: { label: "Estratto · segreto", className: "bg-sky-50 text-sky-800 ring-sky-200" },
  PUBLISHED: { label: "Pubblicato", className: "bg-pine-100 text-pine-800 ring-pine-300" },
  CLOSED: { label: "Chiuso", className: "bg-stone-100 text-stone-700 ring-stone-300" },
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABELS }) {
  const { label, className } = STATUS_LABELS[status];
  return (
    <span className={cx("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset", className)}>
      {label}
    </span>
  );
}

export function Chip({ tone = "neutral", children }: { tone?: "neutral" | "good" | "info" | "warn"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-stone-100 text-stone-700",
        tone === "good" && "bg-pine-100 text-pine-800",
        tone === "info" && "bg-sky-50 text-sky-800",
        tone === "warn" && "bg-gold-100 text-gold-700",
      )}
    >
      {children}
    </span>
  );
}

export function Alert({ tone, title, children }: { tone: "error" | "success" | "info" | "warning"; title?: string; children?: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-2xl border px-4 py-3 text-sm",
        tone === "error" && "border-berry-200 bg-berry-50 text-berry-800",
        tone === "success" && "border-pine-200 bg-pine-50 text-pine-800",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-900",
        tone === "warning" && "border-gold-300 bg-gold-50 text-gold-700",
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}

const AVATAR_SIZES = { sm: "size-10 text-xl", md: "size-14 text-3xl", lg: "size-28 text-6xl", xl: "size-48 text-8xl sm:size-56" };

export function Avatar({
  name,
  avatar,
  photoUrl,
  size = "md",
  className,
}: {
  name: string;
  avatar: string;
  photoUrl: string | null;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  const fallback = AVATARS[isAvatarKey(avatar) ? avatar : "gift"];
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ring-2 ring-gold-300",
        fallback.background,
        AVATAR_SIZES[size],
        className,
      )}
    >
      {photoUrl ? (
        <Image src={photoUrl} alt={`Foto di ${name}`} fill sizes="224px" className="object-cover" />
      ) : (
        <span role="img" aria-label={`${fallback.label} (immagine predefinita di ${name})`}>
          {fallback.emoji}
        </span>
      )}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-pine-900">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClasses =
  "w-full rounded-xl border border-pine-200 bg-white px-3.5 py-2.5 text-base text-ink shadow-inner placeholder:text-stone-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/30 disabled:bg-stone-100 sm:text-sm";

export const fileInputClasses =
  "block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-pine-100 file:px-4 file:py-2 file:font-semibold file:text-pine-800 hover:file:bg-pine-200";

export function Snowfall({ flakes = 18 }: { flakes?: number }) {
  return (
    <div className="snowfall" aria-hidden="true">
      {Array.from({ length: flakes }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 53) % 100}%`,
            fontSize: `${10 + ((i * 7) % 14)}px`,
            animationDuration: `${9 + ((i * 5) % 11)}s`,
            animationDelay: `${-((i * 3) % 13)}s`,
          }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}
