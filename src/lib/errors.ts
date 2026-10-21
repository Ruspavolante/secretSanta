/**
 * Traduzione degli errori del database in messaggi per l'utente.
 * I dettagli interni (SQL, nomi di tabelle, parametri) non vengono mai mostrati.
 */

export type DbError = { code?: string | null; message?: string | null; details?: string | null } | null | undefined;

const APP_ERRORS: Record<string, string> = {
  SS_EVENT_LOCKED:
    "L'estrazione è già stata fatta: per aggiungere o rimuovere partecipanti ed esclusioni devi prima annullarla.",
  SS_EVENT_CLOSED: "L'evento è chiuso: non è più possibile modificarlo.",
  SS_INVALID_STATE: "Operazione non consentita nello stato attuale dell'evento. Ricarica la pagina e riprova.",
  SS_TOO_FEW_PARTICIPANTS: "Servono almeno 3 partecipanti per fare l'estrazione.",
  SS_INVALID_DRAW: "I partecipanti sono cambiati durante l'estrazione: riprova.",
  SS_DRAW_VIOLATES_EXCLUSIONS: "Le esclusioni sono cambiate durante l'estrazione: riprova.",
  SS_INCOMPLETE_DRAW: "L'estrazione è incompleta: rifalla prima di pubblicarla.",
  SS_CONFIRMATION_MISMATCH: "Il nome inserito non corrisponde a quello dell'evento.",
  SS_NOT_FOUND: "Elemento non trovato: potrebbe essere stato eliminato.",
  SS_FORBIDDEN: "Non hai i permessi per questa operazione.",
  SS_INVALID_INPUT: "Dati non validi.",
};

const UNIQUE_CONSTRAINTS: Record<string, string> = {
  participants_event_name_unique: "Esiste già un partecipante con questo nome in questo evento.",
  participants_event_email_unique: "Questo indirizzo email è già usato da un altro partecipante.",
  exclusions_unique: "Questa esclusione esiste già.",
};

export const GENERIC_ERROR = "Si è verificato un errore imprevisto. Riprova tra poco.";

export function dbErrorMessage(error: DbError): string {
  if (!error) return GENERIC_ERROR;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;

  const appCode = text.match(/\bSS_[A-Z_]+\b/)?.[0];
  if (appCode && APP_ERRORS[appCode]) return APP_ERRORS[appCode];

  switch (error.code) {
    case "23505": {
      const constraint = Object.keys(UNIQUE_CONSTRAINTS).find((name) => text.includes(name));
      return constraint ? UNIQUE_CONSTRAINTS[constraint] : "Questo elemento esiste già.";
    }
    case "23514":
    case "22P02":
    case "22001":
    case "22007":
    case "22008":
      return "Dati non validi.";
    case "23503":
      return "L'elemento collegato non esiste più. Ricarica la pagina.";
    case "42501":
    case "PGRST301":
      return APP_ERRORS.SS_FORBIDDEN;
    default:
      return GENERIC_ERROR;
  }
}

/**
 * Log lato server: registra solo codice e messaggio dell'errore, mai i
 * parametri della richiesta (che potrebbero contenere token personali).
 */
export function logServerError(context: string, error: unknown): void {
  const info =
    error && typeof error === "object"
      ? { code: (error as { code?: unknown }).code, message: (error as { message?: unknown }).message }
      : { message: String(error) };
  console.error(`[secret-santa] ${context}`, info);
}
