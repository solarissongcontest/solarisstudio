import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 P14 Entry media presentation contract", () => {
  it("keeps the Public projection pure and browser-authority free", () => {
    const media = source("src/lib/v3-entry-media.ts");

    expect(media).not.toContain("@/integrations/supabase");
    expect(media).not.toContain("localStorage");
    expect(media).not.toContain("sessionStorage");
    expect(media).not.toContain("studio2_media_asset_reviews");
    expect(media).not.toContain("v3_my_entry_media");
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

  it("keeps terminal review truth server-owned and current-source bindable", () => {
    const media = source("src/lib/v3-entry-media.ts");

    expect(media).toContain('source: "server"');
    expect(media).toContain("sourceFingerprint: string | null");
    expect(media).toContain('assetType: "artist_photo" | "cover_artwork"');
    expect(media).toContain('server.state === "accepted"');
    expect(media).toContain('server.state === "quarantined"');
    expect(media).toContain('server.state === "replacement_required"');
  });

  it("retains same-authorization recovery in the existing upload continuity engine", () => {
    const continuity = source("src/lib/v3-media-upload-continuity.ts");

    expect(continuity).toContain("Never mint a second authorization merely because transport became");
    expect(continuity).toContain('return upload.state === "rejected" || upload.state === "expired"');
    expect(continuity).toContain('state: "quarantine_uncertain"');
    expect(continuity).toContain('state: "finalize_uncertain"');
  });

  it("renders a percentage only when measured progress exists", () => {
    const component = source("src/components/v3/V3EntryMediaPipelineStatus.tsx");

    expect(component).toContain("view.progressPercent !== null");
    expect(component).toContain("aria-valuenow={view.progressPercent}");
    expect(component).toContain('style={{ width: `${view.progressPercent}%` }}');
    expect(component).not.toContain("setInterval");
    expect(component).not.toContain("Math.random");
  });

  it("documents the live System handoff instead of claiming authority is absent", () => {
    const contract = source("docs/architecture/v3-public-p14-entry-media-contract.md");

    expect(contract).toContain("Status: **building / System integration pending**");
    expect(contract).toContain("v3_my_entry_media");
    expect(contract).toContain("uploadVerifiedEntryMedia");
    expect(contract).toContain("Public must not duplicate that authority");
    expect(contract).toContain("exact-head Quality and Browser Audit");
    expect(contract).not.toContain("participant-safe read projection is missing");
    expect(contract).not.toContain("Entry media is not an authorized unified-upload domain");
  });
});
