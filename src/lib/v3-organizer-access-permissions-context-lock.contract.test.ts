import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyOrganizerPermissionRead, type OrganizerPermissionReadClient } from "../integrations/permissions/organizer-permission-read-authorization";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/access-permissions.tsx"),
  "utf8",
);

describe("V3 Organizer Access & Permissions context lock", () => {
  it("resolves edition-scoped access work through the verified Organizer edition set", () => {
    expect(route).toContain('const editionsQuery = useEditions();');
    expect(route).toContain("editionsQuery.isSuccess && !editionsQuery.error");
    expect(route).toContain(
      'selectOrganizerEdition(editionsQuery.data ?? [], verifiedChoiceId)',
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
    expect(route).toContain('enabled: editionContextVerified');
  });

  it("pauses permission evaluation and R3 review actions during stale-context revalidation", () => {
    expect(route).toContain("editionsQuery.isSuccess && !editionsQuery.error && !editionsQuery.isFetching");
    expect(route).toContain("!editionsQuery.isFetching &&");
    expect(route).toContain("enabled: editionContextVerified");
    expect(route).toContain("if (!editionContextVerified || (editionId && !resolvedEditionId))");
    expect(route).toContain("onApprove={(approval) => {\\n            if (!editionContextVerified) return;".replace(/\\n/g, "\n"));
    expect(route).toContain("onApply={(approval) => {\\n            if (!editionContextVerified) return;".replace(/\\n/g, "\n"));
    expect(route).toContain("if (!editionContextVerified) {");
  });

  it("withholds private directory metrics and user details when a read fails or refreshes", () => {
    expect(route).toContain("const directoryVerified =");
    expect(route).toContain("catalogQuery.isSuccess &&");
    expect(route).toContain("usersQuery.isSuccess &&");
    expect(route).toContain("!catalogQuery.isFetching &&");
    expect(route).toContain("!usersQuery.isFetching;");
    expect(route).toContain("directoryVerified ? usersQuery.data ?? [] : []");
    expect(route).toContain("const catalog = directoryVerified ? catalogQuery.data : undefined;");
    expect(route).toContain("{directoryVerified ? (");
    expect(route).toContain("Retry permission directory");
    expect(route).toContain("Promise.all([catalogQuery.refetch(), usersQuery.refetch()])");
    expect(route).toContain("!directoryVerified ? (");
  });

  it("visibly disables the R3 approvals queue on unverified or refreshing edition context", () => {
    expect(route).toContain("actionsAvailable={editionContextVerified}");
    expect(route).toContain("actionsAvailable: boolean;");
    expect(route).toContain("disabled={!actionsAvailable}");
    expect(route).toContain("busy={!editionContextVerified || previewChange.isPending || requestApproval.isPending || applyApproved.isPending}");
    expect(route).toContain("disabled={busy}");
    expect(route).toContain("Scope verification required");
    expect(route).toContain("R3 approval actions are paused until the Organizer edition context can be verified.");
    expect(route).toContain("if (!editionContextVerified) return;");
  });

  it("requires affirmative actor-bound scope, even when NAV silently defaults an edition", () => {
    expect(route).toContain("const { editionId, setEditionContext } = useAdminContext()");
    expect(route).toContain('const explicitEditionId = explicitChoice?.actorId === actorId ? explicitChoice.editionId : "";');
    expect(route).toContain('const verifiedChoiceId = explicitEditionId && editionId === explicitEditionId ? explicitEditionId : "";');
    expect(route).toContain("Boolean(verifiedChoiceId) &&");
    expect(route).toContain("Boolean(resolvedEditionId)");
    expect(route).toContain("Choose the edition for this permission review");
    expect(route).toContain("setExplicitChoice(choice ? { actorId, editionId: choice.id } : null)");
    expect(route).toContain("setEditionContext({ id: choice.id, slug: choice.slug, label: formatEditionLabel(choice) })");
    expect(route).toContain("NAV's default edition is not authorization.");
    expect(route).toContain("enabled: editionContextVerified");
  });

  it("does not reinterpret stale edition context as a global permission evaluation", () => {
    expect(route).toContain(
      'editionId ? (resolvedEditionId || "unverified") : "global"',
    );
    expect(route).toContain(
      'enabled: editionContextVerified',
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
    expect(route).toContain('"Edition access unavailable"');
    expect(route).toContain('"Permission verification unavailable"');
    expect(route).toContain('"Permission access denied"');
    expect(route).toContain('"Verifying edition access"');
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
    expect(route).toContain('}, [actorId, editionId, resetSimulation]);');
    expect(route).not.toContain('simulation,\n  ]);');
  });

  it("uses resolved edition context for access simulation and refuses stale-context global fallback", () => {
    expect(route).toContain('if (!editionContextVerified || (editionId && !resolvedEditionId))');
    expect(route).toContain(
      'Access simulation will not fall back to global scope.',
    );
    expect(route).toContain('viewAccessAs(userId, resolvedEditionId || null)');
    expect(route).not.toContain('viewAccessAs(userId, editionId || null)');
  });

  it("segregates private permission, approval and audit projections by signed-in account", () => {
    expect(route).toContain('useAuthenticatedUser().id');
    for (const key of [
      '["permission-engine-catalog", actorId]',
      '["permission-engine-users", actorId]',
      '["permission-engine-summary", actorId]',
      '["permission-engine-events", mismatchesOnly, actorId]',
      '["permission-engine-approvals", actorId]',
    ]) expect(route).toContain(key);
    expect(route).toContain('"permissions.read",');
    expect(route).toContain('editionId ? (resolvedEditionId || "unverified") : "global",');
    expect(route).toContain('      actorId,');
  });

  it("freezes actor identity as well as edition while an R3 review is in flight", () => {
    expect(route).toContain('reviewContextActorId: string;');
    expect(route).toContain('const currentActorRef = useRef(actorId);');
    expect(route).toContain('reviewContextActorId: actorId,');
    expect(route).toContain('currentActorRef.current = actorId;');
    expect(route).toContain('}, [actorId, editionId, resetSimulation]);');
    expect(route).toContain('currentActorRef.current !== pending.reviewContextActorId');
    expect(route).toContain('currentActorRef.current !== reviewContextActorId');
    expect(route).toContain('currentActorRef.current === variables.reviewContextActorId');
    expect(route).toContain('reviewContextActorId: approvalAction.reviewContextActorId');
    expect(route).toContain('Organizer account changed during reauthentication.');
  });

  it("rejects A→B→A context restoration while an R3 preview or password step is pending", () => {
    expect(route).toContain("const reviewContextEpochRef = useRef(0);");
    expect(route).toContain("reviewContextEpochRef.current += 1;");
    expect(route).toContain("}, [actorId, editionId, editionContextVerified]);");
    expect(route).toContain("const reviewContextEpoch = reviewContextEpochRef.current;");
    expect(route).toContain("reviewContextEpoch: number;");
    expect(route).toContain("reviewContextEpoch: reviewContextEpochRef.current,");
    expect(route).toContain("reviewContextEpoch: approvalAction.reviewContextEpoch,");
    expect(route).toContain("reviewContextEpochRef.current !== reviewContextEpoch");
    expect(route).toContain("reviewContextEpochRef.current !== pending.reviewContextEpoch");
    expect(route).toContain("reviewContextEpochRef.current !== pending.reviewContextEpoch) return;");
    expect(route).toContain("reviewContextEpochRef.current === variables.pending.reviewContextEpoch");
    expect(route).toContain("reviewContextEpochRef.current === variables.reviewContextEpoch");
    expect(route).toContain("Organizer review context changed while the R3 preview was loading.");
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
  it("requires a fresh server capability probe for the exact selected edition before private access reads", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client: OrganizerPermissionReadClient = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: true, error: null };
      },
    };
    expect(await verifyOrganizerPermissionRead("edition-22", client)).toBe(true);
    expect(calls).toEqual([{
      name: "studio2_access_allowed",
      args: {
        p_capability: "permissions.read",
        p_edition_id: "edition-22",
        p_strict_before_cutover: false,
      },
    }]);
    expect(route).toContain('queryFn: () => verifyOrganizerPermissionRead(resolvedEditionId)');
    expect(route).toContain('permissionReadQuery.data === true');
    expect(route).toContain('permissionReadQuery.isSuccess &&');
    expect(route).toContain('!permissionReadQuery.isFetching &&');
    expect(route).toContain('!permissionReadQuery.error &&');
    expect(route).toContain('gcTime: 0');
    expect(route).toContain('refetchOnMount: "always"');
    expect(route).not.toContain('supabase.rpc(');
  });

  it("fails closed on revoked, malformed, missing and unavailable permission reads", async () => {
    const denied: OrganizerPermissionReadClient = { rpc: async () => ({ data: false, error: null }) };
    const malformed: OrganizerPermissionReadClient = { rpc: async () => ({ data: null, error: null }) };
    const failed: OrganizerPermissionReadClient = { rpc: async () => ({ data: null, error: { message: "Unavailable" } }) };
    expect(await verifyOrganizerPermissionRead("edition-22", denied)).toBe(false);
    await expect(verifyOrganizerPermissionRead("edition-22", malformed)).rejects.toThrow(/invalid response/);
    await expect(verifyOrganizerPermissionRead("edition-22", failed)).rejects.toMatchObject({ message: "Unavailable" });
    await expect(verifyOrganizerPermissionRead("", denied)).rejects.toThrow(/explicit Organizer edition/);
    expect(route).toContain("Permission access denied");
    expect(route).toContain("Permission verification unavailable");
    expect(route).toContain("Retry permission verification");
    expect(route).toContain("Public edition visibility does not authorize private access reviews.");
  });

  it("never preloads protected directory, approval or audit data until the server confirms capability", () => {
    for (const key of [
      "queryFn: loadPermissionCatalog,",
      "queryFn: loadAccessUsers,",
      "queryFn: loadPermissionSummary,",
      "queryFn: () => loadPermissionEvents(mismatchesOnly),",
      "queryFn: loadPermissionChangeApprovals,",
    ]) {
      const start = route.indexOf(key);
      expect(start).toBeGreaterThan(0);
      expect(route.slice(start, start + 150)).toContain("enabled: editionContextVerified,");
    }
    expect(route).toContain("const directoryVerified =\n    editionContextVerified &&");
    expect(route).toContain("approvals={editionContextVerified && approvalsQuery.isSuccess && !approvalsQuery.isFetching");
    expect(route).toContain("const summary = editionContextVerified && summaryQuery.isSuccess");
    expect(route).toContain('actionsAvailable={editionContextVerified}');
    expect(route).not.toContain("queryFn: () => viewAccessAs(userId, editionId || null)");
  });

});
