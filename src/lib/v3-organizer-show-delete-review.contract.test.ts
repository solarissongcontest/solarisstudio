import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/shows/$slug.tsx"),
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

  it("re-reads exact show state and participant membership before delete", () => {
    expect(route).toContain('.select("id,edition_id,name,kind,sort_order,published,publication_config,broadcast_config")');
    expect(route).toContain('.eq("id", review.showId)');
    expect(route).toContain('.eq("edition_id", review.editionId)');
    expect(route).toContain('supabase.from("participants")');
    expect(route).toContain('stableJson(liveShow.publication_config) !== review.publicationFingerprint');
    expect(route).toContain('stableJson(liveShow.broadcast_config) !== review.broadcastFingerprint');
    expect(route).toContain("if (!sameIdSet(review.participantIds, liveParticipantIds))");
  });

  it("constrains the final delete to the exact reviewed show and edition", () => {
    const deleteIndex = route.indexOf('const { data: deleted, error } = await (supabase.from("shows") as any)');
    const revalidationIndex = route.indexOf("if (!sameIdSet(review.participantIds, liveParticipantIds))");
    expect(deleteIndex).toBeGreaterThan(revalidationIndex);
    expect(route.slice(deleteIndex)).toContain('.eq("id", review.showId)');
    expect(route.slice(deleteIndex)).toContain('.eq("edition_id", review.editionId)');
    expect(route.slice(deleteIndex)).toContain('.select("id")');
    expect(route.slice(deleteIndex)).toContain("if (!deleted)");
    expect(route).not.toContain('supabase.from("shows").delete().eq("id", deleteTarget.id)');
  });

  it("makes dependency/publication impact visible and requires exact-name typing", () => {
    expect(route).toContain("Dependent participants reviewed:");
    expect(route).toContain("Publication state:");
    expect(route).toContain("This show was published when the deletion review opened");
    expect(route).toContain("confirmationText={deleteTarget?.showName}");
    expect(route).toContain("Type ${deleteTarget.showName} to confirm permanent deletion");
  });

  it("keeps System #581 as final show lifecycle authority", () => {
    expect(route).toContain("System #581 owns authoritative version/CAS, idempotency, dependency handling and operation receipts");
    expect(route).toContain("A concurrent dependency change after this final browser recheck remains outside this compatibility boundary");
    expect(route).not.toContain("executeGovernedShowDelete");
  });
});
