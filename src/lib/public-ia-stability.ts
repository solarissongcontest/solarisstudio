import {
  BETA3_FIRST_CLICK_EXPECTATIONS,
  BETA3_RELEASE_GATES,
  beta3NavigationSections,
} from "@/features/beta-test/sections-beta3-navigation";
import { supabase } from "@/integrations/supabase/client";
import { evaluateBeta3FirstClickEvidence } from "@/lib/beta3-release-evidence";
import {
  loadBeta3FirstClickEvidence,
  loadPublicUxMetricsSince,
  loadPublicWebVitalsMetricsSince,
  type PublicUxMetrics,
  type PublicWebVitalsMetrics,
} from "@/lib/public-ux-metrics";

type Beta3StabilitySubmission = {
  device: string;
  answers: Record<string, unknown>;
};

export type PublicIaRetirementGate = {
  key: string;
  label: string;
  passed: boolean;
  value: number | null;
  target: number;
  lowerIsBetter?: boolean;
};

export type PublicIaStabilityEvidence = {
  promotedAt: string;
  flagEnabled: boolean;
  globallyEnabled: boolean;
  metrics: PublicUxMetrics;
  vitals: PublicWebVitalsMetrics;
  beta3Responses: number;
  firstClickStarted: number;
  firstClickCoveragePercent: number | null;
  gates: PublicIaRetirementGate[];
  evidenceSufficient: boolean;
};

const outcomeIds = beta3NavigationSections.flatMap((section) =>
  section.questions
    .filter((question) => question.id.endsWith("Outcome"))
    .map((question) => question.id),
);

export async function loadPublicIaStabilityEvidence(): Promise<PublicIaStabilityEvidence> {
  const database = supabase as any;
  const [flagResult, submissionsResult, firstClickEvidence] = await Promise.all([
    database
      .from("studio2_feature_flags")
      .select("enabled,admins_only,updated_at")
      .eq("key", "public_ia_v3")
      .maybeSingle(),
    database.from("beta3_test_submissions").select("device,answers"),
    loadBeta3FirstClickEvidence(90),
  ]);

  if (flagResult.error) {
    throw new Error(flagResult.error.message || "Could not load the Public IA rollout flag.");
  }
  if (submissionsResult.error) {
    throw new Error(submissionsResult.error.message || "Could not load Beta 3 evidence.");
  }

  const flag = flagResult.data as {
    enabled?: boolean;
    admins_only?: boolean;
    updated_at?: string;
  } | null;
  const promotedAt = String(flag?.updated_at ?? "");
  if (!promotedAt) throw new Error("The Public IA promotion timestamp is unavailable.");

  const [metrics, vitals] = await Promise.all([
    loadPublicUxMetricsSince(promotedAt),
    loadPublicWebVitalsMetricsSince(promotedAt),
  ]);
  const submissions = (submissionsResult.data ?? []) as Beta3StabilitySubmission[];
  const firstClick = evaluateBeta3FirstClickEvidence(
    firstClickEvidence,
    BETA3_FIRST_CLICK_EXPECTATIONS,
  );
  const gates = evaluateBeta3Gates(submissions, firstClick.successRate);

  return {
    promotedAt,
    flagEnabled: flag?.enabled === true,
    globallyEnabled: flag?.enabled === true && flag?.admins_only === false,
    metrics,
    vitals,
    beta3Responses: submissions.length,
    firstClickStarted: firstClick.started,
    firstClickCoveragePercent: firstClick.coveragePercent,
    gates,
    evidenceSufficient: gates.every((gate) => gate.passed),
  };
}

export function evaluateBeta3Gates(
  submissions: Beta3StabilitySubmission[],
  firstClickSuccessPercent: number | null,
): PublicIaRetirementGate[] {
  const responseCount = submissions.length;
  const attempts = responseCount * outcomeIds.length;
  const successes = submissions.reduce(
    (sum, submission) =>
      sum + outcomeIds.filter((id) => successfulFind(submission.answers[id])).length,
    0,
  );
  const coreTaskSuccess = attempts ? (successes / attempts) * 100 : null;
  const oldEditionLookup = percent(submissions, (submission) =>
    successfulFind(submission.answers.beta3OldWinnerOutcome),
  );
  const countryEntryFailures = responseCount
    ? submissions.filter(
        (submission) => !successfulFind(submission.answers.beta3CountryEntryOutcome),
      ).length
    : null;
  const mobile = submissions.filter((submission) =>
    ["Phone", "Tablet"].includes(submission.device),
  );
  const desktop = submissions.filter((submission) =>
    ["Laptop", "Desktop"].includes(submission.device),
  );
  const mobileSuccess = taskSuccess(mobile);
  const desktopSuccess = taskSuccess(desktop);
  const deviceGap =
    mobileSuccess == null || desktopSuccess == null
      ? null
      : Math.abs(mobileSuccess - desktopSuccess);

  return [
    gate("sample", "Comparable Beta 3 sample", responseCount, BETA3_RELEASE_GATES.minimumResponses),
    gate("tasks", "Core task success", coreTaskSuccess, BETA3_RELEASE_GATES.coreTaskSuccessPercent),
    gate(
      "first-click",
      "Observed first-click success",
      firstClickSuccessPercent,
      BETA3_RELEASE_GATES.firstClickSuccessPercent,
    ),
    gate(
      "old-edition",
      "Old edition lookup",
      oldEditionLookup,
      BETA3_RELEASE_GATES.oldEditionLookupPercent,
    ),
    gate("country-entry", "Country entry lookup failures", countryEntryFailures, 1, true),
    gate(
      "device-gap",
      "Mobile / desktop gap",
      deviceGap,
      BETA3_RELEASE_GATES.mobileDesktopGapPercent,
      true,
    ),
  ];
}

function gate(
  key: string,
  label: string,
  value: number | null,
  target: number,
  lowerIsBetter = false,
): PublicIaRetirementGate {
  return {
    key,
    label,
    value,
    target,
    lowerIsBetter,
    passed: value != null && (lowerIsBetter ? value <= target : value >= target),
  };
}

function successfulFind(value: unknown) {
  return typeof value === "string" && value.length > 0 && value !== "Could not find it";
}

function percent(
  submissions: Beta3StabilitySubmission[],
  predicate: (submission: Beta3StabilitySubmission) => boolean,
) {
  return submissions.length
    ? (submissions.filter(predicate).length / submissions.length) * 100
    : null;
}

function taskSuccess(submissions: Beta3StabilitySubmission[]) {
  if (!submissions.length || !outcomeIds.length) return null;
  const successes = submissions.reduce(
    (sum, submission) =>
      sum + outcomeIds.filter((id) => successfulFind(submission.answers[id])).length,
    0,
  );
  return (successes / (submissions.length * outcomeIds.length)) * 100;
}
