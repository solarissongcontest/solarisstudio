import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261018083000_v3_s5_media_verification_consequences.sql",
);
const finalizer = source("supabase/functions/solaris-upload-finalize/index.ts");
const rehearsal = source(
  ".github/scripts/v3-s5-media-verification-consequences-rehearsal.sh",
);

describe("System V3 S5 Media verification consequences", () => {
  it("observes the durable unified-finalizer completion boundary", () => {
    expect(finalizer).toContain('.from("studio2_upload_authorizations")');
    expect(finalizer).toContain('status: "verified"');
    expect(finalizer).toContain('.eq("status", "prepared")');
    expect(finalizer).toContain('.upload(row.final_path');
    expect(finalizer.indexOf('.upload(row.final_path')).toBeLessThan(
      finalizer.lastIndexOf('status: "verified"'),
    );

    expect(migration).toContain("after update of status");
    expect(migration).toContain("old.status is distinct from new.status");
    expect(migration).toContain("new.status = 'verified'");
    expect(migration).toContain("'media.verified'");
  });

  it("requires actual finalizer evidence rather than trusting a status string", () => {
    expect(migration).toContain("new.finalized_at is null");
    expect(migration).toContain("new.detected_mime");
    expect(migration).toContain("'signatureVerified'");
    expect(migration).toContain("'quarantineVerified'");
    expect(migration).toContain("'published_after_verification'");
    expect(migration).toContain("Verified Media upload lacks completed verification evidence");
  });

  it("bridges verified Media assets into one deterministic R1 operation fact", () => {
    expect(migration).toContain("private.v3_media_verification_operation_id");
    expect(migration).toContain("private.studio2_request_fingerprint(");
    expect(migration).toContain("'media.finalize_upload'");
    expect(migration).toContain("'R1'");
    expect(migration).toContain("public.studio2_operation_receipts");
    expect(migration).toContain("'media_asset'");
    expect(migration).toContain("new.id::text");
    expect(migration).toContain("array[]::text[]");
  });

  it("keeps shared quarantine domains out of Media event ownership", () => {
    expect(migration).toContain(
      "new.domain not in ('country_media', 'edition_artwork', 'country_font')",
    );
    expect(migration).not.toContain("beta_feedback', 'media.verified");
    expect(migration).not.toContain("integrity_evidence', 'media.verified");
    expect(migration).toContain("Verified Media upload lacks its authenticated actor");
  });

  it("marks verification event-backed without inventing a task consequence", () => {
    expect(v3DomainConsequence("media.verified")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("media.verified")?.ownerDomain).toBe("media");
    expect(v3DomainConsequence("media.verified")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("media.reviewed")?.implementationState).toBe("event-backed");
  });

  it("keeps hostile verification proof local-only", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("media.verified");
    expect(rehearsal).toContain("beta feedback fabricated media.verified");
    expect(rehearsal).toContain("actorless Media verification unexpectedly succeeded");
    expect(rehearsal).toContain("replay duplicated media.verified");
  });
});
