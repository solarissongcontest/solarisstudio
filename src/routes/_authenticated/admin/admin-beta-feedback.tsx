import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  ADMIN_BETA_COVERAGE,
  ADMIN_BETA_FORM_VERSION,
  buildAdminBetaSections,
} from "@/features/admin-beta-test/sections";
import { formatBetaAnswer, isBetaQuestionVisible } from "@/features/beta-test/sections";
import type { BetaAnswers } from "@/features/beta-test/types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/admin-beta-feedback")({
  head: () => ({
    meta: [
      { title: "Admin Beta Feedback — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminBetaFeedbackPage,
});

const EXPECTED_ADMIN_TEAM = 2;

type AdminBetaBug = {
  id?: string;
  page?: string;
  did?: string;
  expected?: string;
  instead?: string;
  reproducibility?: string;
  severity?: string;
  screenshotPath?: string;
};

type AdminBetaSubmission = {
  id: string;
  tester_name: string;
  device: string;
  browser: string | null;
  familiarity: string | null;
  answers: BetaAnswers;
  bug_reports: AdminBetaBug[];
  screenshot_paths: string[];
  user_agent: string | null;
  form_version: number;
  created_at: string;
};

type CoverageRow = (typeof ADMIN_BETA_COVERAGE)[number] & {
  proper: number;
  brief: number;
  skipped: number;
  missing: number;
  testedAtAll: number;
};

function AdminBetaFeedbackPage() {
  const [submissions, setSubmissions] = useState<AdminBetaSubmission[]>([]);
  const [signedScreenshots, setSignedScreenshots] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sections = useMemo(() => buildAdminBetaSections(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: selectError } = await supabase
        .from("admin_beta_test_submissions" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (selectError) throw selectError;

      const rows = (data ?? []) as unknown as AdminBetaSubmission[];
      setSubmissions(rows);

      const paths = Array.from(
        new Set(
          rows.flatMap((row) => [
            ...(row.screenshot_paths ?? []),
            ...(row.bug_reports ?? [])
              .map((bug) => bug.screenshotPath)
              .filter((value): value is string => Boolean(value)),
          ]),
        ),
      );

      const signed = await Promise.all(
        paths.map(async (path) => {
          const { data: result, error: signedError } = await supabase.storage
            .from("beta-feedback")
            .createSignedUrl(path, 60 * 60);
          if (signedError || !result?.signedUrl) return null;
          return [path, result.signedUrl] as const;
        }),
      );
      setSignedScreenshots(
        Object.fromEntries(
          signed.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load admin beta feedback.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latestByAdmin = useMemo(() => {
    const latest = new Map<string, AdminBetaSubmission>();
    for (const submission of submissions) {
      const key = submission.tester_name.trim().toLowerCase();
      if (key && !latest.has(key)) latest.set(key, submission);
    }
    return [...latest.values()];
  }, [submissions]);

  const coverage = useMemo<CoverageRow[]>(
    () =>
      ADMIN_BETA_COVERAGE.map((item) => {
        let proper = 0;
        let brief = 0;
        let skipped = 0;
        let missing = 0;
        for (const submission of latestByAdmin) {
          const value = submission.answers[item.answerId];
          if (value === "Tested properly") proper += 1;
          else if (value === "Only tried briefly") brief += 1;
          else if (value === "Didn't test") skipped += 1;
          else missing += 1;
        }
        return { ...item, proper, brief, skipped, missing, testedAtAll: proper + brief };
      }),
    [latestByAdmin],
  );

  const coverageGroups = useMemo(() => {
    const groups = new Map<string, CoverageRow[]>();
    coverage.forEach((row) => groups.set(row.group, [...(groups.get(row.group) ?? []), row]));
    return [...groups.entries()];
  }, [coverage]);

  const bugCount = submissions.reduce((sum, row) => sum + (row.bug_reports?.length ?? 0), 0);
  const overall = average(submissions, "overallNow");
  const efficiency = average(submissions, "efficiency");
  const confidence = average(submissions, "confidence");
  const priorities = useMemo(
    () => submissions.map((row) => text(row.answers.priorityOne)).filter(Boolean),
    [submissions],
  );
  const fullyCovered = coverage.filter((row) => row.proper >= EXPECTED_ADMIN_TEAM).length;
  const neverTested = coverage.filter((row) => row.testedAtAll === 0).length;
  const criticalGaps = coverage.filter(
    (row) => row.critical && row.testedAtAll < EXPECTED_ADMIN_TEAM,
  ).length;
  const outdatedResponses = submissions.filter(
    (submission) => submission.form_version < ADMIN_BETA_FORM_VERSION,
  ).length;

  function exportCsv() {
    const questions = sections.flatMap((section) => section.questions);
    const headers = [
      "Tester",
      "Submitted",
      "Device",
      "Browser",
      "Familiarity",
      "Form version",
      ...questions.map((question) => question.label),
      "Bug reports",
    ];
    const rows = submissions.map((submission) => [
      submission.tester_name,
      submission.created_at,
      submission.device,
      submission.browser ?? "",
      submission.familiarity ?? "",
      submission.form_version,
      ...questions.map((question) => csvValue(submission.answers[question.id])),
      JSON.stringify(submission.bug_reports ?? []),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => escapeCsv(String(value ?? ""))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `solaris-admin-beta-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Admin beta · acceptance coverage"
        title="Admin beta feedback"
        description={`The latest test pass from each admin is compared across ${ADMIN_BETA_COVERAGE.length} tracked admin surfaces. A feature is not considered fully covered until both admins have properly tested it.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/beta-test" target="_blank" className="admin-action-secondary">
              Open form <ExternalLink className="size-4" />
            </Link>
            <button type="button" onClick={exportCsv} disabled={!submissions.length} className="admin-action-secondary">
              <Download className="size-4" /> Export CSV
            </button>
            <button type="button" onClick={() => void load()} disabled={loading} className="admin-action-primary">
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Refresh
            </button>
          </div>
        }
      />

      {error ? <AdminCard className="mb-4"><p className="text-sm text-rose-200">{error}</p></AdminCard> : null}

      <section className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Metric icon={Users} label="Admins tested" value={`${Math.min(latestByAdmin.length, EXPECTED_ADMIN_TEAM)}/${EXPECTED_ADMIN_TEAM}`} />
        <Metric icon={CheckCircle2} label="Both tested properly" value={`${fullyCovered}/${coverage.length}`} />
        <Metric icon={AlertTriangle} label="Never tested" value={String(neverTested)} attention={neverTested > 0} />
        <Metric icon={ShieldCheck} label="Critical gaps" value={String(criticalGaps)} attention={criticalGaps > 0} />
        <Metric icon={Star} label="Overall" value={overall ? `${overall.toFixed(1)}/10` : "—"} />
        <Metric icon={Bug} label="Bugs" value={String(bugCount)} attention={bugCount > 0} />
      </section>

      {outdatedResponses ? (
        <AdminCard className="mb-5 !border-amber-200/15 !bg-amber-200/[0.045]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-100" />
            <div>
              <p className="text-sm font-semibold text-foreground">{outdatedResponses} response{outdatedResponses === 1 ? " uses" : "s use"} the older admin-beta form</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Only v{ADMIN_BETA_FORM_VERSION} contains the complete acceptance-test coverage map. Each admin should submit a fresh v{ADMIN_BETA_FORM_VERSION} pass before treating a blank area as tested.</p>
            </div>
          </div>
        </AdminCard>
      ) : null}

      <AdminCard className="mb-5">
        <AdminCardHeader
          eyebrow="Two-admin coverage"
          title="What has actually been tested?"
          description="Only each admin's newest submission counts here, so repeated test passes update coverage instead of inflating it. Brief testing counts as touched, but not fully covered."
        />
        <div className="space-y-5">
          {coverageGroups.map(([group, rows]) => (
            <section key={group}>
              <p className="admin-section-label mb-2">{group}</p>
              <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.07] bg-white/[0.015] px-3">
                {rows.map((row) => {
                  const tone = row.proper >= EXPECTED_ADMIN_TEAM
                    ? "ready"
                    : row.testedAtAll === 0
                      ? "blocked"
                      : "attention";
                  const label = row.proper >= EXPECTED_ADMIN_TEAM
                    ? "2/2 proper"
                    : row.testedAtAll === 0
                      ? "Untested"
                      : `${row.testedAtAll}/2 touched`;
                  return (
                    <div key={row.id} className="flex min-w-0 items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{row.label}</p>
                          {row.critical ? <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-100/70">Critical</span> : null}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Proper {row.proper} · Brief {row.brief} · Skipped {row.skipped}{row.missing ? ` · Older/missing ${row.missing}` : ""}</p>
                      </div>
                      <AdminStatus tone={tone}>{label}</AdminStatus>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </AdminCard>

      <section className="mb-5 grid gap-3 sm:grid-cols-2">
        <AdminCard>
          <AdminCardHeader eyebrow="Experience" title="Latest averages" />
          <div className="grid grid-cols-3 gap-2">
            <CompactMetric label="Overall" value={overall ? overall.toFixed(1) : "—"} />
            <CompactMetric label="Efficiency" value={efficiency ? efficiency.toFixed(1) : "—"} />
            <CompactMetric label="Live trust" value={confidence ? confidence.toFixed(1) : "—"} />
          </div>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader eyebrow="Latest admins" title={`${latestByAdmin.length}/${EXPECTED_ADMIN_TEAM} represented`} />
          <div className="space-y-2">
            {latestByAdmin.map((submission) => (
              <div key={submission.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{submission.tester_name}</p><p className="mt-1 text-[11px] text-muted-foreground">{submission.device} · v{submission.form_version} · {new Date(submission.created_at).toLocaleDateString()}</p></div>
                <AdminStatus tone={submission.form_version >= ADMIN_BETA_FORM_VERSION ? "ready" : "attention"}>{submission.form_version >= ADMIN_BETA_FORM_VERSION ? "Current" : "Retest"}</AdminStatus>
              </div>
            ))}
            {!latestByAdmin.length ? <p className="text-sm text-muted-foreground">No admin has submitted a test pass yet.</p> : null}
          </div>
        </AdminCard>
      </section>

      {priorities.length ? (
        <AdminCard className="mb-5">
          <AdminCardHeader eyebrow="Fix first" title="Tester priorities" description="Each submission's single highest-priority admin change." />
          <div className="divide-y divide-white/[0.07]">
            {priorities.map((priority, index) => <p key={`${priority}-${index}`} className="py-3 text-sm leading-6 first:pt-0 last:pb-0">{priority}</p>)}
          </div>
        </AdminCard>
      ) : null}

      {loading && !submissions.length ? <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading admin beta feedback…</p></AdminCard> : null}
      {!loading && !submissions.length ? <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">No admin beta responses yet. Both admins need a v{ADMIN_BETA_FORM_VERSION} pass before the coverage map can be considered complete.</p></AdminCard> : null}

      <div className="space-y-4">
        {submissions.map((submission) => (
          <AdminCard key={submission.id} className="!p-4 sm:!p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black">{submission.tester_name}</h2>
                  <AdminStatus tone="info">{submission.device}</AdminStatus>
                  <AdminStatus tone={submission.form_version >= ADMIN_BETA_FORM_VERSION ? "ready" : "attention"}>v{submission.form_version}</AdminStatus>
                  {typeof submission.answers.overallNow === "number" ? <AdminStatus tone="ready">{submission.answers.overallNow}/10</AdminStatus> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(submission.created_at).toLocaleString()} · {submission.browser ?? "Browser not given"} · {submission.familiarity ?? "Familiarity not given"}</p>
              </div>
              <p className="text-xs font-semibold text-muted-foreground">{submission.bug_reports?.length ?? 0} bug{(submission.bug_reports?.length ?? 0) === 1 ? "" : "s"}</p>
            </div>

            <details className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <summary className="cursor-pointer text-sm font-semibold">Full response</summary>
              <div className="mt-4 space-y-5">
                {sections.map((section) => {
                  const visible = section.questions.filter((question) => isBetaQuestionVisible(question, submission.answers));
                  return (
                    <section key={section.id}>
                      <h3 className="admin-section-label">{section.title}</h3>
                      <div className="mt-2 divide-y divide-white/[0.07]">
                        {visible.map((question) => (
                          <div key={question.id} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:gap-4">
                            <p className="text-xs font-semibold text-muted-foreground">{question.label}</p>
                            <p className="break-words text-xs leading-5 sm:text-right">{formatBetaAnswer(submission.answers[question.id])}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}

                {(submission.bug_reports ?? []).length ? (
                  <section>
                    <h3 className="admin-section-label">Bug reports</h3>
                    <div className="mt-2 space-y-3">
                      {submission.bug_reports.map((bug, index) => (
                        <div key={bug.id ?? index} className="rounded-xl border border-rose-200/10 bg-rose-200/[0.035] p-3 text-xs leading-5">
                          <p className="font-bold">Bug {index + 1} · {bug.page ?? "Unknown page"}</p>
                          <p className="mt-2"><span className="text-muted-foreground">Did:</span> {bug.did}</p>
                          <p><span className="text-muted-foreground">Expected:</span> {bug.expected}</p>
                          <p><span className="text-muted-foreground">Instead:</span> {bug.instead}</p>
                          <p className="mt-2 text-muted-foreground">{bug.reproducibility || "Reproducibility not given"} · {bug.severity || "Severity not given"}</p>
                          {bug.screenshotPath && signedScreenshots[bug.screenshotPath] ? <a href={signedScreenshots[bug.screenshotPath]} target="_blank" rel="noreferrer" className="mt-2 inline-flex font-semibold text-sky-100 underline">Open screenshot</a> : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </details>
          </AdminCard>
        ))}
      </div>
    </AdminPage>
  );
}

function Metric({ icon: Icon, label, value, attention = false }: { icon: typeof Users; label: string; value: string; attention?: boolean }) {
  return (
    <AdminCard className={`!p-3 sm:!p-4 ${attention ? "!border-amber-200/15 !bg-amber-200/[0.035]" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" /><p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p></div>
      <p className={`numeric mt-3 text-2xl font-black ${attention ? "text-amber-100" : ""}`}>{value}</p>
    </AdminCard>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center"><p className="numeric text-xl font-black">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{label}</p></div>;
}

function average(rows: AdminBetaSubmission[], key: string) {
  const values = rows.map((row) => row.answers[key]).filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function csvValue(value: unknown) {
  if (Array.isArray(value)) return value.join(" | ");
  if (value && typeof value === "object") return Object.entries(value as Record<string, string>).map(([key, answer]) => `${key}: ${answer}`).join(" | ");
  return value ?? "";
}

function escapeCsv(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
