import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/20261121154000_confirmation_method_switch_history.sql");
const sync = read("src/integrations/confirmations/sync.functions.ts");
const route = read("src/routes/confirmations/admin/responses/$id.tsx");
const restore = read("src/components/admin/ConfirmationVersionHistory.tsx");
const verifier = read("src/integrations/confirmations/reconcile.server.ts");

describe("Confirmation / Entry method transitions and post-review recovery", () => {
  it("does not trust browser snapshots as canonical synchronization authority", () => {
    expect(sync).toContain("loadConfirmationSnapshotForSolarisSync(");
    expect(sync).toContain("data.submissionId");
    expect(sync).not.toContain("syncConfirmationSnapshotToSolarisInternal(data.snapshot)");
    expect(route).toContain("submissionId: detail.id");
    expect(route).toContain("editionId: detail.edition?.id");
    expect(restore).toContain("data: { submissionId, editionId }");
    expect(sync).toContain("An exact Organizer edition ID is required.");
    expect(sync).toContain('actorDb.rpc("studio2_access_allowed"');
    expect(sync).toContain('p_capability: "confirmation.manage"');
    expect(sync).toContain("snapshot.edition?.id !== data.editionId");
    expect(restore).not.toContain("data: { snapshot:");
  });

  it("synchronizes after successful exact-version review and NF winner mutations", () => {
    expect(route).toContain("await onChanged()");
    expect(route).toContain("onChanged={afterOrganizerDecision}");
    expect(route).toContain("await afterOrganizerDecision()");
    expect(route).toContain("Official Entry synchronization is pending");
    expect(route).toContain("studio2_apply_confirmation_entry_review");
    expect(route).toContain("studio2_apply_confirmation_winner_change");
  });

  it("classifies authoritative accepted selections separately from stale projections", () => {
    expect(verifier).toContain("accepted_selection_missing_projection");
    expect(verifier).toContain("accepted_selection_pending_projection");
    expect(verifier).toContain('entry.source !== "confirmations"');
    expect(verifier).toContain("syncSubmission: syncConfirmationSubmissionToSolarisInternal");
  });

  it("protects already published canonical entries before any participant or Entry writes", () => {
    expect(sync).toContain('status: "publication_locked"');
    expect(sync).toContain('.eq("publication_status", "published")');
    expect(sync).toContain('canonicalGuard.data?.status === "published"');
    // A published country announcement with no approved song is NOT a
    // published Entry. First-time acceptance must still be projectable.
    expect(sync).toContain("const officialEntryAlreadyPresent =");
    expect(sync).toContain("(publishedParticipant.data?.length ?? 0) > 0 && officialEntryAlreadyPresent");
    expect(sync).toContain(".select(\"id,source,status,artist,song_title,updated_at\")");
    expect(sync).toContain("governed Organizer correction workflow");
    expect(sync.indexOf("const publishedParticipant =")).toBeLessThan(
      sync.indexOf("const entityLookup ="),
    );
    expect(sync.indexOf("const publishedParticipant =")).toBeLessThan(
      sync.indexOf("const participantLookup ="),
    );
    expect(sync.indexOf("const publishedParticipant =")).toBeLessThan(
      sync.indexOf('      .upsert(entryPayload, { onConflict: "edition_id,country_id" })'),
    );
  });

  it("keeps all destructive method-switch sites behind a strict forward-only guard", () => {
    expect(migration).toContain("v_internal_count <> 2 or v_nf_count <> 2");
    expect(migration).toContain("pg_get_functiondef");
    // Hosted PG17.11 metadata was inspected read-only on 2026-11-21.
    // Drift must fail closed instead of text-patching a changed SECURITY DEFINER.
    expect(migration).toContain("094afca871b8185f2eb877bfc9ccd9676dbfb7366b52656ff9d3f0af2f8de2e6");
    expect(migration).toContain("d0b41e6f807613cdbb11a020455ff4c13d5f96dd9adb9dd006b2a64b3915641f");
    expect(migration).toContain("fe4fde03547d6faf1ee32f2a7d796169d609d6e9cc46b8e256c68a524e954ce4");
    expect(migration).toContain("494f8e32b36946f932bcd2c9c8de15cad05de2d6dd6583167fb0a089b68c919a");
    expect(migration).toContain("independent compatibility review required");
    expect(migration).toContain("inactive NF history retained");
    expect(migration).toContain("inactive Internal history retained");
    expect(migration).toContain("existing.selection_method is distinct from 'internal'");
    expect(migration).toContain("existing.selection_method is distinct from 'national_final'");
    expect(migration).toContain("review_status = 'pending'");
    expect(migration).toContain("Published or competition-locked entries require an Organizer correction");
    expect(migration).not.toContain("drop function public.submit_confirmation");
  });

  it("preserves the canonical service-role isolation and local-only test contract", () => {
    const ci = read(".github/workflows/ci.yml");
    const browser = read(".github/workflows/browser-audit.yml");
    expect(ci).toContain("VITE_SUPABASE_URL=http://127.0.0.1:54321");
    expect(browser).toContain("VITE_CONFIRMATIONS_SUPABASE_URL: http://127.0.0.1:54321");
    expect(sync).toContain('canonicalGuard.data.source !== "confirmations"');
    expect(sync).toContain('status: "canonical_newer"');
  });
});
