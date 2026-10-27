import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { transpileModule, ModuleKind } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { confirmationEditionsById } from "./confirmation-edition-identity";

const source = (path: string) => readFileSync(path, "utf8");

describe("canonical edition identity", () => {
  it("keeps equal edition numbers separate, including renumbering", () => {
    const a = { id: "aaa", edition_number: 22, name: "A" };
    const b = { id: "bbb", edition_number: 22, name: "B" };
    const rows = confirmationEditionsById([a, b]);
    expect(rows.get(a.id)).toEqual(a);
    expect(rows.get(b.id)).toEqual(b);
    a.edition_number = 23;
    expect(rows.get(a.id)).toBe(a);
    expect(rows.get("missing")).toBeUndefined();
  });
  it("fails closed for missing or duplicate linkage instead of using a number", () => {
    expect(() => confirmationEditionsById([{ id: "" }])).toThrow();
    expect(() => confirmationEditionsById([{ id: "aaa" }, { id: "aaa" }])).toThrow();
    const route = source("src/routes/confirmations/admin/editions.tsx");
    expect(route).not.toContain("remoteByNumber");
    expect(route).toContain("loadConfirmationEditionBinding(targetEditionId)");
    expect(route).toContain("if (!editionId)");
    expect(route).toContain("previewConfirmationEditionBindingChange({");
    expect(route).not.toContain('from("integration_links")');
  });
  it("uses the actual governed read client with exact identity and rejects absent or duplicate RPC shapes", async () => {
    const rpc = vi.fn(async (_name: string, args: { p_edition_id: string }): Promise<{ data: unknown; error: null }> => ({
      data: { editionId: args.p_edition_id, editionNumber: 22, bindingState: "missing" }, error: null,
    }));
    const exports: { loadConfirmationEditionBinding?: (editionId: string) => Promise<unknown> } = {};
    // Execute the real client without loading a Supabase client or network. The
    // transport seam is the same method used by the production adapter.
    const code = transpileModule(
      source("src/integrations/confirmations/edition-bindings.ts").replace(
        'import { confirmationsSupabase } from "@/integrations/confirmations/client";', "",
      ),
      { compilerOptions: { module: ModuleKind.CommonJS } },
    ).outputText;
    runInNewContext(code, { exports, confirmationsSupabase: { rpc } });
    const load = exports.loadConfirmationEditionBinding!;
    expect(await load("edition-A")).toMatchObject({ editionId: "edition-A", editionNumber: 22 });
    expect(await load("edition-B")).toMatchObject({ editionId: "edition-B", editionNumber: 22 });
    expect(rpc.mock.calls.map(([name, args]) => [name, args])).toEqual([
      ["studio2_confirmation_edition_binding", { p_edition_id: "edition-A" }],
      ["studio2_confirmation_edition_binding", { p_edition_id: "edition-B" }],
    ]);
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(load("edition-A")).rejects.toThrow("invalid response");
    rpc.mockResolvedValueOnce({ data: [{ editionId: "edition-A" }, { editionId: "edition-A" }], error: null });
    await expect(load("edition-A")).rejects.toThrow("invalid response");
  });
});

