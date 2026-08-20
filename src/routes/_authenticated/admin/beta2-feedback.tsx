import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Bug, ExternalLink, History, RefreshCw, Star, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { betaSections, formatBetaAnswer } from "@/features/beta-test/sections";
import type { BetaAnswer, BetaAnswers } from "@/features/beta-test/types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/beta2-feedback")({
  head: () => ({
    meta: [
      { title: "Beta 2 feedback — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Beta2FeedbackDashboard,
});

type BetaBug = {
  page?: string;
  did?: string;
  expected?: string;
  instead?: string;
  reproducibility?: string;
  severity?: string;
};

type Beta2Submission = {
  id: string;
  tester_name: string;
  device: string;
  browser: string | null;
  familiarity: string | null;
  answers: BetaAnswers;
  bug_reports: BetaBug[];
  created_at: string;
};

const questions = betaSections.flatMap((section) => section.questions);

function Beta2FeedbackDashboard() {
  const [submissions, setSubmissions] = useState<Beta2Submission[]>([]);
  const [beta1Count, setBeta1Count] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [beta2, beta1] = await Promise.all([
        supabase.from("beta2_test_submissions" as never).select("*").order("created_at", { ascending: false }),
        supabase.from("beta_test_submissions" as never).select("id", { count: "exact", head: true }),
      ]);
      if (beta2.error) throw beta2.error;
      if (beta1.error) throw beta1.error;
      setSubmissions((beta2.data ?? []) as unknown as Beta2Submission[]);
      setBeta1Count(beta1.count ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Beta 2 feedback.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const bugCount = submissions.reduce((sum, item) => sum + (item.bug_reports?.length ?? 0), 0);
    return {
      overall: averageNumber(submissions, "overallNow"),
      ease: averageNumber(submissions, "ease"),
      recommend: averageNumber(submissions, "recommend"),
      readiness: averagePercent(submissions, "releaseReadinessPercent"),
      activity: averageNumber(submissions, "activityPoints"),
      bugCount,
    };
  }, [submissions]);

  const comparisons = useMemo(
    () => [
      {
        label: "Search target found immediately",
        beta1: "5 / 11",
        beta2: countLabel(submissions, (s) => stringAnswer(s.answers.searchSuccess) === "Immediately"),
      },
      {
        label: "Country entries found easily",
        beta1: "7 / 11",
        beta2: countLabel(submissions, (s) => matrixAnswer(s.answers.countryTasks, "What entries has it sent?") === "Yes, easily"),
      },
      {
        label: "Pulse explored a lot",
        beta1: "4 / 11",
        beta2: countLabel(submissions, (s) => stringAnswer(s.answers.pulseExplore) === "Yes, a lot"),
      },
      {
        label: "Had a visual/responsive problem",
        beta1: "6 / 11",
        beta2: countLabel(submissions, (s) => hasVisualProblem(s.answers.visualProblems)),
      },
      {
        label: "Analysis needed more explanation",
        beta1: "4 / 11",
        beta2: countLabel(submissions, (s) => multiAnswer(s.answers.analysisProblem).includes("Needed more explanation")),
      },
    ],
    [submissions],
  );

  const targets = useMemo(
    () => [
      { label: "Create account", value: percent(submissions, (s) => successfulFind(s.answers.accountFindSuccess)), target: 90 },
      { label: "Find confirmation", value: percent(submissions, (s) => successfulFind(s.answers.confirmationFindSuccess)), target: 85 },
      { label: "Confirmation edit/save", value: percent(submissions, (s) => stringAnswer(s.answers.confirmationPersisted) === "Yes"), target: 90 },
      { label: "Guide found", value: percent(submissions, (s) => successfulFind(s.answers.guideFindSuccess)), target: 90 },
      { label: "Search immediate", value: percent(submissions, (s) => stringAnswer(s.answers.searchSuccess) === "Immediately"), target: 80 },
      { label: "Pulse meaningful", value: percent(submissions, (s) => stringAnswer(s.answers.pulseExplore) === "Yes, a lot"), target: 70 },
      { label: "Analysis purpose clear", value: percent(submissions, (s) => ["Completely clear", "Mostly clear"].includes(stringAnswer(s.answers.analysisPurpose))), target: 80 },
      { label: "Public design change worked", value: percent(submissions, (s) => matrixAnswer(s.answers.countryEditActions, "See the change on the public page") === "Worked"), target: 90 },
    ],
    [submissions],
  );

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-5">
        <AdminPageHeader
          eyebrow="Public beta"
          title="Beta 2.0 feedback"
          description="Beta 2 responses stay separate from the closed Beta 1 archive, with direct before/after benchmarks for the problems Beta 1 exposed."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/beta-test" target="_blank" className="admin-action-secondary">
                Open Beta 2 form <ExternalLink className="size-4" />
              </Link>
              <button type="button" onClick={() => void load()} disabled={loading} className="admin-action-secondary">
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          }
        />

        {error ? (
          <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]">
            <p className="text-sm text-rose-100">{error}</p>
          </AdminCard>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={Users} label="Beta 2 responses" value={String(submissions.length)} />
          <Metric icon={Star} label="Overall" value={summary.overall == null ? "—" : `${summary.overall.toFixed(1)}/10`} />
          <Metric icon={BarChart3} label="Ease" value={summary.ease == null ? "—" : `${summary.ease.toFixed(1)}/10`} />
          <Metric icon={Bug} label="Bugs" value={String(summary.bugCount)} />
          <Metric icon={Star} label="Recommend" value={summary.recommend == null ? "—" : `${summary.recommend.toFixed(1)}/10`} />
          <Metric icon={BarChart3} label="Release readiness" value={summary.readiness == null ? "—" : `${Math.round(summary.readiness)}%`} />
          <Metric icon={Star} label="Avg activity points" value={summary.activity == null ? "—" : Math.round(summary.activity).toString()} />
          <Metric icon={History} label="Beta 1 archived" value={String(beta1Count)} />
        </div>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Before / after"
            title="Beta 1 weaknesses"
            description="These use the real Beta 1 counts instead of invented average scores."
            action={
              <Link to="/admin/beta1-feedback" className="admin-action-secondary !min-h-10">
                Open Beta 1 archive
              </Link>
            }
          />
          <div className="divide-y divide-white/[0.07]">
            {comparisons.map((item) => (
              <div key={item.label} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5">
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="text-xs text-muted-foreground">Beta 1: <strong className="text-foreground">{item.beta1}</strong></p>
                <p className="text-xs text-muted-foreground">Beta 2: <strong className="text-primary">{item.beta2}</strong></p>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Release criteria"
            title="Critical task targets"
            description="Two independent failures of the same critical task should still be treated as a pre-release issue even when the percentage looks acceptable."
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {targets.map((item) => {
              const ready = item.value != null && item.value >= item.target;
              return (
                <div key={item.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold">{item.label}</p>
                    <AdminStatus tone={item.value == null ? "neutral" : ready ? "ready" : "attention"}>
                      target {item.target}%
                    </AdminStatus>
                  </div>
                  <p className="numeric mt-3 text-2xl font-bold">{item.value == null ? "—" : `${Math.round(item.value)}%`}</p>
                </div>
              );
            })}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Responses"
            title={loading ? "Loading…" : `${submissions.length} Beta 2 response${submissions.length === 1 ? "" : "s"}`}
            description="Open a tester to read every answer and structured bug report."
          />
          {!loading && !submissions.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No Beta 2 responses yet.</p>
          ) : (
            <div className="space-y-2">
              {submissions.map((submission) => (
                <details key={submission.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
                  <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{submission.tester_name}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {submission.device}{submission.browser ? ` · ${submission.browser}` : ""} · {new Date(submission.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <AdminStatus tone="info">{Number(submission.answers.activityPoints ?? 0)} pts</AdminStatus>
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
                        if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) return null;
                        return (
                          <div key={question.id} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:gap-5">
                            <p className="text-xs font-semibold text-muted-foreground">{question.label}</p>
                            <p className="break-words text-xs leading-5 sm:text-right">{formatBetaAnswer(value as BetaAnswer)}</p>
                          </div>
                        );
                      })}
                    </div>
                    {submission.bug_reports?.length ? (
                      <div className="mt-4 space-y-2">
                        <p className="admin-section-label">Bug reports</p>
                        {submission.bug_reports.map((bug, index) => (
                          <div key={`${submission.id}-bug-${index}`} className="rounded-xl border border-amber-200/10 bg-amber-200/[0.035] p-3 text-xs leading-5">
                            <p className="font-semibold">{bug.page || `Bug ${index + 1}`}</p>
                            <p className="mt-1 text-muted-foreground">Did: {bug.did}</p>
                            <p className="text-muted-foreground">Expected: {bug.expected}</p>
                            <p className="text-muted-foreground">Instead: {bug.instead}</p>
                            <p className="mt-1 text-muted-foreground">{bug.reproducibility || "Unknown repeatability"} · {bug.severity || "No severity"}</p>
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

function stringAnswer(value: BetaAnswer | undefined) {
  return typeof value === "string" ? value : "";
}

function multiAnswer(value: BetaAnswer | undefined) {
  return Array.isArray(value) ? value : [];
}

function matrixAnswer(value: BetaAnswer | undefined, row: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return "";
  return value[row] ?? "";
}

function successfulFind(value: BetaAnswer | undefined) {
  const answer = stringAnswer(value);
  return Boolean(answer) && answer !== "Could not find it";
}

function hasVisualProblem(value: BetaAnswer | undefined) {
  const answers = multiAnswer(value);
  return answers.length > 0 && !answers.includes("None of these");
}

function percent(submissions: Beta2Submission[], predicate: (submission: Beta2Submission) => boolean) {
  if (!submissions.length) return null;
  return (submissions.filter(predicate).length / submissions.length) * 100;
}

function countLabel(submissions: Beta2Submission[], predicate: (submission: Beta2Submission) => boolean) {
  if (!submissions.length) return "0 / 0";
  return `${submissions.filter(predicate).length} / ${submissions.length}`;
}

function averageNumber(submissions: Beta2Submission[], key: string) {
  const values = submissions
    .map((submission) => submission.answers[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averagePercent(submissions: Beta2Submission[], key: string) {
  const values = submissions
    .map((submission) => String(submission.answers[key] ?? "").replace("%", "").trim())
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
