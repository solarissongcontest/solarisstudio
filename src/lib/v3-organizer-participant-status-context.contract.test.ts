import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/admin/participant-status/$slug.tsx");

describe("V3 Organizer Participation Status edition context", () => {
  it("blocks edition-scoped reads until route and Organizer edition agree", () => {
    expect(route).toContain('import { useAdminContext } from "@/components/admin/AdminContext"');
    expect(route).toContain("const { editionId: organizerEditionId } = useAdminContext()");
    expect(route).toContain(
      "const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined",
    );
    expect(route).toContain("useParticipants(scopedEditionId)");
    expect(route).toContain("useContestEntities(scopedEditionId)");
    expect(route).toContain("useShows(scopedEditionId)");
    expect(route).not.toContain("useParticipants(edition?.id)");
    expect(route).not.toContain("useContestEntities(edition?.id)");
    expect(route).not.toContain("useShows(edition?.id)");
  });

  it("fails closed in the UI when Organizer edition context is absent or mismatched", () => {
    expect(route).toContain('title="Choose an edition"');
    expect(route).toContain('title="Edition context mismatch"');
    expect(route).toContain(
      "Edition-scoped reads and actions stay blocked until the contexts match.",
    );
    expect(route).toContain("if (organizerEditionId !== edition.id)");
  });

  it("validates route, command, entity and capability edition before preview or apply", () => {
    expect(route).toContain('import { validateEditionCommandScope } from "@/lib/solaris-v6-edition-context"');
    expect(route).toContain("function assertParticipationEditionScope(entityEditionId?: string)");
    expect(route).toContain("routeEditionId: edition.id");
    expect(route).toContain("commandEditionId: organizerEditionId");
    expect(route).toContain("entityEditionId: entityEditionId ?? edition.id");
    expect(route).toContain("capabilityEditionId: organizerEditionId");
    expect(route).toContain("const commandEditionId = assertParticipationEditionScope()");
    expect(route).toContain(
      "const commandEditionId = assertParticipationEditionScope(pending.preview.editionId)",
    );
    expect(route.match(/p_edition_id: commandEditionId/g)?.length).toBe(2);
  });

  it("rejects a preview that comes back scoped to a different edition", () => {
    expect(route).toContain("if (preview.editionId !== commandEditionId)");
    expect(route).toContain(
      "Participation preview returned a different edition than the reviewed Organizer context.",
    );
  });

  it("discards a pending review when Organizer or route edition context changes", () => {
    expect(route).toContain("setPendingChange(null)");
    expect(route).toContain("}, [organizerEditionId, edition?.id]);");
  });

  it("preserves the canonical preview/version/idempotency command contract", () => {
    expect(route).toContain('"studio2_participation_status_change_preview"');
    expect(route).toContain('"studio2_apply_participation_status"');
    expect(route).toContain("operationId: crypto.randomUUID()");
    expect(route).toContain("idempotencyKey: crypto.randomUUID()");
    expect(route).toContain("p_operation_id: pending.operationId");
    expect(route).toContain("p_idempotency_key: pending.idempotencyKey");
    expect(route).toContain("p_expected_version: pending.preview.expectedVersion");
  });
});
