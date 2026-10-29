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
    validEvidence?: boolean;
    duplicatePublish?: "same" | "different" | "wrong-size" | "unavailable";
  } = {},
) {
  let handler!: (request: Request) => Promise<Response>;
  const evidenceBytes = new TextEncoder().encode("%PDF-1.7\n%%EOF");
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
    domain: options.validEvidence ? "integrity_evidence" : "country_media",
    declared_mime: options.validEvidence ? "application/pdf" : "image/png",
    expected_size: options.validEvidence ? evidenceBytes.length : 3,
  };
  const update = vi.fn();
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const download = vi.fn().mockResolvedValue({
    data: options.validEvidence
      ? new Blob([evidenceBytes])
      : options.invalidBytes
        ? new Blob([new Uint8Array([0, 1, 2])])
        : null,
    error: options.storageStatus ? { status: options.storageStatus } : null,
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    expect(name).toBe("v3_finalize_media_upload");
    update({
      status: args.p_status,
      detected_mime: args.p_detected_mime,
      verified_metadata: args.p_metadata,
      rejection_reason: args.p_rejection_reason,
    });
    return {
      data: options.updatedRowMissing ? null : { id: row.id },
      error: options.updateError ? { code: "25006" } : null,
    };
  });
  const service = {
    rpc,
    auth: { getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }) },
    from: (table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: async () => ({
        data: table === "studio2_upload_authorizations" ? row : { mode: "normal" },
        error: null,
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        download:
          bucket === "solaris-upload-quarantine"
            ? download
            : vi.fn().mockResolvedValue({
                data:
                  options.duplicatePublish === "unavailable"
                    ? null
                    : new Blob([
                        options.duplicatePublish === "different"
                          ? new TextEncoder().encode("%PDF-1.6\n%%EOF")
                          : options.duplicatePublish === "wrong-size"
                            ? new Uint8Array([1])
                            : evidenceBytes,
                      ]),
                error: options.duplicatePublish === "unavailable" ? { status: 503 } : null,
              }),
        remove,
        upload: vi.fn().mockResolvedValue({
          error: options.duplicatePublish ? { message: "The resource already exists" } : null,
        }),
      }),
    },
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
    Blob,
    TextDecoder,
    atob,
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
  return { request, update, remove, download, rpc };
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

it("acknowledges publication only after the canonical verified receipt is persisted", async () => {
  const { request, update, remove } = await finalizer({ validEvidence: true });
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, replayed: false });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "verified" }));
  expect(update.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
});

it.each([{ updateError: true }, { updatedRowMissing: true }])(
  "retains retry bytes and never invents verified success after unconfirmed receipt writes: %j",
  async (options) => {
    const { request, remove } = await finalizer({ ...options, validEvidence: true });
    const response = await request();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.ok).toBeUndefined();
    expect(body.code).toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
  },
);

it("reconciles duplicate publication only when persisted bytes match the verified payload", async () => {
  const { request, update } = await finalizer({ validEvidence: true, duplicatePublish: "same" });
  expect((await request()).status).toBe(200);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "verified" }));
});

it.each([
  ["different", 409],
  ["wrong-size", 409],
  ["unavailable", 503],
] as const)(
  "never certifies a duplicate object with %s readback",
  async (duplicatePublish, status) => {
    const { request, update, remove } = await finalizer({ validEvidence: true, duplicatePublish });
    const response = await request();
    expect(response.status).toBe(status);
    expect((await response.json()).ok).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  },
);

it("binds the governed finalization call to the verified caller and exact upload capability", async () => {
  const { request, rpc } = await finalizer({ validEvidence: true });
  expect((await request()).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith(
    "v3_finalize_media_upload",
    expect.objectContaining({
      p_token_id: "token-1",
      p_upload_secret: "test-capability",
      p_actor_id: "actor-1",
      p_status: "verified",
    }),
  );
});
