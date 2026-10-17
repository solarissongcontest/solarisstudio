import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 P14 Entry media authority contract", () => {
  it("keeps the Public media projection pure and browser-authority free", () => {
    const media = source("src/lib/v3-entry-media.ts");

    expect(media).not.toContain("@/integrations/supabase");
    expect(media).not.toContain("localStorage");
    expect(media).not.toContain("sessionStorage");
    expect(media).not.toContain("studio2_media_asset_reviews");
    expect(media).not.toContain(".rpc(");
    expect(media).not.toContain(".from(");
  });

  it("does not turn a verified upload receipt into media acceptance", () => {
    const media = source("src/lib/v3-entry-media.ts");
    const verifiedCase = media.slice(
      media.indexOf('case "verified":'),
      media.indexOf('case "retry_upload":'),
    );

    expect(verifiedCase).toContain('state: "validating"');
    expect(verifiedCase).not.toContain('state: "accepted"');
  });

  it("retains same-authorization retry and reconciliation in the existing upload engine", () => {
    const continuity = source("src/lib/v3-media-upload-continuity.ts");
    const uploadSafety = source("src/lib/upload-safety.ts");

    expect(continuity).toContain("Never mint a second authorization merely because transport became");
    expect(continuity).toContain('return upload.state === "rejected" || upload.state === "expired"');
    expect(uploadSafety).toContain("const pendingUploads = new WeakMap");
    expect(uploadSafety).toContain("if (pending.inFlight) return pending.inFlight");
    expect(uploadSafety).toContain("upsert: false");
  });

  it("recognizes that Entry media is not yet an authorized unified-upload domain", () => {
    const uploadSafety = source("src/lib/upload-safety.ts");
    const contract = source("docs/architecture/v3-public-p14-entry-media-contract.md");

    expect(uploadSafety).toContain('| "country_media"');
    expect(uploadSafety).toContain('| "edition_artwork"');
    expect(uploadSafety).not.toContain('| "entry_media"');
    expect(contract).toContain("Entry media is not an authorized unified-upload domain");
    expect(contract).toContain("Public must not emulate one with direct Storage paths");
  });

  it("treats Organizer media review as non-participant authority", () => {
    const migration = source("supabase/migrations/20260912143500_studio2_media_asset_operations.sql");
    const contract = source("docs/architecture/v3-public-p14-entry-media-contract.md");

    expect(migration).toContain("private.studio2_can_manage_media_assets(v_actor, p_edition_id)");
    expect(migration).toContain("Organizer or entry.approve capability required");
    expect(contract).toContain("Public must **not** call that RPC");
    expect(contract).toContain("participant-safe read projection is missing");
  });

  it("pins P14 as building until participant upload and read authority exist", () => {
    const contract = source("docs/architecture/v3-public-p14-entry-media-contract.md");

    expect(contract).toContain("Status: **building / System contract blocked**");
    expect(contract).toContain("System exposes the caller-scoped Entry media upload authority");
    expect(contract).toContain("System exposes the participant-safe current media projection");
    expect(contract).toContain("exact-head Quality and Browser Audit pass");
  });
});
