import { createFileRoute, Link } from "@tanstack/react-router";
import { Bug, Download, ExternalLink, RefreshCw, ShieldCheck, Star, Users, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { buildAdminBetaSections } from "@/features/admin-beta-test/sections";
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

      const paths = Array.from(new Set(rows.flatMap((row) => [
        ...(row.screenshot_paths ?? []),
        ...(row.bug_reports ?? []).map((bug) => bug.screenshotPath).filter((value): value is string => Boolean(value)),
      ])));

      const signed = await Promise.all(paths.map(async (path) => {
        const { data: result, error: signedError } = await supabase.storage.from("beta-feedback").createSignedUrl(path, 60 * 60);
        if (signedError || !result?.signedUrl) return null;
        return [path, result.signedUrl] as const;
      }));
      setSignedScreenshots(Object.fromEntries(signed.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load admin beta feedback.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bugCount = submissions.reduce((sum, row) => sum + (row.bug_reports?.length ?? 0), 0);
  const overall = average(submissions, "overallNow");
  const efficiency = average(submissions, "efficiency");
  const confidence = average(submissions, "confidence");
  const priorities = useMemo(() => submissions.map((row) => text(row.answers.priorityOne)).filter(Boolean), [submissions]);

  function exportCsv() {
    const questions = sections.flatMap((section) => section.questions);
    const headers = ["Tester", "Submitted", "Device", "Browser", "Familiarity", ...questions.map((question) => question.label), "Bug reports"];
    const rows = submissions.map((submission) => [
      submission.tester_name,
      submission.created_at,
      submission.device,
      submission.browser ?? "",
      submission.familiarity ?? "",
      ...questions.map((question) => csvValue(submission.answers[question.id])),
      JSON.stringify(submission.bug_reports ?? []),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => escapeCsv(String(value ?? ""))).join(",")).join("\n");
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
        eyebrow="Admin beta"
        title="Admin beta feedback"
        description="Organizer-workflow feedback stays separate from the public-site beta so navigation, safety and live-production problems are not mixed with public browsing feedback."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/beta-test" target="_blank" className="admin-action-secondary">Open form <ExternalLink className="size-4" /></Link>
            <button type="button" onClick={exportCsv} disabled={!submissions.length} className="admin-action-secondary"><Download className="size-4" /> Export CSV</button>
            <button type="button" onClick={() => void load()} disabled={loading} className="admin-action-primary"><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Refresh</button>
          </div>
        }
      />

      {error ? <AdminCard className="mb-4"><p className="text-sm text-rose-200">{error}</p></AdminCard> : null}

      <section className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Metric icon={Users} label="Responses" value={String(submissions.length)} />
        <Metric icon={Star} label="Overall" value={overall ? `${overall.toFixed(1)}/10` : "—"} />
        <Metric icon={Zap} label="Efficiency" value={efficiency ? `${efficiency.toFixed(1)}/10` : "—"} />
        <Metric icon={ShieldCheck} label="Live confidence" value={confidence ? `${confidence.toFixed(1)}/10` : "—"} />
        <Metric icon={Bug} label="Bugs" value={String(bugCount)} />
      </section>

      {priorities.length ? (
        <AdminCard className="mb-5">
          <AdminCardHeader eyebrow="Fix first" title="Tester priorities" description="Each tester's single highest-priority admin change." />
          <div className="divide-y divide-white/[0.07]">
            {priorities.map((priority, index) => <p key={`${priority}-${index}`} className="py-3 text-sm leading-6 first:pt-0 last:pb-0">{priority}</p>)}
          </div>
        </AdminCard>
      ) : null}

      {loading && !submissions.length ? <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading admin beta feedback…</p></AdminCard> : null}
      {!loading && !submissions.length ? <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">No admin beta responses yet.</p></AdminCard> : null}

      <div className="space-y-4">
        {submissions.map((submission) => (
          <AdminCard key={submission.id} className="!p-4 sm:!p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black">{submission.tester_name}</h2>
                  <AdminStatus tone="info">{submission.device}</AdminStatus>
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

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <AdminCard className="!p-3 sm:!p-4">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" /><p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p></div>
      <p className="numeric mt-3 text-2xl font-black">{value}</p>
    </AdminCard>
  );
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
