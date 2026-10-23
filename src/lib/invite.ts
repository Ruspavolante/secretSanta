/**
 * Costruzione dei link personali e dei messaggi d'invito.
 * Il messaggio contiene SOLO il link del destinatario e mai il risultato dell'estrazione.
 */

export type InviteDetails = {
  participantName: string;
  eventName: string;
  link: string;
  budget?: string | null;
  exchangeDate?: string | null;
};

/** Il token sta nel frammento (#): non viene inviato al server né registrato nei log HTTP. */
export function buildPersonalLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/p#${token}`;
}

/** Link d'iscrizione dell'evento, da condividere nel gruppo: anche qui il token sta nel frammento. */
export function buildSignupLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/iscrizione#${token}`;
}

export function formatItalianDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function extraLines(details: InviteDetails): string[] {
  const lines: string[] = [];
  if (details.budget) lines.push(`💰 Budget: ${details.budget}`);
  if (details.exchangeDate) lines.push(`📅 Scambio dei regali: ${formatItalianDate(details.exchangeDate)}`);
  return lines;
}

export function buildInviteMessage(details: InviteDetails): string {
  const intro =
    `Ciao ${details.participantName}! 🎅 Quest'anno partecipi al nostro Secret Santa "${details.eventName}". ` +
    `Apri il tuo link personale per scoprire chi dovrai sorprendere con il tuo regalo: ${details.link}`;
  const extra = extraLines(details);
  const footer = "Il link è solo tuo: non condividerlo con nessuno! 🤫";
  return [intro, ...(extra.length ? ["", ...extra] : []), "", footer].join("\n");
}

export type SignupDetails = Omit<InviteDetails, "participantName">;

/** Messaggio per il gruppo (es. WhatsApp): contiene solo il link d'iscrizione, mai link personali. */
export function buildSignupMessage(details: SignupDetails): string {
  const intro =
    `Ciao a tutti! 🎅 Quest'anno facciamo il Secret Santa "${details.eventName}". ` +
    `Clicca qui per partecipare ohohoh: ${details.link}`;
  const extra = extraLines({ ...details, participantName: "" });
  const footer =
    "Dopo l'iscrizione riceverai per email il tuo link personale: lì scoprirai a chi fare il regalo quando sarà il momento. 🎁";
  return [intro, ...(extra.length ? ["", ...extra] : []), "", footer].join("\n");
}

export function buildInviteSubject(eventName: string): string {
  return `🎁 Il tuo invito al Secret Santa "${eventName}"`;
}

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildMailtoUrl(email: string | null | undefined, subject: string, body: string): string {
  const to = email ? encodeURIComponent(email) : "";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Versione HTML dell'email d'invito (per l'invio automatico via SMTP). */
export function buildInviteHtml(details: InviteDetails): string {
  const extra = extraLines(details)
    .map((line) => `<p style="margin:4px 0;color:#14532d">${escapeHtml(line)}</p>`)
    .join("");
  return `<!doctype html>
<html lang="it"><body style="margin:0;background:#f7f3ea;font-family:Georgia,serif">
  <div style="max-width:520px;margin:24px auto;background:#fffdf7;border-radius:16px;border:1px solid #e8d9a8;padding:28px">
    <p style="font-size:40px;margin:0;text-align:center">🎅</p>
    <h1 style="color:#14532d;text-align:center;font-size:22px">Ciao ${escapeHtml(details.participantName)}!</h1>
    <p style="color:#1f2937;font-size:16px;line-height:1.5">Quest'anno partecipi al nostro Secret Santa
      <strong>${escapeHtml(details.eventName)}</strong>. Apri il tuo link personale per scoprire chi dovrai sorprendere con il tuo regalo.</p>
    ${extra}
    <p style="text-align:center;margin:28px 0">
      <a href="${escapeHtml(details.link)}" style="background:#b91c1c;color:#fff;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Apri il mio link personale</a>
    </p>
    <p style="color:#6b7280;font-size:13px">Se il pulsante non funziona copia questo indirizzo nel browser:<br>${escapeHtml(details.link)}</p>
    <p style="color:#6b7280;font-size:13px">Il link è solo tuo: non condividerlo con nessuno! 🤫</p>
  </div>
</body></html>`;
}
