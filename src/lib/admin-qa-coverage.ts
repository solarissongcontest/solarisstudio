import type { AdminBetaCoverageItem } from "@/features/admin-beta-test/sections";
import type { BetaSection } from "@/features/beta-test/types";

export type QaCoverageEvidenceState = "evidenced" | "partial" | "not_tested" | "unknown";

export type QaCoverageEvidence = {
  state: QaCoverageEvidenceState;
  label: string;
  detail: string;
};

export type QaCoverageSubmission = {
  tester_name: string;
  device: string;
  answers: Record<string, unknown>;
  form_version: number;
  created_at: string;
};

export type QaCoverageMatrixRow = {
  id: string;
  capability: string;
  group: string;
  href: string;
  critical: boolean;
  scenario: string;
  scenarioDetail: string | null;
  phone: QaCoverageEvidence;
  desktop: QaCoverageEvidence;
  keyboard: QaCoverageEvidence;
  twoAdmin: QaCoverageEvidence;
  offlineReconnect: QaCoverageEvidence;
  passedSha: QaCoverageEvidence;
};

export type QaCoverageMatrixSummary = {
  rows: number;
  evidencedCells: number;
  partialCells: number;
  notTestedCells: number;
  unknownCells: number;
  totalCells: number;
  criticalRowsWithNoDeviceEvidence: number;
};

const UNKNOWN_KEYBOARD: QaCoverageEvidence = {
  state: "unknown",
  label: "Unknown",
  detail: "The current acceptance form does not capture capability-specific keyboard evidence.",
};

const UNKNOWN_TWO_ADMIN: QaCoverageEvidence = {
  state: "unknown",
  label: "Unknown",
  detail: "Individual tester passes do not prove capability-specific concurrent two-admin behavior.",
};

const UNKNOWN_OFFLINE: QaCoverageEvidence = {
  state: "unknown",
  label: "Unknown",
  detail: "The current acceptance form does not capture capability-specific offline/reconnect evidence.",
};

const UNKNOWN_SHA: QaCoverageEvidence = {
  state: "unknown",
  label: "Unknown",
  detail: "Manual acceptance submissions are not bound to an exact tested commit SHA.",
};

export function latestQaCoverageSubmissions(
  submissions: readonly QaCoverageSubmission[],
): QaCoverageSubmission[] {
  const ordered = [...submissions].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const latest = new Map<string, QaCoverageSubmission>();

  for (const submission of ordered) {
    const tester = submission.tester_name.trim().toLowerCase();
    if (tester && !latest.has(tester)) latest.set(tester, submission);
  }

  return [...latest.values()];
}

export function buildAdminQaCoverageMatrix(input: {
  capabilities: readonly AdminBetaCoverageItem[];
  sections: readonly BetaSection[];
  submissions: readonly QaCoverageSubmission[];
  currentFormVersion: number;
}): QaCoverageMatrixRow[] {
  const latest = latestQaCoverageSubmissions(input.submissions).filter(
    (submission) => submission.form_version >= input.currentFormVersion,
  );

  return input.capabilities.map((capability) => {
    const section = input.sections.find((candidate) =>
      candidate.questions.some((question) => question.id === capability.answerId),
    );

    return {
      id: capability.id,
      capability: capability.label,
      group: capability.group,
      href: capability.href,
      critical: Boolean(capability.critical),
      scenario: section?.title ?? "Acceptance scenario",
      scenarioDetail: section?.task?.body ?? null,
      phone: evidenceForDevice(latest, capability.answerId, "phone"),
      desktop: evidenceForDevice(latest, capability.answerId, "desktop"),
      keyboard: UNKNOWN_KEYBOARD,
      twoAdmin:
        capability.id === "concurrency"
          ? evidenceForAnswers(latest, capability.answerId, "Two-admin scenario")
          : UNKNOWN_TWO_ADMIN,
      offlineReconnect: UNKNOWN_OFFLINE,
      passedSha: UNKNOWN_SHA,
    };
  });
}

export function summarizeAdminQaCoverage(
  rows: readonly QaCoverageMatrixRow[],
): QaCoverageMatrixSummary {
  const cells = rows.flatMap((row) => [
    row.phone,
    row.desktop,
    row.keyboard,
    row.twoAdmin,
    row.offlineReconnect,
    row.passedSha,
  ]);

  return {
    rows: rows.length,
    evidencedCells: cells.filter((cell) => cell.state === "evidenced").length,
    partialCells: cells.filter((cell) => cell.state === "partial").length,
    notTestedCells: cells.filter((cell) => cell.state === "not_tested").length,
    unknownCells: cells.filter((cell) => cell.state === "unknown").length,
    totalCells: cells.length,
    criticalRowsWithNoDeviceEvidence: rows.filter(
      (row) =>
        row.critical &&
        row.phone.state !== "evidenced" &&
        row.desktop.state !== "evidenced",
    ).length,
  };
}

function evidenceForDevice(
  submissions: readonly QaCoverageSubmission[],
  answerId: string,
  device: "phone" | "desktop",
): QaCoverageEvidence {
  const relevant = submissions.filter((submission) => classifyDevice(submission.device) === device);
  return evidenceForAnswers(relevant, answerId, device === "phone" ? "Phone" : "Desktop");
}

function evidenceForAnswers(
  submissions: readonly QaCoverageSubmission[],
  answerId: string,
  label: string,
): QaCoverageEvidence {
  if (!submissions.length) {
    return {
      state: "unknown",
      label: "Unknown",
      detail: `${label}: no current-form evidence has been submitted.`,
    };
  }

  let proper = 0;
  let brief = 0;
  let notTested = 0;
  let missing = 0;

  for (const submission of submissions) {
    const value = submission.answers[answerId];
    if (value === "Tested properly") proper += 1;
    else if (value === "Only tried briefly") brief += 1;
    else if (value === "Didn't test") notTested += 1;
    else missing += 1;
  }

  const detail = `${label}: ${proper} proper · ${brief} brief · ${notTested} not tested${missing ? ` · ${missing} missing` : ""}.`;

  if (proper > 0) return { state: "evidenced", label: "Proper", detail };
  if (brief > 0) return { state: "partial", label: "Brief", detail };
  if (notTested > 0) return { state: "not_tested", label: "Not tested", detail };
  return { state: "unknown", label: "Unknown", detail };
}

function classifyDevice(device: string): "phone" | "desktop" | null {
  if (device === "Phone") return "phone";
  if (device === "Laptop" || device === "Desktop") return "desktop";
  return null;
}
