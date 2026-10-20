import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const declarationsRoute = readFileSync(
  resolve(process.cwd(), "src/routes/televoting/admin/integrity-declarations.tsx"),
  "utf8",
);

const integrityRoute = readFileSync(
  resolve(process.cwd(), "src/routes/televoting/admin/integrity.tsx"),
  "utf8",
);

const integrityReview = readFileSync(
  resolve(process.cwd(), "src/components/televoting/V3ScopedIntegrityReview.tsx"),
  "utf8",
);

const command = readFileSync(
  resolve(process.cwd(), "src/lib/voting-declaration-admin.ts"),
  "utf8",
);

describe("V3 Organizer voting integrity context lock", () => {
  it("uses the shell-owned edition identity and label for declarations", () => {
    expect(declarationsRoute).toContain("const { editionId, editionLabel } = useAdminContext()");
    expect(declarationsRoute).toContain("editionContextLabel={editionLabel?.trim() || editionId}");
    expect(declarationsRoute).toContain("key={editionId}");
  });

  it("keeps declaration edition scope visibly locked near the page header", () => {
    expect(declarationsRoute).toContain('data-v3-organizer-context-lock="edition"');
    expect(declarationsRoute).toContain("Edition context");
    expect(declarationsRoute).toContain("<AdminStatus tone=\"info\">{editionContextLabel}</AdminStatus>");
    expect(declarationsRoute).toContain("eyebrow={`${editionContextLabel} · Voting integrity`}");
  });

  it("freezes and repeats the reviewed declaration edition inside destructive confirmation", () => {
    expect(declarationsRoute).toContain("editionLabel: editionContextLabel");
    expect(declarationsRoute).toContain('data-v3-organizer-confirmation-context="edition"');
    expect(declarationsRoute).toContain("{pendingInvalidation.editionLabel}");
    expect(declarationsRoute.indexOf("editionLabel: editionContextLabel")).toBeLessThan(
      declarationsRoute.indexOf("{pendingInvalidation.editionLabel}"),
    );
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
    expect(command).toContain("studio2_voting_declaration_invalidation_preview");
    expect(command).toContain("studio2_apply_voting_declaration_invalidation");
    expect(command).toContain("expectedVersion: input.preview.declarationVersion");
    expect(command).toContain("idempotencyKey: input.idempotencyKey");
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
    expect(integrityReview).toContain("editionLabel: string");
    expect(integrityReview).toContain("eyebrow={`${editionLabel} · Voting · Integrity`}");
  });

  it("keeps exact integrity scope visibly locked without re-enabling unsafe moderation", () => {
    expect(integrityReview).toContain('data-v3-organizer-integrity-scope={editionId}');
    expect(integrityReview).toContain('data-v3-organizer-context-lock="edition"');
    expect(integrityReview).toContain("<AdminStatus tone=\"info\">{editionLabel}</AdminStatus>");
    expect(integrityReview).toContain("Human moderation is temporarily read-only here");
    expect(integrityReview).toContain("until the server verifies edition ownership for every command");
    expect(integrityReview).not.toContain("useMutation");
  });
});