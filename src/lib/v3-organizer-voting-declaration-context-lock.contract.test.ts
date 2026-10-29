import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const declarationsRoute = readFileSync(resolve(process.cwd(), "src/routes/televoting/admin/integrity-declarations.tsx"), "utf8");
const integrityRoute = readFileSync(resolve(process.cwd(), "src/routes/televoting/admin/integrity.tsx"), "utf8");
const integrityReview = readFileSync(resolve(process.cwd(), "src/components/televoting/V3ScopedIntegrityReview.tsx"), "utf8");
const resultIntegrity = readFileSync(resolve(process.cwd(), "src/routes/televoting/admin/result-integrity.tsx"), "utf8");
const roundsView = readFileSync(resolve(process.cwd(), "src/components/televoting/VotingRoundsView.tsx"), "utf8");
const roundGuard = readFileSync(resolve(process.cwd(), "src/routes/televoting/admin/rounds/$id.tsx"), "utf8");
const declarationCommand = readFileSync(resolve(process.cwd(), "src/lib/voting-declaration-admin.ts"), "utf8");

describe("V3 Organizer voting context lock", () => {
  it("uses the shell-owned edition identity and label for declarations", () => {
    expect(declarationsRoute).toContain("const { editionId, editionLabel } = useAdminContext()");
    expect(declarationsRoute).toContain("editionContextLabel={editionLabel?.trim() || editionId}");
    expect(declarationsRoute).toContain("key={editionId}");
  });

  it("keeps declaration edition scope visibly locked near the page header", () => {
    expect(declarationsRoute).toContain('data-v3-organizer-context-lock="edition"');
    expect(declarationsRoute).toContain("<AdminStatus tone=\"info\">{editionContextLabel}</AdminStatus>");
    expect(declarationsRoute).toContain("eyebrow={`${editionContextLabel} · Voting integrity`}");
  });

  it("freezes and repeats the reviewed declaration edition inside destructive confirmation", () => {
    expect(declarationsRoute).toContain("editionLabel: editionContextLabel");
    expect(declarationsRoute).toContain('data-v3-organizer-confirmation-context="edition"');
    expect(declarationsRoute).toContain("{pendingInvalidation.editionLabel}");
  });

  it("retains fail-closed declaration query and command edition checks", () => {
    expect(declarationsRoute).toContain('queryKey: ["merged-integrity-declarations", editionId]');
    expect(declarationsRoute).toContain("data: { editionId, limit: 500, signedOnly: false }");
    expect(declarationsRoute).toContain("row.canonical_edition_id !== editionId");
    expect(declarationsRoute).toContain("pending.editionId !== editionId");
    expect(declarationsRoute).toContain("pending.row.canonical_edition_id !== editionId");
  });

  it("keeps declaration invalidation on the governed preview/apply authority", () => {
    expect(declarationsRoute).toContain("previewVotingDeclarationInvalidation");
    expect(declarationsRoute).toContain("applyVotingDeclarationInvalidation");
    expect(declarationCommand).toContain("studio2_voting_declaration_invalidation_preview");
    expect(declarationCommand).toContain("studio2_apply_voting_declaration_invalidation");
    expect(declarationCommand).toContain("expectedVersion: input.preview.declarationVersion");
    expect(declarationCommand).toContain("idempotencyKey: input.idempotencyKey");
  });

  it("does not add a browser-owned declaration mutation path", () => {
    expect(declarationsRoute).not.toContain("supabase.from");
    expect(declarationsRoute).not.toContain(".update(");
    expect(declarationsRoute).not.toContain(".delete(");
    expect(declarationsRoute).not.toContain(".insert(");
  });

  it("passes the shell-owned human edition label into the read-only integrity review", () => {
    expect(integrityRoute).toContain("const { editionId, editionLabel } = useAdminContext()");
    expect(integrityRoute).toContain("editionLabel={editionLabel?.trim() || editionId}");
    expect(integrityReview).toContain("eyebrow={`${editionLabel} · Voting · Integrity`}");
  });

  it("keeps exact integrity scope visibly locked without re-enabling unsafe moderation", () => {
    expect(integrityReview).toContain('data-v3-organizer-integrity-scope={editionId}');
    expect(integrityReview).toContain('data-v3-organizer-context-lock="edition"');
    expect(integrityReview).toContain("Human moderation is temporarily read-only here");
    expect(integrityReview).not.toContain("useMutation");
  });

  it("keeps Result Integrity visibly tied to the selected edition while preserving round checks", () => {
    expect(resultIntegrity).toContain("const { editionId, editionLabel } = useAdminContext()");
    expect(resultIntegrity).toContain("editionLabel={editionLabel?.trim() || editionId}");
    expect(resultIntegrity).toContain("eyebrow={`${editionLabel} · Voting integrity`}");
    expect(resultIntegrity).toContain('data-v3-organizer-context-lock="edition"');
    expect(resultIntegrity).toContain("rounds.some((round) => round.id === effectiveRoundId)");
    expect(resultIntegrity).toContain("result.round.id !== effectiveRoundId");
  });

  it("keeps Voting Rounds visibly tied to the shell-owned edition", () => {
    expect(roundsView).toContain("editionLabel: organizerEditionLabel");
    expect(roundsView).toContain('data-v3-organizer-context-lock="edition"');
    expect(roundsView).toContain("eyebrow={`${editionContextLabel} · Voting`}");
  });

  it("requires the R2 round preview to prove exact Solaris and remote edition scope", () => {
    expect(roundsView).toContain("preview.solarisEditionId !== scope.editionId");
    expect(roundsView).toContain("preview.remoteEditionId !== scope.remoteEditionId");
    expect(roundsView).toContain("pending.editionId !== scope.editionId");
    expect(roundsView).toContain("pending.preview.remoteEditionId !== scope.remoteEditionId");
  });

  it("freezes edition plus round inside R2 and delete confirmations", () => {
    expect(roundsView).toContain("editionLabel: editionContextLabel");
    expect(roundsView).toContain('data-v3-organizer-confirmation-context="edition-round"');
    expect(roundsView).toContain("{pending.editionLabel} · {pending.round.name}");
    expect(roundsView).toContain("{editionContextLabel} · {deleteTarget.name}");
  });

  it("keeps round status changes on versioned server authority", () => {
    expect(roundsView).toContain("previewMergedTelevotingRoundStatus");
    expect(roundsView).toContain("setMergedTelevotingRoundStatus");
    expect(roundsView).toContain("expectedGlobalVersion: pending.preview.expectedGlobalVersion");
    expect(roundsView).toContain("expectedRoundVersion: pending.preview.expectedRoundVersion");
    expect(roundsView).toContain("operationId: pending.operationId");
    expect(roundsView).toContain("idempotencyKey: pending.idempotencyKey");
    expect(roundsView).not.toContain("supabase.from");
  });

  it("keeps round child editors behind exact-edition membership verification", () => {
    expect(roundGuard).toContain('queryKey: ["v3-organizer-voting-round-scope", editionId ?? "unscoped", roundId]');
    expect(roundGuard).toContain("scopeEdition && scopeEdition.solaris_id === editionId");
    expect(roundGuard).toContain("scopeEdition?.rounds.find((round) => round.id === roundId)");
    expect(roundGuard).toContain("Round is outside the selected edition");
    expect(roundGuard.indexOf("roundBelongsToEdition")).toBeLessThan(roundGuard.indexOf("<Outlet />"));
  });

  it("keeps verified edition plus round visible throughout child editors", () => {
    expect(roundGuard).toContain("const { editionId, editionLabel } = useAdminContext()");
    expect(roundGuard).toContain('data-v3-organizer-context-lock="edition-round"');
    expect(roundGuard).toContain("<AdminStatus tone=\"info\">{editionContextLabel}</AdminStatus>");
    expect(roundGuard).toContain("<AdminStatus tone=\"neutral\">{scopeRound!.name}</AdminStatus>");
  });
});