import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/shows/$slug.tsx"),
  "utf8",
);
const adapter = readFileSync(
  resolve(process.cwd(), "src/lib/show-definition-command.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027213000_v3_show_definition_authority.sql"),
  "utf8",
);

describe("V3 Organizer destructive show deletion review", () => {
  it("freezes the exact show and dependent participant set when review opens", () => {
    expect(route).toContain("type PendingShowDeleteReview = {");
    expect(route).toContain("editionId: edition.id");
    expect(route).toContain("showId: show.id");
    expect(route).toContain("showName: show.name");
    expect(route).toContain("publicationFingerprint: stableJson(show.publication_config)");
    expect(route).toContain("broadcastFingerprint: stableJson(show.broadcast_config)");
    expect(route).toContain("participantIds: participants");
    expect(route).toContain("openDeleteReview(show)");
  });

  it("clears destructive review if Organizer edition context changes", () => {
    expect(route).toContain("setDeleteTarget(null)");
    expect(route).toContain("}, [organizerEditionId, edition?.id]);");
    expect(route).toContain("organizerEditionId !== review.editionId");
    expect(route).toContain("Edition context changed while this show deletion review was open");
  });

  it("re-reads exact show state and participant membership before the governed command", () => {
    expect(route).toContain('.select("id,edition_id,name,kind,sort_order,published,publication_config,broadcast_config")');
    expect(route).toContain('.eq("id", review.showId)');
    expect(route).toContain('.eq("edition_id", review.editionId)');
    expect(route).toContain('supabase.from("participants")');
    expect(route).toContain('stableJson(liveShow.publication_config) !== review.publicationFingerprint');
    expect(route).toContain('stableJson(liveShow.broadcast_config) !== review.broadcastFingerprint');
    expect(route).toContain("if (!sameIdSet(review.participantIds, liveParticipantIds))");
    expect(route).toContain("await deleteShowDefinition({");
    expect(route).not.toContain('supabase.from("shows").delete()');
  });

  it("uses a stable operation identity and server-side CAS/dependency guards", () => {
    expect(adapter).toContain('governedRpc("v3_delete_show"');
    expect(adapter).toContain('p_expected_name: input.current.name');
    expect(adapter).toContain('p_expected_kind: input.current.kind');
    expect(adapter).toContain('p_expected_sort_order: input.current.sortOrder');
    expect(migration).toContain("'show.delete'");
    expect(migration).toContain("using errcode = '40001', message = 'STATE_CHANGED'");
    expect(migration).toContain("message = 'SHOW_HAS_DURABLE_HISTORY'");
    expect(migration).toContain("exists (select 1 from public.results where show_id = v_show.id)");
    expect(migration).toContain("exists (select 1 from public.jury_votes where show_id = v_show.id)");
    expect(migration).toContain("exists (select 1 from public.televote_votes where show_id = v_show.id)");
    expect(migration).toContain("exists (select 1 from private.v3_domain_events where show_id = v_show.id)");
  });

  it("makes irreversible scope visible and requires exact-name typing", () => {
    expect(route).toContain("Dependent participants reviewed:");
    expect(route).toContain("Publication state:");
    expect(route).toContain("The governed delete command will refuse deletion");
    expect(route).toContain("confirmationText={deleteTarget?.showName}");
    expect(route).toContain("Type ${deleteTarget.showName} to confirm permanent deletion");
    expect(route).toContain("cannot use cascading foreign keys as a shortcut for erasing official history");
  });
});
