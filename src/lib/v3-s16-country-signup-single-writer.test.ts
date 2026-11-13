import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/country-auth/index.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  transformers: { before: [() => node => ts.factory.updateSourceFile(
    node, node.statements.filter(s => !ts.isImportDeclaration(s)),
  )] },
}).outputText.replace(/\nexport \{\};?\s*$/, "");

async function signup(outcome: "matched" | "missing" | "read-error" | "cleanup-error") {
  const userId = "22222222-2222-4222-8222-222222222222";
  const countryId = "33333333-3333-4333-8333-333333333333";
  const insert = vi.fn();
  const deleteUser = vi.fn(async () => ({
    error: outcome === "cleanup-error" ? { message: "cleanup failed" } : null,
  }));
  const createUser = vi.fn(async () => ({
    data: { user: { id: userId } }, error: null,
  }));
  const signInWithPassword = vi.fn(async () => ({
    data: { user: { id: userId }, session: { access_token: "test-local-access", refresh_token: "test-local-refresh" } },
    error: null,
  }));
  const reads: Array<{ table: string; filters: Record<string, string> }> = [];
  const service = {
    rpc: vi.fn(async () => ({ data: true, error: null })),
    auth: { admin: { createUser, deleteUser } },
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { filters[key] = value; return query; },
        insert: (...args: unknown[]) => { insert(table, ...args); throw new Error("illegal second writer"); },
        maybeSingle: async () => {
          reads.push({ table, filters: { ...filters } });
          if (table === "countries") return { data: { id: countryId }, error: null };
          if (table === "country_accounts" && filters.user_id) {
            if (outcome === "read-error") return { data: null, error: { message: "transient" } };
            if (outcome !== "matched") return { data: null, error: null };
            return { data: {
              user_id: userId, country_id: countryId,
              instagram_username: "example", display_name: "Example",
            }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return query;
    },
  };
  let handler: ((req: Request) => Promise<Response>) | undefined;
  await runInNewContext(`(async () => { ${compiled} })()`, {
    Deno: {
      env: { get: (key: string) => ({
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        SUPABASE_ANON_KEY: "anon",
      } as Record<string, string>)[key] },
      serve: (callback: (req: Request) => Promise<Response>) => { handler = callback; },
    },
    createClient: (_url: string, key: string) => key === "service"
      ? service : { auth: { signInWithPassword } },
    crypto: webcrypto, TextEncoder, Request, Response, URL,
    fetch: vi.fn(async () => ({ ok: true, text: async () => "" })),
    console: { error: vi.fn() },
  });
  if (!handler) throw new Error("No handler registered");
  const response = await handler(new Request("http://127.0.0.1:54321/functions/v1/country-auth", {
    method: "POST",
    body: JSON.stringify({
      action: "signup", countryId, instagramUsername: "Example",
      displayName: "Example", password: "NotBreached-Test123",
    }),
  }));
  return { response, insert, createUser, deleteUser, signInWithPassword, reads, userId };
}

describe("S16 atomic country signup authority", () => {
  it("uses trigger readback and signs in only after exact country ownership", async () => {
    const r = await signup("matched");
    expect(r.response.status).toBe(200);
    expect(await r.response.json()).toMatchObject({ userId: r.userId });
    expect(r.createUser).toHaveBeenCalledOnce();
    expect(r.insert).not.toHaveBeenCalled();
    expect(r.deleteUser).not.toHaveBeenCalled();
    expect(r.signInWithPassword).toHaveBeenCalledOnce();
    expect(r.reads).toContainEqual({ table: "country_accounts", filters: { user_id: r.userId } });
  });

  it("refuses session and rolls back verified missing ownership", async () => {
    const r = await signup("missing");
    expect(r.response.status).toBe(500);
    expect(r.deleteUser).toHaveBeenCalledOnce();
    expect(r.signInWithPassword).not.toHaveBeenCalled();
    expect(r.insert).not.toHaveBeenCalled();
  });

  it("never deletes a possibly valid account on a temporary ownership read error", async () => {
    const r = await signup("read-error");
    expect(r.response.status).toBe(503);
    expect(r.deleteUser).not.toHaveBeenCalled();
    expect(r.signInWithPassword).not.toHaveBeenCalled();
    expect(r.insert).not.toHaveBeenCalled();
  });

  it("does not misreport failed cleanup as a successful rollback", async () => {
    const r = await signup("cleanup-error");
    expect(r.response.status).toBe(503);
    expect((await r.response.json()).error).toContain("organizer assistance");
    expect(r.deleteUser).toHaveBeenCalledOnce();
    expect(r.signInWithPassword).not.toHaveBeenCalled();
  });
});
