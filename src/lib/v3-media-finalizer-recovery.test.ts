import { createHash } from "node:crypto";
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

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

const sha256Hex = async (bytes: Uint8Array) => digest(bytes);
const validSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const verifyPublishedBlob = async (
  blob: Blob,
  expected: { size: number; sha256: string },
) => {
  if (blob.size !== expected.size) return false;
  return digest(new Uint8Array(await blob.arrayBuffer())) === expected.sha256;
};

async function finalizer(
  options: {
    status?: string;
    expiresAt?: string;
    storageStatus?: number;
    updateError?: boolean;
    updatedRowMissing?: boolean;
    invalidBytes?: boolean;
    validEvidence?: boolean;
    revokedSession?: boolean;
    duplicatePublish?: "same" | "different" | "wrong-size" | "unavailable";
    publishedReadback?: "same" | "different" | "wrong-size" | "unavailable";
    receiptReadbackError?: boolean;
    verifiedReceiptUnbound?: boolean;
  } = {},
) {
  let handler!: (request: Request) => Promise<Response>;
  const evidenceBytes = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  const evidenceSha = digest(evidenceBytes);
  const verifiedMetadata = options.verifiedReceiptUnbound
    ? {}
    : {
        publishedSha256: evidenceSha,
        publishedSize: evidenceBytes.length,
        hashAlgorithm: "sha256",
        storageObjectId: "27182200-0000-4000-8000-000000000031",
      };
  const row = {
    id: "token-1",
    actor_id: "actor-1",
    authorization_secret: "test-capability",
    status: options.status ?? "prepared",
    expires_at: options.expiresAt ?? "2100-01-01T00:00:00Z",
    final_bucket: "country-media",
    final_path: "country/image.png",
    quarantine_path: "token-1/image.png",
    detected_mime:
      options.status === "verified" || options.validEvidence ? "application/pdf" : "image/png",
    verified_metadata: options.status === "verified" ? verifiedMetadata : {},
    rejection_reason: null,
    domain: options.validEvidence || options.status === "verified" ? "integrity_evidence" : "country_media",
    declared_mime:
      options.validEvidence || options.status === "verified" ? "application/pdf" : "image/png",
    expected_size:
      options.validEvidence || options.status === "verified" ? evidenceBytes.length : 3,
  };
  const update = vi.fn();
  const receiptReadback = vi.fn();
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const quarantineDownload = vi.fn().mockResolvedValue({
    data: options.validEvidence
      ? new Blob([evidenceBytes])
      : options.invalidBytes
        ? new Blob([new Uint8Array([0, 1, 2])])
        : null,
    error: options.storageStatus ? { status: options.storageStatus } : null,
  });
  const finalReadbackMode = options.publishedReadback ?? options.duplicatePublish ?? "same";
  const finalDownload = vi.fn().mockResolvedValue({
    data:
      finalReadbackMode === "unavailable"
        ? null
        : new Blob([
            finalReadbackMode === "different"
              ? new TextEncoder().encode("%PDF-1.6\n%%EOF")
              : finalReadbackMode === "wrong-size"
                ? new Uint8Array([1])
                : evidenceBytes,
          ]),
    error: finalReadbackMode === "unavailable" ? { status: 503 } : null,
  });
  const activeSessionRpc = vi.fn(async () => ({
    data: options.revokedSession ? false : true,
    error: options.revokedSession ? { code: "42501", message: "SESSION_REVOKED" } : null,
  }));
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "v3_assert_active_session") return activeSessionRpc();
    if (name === "v3_finalize_media_upload") {
      update({
        status: args.p_status,
        detected_mime: args.p_detected_mime,
        verified_metadata: args.p_metadata,
        rejection_reason: args.p_rejection_reason,
      });
      return {
        data: options.updatedRowMissing ? null : { id: row.id, operationId: "operation-1" },
        error: options.updateError ? { code: "25006" } : null,
      };
    }
    if (name === "v3_read_media_finalization_receipt") {
      receiptReadback(args);
      return {
        data: options.receiptReadbackError
          ? null
          : {
              id: row.id,
              operationId: "operation-1",
              metadata:
                row.status === "verified"
                  ? verifiedMetadata
                  : {
                      publishedSha256: evidenceSha,
                      publishedSize: evidenceBytes.length,
                      hashAlgorithm: "sha256",
                      storageObjectId: "27182200-0000-4000-8000-000000000031",
                    },
            },
        error: options.receiptReadbackError ? { code: "PGRST116" } : null,
      };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const from = vi.fn((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: async () => ({
      data: table === "studio2_upload_authorizations" ? row : { mode: "normal" },
      error: null,
    }),
  }));
  const service = {
    rpc,
    auth: { getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }) },
    from,
    storage: {
      from: (bucket: string) => ({
        download:
          bucket === "solaris-upload-quarantine"
            ? quarantineDownload
            : finalDownload,
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
          name === "SUPABASE_URL"
            ? "http://127.0.0.1:54321"
            : name === "SUPABASE_ANON_KEY"
              ? "test-anon-key"
              : "test-service-key",
      },
      readFile: async () => new Uint8Array(),
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
    createClient: () => service,
    mockResolve: () => "file:///mock/magick.js",
    initializeImageMagick: async () => {},
    sha256Hex,
    validSha256,
    verifyPublishedBlob,
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
  return {
    request,
    activeSessionRpc,
    from,
    download: quarantineDownload,
    update,
    receiptReadback,
    remove,
    quarantineDownload,
    finalDownload,
    rpc,
    evidenceSha,
  };
}

describe("Media finalizer authoritative recovery evidence", () => {
  it("rejects a revoked actor session before any service-role authorization read or Storage effect", async () => {
    const { request, activeSessionRpc, from, download, remove } = await finalizer({ revokedSession: true });
    const response = await request();
    expect(response.status).toBe(401);
    expect(activeSessionRpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

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
    const { request, quarantineDownload, finalDownload } = await finalizer({ status });
    const response = await request();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(`authorization_${status}`);
    expect(quarantineDownload).not.toHaveBeenCalled();
    expect(finalDownload).not.toHaveBeenCalled();
  });

  it("reconciles a verified replay against exact published bytes and the durable receipt", async () => {
    const { request, update, quarantineDownload, finalDownload, receiptReadback } = await finalizer({
      status: "verified",
    });
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      token_id: "token-1",
      replayed: true,
      operation_id: "operation-1",
    });
    expect(update).not.toHaveBeenCalled();
    expect(quarantineDownload).not.toHaveBeenCalled();
    expect(finalDownload).toHaveBeenCalledTimes(1);
    expect(receiptReadback).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["different", 409, "verified_publication_conflict"],
    ["wrong-size", 409, "verified_publication_conflict"],
    ["unavailable", 503, "verified_publication_unconfirmed"],
  ] as const)(
    "never replays verified success when published bytes are %s",
    async (publishedReadback, status, code) => {
      const { request, receiptReadback } = await finalizer({
        status: "verified",
        publishedReadback,
      });
      const response = await request();
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
      expect(receiptReadback).not.toHaveBeenCalled();
    },
  );

  it("does not trust historical verified rows that lack an exact byte identity", async () => {
    const { request, finalDownload } = await finalizer({
      status: "verified",
      verifiedReceiptUnbound: true,
    });
    const response = await request();
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("verified_receipt_unbound");
    expect(finalDownload).not.toHaveBeenCalled();
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

it("reads first-published bytes back before the canonical verified receipt is persisted", async () => {
  const { request, update, receiptReadback, remove, finalDownload, evidenceSha } = await finalizer({
    validEvidence: true,
  });
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, replayed: false });
  expect(finalDownload).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "verified",
      verified_metadata: expect.objectContaining({
        publishedSha256: evidenceSha,
        hashAlgorithm: "sha256",
      }),
    }),
  );
  expect(receiptReadback).toHaveBeenCalledTimes(1);
  expect(update.mock.invocationCallOrder[0]).toBeLessThan(receiptReadback.mock.invocationCallOrder[0]);
  expect(receiptReadback.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
});

it.each([
  ["different", 409],
  ["wrong-size", 409],
  ["unavailable", 503],
] as const)(
  "does not finalize a first publication whose readback is %s",
  async (publishedReadback, status) => {
    const { request, update, remove } = await finalizer({
      validEvidence: true,
      publishedReadback,
    });
    const response = await request();
    expect(response.status).toBe(status);
    expect((await response.json()).ok).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  },
);

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

it("returns uncertainty after a committed verification whose canonical receipt cannot be read back", async () => {
  const { request, update, remove } = await finalizer({
    validEvidence: true,
    receiptReadbackError: true,
  });
  const response = await request();
  expect(response.status).toBe(503);
  expect((await response.json()).ok).toBeUndefined();
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "verified" }));
  expect(remove).not.toHaveBeenCalled();
});

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

it("binds governed finalization and receipt readback to the verified caller and exact upload capability", async () => {
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
  expect(rpc).toHaveBeenCalledWith(
    "v3_read_media_finalization_receipt",
    expect.objectContaining({
      p_token_id: "token-1",
      p_upload_secret: "test-capability",
      p_actor_id: "actor-1",
    }),
  );
});
