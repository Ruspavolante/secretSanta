/** Client Supabase finto per i test unitari delle server action. */

export type Call = { table?: string; rpc?: string; args?: unknown; ops: { method: string; args: unknown[] }[] };
export type Result = { data?: unknown; error?: unknown; count?: number };

/** Client Supabase finto: registra le chiamate e risponde tramite `handler`. */
export function fakeSupabase(handler: (call: Call) => Result = () => ({ data: null, error: null })) {
  const calls: Call[] = [];
  const builder = (call: Call) => {
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            const result = { data: null, error: null, ...handler(call) };
            return (resolve: (value: unknown) => unknown) => resolve(result);
          }
          return (...args: unknown[]) => {
            call.ops.push({ method: prop, args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return builder(call);
    },
    rpc(name: string, args: unknown) {
      const call: Call = { rpc: name, args, ops: [] };
      calls.push(call);
      return builder(call);
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (...args: unknown[]) => {
            const call: Call = { table: `storage:${bucket}`, ops: [{ method: "upload", args }] };
            calls.push(call);
            return { data: null, error: null, ...handler(call) };
          },
          list: async (...args: unknown[]) => {
            const call: Call = { table: `storage:${bucket}`, ops: [{ method: "list", args }] };
            calls.push(call);
            return { data: [], error: null, ...handler(call) };
          },
          remove: async (...args: unknown[]) => {
            const call: Call = { table: `storage:${bucket}`, ops: [{ method: "remove", args }] };
            calls.push(call);
            return { data: null, error: null, ...handler(call) };
          },
        };
      },
    },
  };
  return { client, calls };
}
