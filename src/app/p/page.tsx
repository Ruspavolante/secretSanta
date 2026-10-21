import type { Metadata } from "next";
import { ParticipantExperience } from "@/components/participant/participant-experience";
import { Snowfall } from "@/components/ui";

export const metadata: Metadata = {
  title: "Il tuo Secret Santa",
  robots: { index: false, follow: false },
};

/**
 * Pagina personale del partecipante. Il token è nel frammento dell'URL (/p#token):
 * non arriva al server con la richiesta della pagina e viene inviato solo nel
 * corpo delle richieste che leggono lo stato o rivelano il destinatario.
 */
export default function ParticipantPage() {
  return (
    <main className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-pine-700),var(--color-pine-950)_70%)] px-4 py-10 text-white">
      <Snowfall flakes={24} />
      <div className="relative w-full max-w-lg">
        <ParticipantExperience />
      </div>
    </main>
  );
}
