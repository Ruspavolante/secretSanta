import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: vi.fn() }));

import { GET } from "@/app/api/keepalive/route";
import { createSupabasePublicClient } from "@/lib/supabase/public";

function mockRpc(error: unknown = null) {
  const rpc = vi.fn(async () => ({ data: [], error }));
  vi.mocked(createSupabasePublicClient).mockReturnValue({ rpc } as never);
  return rpc;
}

const request = (authorization?: string) =>
  new Request("https://santa.test/api/keepalive", { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("battito anti-pausa di Supabase", () => {
  it("esegue una query sul database e risponde ok", async () => {
    const rpc = mockRpc();
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("signup_info", { p_token: "keepalive" });
  });

  it("con CRON_SECRET accetta solo le chiamate del cron di Vercel", async () => {
    vi.stubEnv("CRON_SECRET", "segreto-di-prova");
    const rpc = mockRpc();
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer sbagliato"))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect((await GET(request("Bearer segreto-di-prova"))).status).toBe(200);
  });

  it("se il database non risponde lo segnala (503) senza dettagli", async () => {
    mockRpc({ code: "PGRST000", message: "connection failed" });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });
});
