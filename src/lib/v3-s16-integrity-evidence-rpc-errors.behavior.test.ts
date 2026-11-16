import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type MockScenario = {
  descriptor?: { data: unknown; error: { message: string } | null };
  finalize?: { data: unknown; error: { message: string } | null };
  authFailed?: boolean;
};

function loadEdge(file: string, scenario: MockScenario = {}) {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const rpc = vi.fn(async (name: string) => {
    if (name.includes("descriptor")) return scenario.descriptor ?? { data: null, error: null };
    return scenario.finalize ?? { data: { ok: true }, error: null };
  });
  const signedUrl = vi.fn(async () => ({ data: { signedUrl: "https://example.invalid/signed" }, error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const logger = vi.fn();
  const authClient = {
    auth: {
      getUser: vi.fn(async () => scenario.authFailed
        ? { data: { user: null }, error: { message: "expired" } }
        : { data: { user: { id: "actor-1" } }, error: null }),
    },
    rpc,
  };
  const service = {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: signedUrl,
        remove,
      })),
    },
  };
  const source = readFileSync(file, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
    transformers: {
      before: [
        () => (node) => ts.factory.updateSourceFile(
          node,
          node.statements.filter((statement) => !ts.isImportDeclaration(statement)),
        ),
      ],
    },
  }).outputText.replace(/\nexport \{\};?\s*$/, "");

  void runInNewContext("(async () => { " + compiled + " })()", {
    Deno: {
      env: { get: (name: string) => ({
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_ANON_KEY: "local-anon",
        SUPABASE_SERVICE_ROLE_KEY: "local-service",
      } as Record<string, string>)[name] },
      serve: (callback: typeof handler) => { handler = callback; },
    },
    createClient: (_url: string, key: string) => key === "local-service" ? service : authClient,
    Response,
    console: { error: logger },
  });
  if (!handler) throw new Error("Edge handler did not register.");
  const request = async (body: Record<string, string>) => handler!(
    new Request("http://127.0.0.1:54321/functions/v1/test", {
      method: "POST",
      headers: { authorization: "Bearer local-actor" },
      body: JSON.stringify(body),
    }),
  );
  return { request, rpc, signedUrl, remove, logger, service, authClient };
}

const downloadPath = "supabase/functions/integrity-evidence-download/index.ts";
const lifecyclePath = "supabase/functions/integrity-evidence-lifecycle/index.ts";
const sqlDiagnostic = "permission denied on private.identity_secrets() with sensitive SQL function name";

describe("S16 protected Integrity Edge error behavior", () => {
  it("fails closed and redacts SQL diagnostics before issuing a signed URL", async () => {
    const edge = loadEdge(downloadPath, {
      descriptor: { data: null, error: { message: sqlDiagnostic } },
    });
    const response = await edge.request({ mode: "organizer", evidenceId: "evidence-A" });
    expect(response.status).toBe(403);
    const result = await response.json();
    expect(result).toEqual({ error: "Evidence is not available." });
    expect(JSON.stringify(result)).not.toContain(sqlDiagnostic);
    expect(edge.signedUrl).not.toHaveBeenCalled();
  });

  it("denies and redacts lifecycle descriptor errors without touching Storage", async () => {
    const edge = loadEdge(lifecyclePath, {
      descriptor: { data: null, error: { message: sqlDiagnostic } },
    });
    const response = await edge.request({ mode: "delete_evidence", evidenceId: "evidence-A" });
    expect(response.status).toBe(403);
    const result = await response.json();
    expect(result).toEqual({ error: "Evidence lifecycle action is not available." });
    expect(JSON.stringify(result)).not.toContain(sqlDiagnostic);
    expect(edge.remove).not.toHaveBeenCalled();
  });

  it("preserves uncertain Storage finalization as 409 without leaking RPC diagnostics", async () => {
    const edge = loadEdge(lifecyclePath, {
      descriptor: {
        data: { bucket: "integrity-evidence", storage_path: "quarantine/evidence-A", object_exists: true },
        error: null,
      },
      finalize: { data: null, error: { message: sqlDiagnostic } },
    });
    const response = await edge.request({ mode: "delete_evidence", evidenceId: "evidence-A" });
    expect(response.status).toBe(409);
    const result = await response.json();
    expect(result).toEqual({ error: "Evidence storage was changed but lifecycle finalization failed." });
    expect(JSON.stringify(result)).not.toContain(sqlDiagnostic);
    expect(edge.remove).toHaveBeenCalledWith(["quarantine/evidence-A"]);
    expect(edge.logger).toHaveBeenCalled();
  });

  it.each([downloadPath, lifecyclePath])("does not invoke privileged operations for an expired session: %s", async (path) => {
    const edge = loadEdge(path, { authFailed: true });
    const response = await edge.request({ mode: "organizer", evidenceId: "evidence-A" });
    expect(response.status).toBe(401);
    expect(edge.rpc).not.toHaveBeenCalled();
    expect(edge.remove).not.toHaveBeenCalled();
    expect(edge.signedUrl).not.toHaveBeenCalled();
  });
});
