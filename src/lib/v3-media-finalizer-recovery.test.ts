import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/solaris-upload-finalize/index.ts", "utf8").replace(
  "import.meta.resolve(",
  "mockResolve(",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
    transformers: {
      before: [
        () => (node) =>
          ts.factory.updateSourceFile(
            node,
            node.statements.filter((statement) => !ts.isImportDeclaration(statement)),
          ),
      ],
    },
  })
  .outputText.replace(/\nexport \{\};?\s*$/, "");

async function finalizer(
  options: {
    status?: string;
    expiresAt?: string;
    storageStatus?: number;
    updateError?: boolean;
    updatedRowMissing?: boolean;
    invalidBytes?: boolean;
  } = {},
) {
  let handler!: (request: Request) => Promise<Response>;
  const row = {
    id: "token-1",
    actor_id: "actor-1",
    authorization_secret: "test-capability",
    status: options.status ?? "prepared",
    expires_at: options.expiresAt ?? "2100-01-01T00:00:00Z",
    final_bucket: "country-media",
    final_path: "country/image.png",
    quarantine_path: "token-1/image.png",
    detected_mime: "image/png",
    verified_metadata: {},
    rejection_reason: null,
    domain: "country_media",
    declared_mime: "image/png",
    expected_size: 3,
  };
  const update = vi.fn();
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const download = vi.fn().mockResolvedValue({
    data: options.invalidBytes ? new Blob([new Uint8Array([0, 1, 2])]) : null,
    error: options.storageStatus ? { status: options.storageStatus } : null,
  });
  const service = {
    auth: { getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }) },
    from: (table: string) => {
      let isUpdate = false;
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: (...args: unknown[]) => {
          isUpdate = true;
          update(...args);
          return query;
        },
        maybeSingle: async () => {
          if (isUpdate)
            return {
              data: options.updatedRowMissing ? null : { id: row.id },
              error: options.updateError ? { code: "25006" } : null,
            };
          return {
            data: table === "studio2_upload_authorizations" ? row : { mode: "normal" },
            error: null,
          };
        },
      };
      return query;
    },
    storage: { from: () => ({ download, remove }) },
  };
  await runInNewContext(`(async () => { ${compiled} })()`, {
    Deno: {
      env: {
        get: (name: string) =>
          name === "SUPABASE_URL" ? "http://127.0.0.1:54321" : "test-service-key",
      },
      readFile: async () => new Uint8Array(),
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
    createClient: () => service,
    mockResolve: () => "file:///mock/magick.js",
    initializeImageMagick: async () => {},
    URL,
    Response,
    console: { error: vi.fn() },
  });
  const request = () =>
    handler(
      new Request("http://localhost/finalize", {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
        body: JSON.stringify({ token_id: row.id, upload_secret: row.authorization_secret }),
      }),
    );
  return { request, update, remove, download };
}

describe("Media finalizer authoritative recovery evidence", () => {
  it("reports confirmed missing quarantine bytes explicitly", async () => {
    const { request } = await finalizer({ storageStatus: 404 });
    const response = await request();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("quarantine_missing");
  });

  it.each([403, 500, 503, undefined])(
    "does not mistake Storage failure %s for absent bytes",
    async (storageStatus) => {
      const { request } = await finalizer({ storageStatus });
      const response = await request();
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBeUndefined();
    },
  );

  it.each(["rejected", "expired"])("returns persisted %s evidence", async (status) => {
    const { request, download } = await finalizer({ status });
    const response = await request();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(`authorization_${status}`);
    expect(download).not.toHaveBeenCalled();
  });

  it("keeps verified receipts replayable", async () => {
    const { request, update } = await finalizer({ status: "verified" });
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, token_id: "token-1", replayed: true });
    expect(update).not.toHaveBeenCalled();
  });

  it("confirms expiration before returning terminal evidence and deleting bytes", async () => {
    const { request, update, remove } = await finalizer({ expiresAt: "2000-01-01T00:00:00Z" });
    const response = await request();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("authorization_expired");
    expect(update).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it.each([{ updateError: true }, { updatedRowMissing: true }])(
    "does not invent terminal expiration on failed/raced writes: %j",
    async (options) => {
      const { request, remove } = await finalizer({
        ...options,
        expiresAt: "2000-01-01T00:00:00Z",
      });
      const response = await request();
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBeUndefined();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it("reports rejection only after the server persists it", async () => {
    const { request, update } = await finalizer({ invalidBytes: true });
    const response = await request();
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("authorization_rejected");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it.each([{ updateError: true }, { updatedRowMissing: true }])(
    "preserves uncertainty if signature rejection cannot be recorded: %j",
    async (options) => {
      const { request } = await finalizer({ ...options, invalidBytes: true });
      const response = await request();
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBeUndefined();
    },
  );
});
