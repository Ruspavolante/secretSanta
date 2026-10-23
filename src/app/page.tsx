import Link from "next/link";
import { HeroGift } from "@/components/hero-gift";
import { Alert, buttonClasses, Snowfall } from "@/components/ui";

const STEPS = [
  { icon: "🔑", title: "Crea il tuo account", text: "Gratis, con email e password: vedi e gestisci solo i tuoi eventi." },
  { icon: "👥", title: "Invita gli amici", text: "Condividi il link d'iscrizione nel gruppo oppure aggiungili tu, con foto." },
  { icon: "🚫", title: "Esclusioni ed estrazione", text: "Le coppie non si pescano; l'algoritmo trova un abbinamento valido in segreto." },
  { icon: "🎁", title: "Ognuno scopre il suo", text: "Quando pubblichi, ogni link personale rivela a chi fare il regalo." },
];

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { account } = await searchParams;
  return (
    <main className="flex flex-1 flex-col">
      {account === "eliminato" ? (
        <div className="mx-auto w-full max-w-5xl px-4 pt-4">
          <Alert tone="success" title="Account eliminato">
            Il tuo account e tutti i tuoi eventi sono stati cancellati.
          </Alert>
        </div>
      ) : null}
      <section className="relative isolate overflow-hidden bg-pine-900 text-white">
        <Snowfall />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pt-20 pb-24 text-center sm:pt-28">
          <HeroGift className="size-40 drop-shadow-[0_18px_30px_rgb(0_0_0/0.35)] sm:size-52" />
          <h1 className="mt-4 font-display text-5xl font-extrabold tracking-tight sm:text-7xl">Secret Santa</h1>
          <p className="mt-3 font-display text-lg text-gold-300 italic sm:text-xl">
            Il modo più organizzato per regalare calzini a qualcuno che conosci a malapena.
          </p>
          <p className="mt-5 max-w-2xl text-lg text-pine-100">
            Organizza lo scambio dei regali: ognuno riceve il suo link personale e scopre a chi farà il regalo
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/admin/registrati" className={buttonClasses("gold", "lg")}>
              Crea un account
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold text-white ring-1 ring-white/40 transition-colors hover:bg-white/10"
            >
              Accedi
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
