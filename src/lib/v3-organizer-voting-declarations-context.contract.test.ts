import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/televoting/admin/integrity-declarations.tsx",
  "utf8",
);
const serverFn = readFileSync(
  "src/integrations/televoting/integrity-declarations.functions.ts",
  "utf8",
);
const server = readFileSync(
  "src/integrations/televoting/integrity-declarations.server.ts",
  "utf8",
);

describe("V3 Organizer voting declaration edition scope", () => {
  it("requires exact edition identity at the server-function boundary", () => {
    expect(serverFn).toContain('createServerFn({ method: "POST" })');
    expect(serverFn).toContain("Voting integrity declarations require a valid edition id");
    expect(serverFn).toContain("editionId,");
    expect(serverFn).toContain("listIntegrityDeclarationsServer(data)");
  });

  it("filters preflights and verifies every round binding server-side", () => {
    expect(server).toContain('.eq("canonical_edition_id", scopedEditionId)');
    expect(server).toContain("Voting integrity declarations returned data outside the selected edition scope");
    expect(server).toContain('from("televoting_round_bindings")');
    expect(server).toContain('select("remote_round_id,edition_id")');
    expect(server).toContain("bindingByRound.get(roundId) !== scopedEditionId");
    expect(server).toContain("references a round outside the selected edition scope");
    expect(server).toContain("canonical_edition_id: scopedEditionId");
  });

  it("remounts pending operations when Organizer edition context changes", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain('<IntegrityDeclarationsPage key={`${actorId}:${editionId}`} editionId={editionId} />');
    expect(route).toContain('["merged-integrity-declarations", actorId, editionId]');
    expect(route).toContain("data: { editionId, limit: 500, signedOnly: false }");
    expect(route).toContain("row.canonical_edition_id !== editionId");
    expect(route).toContain("pending.editionId !== editionId");
    expect(route).toContain("Organizer edition context changed before declaration invalidation");
    expect(route).toContain('title="Choose an edition"');
  });

  it("keeps invalidation versioned and idempotent while explicit server edition binding remains pending", () => {
    expect(route).toContain("operationId");
    expect(route).toContain("idempotencyKey");
    expect(route).toContain("applyVotingDeclarationInvalidation");
  });
  it("never reuses another account's private declarations or allows unverified invalidation", () => {
    expect(route).toContain('const actorId = useAuthenticatedUser().id;');
    expect(route).toContain('["merged-televoting-admin", actorId]');
    expect(route).toContain('["merged-integrity-declarations", actorId, editionId]');
    expect(route).toContain("enabled: Boolean(actorId && admin)");
    expect(route.match(/gcTime: 0/g)?.length).toBe(2);
    expect(route.match(/refetchInterval: false/g)?.length).toBe(2);
    expect(route).toContain("if (!readVerified) {");
    expect(route).toContain("Retry declarations");
    expect(route).toContain("if (!readVerified) setPendingInvalidation(null)");
    expect(route).toContain("pending.actorId !== actorId");
    expect(route).toContain("actorId,");
  });

});
