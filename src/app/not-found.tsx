import Link from "next/link";
import { buttonClasses } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-6xl" aria-hidden="true">
        🦌
      </p>
      <h1 className="mt-4 font-display text-3xl font-bold text-pine-900">Pagina non trovata</h1>
      <p className="mt-3 max-w-md text-muted">
        Anche le renne a volte sbagliano strada. Controlla l&apos;indirizzo oppure torna alla pagina iniziale.
      </p>
      <Link href="/" className={`${buttonClasses("secondary")} mt-8`}>
        Torna all&apos;inizio
      </Link>
    </main>
  );
}
