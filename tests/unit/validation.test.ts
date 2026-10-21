import { describe, expect, it } from "vitest";
import {
  detectImageType,
  eventSchema,
  exclusionSchema,
  isValidIsoDate,
  participantSchema,
  tokenSchema,
  validatePhoto,
} from "@/lib/validation";

const A = "a0000000-0000-4000-8000-000000000001";
const B = "a0000000-0000-4000-8000-000000000002";
const E = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("eventSchema", () => {
  it("normalizza i campi e converte i vuoti in null", () => {
    const result = eventSchema.parse({ name: "  Natale   2026 ", description: " ", budget: "", exchangeDate: "" });
    expect(result).toEqual({ name: "Natale 2026", description: null, budget: null, exchangeDate: null });
  });

  it("rifiuta nome vuoto, troppo lungo e date inesistenti", () => {
    expect(eventSchema.safeParse({ name: "   ", description: "", budget: "", exchangeDate: "" }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "x".repeat(81), description: "", budget: "", exchangeDate: "" }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "Ok", description: "", budget: "", exchangeDate: "2026-02-30" }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "Ok", description: "x".repeat(501), budget: "", exchangeDate: "" }).success).toBe(false);
  });

  it("accetta una data valida", () => {
    expect(eventSchema.parse({ name: "Ok", description: "", budget: "20 €", exchangeDate: "2026-12-24" }).exchangeDate).toBe("2026-12-24");
  });
});

describe("participantSchema", () => {
  it("accetta nome ed email opzionale", () => {
    expect(participantSchema.parse({ name: " Mario ", email: " Mario@Example.COM ", avatar: "gift" })).toEqual({
      name: "Mario",
      email: "mario@example.com",
      avatar: "gift",
    });
    expect(participantSchema.parse({ name: "Sara", email: "", avatar: "tree" }).email).toBeNull();
  });

  it("rifiuta email non valide, nomi vuoti e avatar sconosciuti", () => {
    expect(participantSchema.safeParse({ name: "Mario", email: "non-una-email", avatar: "gift" }).success).toBe(false);
    expect(participantSchema.safeParse({ name: "", email: "", avatar: "gift" }).success).toBe(false);
    expect(participantSchema.safeParse({ name: "x".repeat(61), email: "", avatar: "gift" }).success).toBe(false);
    expect(participantSchema.safeParse({ name: "Mario", email: "", avatar: "<script>" }).success).toBe(false);
  });
});

describe("exclusionSchema", () => {
  it("richiede due persone diverse e identificativi validi", () => {
    expect(exclusionSchema.safeParse({ eventId: E, giverId: A, receiverId: B, bothDirections: true }).success).toBe(true);
    expect(exclusionSchema.safeParse({ eventId: E, giverId: A, receiverId: A, bothDirections: false }).success).toBe(false);
    expect(exclusionSchema.safeParse({ eventId: E, giverId: "1 or 1=1", receiverId: B, bothDirections: false }).success).toBe(false);
  });
});

describe("tokenSchema", () => {
  it("accetta solo token base64url di 43 caratteri", () => {
    expect(tokenSchema.safeParse("A".repeat(43)).success).toBe(true);
    expect(tokenSchema.safeParse("abc_DEF-123".padEnd(43, "x")).success).toBe(true);
    expect(tokenSchema.safeParse("A".repeat(42)).success).toBe(false);
    expect(tokenSchema.safeParse("A".repeat(42) + "=").success).toBe(false);
    expect(tokenSchema.safeParse("").success).toBe(false);
  });
});

describe("isValidIsoDate", () => {
  it("valida le date di calendario", () => {
    expect(isValidIsoDate("2026-12-25")).toBe(true);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("25/12/2026")).toBe(false);
  });
});

describe("foto", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

  it("riconosce il formato dai byte iniziali", () => {
    expect(detectImageType(jpeg)).toBe("image/jpeg");
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(webp)).toBe("image/webp");
    expect(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("rifiuta file mancanti, vuoti, troppo grandi o con contenuto non immagine", async () => {
    expect((await validatePhoto(null)).ok).toBe(false);
    expect((await validatePhoto(new Blob([]))).ok).toBe(false);
    expect((await validatePhoto(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]))).ok).toBe(false);
    // MIME dichiarato da immagine, contenuto HTML: rifiutato.
    expect((await validatePhoto(new Blob(["<html>"], { type: "image/png" }))).ok).toBe(false);
    const ok = await validatePhoto(new Blob([png], { type: "application/octet-stream" }));
    expect(ok).toMatchObject({ ok: true, type: "image/png" });
  });
});
