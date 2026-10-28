import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const publicFunctions = source("src/lib/public.functions.ts");
const sync = source("src/integrations/confirmations/sync.functions.ts");
const entryAuthority = source("supabase/migrations/20261027211501_v3_s16_entry_confirmation_authority.sql");
const finalReviewGuard = source("supabase/migrations/20261028112937_v3_confirmation_preserve_final_entry_review.sql");

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
    expect(sync).toContain('db.rpc("v3_sync_confirmation_entry"');
    expect(entryAuthority).toContain("'status', 'canonical_newer'");
    expect(finalReviewGuard).toContain("v_existing.status in ('withdrawn','disqualified')");
    expect(finalReviewGuard).toContain("v_existing.status is distinct from v_status");
    expect(finalReviewGuard).toContain("v_existing.updated_at > v_submission.updated_at");
  });

  it("does not overwrite a canonical entry owned outside Confirmations", () => {
    expect(entryAuthority).toContain("v_existing.source <> 'confirmations'");
    expect(entryAuthority).toContain("'status', 'canonical_owned'");
    expect(entryAuthority).toContain("for update;");
    expect(sync).not.toMatch(/\.from\("entries"\)\s*\.(?:update|insert|upsert)/);
  });

  it("fails closed when publication-event emission fails and retries the idempotent event on the next sync", () => {
    expect(sync).toContain(
      'const { error: publicationEventError } = await db.rpc("emit_entry_published_event"',
    );
    expect(sync).toContain("if (publicationEventError)");
    expect(sync).toContain('status: "publication_event_failed"');
    expect(sync).toContain("await recordSyncEvent(db, snapshot, failedResult, message)");
    expect(sync).not.toContain("!publicationWasPublic");
  });

  it("keeps manual snapshot sync organizer-protected", () => {
    expect(sync).toContain("await requireSolarisOrganizerServer()");
    expect(sync).toContain("syncConfirmationSnapshotToSolarisInternal(data.snapshot)");
  });
});
