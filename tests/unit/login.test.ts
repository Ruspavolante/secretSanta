import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { login } from "@/lib/actions/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function credentials(email = "admin@example.com", password = "segreta-123") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

function mockAuth({ signInError = null as unknown, isAdmin = true }) {
  const signOut = vi.fn(async () => ({ error: null }));
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { signInWithPassword: vi.fn(async () => ({ error: signInError })), signOut },
    rpc: vi.fn(async () => ({ data: isAdmin, error: null })),
  } as never);
  return { signOut };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("login", () => {
  it("valida l'input prima di contattare Supabase", async () => {
    expect(await login(null, credentials("non-email", "x"))).toEqual({ ok: false, error: "Inserisci un indirizzo email valido." });
    expect(await login(null, credentials("a@example.com", ""))).toEqual({ ok: false, error: "Inserisci la password." });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("credenziali errate: messaggio generico (non rivela se l'email esiste)", async () => {
    mockAuth({ signInError: { status: 400, message: "Invalid login credentials" } });
    expect(await login(null, credentials())).toEqual({ ok: false, error: "Email o password non corretti." });
  });

  it("servizio irraggiungibile o in pausa: lo dice chiaramente", async () => {
    mockAuth({ signInError: { status: 0, message: "fetch failed" } });
    expect(await login(null, credentials())).toMatchObject({ ok: false, error: expect.stringContaining("non disponibile") });
    mockAuth({ signInError: { status: 503, message: "unavailable" } });
    expect(await login(null, credentials())).toMatchObject({ ok: false, error: expect.stringContaining("non disponibile") });
  });

  it("troppi tentativi: invita ad attendere", async () => {
    mockAuth({ signInError: { status: 429, message: "rate limit" } });
    expect(await login(null, credentials())).toMatchObject({ ok: false, error: expect.stringContaining("Troppi tentativi") });
  });

  it("qualsiasi organizzatore con credenziali valide entra nella propria area", async () => {
    const { signOut } = mockAuth({ isAdmin: false });
    await expect(login(null, credentials())).rejects.toThrow("REDIRECT:/admin");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("configurazione mancante: messaggio chiaro", async () => {
    vi.mocked(createSupabaseServerClient).mockRejectedValue(new Error("Variabile d'ambiente mancante"));
    expect(await login(null, credentials())).toMatchObject({ ok: false, error: expect.stringContaining("non è configurato") });
  });
});
