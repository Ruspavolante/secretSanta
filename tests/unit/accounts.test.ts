import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireAdminAction: vi.fn(),
}));
vi.mock("@/lib/site", () => ({ getBaseUrl: vi.fn(async () => "https://santa.test") }));

import { NextRequest } from "next/server";
import { GET as confirmLink } from "@/app/auth/confirm/route";
import { changePassword, deleteAccount, requestPasswordReset, setNewPassword } from "@/lib/actions/account";
import { registerOrganizer } from "@/lib/actions/auth";
import { isRecentRecovery, requireAdminAction } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const EMAIL = "nuovo@example.com";
const EVENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function mockSignUp(result: { session?: unknown; error?: unknown }) {
  const signUp = vi.fn(async () => ({ data: { session: result.session ?? null, user: null }, error: result.error ?? null }));
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { signUp } } as never);
  return signUp;
}

/** Client della sessione corrente per le azioni dell'account. */
function asOrganizer(overrides: { signIn?: unknown; update?: unknown; rpc?: unknown; files?: { name: string }[] } = {}) {
  const calls = {
    signIn: vi.fn(async () => ({ data: {}, error: overrides.signIn ?? null })),
    updateUser: vi.fn(async () => ({ data: {}, error: overrides.update ?? null })),
    signOut: vi.fn(async () => ({ error: null })),
    rpc: vi.fn(async () => ({ data: null, error: overrides.rpc ?? null })),
    list: vi.fn(async () => ({ data: overrides.files ?? [], error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
  };
  const supabase = {
    auth: { signInWithPassword: calls.signIn, updateUser: calls.updateUser, signOut: calls.signOut },
    rpc: calls.rpc,
    from: () => ({ select: async () => ({ data: [{ id: EVENT_A }], error: null }) }),
    storage: { from: () => ({ list: calls.list, remove: calls.remove }) },
  };
  vi.mocked(requireAdminAction).mockResolvedValue({ ok: true, context: { supabase: supabase as never, userId: "u", email: EMAIL } });
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("registrazione di un organizzatore", () => {
  const valid = { email: " Nuovo@Example.com ", password: "una-password", confirm: "una-password" };

  it("valida email, lunghezza e conferma della password prima di contattare Supabase", async () => {
    const signUp = mockSignUp({});
    expect(await registerOrganizer(null, form({ ...valid, email: "x" }))).toMatchObject({ ok: false, error: expect.stringContaining("email") });
    expect(await registerOrganizer(null, form({ ...valid, password: "corta", confirm: "corta" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("almeno 8"),
    });
    expect(await registerOrganizer(null, form({ ...valid, confirm: "diversa-123" }))).toMatchObject({
      ok: false,
      error: "Le due password non coincidono.",
    });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("crea l'account con l'email normalizzata e porta subito all'area organizzatore", async () => {
    const signUp = mockSignUp({ session: { access_token: "x" } });
    await expect(registerOrganizer(null, form(valid))).rejects.toThrow("REDIRECT:/admin");
    expect(signUp).toHaveBeenCalledWith({ email: "nuovo@example.com", password: "una-password" });
  });

  it("se il progetto richiede la conferma email lo dice invece di fingere l'accesso", async () => {
    mockSignUp({ session: null });
    expect(await registerOrganizer(null, form(valid))).toEqual({
      ok: true,
      message: expect.stringContaining("Controlla l'email nuovo@example.com"),
    });
  });

  it("traduce gli errori di Supabase Auth", async () => {
    mockSignUp({ error: { status: 422, code: "user_already_exists", message: "User already registered" } });
    expect(await registerOrganizer(null, form(valid))).toEqual({ ok: false, error: "Esiste già un account con questa email: accedi." });
    mockSignUp({ error: { status: 422, code: "signup_disabled", message: "Signups not allowed" } });
    expect(await registerOrganizer(null, form(valid))).toMatchObject({ ok: false, error: expect.stringContaining("non è attiva") });
    mockSignUp({ error: { status: 429, code: "over_request_rate_limit", message: "rate" } });
    expect(await registerOrganizer(null, form(valid))).toMatchObject({ ok: false, error: expect.stringContaining("Troppi tentativi") });
    mockSignUp({ error: { status: 0, message: "fetch failed" } });
    expect(await registerOrganizer(null, form(valid))).toMatchObject({ ok: false, error: expect.stringContaining("non disponibile") });
  });
});

describe("account dell'organizzatore", () => {
  const passwords = { current: "vecchia-password", password: "nuova-password", confirm: "nuova-password" };

  it("cambio password: richiede la password attuale corretta", async () => {
    const calls = asOrganizer({ signIn: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" } });
    expect(await changePassword(null, form(passwords))).toEqual({ ok: false, error: "La password attuale non è corretta." });
    expect(calls.updateUser).not.toHaveBeenCalled();
  });

  it("cambio password: valida e aggiorna", async () => {
    let calls = asOrganizer();
    expect(await changePassword(null, form({ ...passwords, confirm: "altra-password" }))).toMatchObject({ ok: false });
    expect(calls.signIn).not.toHaveBeenCalled();

    calls = asOrganizer();
    expect(await changePassword(null, form(passwords))).toEqual({ ok: true, message: "Password aggiornata." });
    expect(calls.signIn).toHaveBeenCalledWith({ email: EMAIL, password: "vecchia-password" });
    expect(calls.updateUser).toHaveBeenCalledWith({ password: "nuova-password" });
  });

  it("eliminazione: serve l'email esatta, poi rimuove le foto, l'account e la sessione", async () => {
    let calls = asOrganizer({ files: [{ name: "a.jpg" }, { name: "cover-b.png" }] });
    expect(await deleteAccount(null, form({ confirmation: "altro@example.com" }))).toMatchObject({ ok: false });
    expect(calls.rpc).not.toHaveBeenCalled();

    calls = asOrganizer({ files: [{ name: "a.jpg" }, { name: "cover-b.png" }] });
    await expect(deleteAccount(null, form({ confirmation: " NUOVO@example.com " }))).rejects.toThrow("REDIRECT:/?account=eliminato");
    expect(calls.remove).toHaveBeenCalledWith([`${EVENT_A}/a.jpg`, `${EVENT_A}/cover-b.png`]);
    expect(calls.rpc).toHaveBeenCalledWith("delete_my_account");
    expect(calls.signOut).toHaveBeenCalled();
  });

  it("eliminazione non riuscita: l'utente resta collegato e riceve un errore", async () => {
    const calls = asOrganizer({ rpc: { code: "XX000", message: "boom" } });
    expect(await deleteAccount(null, form({ confirmation: EMAIL }))).toMatchObject({ ok: false });
    expect(calls.signOut).not.toHaveBeenCalled();
  });

  it("senza sessione non fa nulla", async () => {
    vi.mocked(requireAdminAction).mockResolvedValue({ ok: false, error: "Sessione scaduta: accedi di nuovo." });
    expect(await changePassword(null, form(passwords))).toEqual({ ok: false, error: "Sessione scaduta: accedi di nuovo." });
    expect(await deleteAccount(null, form({ confirmation: EMAIL }))).toEqual({ ok: false, error: "Sessione scaduta: accedi di nuovo." });
  });
});

describe("recupero password", () => {
  function mockReset(error: unknown = null) {
    const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error }));
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { resetPasswordForEmail } } as never);
    return resetPasswordForEmail;
  }

  it("risponde allo stesso modo che l'account esista o no e usa il link del sito", async () => {
    const reset = mockReset();
    expect(await requestPasswordReset(null, form({ email: " Chiunque@Example.com " }))).toEqual({
      ok: true,
      message: expect.stringContaining("Se esiste un account con chiunque@example.com"),
    });
    expect(reset).toHaveBeenCalledWith("chiunque@example.com", { redirectTo: "https://santa.test/auth/confirm" });
  });

  it("email non valida: nessuna richiesta; errori di invio detti chiaramente", async () => {
    let reset = mockReset();
    expect(await requestPasswordReset(null, form({ email: "x" }))).toMatchObject({ ok: false });
    expect(reset).not.toHaveBeenCalled();

    reset = mockReset({ status: 429, message: "rate limit" });
    expect(await requestPasswordReset(null, form({ email: EMAIL }))).toMatchObject({ ok: false, error: expect.stringContaining("Troppe richieste") });
    mockReset({ status: 500, message: "Error sending recovery email" });
    expect(await requestPasswordReset(null, form({ email: EMAIL }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("Non siamo riusciti a inviare"),
    });
  });

  it("la nuova password si imposta solo entro un'ora dal link", async () => {
    const now = Date.now() / 1000;
    expect(isRecentRecovery({ recoveryAt: now - 60 })).toBe(true);
    expect(isRecentRecovery({ recoveryAt: now - 2 * 3600 })).toBe(false);
    expect(isRecentRecovery({ recoveryAt: null })).toBe(false);
    expect(isRecentRecovery({})).toBe(false);
  });

  it("setNewPassword: rifiuta sessioni normali, valida e aggiorna", async () => {
    const updateUser = vi.fn(async () => ({ data: {}, error: null }));
    const context = (recoveryAt: number | null) => ({
      ok: true as const,
      context: { supabase: { auth: { updateUser } } as never, userId: "u", email: EMAIL, recoveryAt },
    });
    const values = { password: "nuova-password", confirm: "nuova-password" };

    vi.mocked(requireAdminAction).mockResolvedValue(context(null));
    expect(await setNewPassword(null, form(values))).toMatchObject({ ok: false, error: expect.stringContaining("scaduto") });

    vi.mocked(requireAdminAction).mockResolvedValue(context(Date.now() / 1000));
    expect(await setNewPassword(null, form({ ...values, confirm: "diversa-123" }))).toMatchObject({ ok: false });
    expect(updateUser).not.toHaveBeenCalled();
    await expect(setNewPassword(null, form(values))).rejects.toThrow("REDIRECT:/admin?password=aggiornata");
    expect(updateUser).toHaveBeenCalledWith({ password: "nuova-password" });
  });

  it("il link dell'email apre la sessione e porta alla nuova password; se non vale torna alla richiesta", async () => {
    const verifyOtp = vi.fn(async () => ({ data: {}, error: null as unknown }));
    const exchangeCodeForSession = vi.fn(async () => ({ data: {}, error: null as unknown }));
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { verifyOtp, exchangeCodeForSession } } as never);
    const open = async (query: string) => (await confirmLink(new NextRequest(`https://santa.test/auth/confirm${query}`))).headers.get("location");

    expect(await open("?token_hash=abc&type=recovery")).toBe("https://santa.test/admin/nuova-password");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
    expect(await open("?code=xyz")).toBe("https://santa.test/admin/nuova-password");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("xyz");

    // Tipi diversi dal recupero o link incompleti non aprono sessioni
    expect(await open("?token_hash=abc&type=signup")).toBe("https://santa.test/admin/password-dimenticata?errore=link");
    expect(await open("")).toBe("https://santa.test/admin/password-dimenticata?errore=link");
    verifyOtp.mockResolvedValueOnce({ data: {}, error: { message: "Token has expired or is invalid" } });
    expect(await open("?token_hash=vecchio&type=recovery")).toBe("https://santa.test/admin/password-dimenticata?errore=link");
  });
});
