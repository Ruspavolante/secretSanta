/**
 * Citazioni sul donare di persone che con il Natale c'entrano poco.
 * Quelle di persone reali sono frasi autentiche (in traduzione italiana, con la
 * fonte); le battute sono attribuite solo a personaggi dichiaratamente immaginari.
 * Il commento (`note`) è nostro e viene mostrato separato dalla citazione.
 */
export type Quote = {
  text: string;
  author: string;
  role: string;
  source?: string;
  note?: string;
  fictional?: boolean;
};

export const QUOTES: readonly Quote[] = [
  {
    text: "Questa è la legge del beneficio tra due persone: chi lo fa deve dimenticarlo subito, chi lo riceve non deve dimenticarlo mai.",
    author: "Lucio Anneo Seneca",
    role: "senatore romano e consigliere di Nerone",
    source: "De beneficiis, II",
  },
  {
    text: "Chi ha fatto il dono taccia; ne parli chi l'ha ricevuto.",
    author: "Lucio Anneo Seneca",
    role: "senatore romano e consigliere di Nerone",
    source: "De beneficiis, II",
    note: "Il primo teorico del Secret Santa.",
  },
  {
    text: "Bisogna badare che la generosità non sia superiore alle proprie possibilità.",
    author: "Marco Tullio Cicerone",
    role: "avvocato e console romano",
    source: "De officiis, I",
    note: "Rispettate il budget.",
  },
  {
    text: "È con dei ninnoli che si guidano gli uomini.",
    author: "Napoleone Bonaparte",
    role: "generale",
    source: "Consiglio di Stato, 1802",
  },
  {
    text: "Tutta l'arte della guerra si basa sull'inganno.",
    author: "Sun Tzu",
    role: "generale e stratega cinese",
    source: "L'arte della guerra, I",
    note: "Indispensabile per mantenere il segreto fino allo scambio.",
  },
  {
    text: "Non fare agli altri ciò che non vorresti fosse fatto a te.",
    author: "Confucio",
    role: "funzionario dello Stato di Lu",
    source: "Dialoghi, XV",
    note: "Vale anche per i calzini.",
  },
  {
    text: "Il saggio non accumula: più fa per gli altri, più possiede; più dà agli altri, più ha.",
    author: "Laozi",
    role: "archivista alla corte dei Zhou",
    source: "Tao Te Ching, 81",
  },
  {
    text: "Non importa che il gatto sia bianco o nero: finché acchiappa i topi è un buon gatto.",
    author: "Deng Xiaoping",
    role: "politico cinese",
    note: "Criterio valido anche per scegliere un regalo.",
  },
  {
    text: "Non è cosa alcuna che consumi sé stessa quanto la liberalità.",
    author: "Niccolò Machiavelli",
    role: "segretario della Repubblica fiorentina",
    source: "Il Principe, XVI",
    note: "Di nuovo: rispettate il budget.",
  },
  {
    text: "Quando hai fatto del bene e un altro l'ha ricevuto, perché cerchi ancora una terza cosa, come gli sciocchi: sembrare generoso o avere il contraccambio?",
    author: "Marco Aurelio",
    role: "imperatore e comandante militare",
    source: "Pensieri, V",
  },
  {
    text: "Un regalo ben incartato è come un sottomarino: nessuno deve sapere cosa c'è dentro finché non emerge.",
    author: "Ammiraglio Gustavo Panettone",
    role: "comandante della flotta sottomarina delle renne",
    fictional: true,
  },
  {
    text: "Ai sensi del Codice del Polo Nord, il regalo riciclato è ammesso solo se chi l'aveva regalato abita in un'altra regione.",
    author: "Avv. Ermenegilda Cavillo",
    role: "specialista in contenziosi tra elfi",
    fictional: true,
  },
  {
    text: "Il contenuto è un dettaglio: il fiocco è una dichiarazione d'intenti.",
    author: "Barone Fulgenzio di Scartoffia",
    role: "collezionista di nastri e fiocchi",
    fictional: true,
  },
  {
    text: "Mai attaccare il panettone prima di aver scoperto chi ti ha estratto.",
    author: "Colonnello Ottavio Brodo",
    role: "stratega del cenone",
    fictional: true,
  },
  {
    text: "Lo scontrino regalo non è sfiducia: è previdenza.",
    author: "Ispettrice Clotilde Spago",
    role: "Ufficio Pacchi Smarriti di Rovaniemi",
    fictional: true,
  },
];

/** Indice casuale diverso da quello attuale (se ce n'è più di una). */
export function randomQuoteIndex(current: number | null, random: () => number = Math.random): number {
  if (QUOTES.length < 2) return 0;
  let next = Math.floor(random() * QUOTES.length);
  if (next === current) next = (next + 1) % QUOTES.length;
  return next;
}
