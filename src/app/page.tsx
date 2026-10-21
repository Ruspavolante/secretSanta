import Link from "next/link";
import { buttonClasses, Snowfall } from "@/components/ui";

const STEPS = [
  { icon: "👥", title: "Aggiungi gli amici", text: "Nome, email facoltativa e una foto (o un'immagine natalizia)." },
  { icon: "🚫", title: "Imposta le esclusioni", text: "Le coppie che non devono pescarsi, in una o entrambe le direzioni." },
  { icon: "🎲", title: "Estrai in segreto", text: "Un algoritmo garantisce un abbinamento valido per tutti." },
  { icon: "📨", title: "Invia i link personali", text: "Via email, WhatsApp o copiando il messaggio pronto." },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate overflow-hidden bg-pine-900 text-white">
        <Snowfall />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pt-20 pb-24 text-center sm:pt-28">
          <p className="animate-float text-7xl" aria-hidden="true">
            🎅
          </p>
          <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
            Secret Santa <span className="text-gold-300">tra amici</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-pine-100">
            Organizza lo scambio dei regali senza bigliettini: ognuno riceve il suo link personale e scopre chi deve
            sorprendere, con tanto di foto.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/admin" className={buttonClasses("gold", "lg")}>
              Area organizzatore
            </Link>
          </div>
          <p className="mt-6 max-w-md text-sm text-pine-200">
            Sei un partecipante? Apri il link personale che ti ha mandato l&apos;organizzatore: ti porterà direttamente
            alla tua pagina.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-16">
        <h2 className="text-center font-display text-3xl font-bold text-pine-900">Come funziona</h2>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-3xl border border-gold-200 bg-snow p-6 shadow-sm">
              <p className="text-4xl" aria-hidden="true">
                {step.icon}
              </p>
              <p className="mt-4 text-xs font-bold tracking-widest text-gold-600 uppercase">Passo {index + 1}</p>
              <h3 className="mt-1 font-display text-xl font-bold text-pine-900">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-auto border-t border-gold-200 py-6 text-center text-xs text-muted">
        Fatto con 🎄 per gli amici · I risultati restano segreti fino alla pubblicazione
      </footer>
    </main>
  );
}
