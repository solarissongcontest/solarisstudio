import { describe, expect, it, vi } from "vitest";
import {
  loadMyEntryMediaProjection,
  uploadVerifiedEntryMedia,
} from "./v3-entry-media-authority";

function makeClient() {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const upload = vi.fn(async () => ({ error: null }));
  const invoke = vi.fn(async () => ({
    data: {
      ok: true,
      token_id: "token-1",
      bucket: "country-media",
      object_path: "country/entry/entry-1/artist_photo/token-1.png",
      detected_mime: "image/png",
      metadata: { signatureVerified: true },
      replayed: false,
    },
    error: null,
  }));

  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      })),
    },
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "v3_prepare_entry_media_upload") {
        return {
          data: {
            token_id: "token-1",
            upload_secret: "secret-1",
            bucket: "solaris-upload-quarantine",
            object_path: "token-1/token-1.png",
            final_bucket: "country-media",
            expires_at: "2026-10-20T00:00:00Z",
          },
          error: null,
        };
      }
      if (name === "v3_commit_entry_media_upload") {
        return {
          data: {
            ok: true,
            replayed: false,
            tokenId: "token-1",
            entryId: "entry-1",
            assetKey: "entry:entry-1:artist_photo",
            assetType: "artist_photo",
            state: "validating",
            sourceFingerprint:
              "https://local.example/storage/v1/object/public/country-media/country/entry/entry-1/artist_photo/token-1.png",
            updatedAt: "2026-10-19T20:00:00Z",
          },
          error: null,
        };
      }
      if (name === "v3_my_entry_media") {
        return {
          data: {
            entryId: "entry-1",
            editionId: "edition-1",
            countryId: "country-1",
            assets: [
              {
                assetKey: "entry:entry-1:artist_photo",
                assetType: "artist_photo",
                state: "accepted",
                reason: null,
                sourceFingerprint:
                  "https://local.example/storage/v1/object/public/country-media/country/entry/entry-1/artist_photo/token-1.png",
                updatedAt: "2026-10-19T20:05:00Z",
              },
            ],
            serverTime: "2026-10-19T20:05:01Z",
          },
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected RPC ${name}` } };
    }),
    functions: { invoke },
    storage: { from: vi.fn(() => ({ upload })) },
  };

  return { client, calls, upload, invoke };
}

describe("V3 Entry media authority runtime", () => {
  it("uses the exact caller-scoped Entry media RPC before quarantine/finalization", async () => {
    const { client, calls, upload, invoke } = makeClient();
    const file = new File(["verified-image"], "artist.png", { type: "image/png" });

    const result = await uploadVerifiedEntryMedia({
      client,
      entryId: "entry-1",
      assetType: "artist_photo",
      file,
    });

    expect(calls[0]).toEqual({
      name: "v3_prepare_entry_media_upload",
      args: {
        p_entry_id: "entry-1",
        p_asset_type: "artist_photo",
        p_name: "artist.png",
        p_mime: "image/png",
        p_size: file.size,
      },
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("solaris-upload-finalize", {
      body: { token_id: "token-1", upload_secret: "secret-1" },
    });
    expect(calls.at(-1)).toEqual({
      name: "v3_commit_entry_media_upload",
      args: { p_token_id: "token-1" },
    });
    expect(result.commit.state).toBe("validating");
  });

  it("maps the participant-safe current-source projection without Organizer identity", async () => {
    const { client } = makeClient();

    const projection = await loadMyEntryMediaProjection({
      client,
      entryId: "entry-1",
    });

    expect(projection.assets).toEqual([
      expect.objectContaining({
        assetKey: "entry:entry-1:artist_photo",
        assetType: "artist_photo",
        state: "accepted",
        reason: null,
      }),
    ]);
    expect(projection.assets[0]).not.toHaveProperty("reviewedBy");
    expect(projection.assets[0]).not.toHaveProperty("authorizationSecret");
  });

  it("rejects a projection for a different Entry even if the server payload is otherwise valid", async () => {
    const { client } = makeClient();
    const rpc = client.rpc as ReturnType<typeof vi.fn>;
    rpc.mockImplementationOnce(async () => ({
      data: {
        entryId: "entry-2",
        editionId: "edition-1",
        countryId: "country-1",
        assets: [],
        serverTime: "2026-10-19T20:05:01Z",
      },
      error: null,
    }));

    await expect(
      loadMyEntryMediaProjection({ client, entryId: "entry-1" }),
    ).rejects.toThrow("another Entry");
  });
});
