import { describe, expect, it } from "vitest";
import { dbErrorMessage, GENERIC_ERROR } from "@/lib/errors";
import {
  buildInviteHtml,
  buildInviteMessage,
  buildMailtoUrl,
  buildPersonalLink,
  buildWhatsAppUrl,
  formatItalianDate,
} from "@/lib/invite";

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

describe("link personale", () => {
  it("mette il token nel frammento dell'URL", () => {
    expect(buildPersonalLink("https://santa.example.com/", TOKEN)).toBe(`https://santa.example.com/p#${TOKEN}`);
  });
});

describe("messaggio d'invito", () => {
  const link = buildPersonalLink("https://santa.example.com", TOKEN);
  const message = buildInviteMessage({
    participantName: "Mario",
    eventName: "Natale 2026",
    link,
    budget: "25 €",
    exchangeDate: "2026-12-20",
  });

  it("segue il testo richiesto e contiene il link personale", () => {
    expect(message).toContain(
      `Ciao Mario! 🎅 Quest'anno partecipi al nostro Secret Santa "Natale 2026". Apri il tuo link personale per scoprire chi dovrai sorprendere con il tuo regalo: ${link}`,
    );
    expect(message).toContain("💰 Budget: 25 €");
    expect(message).toContain("📅 Scambio dei regali: 20 dicembre 2026");
  });

  it("contiene un solo link", () => {
    expect(message.match(/https?:\/\//g)).toHaveLength(1);
  });

  it("omette budget e data se non impostati", () => {
    const simple = buildInviteMessage({ participantName: "Sara", eventName: "X", link });
    expect(simple).not.toContain("Budget");
    expect(simple).not.toContain("Scambio");
  });

  it("l'HTML dell'email esegue l'escape dei dati inseriti", () => {
    const html = buildInviteHtml({ participantName: "<b>Eve</b>", eventName: "A & B", link });
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("<b>Eve</b>");
  });

  it("costruisce i link WhatsApp e mailto codificati", () => {
    expect(buildWhatsAppUrl("Ciao & buon Natale")).toBe("https://wa.me/?text=Ciao%20%26%20buon%20Natale");
    expect(buildMailtoUrl("mario@example.com", "Oggetto", "Testo")).toBe(
      "mailto:mario%40example.com?subject=Oggetto&body=Testo",
    );
    expect(buildMailtoUrl(null, "O", "T")).toBe("mailto:?subject=O&body=T");
  });

  it("formatta le date in italiano", () => {
    expect(formatItalianDate("2026-12-24")).toBe("24 dicembre 2026");
  });
});

describe("dbErrorMessage", () => {
  it("traduce gli errori applicativi", () => {
    expect(dbErrorMessage({ code: "P0001", message: "SS_EVENT_LOCKED" })).toMatch(/annullarla/);
    expect(dbErrorMessage({ code: "P0001", message: "SS_CONFIRMATION_MISMATCH" })).toMatch(/non corrisponde/);
    expect(dbErrorMessage({ code: "42501", message: "SS_FORBIDDEN" })).toMatch(/permessi/);
  });

  it("riconosce i vincoli di unicità", () => {
    expect(
      dbErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "participants_event_name_unique"' }),
    ).toMatch(/stesso nome|questo nome/);
    expect(dbErrorMessage({ code: "23505", message: 'violates unique constraint "exclusions_unique"' })).toMatch(/esiste già/);
  });

  it("non espone mai dettagli interni", () => {
    const internal = { code: "XX000", message: 'relation "public.assignments" secret detail', details: "token=abc" };
    expect(dbErrorMessage(internal)).toBe(GENERIC_ERROR);
    expect(dbErrorMessage(null)).toBe(GENERIC_ERROR);
    expect(dbErrorMessage({ code: "42501", message: "permission denied for table assignments" })).not.toContain("assignments");
  });
});
