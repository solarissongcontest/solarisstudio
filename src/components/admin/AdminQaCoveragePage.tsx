import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bug,
  Download,
  ExternalLink,
  GitCommit,
  Keyboard,
  Laptop,
  Network,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Users,
  UsersRound,
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
import {
  buildAdminQaCoverageMatrix,
  latestQaCoverageSubmissions,
  summarizeAdminQaCoverage,
  type QaCoverageEvidence,
} from "@/lib/admin-qa-coverage";
import { rowsToSpreadsheetSafeCsv } from "@/lib/spreadsheet-safe-csv";

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
  form_version: number;
  created_at: string;
};

export function AdminQaCoveragePage() {
  const [submissions, setSubmissions] = useState<AdminBetaSubmission[]>([]);
  const [signedScreenshots, setSignedScreenshots] = useState<Record<string, string>>({});
  const [screenshotLoading, setScreenshotLoading] = useState<Record<string, boolean>>({});
  const [screenshotErrors, setScreenshotErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sections = useMemo(() => buildAdminBetaSections(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: selectError } = await supabase
        .from("admin_beta_test_submissions" as never)
        .select("id,tester_name,device,browser,familiarity,answers,bug_reports,form_version,created_at")
        .order("created_at", { ascending: false });
      if (selectError) throw selectError;

      setSubmissions((data ?? []) as unknown as AdminBetaSubmission[]);
      setSignedScreenshots({});
      setScreenshotLoading({});
      setScreenshotErrors({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Organizer QA evidence.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScreenshot = useCallback(
    async (path: string) => {
      if (signedScreenshots[path] || screenshotLoading[path]) return;

      setScreenshotLoading((current) => ({ ...current, [path]: true }));
      setScreenshotErrors((current) => {
        const next = { ...current };
        delete next[path];
        return next;
      });

      try {
        const { data: result, error: signedError } = await supabase.storage
          .from("beta-feedback")
          .createSignedUrl(path, 60 * 60);
        if (signedError || !result?.signedUrl) throw signedError ?? new Error("Missing signed URL");
        setSignedScreenshots((current) => ({ ...current, [path]: result.signedUrl }));
      } catch {
        setScreenshotErrors((current) => ({
          ...current,
          [path]: "Could not load screenshot. Try again.",
        }));
      } finally {
        setScreenshotLoading((current) => ({ ...current, [path]: false }));
      }
    },
    [signedScreenshots, screenshotLoading],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const latestByAdmin = useMemo(
    () => latestQaCoverageSubmissions(submissions),
    [submissions],
  );

  const matrix = useMemo(
    () =>
      buildAdminQaCoverageMatrix({
        capabilities: ADMIN_BETA_COVERAGE,
        sections,
        submissions,
        currentFormVersion: ADMIN_BETA_FORM_VERSION,
      }),
    [sections, submissions],
  );

  const matrixGroups = useMemo(() => {
    const groups = new Map<string, typeof matrix>();
    for (const row of matrix) {
      groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
    }
    return [...groups.entries()];
  }, [matrix]);

  const matrixSummary = useMemo(() => summarizeAdminQaCoverage(matrix), [matrix]);
  const phoneEvidenceRows = matrix.filter((row) => row.phone.state === "evidenced").length;
  const desktopEvidenceRows = matrix.filter((row) => row.desktop.state === "evidenced").length;
  const bugCount = submissions.reduce((sum, row) => sum + (row.bug_reports?.length ?? 0), 0);
  const overall = average(submissions, "overallNow");
  const efficiency = average(submissions, "efficiency");
  const confidence = average(submissions, "confidence");
  const priorities = useMemo(
    () => submissions.map((row) => text(row.answers.priorityOne)).filter(Boolean),
    [submissions],
  );
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
    const csv = rowsToSpreadsheetSafeCsv([headers, ...rows]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `solaris-organizer-qa-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Product QA · evidence matrix"
        title="QA Coverage"
        description="Scenario-level Organizer evidence across phone, desktop, keyboard, two-admin, offline/reconnect and exact-SHA dimensions. Unknown stays unknown until Solaris has actual evidence for it."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/beta-test" target="_blank" className="admin-action-secondary">
              Acceptance test <ExternalLink className="size-4" />
            </Link>
            <button type="button" onClick={exportCsv} disabled={!submissions.length} className="admin-action-secondary">
              <Download className="size-4" /> Export responses
            </button>
            <button type="button" onClick={() => void load()} disabled={loading} className="admin-action-primary">
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Refresh
            </button>
          </div>
        }
      />

      {error ? (
        <AdminCard className="mb-4 !border-rose-200/15 !bg-rose-200/[0.035]">
          <p className="text-sm font-semibold text-rose-100">QA evidence could not be loaded.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p>
        </AdminCard>
      ) : null}

      <section className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Metric icon={Users} label="Current testers" value={`${Math.min(latestByAdmin.filter((row) => row.form_version >= ADMIN_BETA_FORM_VERSION).length, EXPECTED_ADMIN_TEAM)}/${EXPECTED_ADMIN_TEAM}`} />
        <Metric icon={Smartphone} label="Phone evidenced" value={`${phoneEvidenceRows}/${matrix.length}`} />
        <Metric icon={Laptop} label="Desktop evidenced" value={`${desktopEvidenceRows}/${matrix.length}`} />
        <Metric icon={AlertTriangle} label="Unknown cells" value={`${matrixSummary.unknownCells}/${matrixSummary.totalCells}`} attention={matrixSummary.unknownCells > 0} />
        <Metric icon={ShieldCheck} label="Critical device gaps" value={String(matrixSummary.criticalRowsWithNoDeviceEvidence)} attention={matrixSummary.criticalRowsWithNoDeviceEvidence > 0} />
        <Metric icon={Bug} label="Reported bugs" value={String(bugCount)} attention={bugCount > 0} />
      </section>

      <AdminCard className="mb-5 !border-amber-200/15 !bg-amber-200/[0.045]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-100" />
          <div>
            <p className="text-sm font-semibold">Coverage is evidence, not optimism</p>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
              Current manual submissions can evidence capability use on phone and desktop. They do not yet bind every capability to keyboard testing, offline/reconnect behavior or an exact commit SHA. Those cells remain Unknown and block a parity claim instead of quietly becoming green.
            </p>
          </div>
        </div>
      </AdminCard>

      {outdatedResponses ? (
        <AdminCard className="mb-5 !border-amber-200/15 !bg-amber-200/[0.035]">
          <p className="text-sm font-semibold">{outdatedResponses} older response{outdatedResponses === 1 ? "" : "s"} excluded from matrix evidence</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Only the current acceptance form v{ADMIN_BETA_FORM_VERSION} contributes to the canonical coverage matrix.</p>
        </AdminCard>
      ) : null}

      <AdminCard className="mb-5">
        <AdminCardHeader
          eyebrow="Canonical O16 matrix"
          title="Capability × scenario × environment"
          description="Each row comes from a real Organizer acceptance-test capability and its scenario section. Manual evidence is deliberately weaker than release certification; exact-SHA cells remain unknown until test evidence is bound to a commit."
        />
        <div className="space-y-6">
          {matrixGroups.map(([group, rows]) => (
            <section key={group}>
              <p className="admin-section-label mb-2">{group}</p>
              <div className="space-y-2">
                {rows.map((row) => (
                  <article key={row.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 sm:p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{row.capability}</h3>
                          {row.critical ? <AdminStatus tone="attention">Critical</AdminStatus> : null}
                          <a href={row.href} className="text-xs font-semibold text-sky-100 underline underline-offset-2">Open capability</a>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-muted-foreground">Scenario: {row.scenario}</p>
                        {row.scenarioDetail ? <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">{row.scenarioDetail}</p> : null}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                      <EvidenceTile icon={Smartphone} label="Phone" evidence={row.phone} />
                      <EvidenceTile icon={Laptop} label="Desktop" evidence={row.desktop} />
                      <EvidenceTile icon={Keyboard} label="Keyboard" evidence={row.keyboard} />
                      <EvidenceTile icon={UsersRound} label="Two-admin" evidence={row.twoAdmin} />
                      <EvidenceTile icon={Network} label="Offline / reconnect" evidence={row.offlineReconnect} />
                      <EvidenceTile icon={GitCommit} label="Passed SHA" evidence={row.passedSha} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </AdminCard>

      <section className="mb-5 grid gap-3 sm:grid-cols-2">
        <AdminCard>
          <AdminCardHeader eyebrow="Experience" title="Latest response averages" />
          <div className="grid grid-cols-3 gap-2">
            <CompactMetric label="Overall" value={overall ? overall.toFixed(1) : "—"} />
            <CompactMetric label="Efficiency" value={efficiency ? efficiency.toFixed(1) : "—"} />
            <CompactMetric label="Live trust" value={confidence ? confidence.toFixed(1) : "—"} />
          </div>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader eyebrow="Latest testers" title={`${latestByAdmin.length}/${EXPECTED_ADMIN_TEAM} represented`} />
          <div className="space-y-2">
            {latestByAdmin.map((submission) => (
              <div key={submission.tester_name.toLowerCase()} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{submission.tester_name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{submission.device} · v{submission.form_version} · {new Date(submission.created_at).toLocaleDateString()}</p>
                </div>
                <AdminStatus tone={submission.form_version >= ADMIN_BETA_FORM_VERSION ? "ready" : "attention"}>{submission.form_version >= ADMIN_BETA_FORM_VERSION ? "Current" : "Retest"}</AdminStatus>
              </div>
            ))}
            {!latestByAdmin.length ? <p className="text-sm text-muted-foreground">No admin has submitted an acceptance pass yet.</p> : null}
          </div>
        </AdminCard>
      </section>

      {priorities.length ? (
        <AdminCard className="mb-5">
          <AdminCardHeader eyebrow="Fix first" title="Tester priorities" description="Each submission's highest-priority Organizer change." />
          <div className="divide-y divide-white/[0.07]">
            {priorities.map((priority, index) => <p key={`${priority}-${index}`} className="py-3 text-sm leading-6 first:pt-0 last:pb-0">{priority}</p>)}
          </div>
        </AdminCard>
      ) : null}

      {loading && !submissions.length ? <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading Organizer QA evidence…</p></AdminCard> : null}
      {!loading && !submissions.length ? <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">No Organizer acceptance responses yet. Unknown evidence remains unknown until a current-form pass exists.</p></AdminCard> : null}

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
                      {submission.bug_reports.map((bug, index) => {
                        const screenshotPath = bug.screenshotPath;
                        return (
                          <div key={bug.id ?? index} className="rounded-xl border border-rose-200/10 bg-rose-200/[0.035] p-3 text-xs leading-5">
                            <p className="font-bold">Bug {index + 1} · {bug.page ?? "Unknown page"}</p>
                            <p className="mt-2"><span className="text-muted-foreground">Did:</span> {bug.did}</p>
                            <p><span className="text-muted-foreground">Expected:</span> {bug.expected}</p>
                            <p><span className="text-muted-foreground">Instead:</span> {bug.instead}</p>
                            <p className="mt-2 text-muted-foreground">{bug.reproducibility || "Reproducibility not given"} · {bug.severity || "Severity not given"}</p>
                            {screenshotPath ? (
                              <div className="mt-2">
                                {signedScreenshots[screenshotPath] ? (
                                  <a href={signedScreenshots[screenshotPath]} target="_blank" rel="noreferrer" className="inline-flex font-semibold text-sky-100 underline">
                                    Open screenshot
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void loadScreenshot(screenshotPath)}
                                    disabled={Boolean(screenshotLoading[screenshotPath])}
                                    className="font-semibold text-sky-100 underline disabled:cursor-wait disabled:opacity-60"
                                  >
                                    {screenshotLoading[screenshotPath] ? "Loading screenshot…" : "Load screenshot"}
                                  </button>
                                )}
                                {screenshotErrors[screenshotPath] ? (
                                  <p className="mt-1 text-[11px] text-rose-100">{screenshotErrors[screenshotPath]}</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
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

function EvidenceTile({ icon: Icon, label, evidence }: { icon: typeof Smartphone; label: string; evidence: QaCoverageEvidence }) {
  const tone = evidence.state === "evidenced"
    ? "ready"
    : evidence.state === "partial"
      ? "attention"
      : evidence.state === "not_tested"
        ? "blocked"
        : "neutral";

  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 p-3" title={evidence.detail}>
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-3.5 shrink-0" /><p className="truncate text-[10px] font-bold uppercase tracking-[0.1em]">{label}</p></div>
      <div className="mt-2"><AdminStatus tone={tone}>{evidence.label}</AdminStatus></div>
      <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{evidence.detail}</p>
    </div>
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
