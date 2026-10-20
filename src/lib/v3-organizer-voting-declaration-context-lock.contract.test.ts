import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/televoting/admin/integrity-declarations.tsx"),
  "utf8",
);

const command = readFileSync(
  resolve(process.cwd(), "src/lib/voting-declaration-admin.ts"),
  "utf8",
);

describe("V3 Organizer voting declaration context lock", () => {
  it("uses the shell-owned edition identity and label", () => {
    expect(route).toContain("const { editionId, editionLabel } = useAdminContext()");
    expect(route).toContain("editionContextLabel={editionLabel?.trim() || editionId}");
    expect(route).toContain("key={editionId}");
  });

  it("keeps exact edition scope visibly locked near the page header", () => {
    expect(route).toContain('data-v3-organizer-context-lock="edition"');
    expect(route).toContain("Edition context");
    expect(route).toContain("<AdminStatus tone=\"info\">{editionContextLabel}</AdminStatus>");
    expect(route).toContain("eyebrow={`${editionContextLabel} · Voting integrity`}");
  });

  it("freezes and repeats the reviewed edition inside destructive confirmation", () => {
    expect(route).toContain("editionLabel: editionContextLabel");
    expect(route).toContain('data-v3-organizer-confirmation-context="edition"');
    expect(route).toContain("{pendingInvalidation.editionLabel}");
    expect(route.indexOf("editionLabel: editionContextLabel")).toBeLessThan(
      route.indexOf("{pendingInvalidation.editionLabel}"),
    );
  });

  it("retains fail-closed query and command edition checks", () => {
    expect(route).toContain('queryKey: ["merged-integrity-declarations", editionId]');
    expect(route).toContain("data: { editionId, limit: 500, signedOnly: false }");
    expect(route).toContain("row.canonical_edition_id !== editionId");
    expect(route).toContain("pending.editionId !== editionId");
    expect(route).toContain("pending.row.canonical_edition_id !== editionId");
  });

  it("keeps invalidation on the governed preview/apply authority", () => {
    expect(route).toContain("previewVotingDeclarationInvalidation");
    expect(route).toContain("applyVotingDeclarationInvalidation");
    expect(command).toContain("studio2_voting_declaration_invalidation_preview");
    expect(command).toContain("studio2_apply_voting_declaration_invalidation");
    expect(command).toContain("expectedVersion: input.preview.declarationVersion");
    expect(command).toContain("idempotencyKey: input.idempotencyKey");
  });

  it("does not add a browser-owned declaration mutation path", () => {
    expect(route).not.toContain("supabase.from");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".delete(");
    expect(route).not.toContain(".insert(");
  });
});