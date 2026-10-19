import type {
  V3EntryConfirmationProjection,
  V3EntryLifecycle,
} from "./v3-entry";

export type V3EntryEditingState =
  | "not-applicable"
  | "open"
  | "reopened"
  | "locked"
  | "closed";

export type V3EntryEditingPresentation = {
  state: V3EntryEditingState;
  label: string;
  description: string;
};

/**
 * Present the server-authoritative edit gate separately from Entry review state.
 * `canEdit` and `editReason` come from the caller-scoped Confirmation access
 * projection; this helper never infers editability from browser time, drafts or
 * the review label itself.
 */
export function deriveV3EntryEditingPresentation(
  confirmation: V3EntryConfirmationProjection | null,
  lifecycle: V3EntryLifecycle,
): V3EntryEditingPresentation {
  if (!confirmation) {
    return {
      state: "not-applicable",
      label: "No submitted response",
      description: "Editing state becomes available after a canonical response exists.",
    };
  }

  if (confirmation.canEdit) {
    if (lifecycle.state === "changes-required") {
      return {
        state: "reopened",
        label: "Correction editing reopened",
        description: "The current response is editable so the requested correction can be submitted.",
      };
    }
    return {
      state: "open",
      label: "Editing available",
      description: "The current canonical response is open for editing.",
    };
  }

  if (confirmation.editReason === "locked") {
    return {
      state: "locked",
      label: "Submission locked",
      description: "The current response is locked and cannot be edited.",
    };
  }

  return {
    state: "closed",
    label: "Editing closed",
    description: "The current response is not editable right now.",
  };
}
