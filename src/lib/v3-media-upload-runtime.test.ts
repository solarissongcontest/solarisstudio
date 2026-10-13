import { describe, expect, it, vi } from "vitest";
import { uploadVerifiedFile } from "./upload-safety";

function runtime() {
  let actor = "actor-1";
  const prepared = {
    token_id: "token-1",
    upload_secret: "test-capability",
    bucket: "solaris-upload-quarantine",
    object_path: "token-1/image.png",
    final_bucket: "country-media",
    expires_at: "2100-01-01T00:00:00Z",
  };
  const receipt = {
    ok: true,
    token_id: prepared.token_id,
    bucket: prepared.final_bucket,
    object_path: "country/image.png",
    detected_mime: "image/png",
    metadata: {},
    replayed: false,
  };
  const upload = vi.fn().mockResolvedValue({ error: null });
  const invoke = vi.fn().mockResolvedValue({ data: receipt, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: prepared, error: null });
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: actor } } }, error: null })),
    },
    rpc,
    functions: { invoke },
    storage: { from: vi.fn(() => ({ upload })) },
  };
  const file = new File(["immutable-image-bytes"], "image.png", { type: "image/png" });
  const input = {
    client,
    file,
    domain: "country_media" as const,
    entityId: "country-1",
    scope: "flags",
  };
  return {
    input,
    client,
    upload,
    invoke,
    rpc,
    prepared,
    receipt,
    switchActor: (value: string) => {
      actor = value;
    },
  };
}

function serverFailure(code: string, status = 409) {
  return {
    data: null,
    error: {
      message: "Server could not finalize this upload.",
      context: new Response(JSON.stringify({ code }), { status }),
    },
  };
}

describe("production Media upload continuity", () => {
  it("verifies a lost Storage response using the original authorization", async () => {
    const r = runtime();
    r.upload.mockResolvedValueOnce({ error: { message: "Network response lost" } });
    expect(await uploadVerifiedFile(r.input)).toEqual(r.receipt);
    expect(r.rpc).toHaveBeenCalledTimes(1);
    expect(r.invoke).toHaveBeenCalledWith("solaris-upload-finalize", {
      body: { token_id: "token-1", upload_secret: "test-capability" },
    });
    expect(r.upload).toHaveBeenCalledTimes(1);
    expect(r.upload.mock.calls[0][2]).toMatchObject({ upsert: false });
  });

  it("reconciles a lost finalization response without another authorization or upload", async () => {
    const r = runtime();
    r.invoke.mockResolvedValueOnce({ data: null, error: { message: "Response lost" } });
    await expect(uploadVerifiedFile(r.input)).rejects.toThrow();
    r.invoke.mockResolvedValueOnce({ data: { ...r.receipt, replayed: true }, error: null });
    expect((await uploadVerifiedFile(r.input)).replayed).toBe(true);
    expect(r.rpc).toHaveBeenCalledTimes(1);
    expect(r.upload).toHaveBeenCalledTimes(1);
    expect(r.invoke.mock.calls[0]).toEqual(r.invoke.mock.calls[1]);
  });

  it("re-uploads to the same authorized path only after authoritative not-found", async () => {
    const r = runtime();
    r.upload.mockResolvedValueOnce({ error: { message: "Connection lost" } });
    r.invoke.mockResolvedValueOnce(serverFailure("quarantine_missing"));
    await expect(uploadVerifiedFile(r.input)).rejects.toThrow();
    await uploadVerifiedFile(r.input);
    expect(r.rpc).toHaveBeenCalledTimes(1);
    expect(r.upload).toHaveBeenCalledTimes(2);
    expect(r.upload.mock.calls[0]).toEqual(r.upload.mock.calls[1]);
  });

  it.each(["authorization_expired", "authorization_rejected"])(
    "permits a new authorization after %s",
    async (code) => {
      const r = runtime();
      r.invoke.mockResolvedValueOnce(serverFailure(code));
      await expect(uploadVerifiedFile(r.input)).rejects.toThrow();
      await uploadVerifiedFile(r.input);
      expect(r.rpc).toHaveBeenCalledTimes(2);
    },
  );

  it("does not infer terminal state from status or error wording", async () => {
    const r = runtime();
    r.invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Upload authorization expired.",
        context: new Response("not-json", { status: 409 }),
      },
    });
    await expect(uploadVerifiedFile(r.input)).rejects.toThrow();
    await uploadVerifiedFile(r.input);
    expect(r.rpc).toHaveBeenCalledTimes(1);
    expect(r.upload).toHaveBeenCalledTimes(1);
  });

  it("does not claim success from a receipt for a different authorization", async () => {
    const r = runtime();
    r.invoke.mockResolvedValueOnce({
      data: { ...r.receipt, token_id: "another-token" },
      error: null,
    });
    await expect(uploadVerifiedFile(r.input)).rejects.toThrow(/authorization/);
    await uploadVerifiedFile(r.input);
    expect(r.rpc).toHaveBeenCalledTimes(1);
    expect(r.upload).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent retries of the same selected File", async () => {
    const r = runtime();
    const receipts = await Promise.all([uploadVerifiedFile(r.input), uploadVerifiedFile(r.input)]);
    expect(receipts).toEqual([r.receipt, r.receipt]);
    expect(r.rpc).toHaveBeenCalledTimes(1);
    expect(r.upload).toHaveBeenCalledTimes(1);
    expect(r.invoke).toHaveBeenCalledTimes(1);
  });

  it("partitions capabilities by actor and destination", async () => {
    const r = runtime();
    await uploadVerifiedFile(r.input);
    r.switchActor("actor-2");
    await uploadVerifiedFile(r.input);
    await uploadVerifiedFile({ ...r.input, entityId: "country-2" });
    expect(r.rpc).toHaveBeenCalledTimes(3);
  });

  it("never reuses another File solely because its name matches", async () => {
    const r = runtime();
    await uploadVerifiedFile(r.input);
    const other = new File(["different-bytes"], "image.png", { type: "image/png" });
    await uploadVerifiedFile({ ...r.input, file: other });
    expect(r.rpc).toHaveBeenCalledTimes(2);
  });
});
