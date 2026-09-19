import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Bug, ExternalLink, Gauge, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { formatBetaAnswer } from "@/features/beta-test/sections";
import {
  BETA3_FIRST_CLICK_EXPECTATIONS,
  BETA3_RELEASE_GATES,
  beta3NavigationSections,
} from "@/features/beta-test/sections-beta3-navigation";
import type { BetaAnswer, BetaAnswers } from "@/features/beta-test/types";
import { supabase } from "@/integrations/supabase/client";
import {
  evaluateBeta3FirstClickEvidence,
  type Beta3FirstClickEvidence,
} from "@/lib/beta3-release-evidence";
import { loadBeta3FirstClickEvidence } from "@/lib/public-ux-metrics";

export const Route = createFileRoute("/_authenticated/admin/beta3-feedback")({
  head: () => ({
    meta: [
      { title: "Beta 3 feedback — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Beta3FeedbackDashboard,
});

type BetaBug = {
  page?: string;
  did?: string;
  expected?: string;
  instead?: string;
  reproducibility?: string;
  severity?: string;
};

type Beta3Submission = {
  id: string;
  tester_name: string;
  device: string;
  browser: string | null;
  familiarity: string | null;
  answers: BetaAnswers;
  bug_reports: BetaBug[];
  created_at: string;
};

const questions = beta3NavigationSections.flatMap((section) => section.questions);
const outcomeQuestions = questions.filter((question) => question.id.endsWith("Outcome"));

function Beta3FeedbackDashboard() {
  const [submissions, setSubmissions] = useState<Beta3Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstClickEvidence, setFirstClickEvidence] =
    useState<Beta3FirstClickEvidence | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, firstClicks] = await Promise.all([
        supabase
          .from("beta3_test_submissions" as never)
          .select("*")
          .order("created_at", { ascending: false }),
        loadBeta3FirstClickEvidence(90),
      ]);
      if (result.error) throw result.error;
      setSubmissions((result.data ?? []) as unknown as Beta3Submission[]);
      setFirstClickEvidence(firstClicks);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Beta 3 feedback.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const attempts = submissions.length * outcomeQuestions.length;
    const successful = submissions.reduce(
      (sum, submission) =>
        sum + outcomeQuestions.filter((question) => successfulFind(submission.answers[question.id])).length,
      0,
    );
    const immediate = submissions.reduce(
      (sum, submission) =>
        sum + outcomeQuestions.filter(
          (question) => stringAnswer(submission.answers[question.id]) === "Found immediately",
        ).length,
      0,
    );
    const bugs = submissions.reduce(
      (sum, submission) => sum + (submission.bug_reports?.length ?? 0),
      0,
    );
    return {
      attempts,
      successful,
      immediate,
      bugs,
      successRate: attempts ? (successful / attempts) * 100 : null,
      immediateRate: attempts ? (immediate / attempts) * 100 : null,
    };
  }, [submissions]);

  const taskRows = useMemo(
    () =>
      outcomeQuestions.map((question) => {
        const section = beta3NavigationSections.find((item) =>
          item.questions.some((candidate) => candidate.id === question.id),
        );
        return {
          id: question.id,
          section: section?.title ?? question.id,
          success: percent(submissions, (submission) => successfulFind(submission.answers[question.id])),
          immediate: percent(
            submissions,
            (submission) => stringAnswer(submission.answers[question.id]) === "Found immediately",
          ),
        };
      }),
    [submissions],
  );

  const mobile = submissions.filter((submission) => ["Phone", "Tablet"].includes(submission.device));
  const desktop = submissions.filter((submission) => ["Laptop", "Desktop"].includes(submission.device));
  const mobileSuccess = overallTaskSuccess(mobile);
  const desktopSuccess = overallTaskSuccess(desktop);
  const deviceGap =
    mobileSuccess != null && desktopSuccess != null
      ? Math.abs(mobileSuccess - desktopSuccess)
      : null;

  const firstClickEvaluation = useMemo(
    () =>
      firstClickEvidence
        ? evaluateBeta3FirstClickEvidence(
            firstClickEvidence,
            BETA3_FIRST_CLICK_EXPECTATIONS,
          )
        : null,
    [firstClickEvidence],
  );
  const countryEntrySuccess = percent(
    submissions,
    (submission) => successfulFind(submission.answers.beta3CountryEntryOutcome),
  );
  const countryEntryFailures =
    countryEntrySuccess == null
      ? null
      : submissions.length -
        submissions.filter((submission) =>
          successfulFind(submission.answers.beta3CountryEntryOutcome),
        ).length;
  const releaseGates = [
    submissions.length >= BETA3_RELEASE_GATES.minimumResponses,
    summary.successRate != null &&
      summary.successRate >= BETA3_RELEASE_GATES.coreTaskSuccessPercent,
    firstClickEvaluation?.successRate != null &&
      firstClickEvaluation.successRate >= BETA3_RELEASE_GATES.firstClickSuccessPercent,
    percent(
      submissions,
      (submission) => successfulFind(submission.answers.beta3OldWinnerOutcome),
    ) != null &&
      (percent(
        submissions,
        (submission) => successfulFind(submission.answers.beta3OldWinnerOutcome),
      ) ?? 0) >= BETA3_RELEASE_GATES.oldEditionLookupPercent,
    countryEntryFailures != null && countryEntryFailures <= 1,
    deviceGap != null && deviceGap <= BETA3_RELEASE_GATES.mobileDesktopGapPercent,
  ];
  const passedReleaseGates = releaseGates.filter(Boolean).length;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-5">
        <AdminPageHeader
          eyebrow="Public beta"
          title="Beta 3 navigation"
          description="Task-based findability results for the public IA rebuild. Pair these self-reported outcomes with Public UX telemetry before deciding whether the new navigation has passed."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/public-ux" className="admin-action-secondary">
                Public UX <BarChart3 className="size-4" />
              </Link>
              <Link to="/beta-test" target="_blank" className="admin-action-secondary">
                Open Beta 3 <ExternalLink className="size-4" />
              </Link>
              <button type="button" onClick={() => void load()} disabled={loading} className="admin-action-secondary">
                <RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} /> Refresh
              </button>
            </div>
          }
        />

        {error ? (
          <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]">
            <p className="text-sm text-rose-100">{error}</p>
          </AdminCard>
        ) : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={Users} label="Responses" value={String(submissions.length)} />
          <Metric
            icon={Gauge}
            label="Task success"
            value={summary.successRate == null ? "—" : Math.round(summary.successRate) + "%"}
          />
          <Metric
            icon={BarChart3}
            label="Immediate finds"
            value={summary.immediateRate == null ? "—" : Math.round(summary.immediateRate) + "%"}
          />
          <Metric icon={Bug} label="Bugs" value={String(summary.bugs)} />
        </section>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Release gates"
            title="Beta 3 thresholds"
            description="The release gate now combines tester outcomes with observed first-destination telemetry. Missing first-click telemetry counts against the measured rate instead of quietly disappearing."
          />
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <AdminStatus
              tone={
                submissions.length > 0 &&
                passedReleaseGates === releaseGates.length
                  ? "ready"
                  : "attention"
              }
            >
              {submissions.length > 0 && passedReleaseGates === releaseGates.length
                ? "Release gates passed"
                : `${passedReleaseGates}/${releaseGates.length} gates passed`}
            </AdminStatus>
            <span className="text-xs text-muted-foreground">
              {submissions.length} completed Beta 3 response{submissions.length === 1 ? "" : "s"} ·{" "}
              {firstClickEvaluation?.started ?? 0} observed task run
              {(firstClickEvaluation?.started ?? 0) === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <GateCountCard
              label="Comparable sample"
              value={submissions.length}
              target={BETA3_RELEASE_GATES.minimumResponses}
              detail="Overall rollout readiness stays blocked until the Beta 3 sample is large enough to compare with the previous test."
              lowerIsBetter={false}
            />
            <GateCard
              label="Core task success"
              value={summary.successRate}
              target={BETA3_RELEASE_GATES.coreTaskSuccessPercent}
            />
            <GateCard
              label="Observed first-click success"
              value={firstClickEvaluation?.successRate ?? null}
              target={BETA3_RELEASE_GATES.firstClickSuccessPercent}
              detail={
                firstClickEvaluation?.coveragePercent == null
                  ? "No Beta 3 first-destination telemetry yet."
                  : `${Math.round(firstClickEvaluation.coveragePercent)}% of started tasks have an observed first destination.`
              }
            />
            <GateCard
              label="Old edition lookup"
              value={percent(submissions, (submission) => successfulFind(submission.answers.beta3OldWinnerOutcome))}
              target={BETA3_RELEASE_GATES.oldEditionLookupPercent}
            />
            <GateCountCard
              label="Country entry lookup failures"
              value={countryEntryFailures}
              target={1}
              detail="Original plan target: 0–1 failures at a comparable test size."
            />
            <GateCard
              label="Mobile / desktop gap"
              value={deviceGap}
              target={BETA3_RELEASE_GATES.mobileDesktopGapPercent}
              lowerIsBetter
            />
            <GateCard
              label="Self-reported immediate finds"
              value={summary.immediateRate}
              target={BETA3_RELEASE_GATES.firstClickSuccessPercent}
              supporting
              detail="Supporting signal only. The release gate uses observed first-destination telemetry above."
            />
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Task matrix"
            title="Where people still struggle"
            description="Success includes immediate, eventually and difficult-but-found outcomes. Immediate stays separate because findability should not require a scavenger hunt."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-white/[0.08] text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Task</th>
                  <th className="px-3 py-2 text-right font-semibold">Success</th>
                  <th className="px-3 py-2 text-right font-semibold">Immediate</th>
                  <th className="pl-3 py-2 text-right font-semibold">Responses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {taskRows.map((task) => (
                  <tr key={task.id}>
                    <td className="py-3 pr-3 font-semibold">{task.section}</td>
                    <td className="px-3 py-3 text-right">
                      {task.success == null ? "—" : Math.round(task.success) + "%"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {task.immediate == null ? "—" : Math.round(task.immediate) + "%"}
                    </td>
                    <td className="pl-3 py-3 text-right text-muted-foreground">{submissions.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Responses"
            title={loading ? "Loading…" : submissions.length + " Beta 3 response" + (submissions.length === 1 ? "" : "s")}
            description="Open a tester to inspect task outcomes, expected locations and reproducible bug reports."
          />
          {!loading && !submissions.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No Beta 3 responses yet.</p>
          ) : (
            <div className="space-y-2">
              {submissions.map((submission) => (
                <details key={submission.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
                  <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{submission.tester_name}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {submission.device}
                          {submission.browser ? " · " + submission.browser : ""}
                          {submission.familiarity ? " · " + submission.familiarity : ""}
                          {" · " + new Date(submission.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <AdminStatus tone="info">{Math.round(submissionTaskSuccess(submission))}% tasks</AdminStatus>
                        <AdminStatus tone={(submission.bug_reports?.length ?? 0) ? "attention" : "ready"}>
                          {submission.bug_reports?.length ?? 0} bugs
                        </AdminStatus>
                      </div>
                    </div>
                  </summary>
                  <div className="border-t border-white/[0.07] p-4">
                    <div className="divide-y divide-white/[0.06]">
                      {questions.map((question) => {
                        const value = submission.answers[question.id];
                        if (
                          value === undefined ||
                          value === "" ||
                          (Array.isArray(value) && !value.length)
                        ) return null;
                        return (
                          <div
                            key={question.id}
                            className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:gap-5"
                          >
                            <p className="text-xs font-semibold text-muted-foreground">{question.label}</p>
                            <p className="break-words text-xs leading-5 sm:text-right">
                              {formatBetaAnswer(value as BetaAnswer)}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {submission.bug_reports?.length ? (
                      <div className="mt-4 space-y-2">
                        <p className="admin-section-label">Bug reports</p>
                        {submission.bug_reports.map((bug, index) => (
                          <div
                            key={submission.id + "-bug-" + index}
                            className="rounded-xl border border-amber-200/10 bg-amber-200/[0.035] p-3 text-xs leading-5"
                          >
                            <p className="font-semibold">{bug.page || "Bug " + (index + 1)}</p>
                            <p className="mt-1 text-muted-foreground">Did: {bug.did}</p>
                            <p className="text-muted-foreground">Expected: {bug.expected}</p>
                            <p className="text-muted-foreground">Instead: {bug.instead}</p>
                            <p className="mt-1 text-muted-foreground">
                              {bug.reproducibility || "Unknown repeatability"} · {bug.severity || "No severity"}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="admin-card p-3 sm:p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <p className="text-[11px] font-semibold">{label}</p>
      </div>
      <p className="numeric mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function GateCard({
  label,
  value,
  target,
  lowerIsBetter = false,
  detail,
  supporting = false,
}: {
  label: string;
  value: number | null;
  target: number;
  lowerIsBetter?: boolean;
  detail?: string;
  supporting?: boolean;
}) {
  const passed = value != null && (lowerIsBetter ? value <= target : value >= target);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold">{label}</p>
        <AdminStatus
          tone={
            supporting
              ? "info"
              : value == null
                ? "neutral"
                : passed
                  ? "ready"
                  : "attention"
          }
        >
          {supporting ? "Supporting" : `${lowerIsBetter ? "≤ " : "≥ "}${target}%`}
        </AdminStatus>
      </div>
      <p className="numeric mt-3 text-2xl font-bold">
        {value == null ? "—" : Math.round(value) + "%"}
      </p>
      {detail ? <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function GateCountCard({
  label,
  value,
  target,
  detail,
  lowerIsBetter = true,
}: {
  label: string;
  value: number | null;
  target: number;
  detail: string;
  lowerIsBetter?: boolean;
}) {
  const passed =
    value != null && (lowerIsBetter ? value <= target : value >= target);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold">{label}</p>
        <AdminStatus tone={value == null ? "neutral" : passed ? "ready" : "attention"}>
          {lowerIsBetter ? "≤ " : "≥ "}{target}
        </AdminStatus>
      </div>
      <p className="numeric mt-3 text-2xl font-bold">{value == null ? "—" : value}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </div>
  );
}

function stringAnswer(value: BetaAnswer | undefined) {
  return typeof value === "string" ? value : "";
}

function successfulFind(value: BetaAnswer | undefined) {
  const answer = stringAnswer(value);
  return Boolean(answer) && answer !== "Could not find it";
}

function percent(
  submissions: Beta3Submission[],
  predicate: (submission: Beta3Submission) => boolean,
) {
  if (!submissions.length) return null;
  return (submissions.filter(predicate).length / submissions.length) * 100;
}

function submissionTaskSuccess(submission: Beta3Submission) {
  if (!outcomeQuestions.length) return 0;
  const successful = outcomeQuestions.filter((question) =>
    successfulFind(submission.answers[question.id]),
  ).length;
  return (successful / outcomeQuestions.length) * 100;
}

function overallTaskSuccess(submissions: Beta3Submission[]) {
  if (!submissions.length || !outcomeQuestions.length) return null;
  const attempts = submissions.length * outcomeQuestions.length;
  const successful = submissions.reduce(
    (sum, submission) =>
      sum + outcomeQuestions.filter((question) => successfulFind(submission.answers[question.id])).length,
    0,
  );
  return (successful / attempts) * 100;
}
