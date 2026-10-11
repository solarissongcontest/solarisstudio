export type V3OrganizerRiskTier = 1 | 2 | 3 | 4;

export type V3OrganizerContext = {
  editionId: string;
  editionLabel: string;
  showId?: string | null;
  showLabel?: string | null;
};

export type V3OrganizerOperation =
  | "edit_copy"
  | "save_draft_schedule"
  | "open_confirmation"
  | "send_reminder"
  | "start_jury"
  | "close_voting"
  | "publish_results"
  | "disqualify_entry"
  | "reopen_finalized_workflow"
  | "delete_edition"
  | "override_official_result"
  | "platform_emergency_mode";

export type V3OrganizerOperationPolicy = {
  operation: V3OrganizerOperation;
  riskTier: V3OrganizerRiskTier;
  reversible: boolean;
  requiresReview: boolean;
  requiresExplicitConsequence: boolean;
  requiresReauthentication: boolean;
  supportsUndo: boolean;
};

const POLICIES: Readonly<Record<V3OrganizerOperation, V3OrganizerOperationPolicy>> = Object.freeze({
  edit_copy: {
    operation: "edit_copy",
    riskTier: 1,
    reversible: true,
    requiresReview: false,
    requiresExplicitConsequence: false,
    requiresReauthentication: false,
    supportsUndo: true,
  },
  save_draft_schedule: {
    operation: "save_draft_schedule",
    riskTier: 1,
    reversible: true,
    requiresReview: false,
    requiresExplicitConsequence: false,
    requiresReauthentication: false,
    supportsUndo: true,
  },
  open_confirmation: {
    operation: "open_confirmation",
    riskTier: 2,
    reversible: true,
    requiresReview: true,
    requiresExplicitConsequence: false,
    requiresReauthentication: false,
    supportsUndo: false,
  },
  send_reminder: {
    operation: "send_reminder",
    riskTier: 2,
    reversible: false,
    requiresReview: true,
    requiresExplicitConsequence: false,
    requiresReauthentication: false,
    supportsUndo: false,
  },
  start_jury: {
    operation: "start_jury",
    riskTier: 2,
    reversible: true,
    requiresReview: true,
    requiresExplicitConsequence: false,
    requiresReauthentication: false,
    supportsUndo: false,
  },
  close_voting: {
    operation: "close_voting",
    riskTier: 3,
    reversible: false,
    requiresReview: true,
    requiresExplicitConsequence: true,
    requiresReauthentication: false,
    supportsUndo: false,
  },
  publish_results: {
    operation: "publish_results",
    riskTier: 3,
    reversible: false,
    requiresReview: true,
    requiresExplicitConsequence: true,
    requiresReauthentication: false,
    supportsUndo: false,
  },
  disqualify_entry: {
    operation: "disqualify_entry",
    riskTier: 3,
    reversible: true,
    requiresReview: true,
    requiresExplicitConsequence: true,
    requiresReauthentication: false,
    supportsUndo: false,
  },
  reopen_finalized_workflow: {
    operation: "reopen_finalized_workflow",
    riskTier: 3,
    reversible: true,
    requiresReview: true,
    requiresExplicitConsequence: true,
    requiresReauthentication: false,
    supportsUndo: false,
  },
  delete_edition: {
    operation: "delete_edition",
    riskTier: 4,
    reversible: false,
    requiresReview: true,
    requiresExplicitConsequence: true,
    requiresReauthentication: true,
    supportsUndo: false,
  },
  override_official_result: {
    operation: "override_official_result",
    riskTier: 4,
    reversible: false,
    requiresReview: true,
    requiresExplicitConsequence: true,
    requiresReauthentication: true,
    supportsUndo: false,
  },
  platform_emergency_mode: {
    operation: "platform_emergency_mode",
    riskTier: 4,
    reversible: true,
    requiresReview: true,
    requiresExplicitConsequence: true,
    requiresReauthentication: true,
    supportsUndo: false,
  },
});

export function v3OrganizerOperationPolicy(operation: V3OrganizerOperation) {
  return POLICIES[operation];
}

