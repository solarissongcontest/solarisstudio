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
    expect(route).toContain("editionsQuery.isSuccess && !editionsQuery.error");
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

  it("does not offer stale cached edition identity as verified access scope after a failed refresh", () => {
    expect(route).toContain("editionsQuery.isSuccess && !editionsQuery.error");
    expect(route).toContain('const resolvedEditionId = editionId && organizerEdition ? organizerEdition.id : "";');
    expect(route).toContain('editionAvailable={Boolean(resolvedEditionId)}');
    expect(route).toContain('enabled: editionsQuery.isSuccess && (!editionId || Boolean(resolvedEditionId))');
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
    expect(route).toContain('scopeLabelForEdition={(approvalEditionId) =>');
    expect(route).toContain('permissionScopeLabel(approvalEditionId, editionLabels)');
    expect(route).toContain('{scopeLabelForEdition(approval.editionId)}');
    expect(route).toContain('scopeLabel={permissionScopeLabel(approvalAction.approval.editionId, editionLabels)}');
    expect(route).toContain('editionScopeLabel={organizerEditionLabel}');
  });

  it("freezes Organizer edition context into an R3 review and fails closed if context changes", () => {
    expect(route).toContain('reviewContextEditionId: string | null');
    expect(route).toContain('reviewContextEditionId: editionId ?? null');
    expect(route).toContain(
      'if (!verifiedEditionRef.current || (editionId ?? null) !== pending.reviewContextEditionId)',
    );
    expect(route).toContain(
      'Organizer edition context changed after this R3 review opened or could not be verified. Nothing was requested.',
    );
    expect(route).toContain(
      'if ((editionId ?? null) !== approvalAction.reviewContextEditionId)',
    );
    expect(route).toContain(
      'Organizer edition context changed after this R3 review opened. Nothing was applied.',
    );
  });

  it("drops late preview results and rechecks edition context after every password step", () => {
    expect(route).toContain("const currentEditionRef = useRef<string | null>(editionId ?? null);");
    expect(route).toContain("currentEditionRef.current = editionId ?? null;");
    expect(route).toContain("currentEditionRef.current !== pending.reviewContextEditionId");
    expect(route).toContain("Organizer edition context changed or became unverified while the R3 preview was loading.");
    expect(route).toContain("Organizer edition context changed during reauthentication or became unverified. Nothing was requested.");
    expect(route).toContain("Organizer edition context changed during reauthentication or became unverified. Nothing was approved.");
    expect(route).toContain("Organizer edition context changed during reauthentication or became unverified. Nothing was applied.");
    expect(route).toContain("reviewContextEditionId: approvalAction.reviewContextEditionId");
    expect(route).toContain("currentEditionRef.current === variables.pending.reviewContextEditionId");
    expect(route).toContain("currentEditionRef.current === variables.reviewContextEditionId");
    expect(route).toContain("approvePermissionChangeApproval(approval.id)");
    expect(route).toContain("approvalRequestId: approval.id");
  });

  it("pauses R3 review and manual controls when live edition verification fails", () => {
    expect(route).toContain("const editionContextVerified =");
    expect(route).toContain("const verifiedEditionRef = useRef(editionContextVerified);");
    expect(route).toContain("verifiedEditionRef.current = editionContextVerified;");
    expect(route).toContain("if (!editionContextVerified) {");
    expect(route).toContain('title={editionsQuery.isError ? "Edition access unavailable" : "Verifying edition access"}');
    expect(route).toContain("Retry edition lookup");
    expect(route).toContain("Organizer edition context is not verified. No access change was previewed.");
    expect(route).toContain('scope === "edition"');
    expect(route).toContain('"Edition unverified"');
    expect(route).toContain('"Every edition"');
    for (const action of ["requested", "approved", "applied"]) {
      expect(route).toContain(`or became unverified. Nothing was ${action}.`);
    }
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
