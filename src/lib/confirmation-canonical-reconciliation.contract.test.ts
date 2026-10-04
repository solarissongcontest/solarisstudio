import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const publicFunctions = source("src/lib/public.functions.ts");
const sync = source("src/integrations/confirmations/sync.functions.ts");

describe("confirmation canonical reconciliation", () => {
  it("reconciles a successful participant save using the server-returned submission id", () => {
    expect(publicFunctions).toContain("syncConfirmationSubmissionToSolarisInternal");
    expect(publicFunctions).toContain("result.ok && result.submission_id");
    expect(publicFunctions).toContain("result.canonical_sync = sync.ok ? \"synced\" : \"pending\"");
  });

  it("records recovery evidence when the post-commit canonical projection throws", () => {
    expect(publicFunctions).toContain("recordConfirmationCanonicalSyncFailure");
    expect(publicFunctions).toContain('event_type: "confirmation.snapshot.synced"');
    expect(publicFunctions).toContain('status: "failed"');
    expect(publicFunctions).toContain('remote_id: submissionId');
    expect(publicFunctions).toContain('recovery_source: "participant_save_post_commit"');
    expect(publicFunctions).toContain("await recordConfirmationCanonicalSyncFailure(");
    expect(publicFunctions).toContain('result.canonical_sync = "pending"');
  });

  it("rebuilds the sync snapshot from canonical database rows instead of trusting participant snapshot input", () => {
    expect(sync).toContain("loadConfirmationSnapshotForSolarisSync");
    expect(sync).toContain('.from("submissions")');
    expect(sync).toContain("participating,updated_at,selection_method");
    expect(sync).toContain('.from("internal_entries")');
    expect(sync).toContain('.from("national_finals")');
    expect(sync).toContain('.from("national_final_entries")');
    expect(sync).toContain("syncConfirmationSubmissionToSolarisInternal");
  });

  it("does not let an older Confirmation reverse a newer final canonical lifecycle decision", () => {
    expect(sync).toContain('status: "canonical_newer"');
    expect(sync).toContain("canonicalUpdatedAt > snapshotUpdatedAt");
    expect(sync).toContain("canonicalHasFinalLifecycle");
    expect(sync).toContain("canonicalGuard.data.status !== intendedCanonicalStatus");
  });

  it("does not overwrite a canonical entry owned outside Confirmations", () => {
    expect(sync).toContain('canonicalGuard.data.source !== "confirmations"');
    expect(sync).toContain('status: "canonical_owned"');
    expect(sync).toContain("Automatic reconciliation was stopped instead of overwriting it");
  });

  it("keeps manual snapshot sync organizer-protected", () => {
    expect(sync).toContain("await requireSolarisOrganizerServer()");
    expect(sync).toContain("syncConfirmationSnapshotToSolarisInternal(data.snapshot)");
  });
});
