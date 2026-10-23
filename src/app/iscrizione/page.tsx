import type { Metadata } from "next";
import { SignupExperience } from "@/components/signup/signup-experience";
import { Snowfall } from "@/components/ui";

export const metadata: Metadata = {
  title: "Iscriviti al Secret Santa",
  robots: { index: false, follow: false },
};

/**
 * Pagina d'iscrizione dal link di gruppo. Il token è nel frammento dell'URL
 * (/iscrizione#token): non arriva al server con la richiesta della pagina.
 */
export default function SignupPage() {
  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-pine-700),var(--color-pine-950)_70%)] px-4 py-10 text-white">
      <Snowfall flakes={24} />
      <div className="relative w-full max-w-lg">
        <SignupExperience />
      </div>
    </main>
  );
}