describe("push display survives receipt outages", () => {
  it.each(["success", "slow", "reject", "hang"])("displays immediately with %s telemetry", async (mode) => {
    const handlers: Record<string, (event: any) => void> = {};
    const show = vi.fn().mockResolvedValue(undefined);
    let resolveReceipt: (() => void) | undefined;
    const fetch = vi.fn(() => mode === "success" ? Promise.resolve({ ok: true }) : mode === "reject" ? Promise.reject(new Error("offline")) : new Promise<void>((resolve) => { resolveReceipt = resolve; }));
    const clear = vi.fn();
    const timeouts: Array<() => void> = [];
    runInNewContext(source("public/sw.js"), {
      self: { addEventListener: (name: string, handler: any) => { handlers[name] = handler; }, registration: { showNotification: show } },
      fetch, AbortController, setTimeout: (fn: () => void) => { timeouts.push(fn); return 1; }, clearTimeout: clear,
    });
    let lifetime: Promise<unknown> | undefined;
    handlers.push({ data: { json: () => ({ title: "Test", tag: "dedupe", route: "/my-solaris", deliveryId: "d", receiptToken: "t", receiptUrl: "https://receipt.invalid" }) }, waitUntil: (p: Promise<unknown>) => { lifetime = p; } });
    expect(show).toHaveBeenCalledOnce();
    expect(show.mock.calls[0][1]).toMatchObject({ tag: "dedupe", renotify: false, data: { route: "/my-solaris" } });
    await Promise.resolve();
    expect(fetch.mock.calls.length).toBe(2);
    if (mode === "success" || mode === "reject") await lifetime;
    else if (mode === "slow") resolveReceipt?.();
    else { timeouts.forEach((fn) => fn()); expect(show).toHaveBeenCalledOnce(); }
  });
});

describe("signup address budget", () => {
  it("rotating countries and usernames cannot bypass the durable address bucket", async () => {
    let handler: (req: Request) => Promise<Response> = async () => new Response();
    const counters = new Map<string, number>();
    const rpc = vi.fn(async (_name: string, args: any) => {
      const key = `${args.p_scope}:${args.p_key_hash}`;
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return { data: count <= args.p_limit, error: null };
    });
    const lookup = vi.fn();
    const service = { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { lookup(); return { data: null, error: null }; } }) }) }) };
    const code = transpileModule(source("supabase/functions/country-auth/index.ts").replace(/^import .*;\n/gm, ""), { compilerOptions: { module: ModuleKind.None } }).outputText;
    const passwordFetch = vi.fn(async () => ({ ok: true, text: async () => "" }));
    runInNewContext(code, { Deno: { env: { get: () => "local-test-only" }, serve: (fn: typeof handler) => { handler = fn; } }, createClient: () => service, crypto: webcrypto, TextEncoder, Response, fetch: passwordFetch, console });
    for (let i = 0; i < 6; i++) {
      const response = await handler(new Request("http://localhost/signup", { method: "POST", headers: { "x-forwarded-for": "192.0.2.1", "Content-Type": "application/json" }, body: JSON.stringify({ action: "signup", countryId: `country-${i}`, instagramUsername: `user${i}`, displayName: "Test", password: "safe-test-password" }) }));
      expect(response.status).toBe(i < 5 ? 400 : 429);
      if (i === 5) expect(response.headers.get("Retry-After")).toBe("900");
    }
    expect(passwordFetch).toHaveBeenCalledTimes(5);
    expect(rpc.mock.calls.filter((call) => call[1].p_scope === "signup-address")).toHaveLength(6);
    expect(lookup).toHaveBeenCalledTimes(10);
  });
});

describe("show-scoped Organizer reminders", () => {
  it("authorizes show-only rows through the show's edition instead of requiring global edition.manage", () => {
    const migration = source("supabase/migrations/20261005153104_pr450_remaining_review_boundaries.sql");
    expect(migration).toContain("when edition_id is not null then public.studio2_access_allowed('edition.manage', edition_id, true)");
    expect(migration).toContain("when show_id is not null then private.studio2_show_access_allowed('edition.manage', show_id, true)");
    expect(migration).toContain("else public.studio2_access_allowed('edition.manage', null, true)");
    expect(migration).not.toContain("public.studio2_access_allowed('edition.manage', edition_id, true)\n  and (show_id is null");
  });
});

describe("navigation hydration boundary", () => {
  it("keeps the server-rendered drawer trigger disabled until its handler is attached", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain("const [navigationReady, setNavigationReady] = useState(false)");
    expect(shell).toContain("useEffect(() => setNavigationReady(true), [])");
    expect(shell).toContain("disabled={!navigationReady}");
    expect(shell).toContain("aria-busy={!navigationReady}");
  });
});
