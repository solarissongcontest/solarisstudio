import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const component = source("src/components/v3/V3EntryMediaParticipantPanel.tsx");
const presentation = source("src/lib/v3-entry-media-participant.ts");
const authority = source("src/lib/v3-entry-media-authority.ts");

describe("V3 participant Entry media authority boundary", () => {
  it("consumes only the caller-scoped System projection and verified upload adapter", () => {
    expect(component).toContain("loadMyEntryMediaProjection");
    expect(component).toContain("uploadVerifiedEntryMedia");
    expect(component).toContain('queryKey = [QUERY_PREFIX, entryId]');
    expect(component).toContain("projection.refetch()");
    expect(component).toContain("invalidateQueries({ queryKey })");

    expect(component).not.toContain(".from(");
    expect(component).not.toContain(".rpc(");
    expect(component).not.toContain("studio2_media_asset_reviews");
    expect(component).not.toContain("reviewed_by");
    expect(component).not.toContain("Date.now(");
  });

  it("never equates browser upload completion with authoritative acceptance", () => {
    expect(component).toContain("Finishing a browser upload does not mean an image has been accepted.");
    expect(component).toContain("Upload verified and committed. Solaris is now validating");
    expect(authority).toContain('state: "validating"');
    expect(authority).toContain('rpc("v3_my_entry_media"');
  });

  it("keeps client file checks aligned with the bounded System image contract", () => {
    expect(presentation).toContain('"image/jpeg"');
    expect(presentation).toContain('"image/png"');
    expect(presentation).toContain('"image/webp"');
    expect(presentation).toContain("5 * 1024 * 1024");
    expect(presentation).toContain('assetType: "artist_photo"');
    expect(presentation).toContain('assetType: "cover_artwork"');
    expect(component).toContain("V3_ENTRY_MEDIA_ACCEPTED_MIME_TYPES.join");
  });

  it("fails closed when caller-scoped projection state cannot be loaded", () => {
    expect(component).toContain('data-v3-entry-media-state="error"');
    expect(component).toContain("Entry media could not be verified");
    expect(component).toContain("Nothing was accepted from browser state alone");
    expect(component).toContain("refetchOnWindowFocus: true");
  });

  it("supports Organizer participant-view inspection without participant mutation", () => {
    expect(component).toContain("readOnly = false");
    expect(component).toContain("Participant View is read-only");
    expect(component).toContain("{!readOnly ? (");
  });
});