export function v3OrganizerContextKey(context: V3OrganizerContext) {
  return [context.editionId, context.showId ?? "edition"].join(":");
}

export function assertV3OrganizerContext(
  expected: V3OrganizerContext,
  actual: V3OrganizerContext,
) {
  if (expected.editionId !== actual.editionId) {
    throw new Error(
      `Organizer edition context changed from ${expected.editionLabel} to ${actual.editionLabel}. Review the operation before continuing.`,
    );
  }
  if ((expected.showId ?? null) !== (actual.showId ?? null)) {
    throw new Error("Organizer show context changed. Review the operation before continuing.");
  }
}

export type V3OrganizerContextSwitch = {
  from: V3OrganizerContext;
  to: V3OrganizerContext;
  closeDestructiveFlows: true;
  clearEditionScopedCache: boolean;
  clearShowScopedCache: boolean;
  resetSelectedShow: boolean;
  reloadCanonicalState: true;
};

/**
 * Organizer context switches are explicit state transitions. Destructive flows
 * must close so a stale confirmation sheet can never survive an edition/show
 * change and operate against the wrong contest context.
 */
export function projectV3OrganizerContextSwitch(
  from: V3OrganizerContext,
  to: V3OrganizerContext,
): V3OrganizerContextSwitch {
  const editionChanged = from.editionId !== to.editionId;
  const showChanged = (from.showId ?? null) !== (to.showId ?? null);

  return {
    from,
    to,
    closeDestructiveFlows: true,
    clearEditionScopedCache: editionChanged,
    clearShowScopedCache: editionChanged || showChanged,
    resetSelectedShow: editionChanged,
    reloadCanonicalState: true,
  };
}

function operationVerb(operation: V3OrganizerOperation) {
  switch (operation) {
    case "edit_copy":
      return "Save changes";
    case "save_draft_schedule":
      return "Save draft schedule";
    case "open_confirmation":
      return "Open confirmations";
    case "send_reminder":
      return "Send reminder";
    case "start_jury":
      return "Start jury voting";
    case "close_voting":
      return "Close voting";
    case "publish_results":
      return "Publish results";
    case "disqualify_entry":
      return "Disqualify entry";
    case "reopen_finalized_workflow":
      return "Reopen finalized workflow";
    case "delete_edition":
      return "Delete edition";
    case "override_official_result":
      return "Override official result";
    case "platform_emergency_mode":
      return "Change emergency mode";
  }
}

export type V3OrganizerConfirmationCopy = {
  title: string;
  contextLabel: string;
  consequence: string | null;
  confirmLabel: string;
};

export function v3OrganizerConfirmationCopy(
  operation: V3OrganizerOperation,
  context: V3OrganizerContext,
): V3OrganizerConfirmationCopy {
  const policy = v3OrganizerOperationPolicy(operation);
  const scope = context.showLabel
    ? `${context.editionLabel} · ${context.showLabel}`
    : context.editionLabel;

  const consequence = (() => {
    switch (operation) {
      case "close_voting":
        return "No further votes will be accepted after this operation completes.";
      case "publish_results":
        return "Official results will become visible according to the publication policy.";
      case "disqualify_entry":
        return "The entry will stop being treated as eligible in the affected contest workflow.";
      case "reopen_finalized_workflow":
        return "A finalized workflow will become editable/operational again and requires renewed integrity review.";
      case "delete_edition":
        return "This removes the edition context and may make related operational data unreachable. This action is not undoable.";
      case "override_official_result":
        return "The currently official result will be replaced. This requires a complete audit trail.";
      case "platform_emergency_mode":
        return "This changes platform-wide emergency behaviour and may affect multiple active workflows.";
      default:
        return policy.requiresExplicitConsequence
          ? "Review the impact of this operation before continuing."
          : null;
    }
  })();

  return {
    title: `${operationVerb(operation)}?`,
    contextLabel: scope,
    consequence,
    confirmLabel: operationVerb(operation),
  };
}
