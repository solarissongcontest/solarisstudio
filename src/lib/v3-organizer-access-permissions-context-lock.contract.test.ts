import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/access-permissions.tsx"),
  "utf8",
);

describe("V3 Organizer Access & Permissions context lock", () => {
  it("resolves edition-scoped access work through the verified Organizer edition set", () => {
    expect(route).toContain('const editionsQuery = useEditions();');
    expect(route).toContain(
      'selectOrganizerEdition(editionsQuery.data ?? [], editionId)',
    );
    expect(route).toContain(
      'const resolvedEditionId = editionId && organizerEdition ? organizerEdition.id : "";',
    );
    expect(route).toContain('editionAvailable={Boolean(resolvedEditionId)}');
    expect(route).toContain(
      'const effectiveScope = scope === "edition" ? (resolvedEditionId || null) : null;',
    );
    expect(route).not.toContain(
      'const effectiveScope = scope === "edition" && editionId ? editionId : null;',
    );
  });

  it("does not reinterpret stale edition context as a global permission evaluation", () => {
    expect(route).toContain(
      'editionId ? (resolvedEditionId || "unverified") : "global"',
    );
    expect(route).toContain(
      'enabled: editionsQuery.isSuccess && (!editionId || Boolean(resolvedEditionId))',
    );
    expect(route).toContain('editionId: resolvedEditionId || null');
  });

  it("makes exact access scope visible instead of calling every non-global change merely selected edition", () => {
    expect(route).toContain('data-v3-organizer-context-lock="permissions"');
    expect(route).toContain('No verified edition selected');
    expect(route).toContain('Edition-scoped grants use only this verified Organizer context.');
    expect(route).toContain('scopeLabel: permissionScopeLabel(preview.editionId, editionLabels)');
    expect(route).toContain('{pending.scopeLabel}');
    expect(route).toContain('permissionScopeLabel(approval.editionId, editionLabels)');
    expect(route).toContain('editionScopeLabel={organizerEditionLabel}');
  });

  it("freezes Organizer edition context into an R3 review and fails closed if context changes", () => {
    expect(route).toContain('reviewContextEditionId: string | null');
    expect(route).toContain('reviewContextEditionId: editionId ?? null');
    expect(route).toContain(
      'if ((editionId ?? null) !== pending.reviewContextEditionId)',
    );
    expect(route).toContain(
      'Organizer edition context changed after this R3 review opened. Nothing was requested.',
    );
    expect(route).toContain(
      'if ((editionId ?? null) !== approvalAction.reviewContextEditionId)',
    );
    expect(route).toContain(
      'Organizer edition context changed after this R3 review opened. Nothing was applied.',
    );
  });

  it("cancels unfinished local R3 review state only from edition-context changes", () => {
    expect(route).toContain('const resetSimulation = simulation.reset;');
    expect(route).toContain('setPendingChange(null);');
    expect(route).toContain('setReauthPassword("");');
    expect(route).toContain('setApprovalAction(null);');
    expect(route).toContain('setApprovalPassword("");');
    expect(route).toContain('setMessage(null);');
    expect(route).toContain('resetSimulation();');
    expect(route).toContain('}, [editionId, resetSimulation]);');
    expect(route).not.toContain('simulation,\n  ]);');
  });

  it("uses resolved edition context for access simulation and refuses stale-context global fallback", () => {
    expect(route).toContain('if (editionId && !resolvedEditionId)');
    expect(route).toContain(
      'Access simulation will not fall back to global scope.',
    );
    expect(route).toContain('viewAccessAs(userId, resolvedEditionId || null)');
    expect(route).not.toContain('viewAccessAs(userId, editionId || null)');
  });

  it("preserves the existing server-authoritative R3 permission operation pipeline", () => {
    for (const contract of [
      'previewPermissionChange(command)',
      'riskClass: "R3"',
      'reauthenticatePermissionR3(password)',
      'requestPermissionChangeApproval({',
      'expectedVersion: pending.preview.expectedVersion',
      'idempotencyKey: pending.idempotencyKey',
      'approvePermissionChangeApproval(approval.id)',
      'applyPermissionChange({',
      'approvalRequestId: approval.id',
    ]) {
      expect(route).toContain(contract);
    }
  });

  it("does not introduce direct permission-table writes into the Organizer route", () => {
    expect(route).not.toContain('supabase.from(');
    expect(route).not.toContain('supabase.rpc(');
  });
});
