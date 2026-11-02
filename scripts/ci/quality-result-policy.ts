export type QualityStatus =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "missing"
  | "unknown";

export type QualityResultInput = {
  name: string;
  required: boolean;
  outcome?: string | null;
  conclusion?: string | null;
  allowSkipped?: boolean;
};

export type QualityResultEvaluation = {
  name: string;
  required: boolean;
  rawOutcome: string;
  rawConclusion: string;
  collectedStatus: QualityStatus;
  blocking: boolean;
  reason: string;
};

const KNOWN_STATUSES = new Set(["success", "failure", "cancelled", "skipped"]);

function normalizeRaw(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized || "missing";
}

function normalizeStatus(value: string): QualityStatus {
  if (value === "missing") return "missing";
  if (KNOWN_STATUSES.has(value)) return value as QualityStatus;
  return "unknown";
}

export function evaluateQualityResult(
  input: QualityResultInput,
): QualityResultEvaluation {
  const rawOutcome = normalizeRaw(input.outcome);
  const rawConclusion = normalizeRaw(input.conclusion);
  const outcome = normalizeStatus(rawOutcome);
  const conclusion = normalizeStatus(rawConclusion);

  if (!input.required) {
    if (outcome === "success" && conclusion === "success") {
      return {
        name: input.name,
        required: false,
        rawOutcome,
        rawConclusion,
        collectedStatus: "success",
        blocking: false,
        reason: "optional diagnostic succeeded",
      };
    }

    return {
      name: input.name,
      required: false,
      rawOutcome,
      rawConclusion,
      collectedStatus: outcome,
      blocking: false,
      reason: `optional diagnostic is non-blocking (${rawOutcome}/${rawConclusion})`,
    };
  }

  if (outcome === "cancelled" || conclusion === "cancelled") {
    return {
      name: input.name,
      required: true,
      rawOutcome,
      rawConclusion,
      collectedStatus: "cancelled",
      blocking: true,
      reason: "required check was cancelled",
    };
  }

  if (outcome === "missing" || conclusion === "missing") {
    return {
      name: input.name,
      required: true,
      rawOutcome,
      rawConclusion,
      collectedStatus: "missing",
      blocking: true,
      reason: "required check did not expose a complete outcome/conclusion pair",
    };
  }

  if (outcome === "skipped" || conclusion === "skipped") {
    const legitimateSkip =
      input.allowSkipped === true && outcome === "skipped" && conclusion === "skipped";
    return {
      name: input.name,
      required: true,
      rawOutcome,
      rawConclusion,
      collectedStatus: "skipped",
      blocking: !legitimateSkip,
      reason: legitimateSkip
        ? "required check was legitimately skipped by an explicit prerequisite policy"
        : "required check was skipped without an allowed skip policy",
    };
  }

  if (outcome === "failure") {
    return {
      name: input.name,
      required: true,
      rawOutcome,
      rawConclusion,
      collectedStatus: "failure",
      blocking: true,
      reason:
        conclusion === "success"
          ? "raw step failure was masked by continue-on-error; required failures still block"
          : "required check failed",
    };
  }

  if (conclusion === "failure") {
    return {
      name: input.name,
      required: true,
      rawOutcome,
      rawConclusion,
      collectedStatus: "failure",
      blocking: true,
      reason: "required check concluded with failure",
    };
  }

  if (outcome !== "success" || conclusion !== "success") {
    return {
      name: input.name,
      required: true,
      rawOutcome,
      rawConclusion,
      collectedStatus: "unknown",
      blocking: true,
      reason: `required check returned an unknown status pair (${rawOutcome}/${rawConclusion})`,
    };
  }

  return {
    name: input.name,
    required: true,
    rawOutcome,
    rawConclusion,
    collectedStatus: "success",
    blocking: false,
    reason: "required check succeeded",
  };
}

export function evaluateQualityResults(inputs: QualityResultInput[]) {
  const results = inputs.map(evaluateQualityResult);
  const blocking = results.filter((result) => result.blocking);

  return {
    ok: blocking.length === 0,
    results,
    blocking,
  };
}
