import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, History, Loader2, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { beta1Sections } from "@/features/beta-test/sections-beta1";
import { formatBetaAnswer, isBetaQuestionVisible } from "@/features/beta-test/sections";
import type { BetaAnswer, BetaAnswers } from "@/features/beta-test/types";
import { supabase } from "@/integrations/supabase/client";
import { rowsToSpreadsheetSafeCsv } from "@/lib/spreadsheet-safe-csv";

export const Route = createFileRoute("/_authenticated/admin/beta1-feedback")({
  head: () => ({
    meta: [
      { title: "Beta 1 archive — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Beta1ArchivePage,
});

type BetaBug = {
  page?: string;
  did?: string;
  expected?: string;
  instead?: string;
  reproducibility?: string;
  severity?: string;
};

type Beta1Submission = {
  id: string;
  tester_name: string;
  device: string;
  browser: string | null;
  familiarity: string | null;
  answers: BetaAnswers;
  bug_reports: BetaBug[];
  form_version: number;
  created_at: string;
};

const BETA1_PAGE_SIZE = 50;
const BETA1_EXPORT_PAGE_SIZE = 250;
const BETA1_EXPORT_MAX_ROWS = 5_000;
const BETA1_COLUMNS =
  "id,tester_name,device,browser,familiarity,answers,bug_reports,form_version,created_at";

const questions = beta1Sections.flatMap((section) => section.questions);

async function fetchBeta1Page(offset: number, pageSize: number) {
  const { data, error, count } = await supabase
    .from("beta_test_submissions" as never)
    .select(BETA1_COLUMNS, { count: "exact" })
    .eq("form_version", 2)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as Beta1Submission[],
    totalCount: count ?? 0,
  };
}

function Beta1ArchivePage() {
  const [submissions, setSubmissions] = useState<Beta1Submission[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchBeta1Page(0, BETA1_PAGE_SIZE);
      setSubmissions(page.rows);
      setTotalCount(page.totalCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the Beta 1 archive.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasMore = totalCount !== null && submissions.length < totalCount;

  const loadMore = async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchBeta1Page(submissions.length, BETA1_PAGE_SIZE);
      setSubmissions((current) => {
        const existing = new Set(current.map((submission) => submission.id));
        return [
          ...current,
          ...page.rows.filter((submission) => !existing.has(submission.id)),
        ];
      });
      setTotalCount(page.totalCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load more Beta 1 responses.");
    } finally {
      setLoadingMore(false);
    }
  };

  const summary = useMemo(
    () => ({
      ease: averageNumber(submissions, "ease"),
      homeClarity: averageNumber(submissions, "homeClarity"),
      recommend: averageNumber(submissions, "recommend"),
      bugs: submissions.reduce((total, item) => total + (item.bug_reports?.length ?? 0), 0),
    }),
    [submissions],
  );

  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const archive: Beta1Submission[] = [];
      let expectedTotal: number | null = null;

      for (let offset = 0; offset < BETA1_EXPORT_MAX_ROWS; offset += BETA1_EXPORT_PAGE_SIZE) {
        const page = await fetchBeta1Page(offset, BETA1_EXPORT_PAGE_SIZE);
        expectedTotal ??= page.totalCount;

        if (page.totalCount > BETA1_EXPORT_MAX_ROWS) {
          throw new Error(
            `Beta 1 export is capped at ${BETA1_EXPORT_MAX_ROWS.toLocaleString()} rows. Use a governed server export for larger archives.`,
          );
        }

        archive.push(...page.rows);
        if (archive.length >= page.totalCount || page.rows.length < BETA1_EXPORT_PAGE_SIZE) break;
      }

      if (expectedTotal !== null && archive.length < expectedTotal) {
        throw new Error("Beta 1 export stopped before the full archive could be read. Retry the export.");
      }

      downloadBeta1Csv(archive);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export the Beta 1 archive.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-5">
        <AdminPageHeader
          eyebrow="Public beta"
          title="Beta 1 archive"
          description="Beta 1 is closed. Its original questionnaire and every saved response remain here for before/after comparisons with Beta 2. Archive reads are deliberately paged so opening this historical surface does not download the entire dataset."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/beta2-feedback" className="admin-action-secondary">
                Open Beta 2 feedback
              </Link>
              <button
                type="button"
                onClick={() => void exportCsv()}
                disabled={exporting || loading || totalCount === 0}
                className="admin-action-secondary"
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {exporting ? "Exporting…" : "Export all Beta 1 CSV"}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="admin-action-secondary"
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          }
        />

        {error ? (
          <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-rose-100">{error}</p>
              <button type="button" onClick={() => void load()} className="admin-action-secondary">
                Retry archive read
              </button>
            </div>
          </AdminCard>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric
            label="Loaded responses"
            value={totalCount === null ? String(submissions.length) : `${submissions.length} / ${totalCount}`}
          />
          <Metric label="Ease · loaded" value={rating(summary.ease)} />
          <Metric label="Homepage clarity · loaded" value={rating(summary.homeClarity)} />
          <Metric label="Recommend · loaded" value={rating(summary.recommend)} />
          <Metric label="Bug reports · loaded" value={String(summary.bugs)} />
        </div>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Baseline"
            title="Beta 1 findings kept for comparison"
            description="These are the real findings used by the Beta 2 before/after report."
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Baseline label="Search target found immediately" value="5 / 11" />
            <Baseline label="Country entries found easily" value="7 / 11" />
            <Baseline label="Pulse explored a lot" value="4 / 11" />
            <Baseline label="Visual/responsive problem" value="6 / 11" />
            <Baseline label="Analysis needed more explanation" value="4 / 11" />
            <Baseline label="Ease average" value="8.64 / 10" />
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Original responses"
            title={
              loading
                ? "Loading…"
                : `${submissions.length}${totalCount !== null ? ` of ${totalCount}` : ""} archived response${totalCount === 1 ? "" : "s"}`
            }
            description="Questions below use the original Beta 1 questionnaire, not the current Beta 2 form. Summary metrics above describe the currently loaded page set; the baseline card remains the frozen historical comparison."
            action={<AdminStatus tone="neutral">Closed</AdminStatus>}
          />
          {!loading && !submissions.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No Beta 1 responses were found.</p>
          ) : (
            <div className="space-y-2">
              {submissions.map((submission) => (
                <details
                  key={submission.id}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.02]"
                >
                  <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{submission.tester_name}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {submission.device}
                          {submission.browser ? ` · ${submission.browser}` : ""} ·{" "}
                          {new Date(submission.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <AdminStatus tone="neutral">Beta 1</AdminStatus>
                        <AdminStatus tone={(submission.bug_reports?.length ?? 0) ? "attention" : "ready"}>
                          {submission.bug_reports?.length ?? 0} bugs
                        </AdminStatus>
                      </div>
                    </div>
                  </summary>
                  <div className="border-t border-white/[0.07] p-4">
                    <div className="space-y-4">
                      {beta1Sections.map((section) => {
                        const visible = section.questions.filter((question) =>
                          isBetaQuestionVisible(question, submission.answers),
                        );
                        return (
                          <section
                            key={section.id}
                            className="rounded-xl border border-white/[0.06] bg-black/10 p-3"
                          >
                            <p className="admin-section-label">{section.title}</p>
                            <div className="mt-2 divide-y divide-white/[0.06]">
                              {visible.map((question) => {
                                const value = submission.answers[question.id];
                                if (
                                  value === undefined ||
                                  value === "" ||
                                  (Array.isArray(value) && !value.length)
                                ) {
                                  return null;
                                }
                                return (
                                  <div
                                    key={question.id}
                                    className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] sm:gap-5"
                                  >
                                    <p className="text-xs font-semibold text-muted-foreground">
                                      {question.label}
                                    </p>
                                    <p className="break-words whitespace-pre-wrap text-xs leading-5 sm:text-right">
                                      {formatBetaAnswer(value as BetaAnswer)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </div>
                </details>
              ))}

              {hasMore ? (
                <div className="flex justify-center pt-3">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="admin-action-secondary"
                  >
                    {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                    {loadingMore ? "Loading…" : `Load ${BETA1_PAGE_SIZE} more`}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-card p-3 sm:p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <History className="size-4" />
        <p className="text-[11px] font-semibold">{label}</p>
      </div>
      <p className="numeric mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Baseline({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Users className="size-3.5" />
        <p className="text-xs font-semibold">{label}</p>
      </div>
      <p className="numeric mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

function averageNumber(submissions: Beta1Submission[], key: string) {
  const values = submissions
    .map((submission) => submission.answers[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rating(value: number | null) {
  return value == null ? "—" : `${value.toFixed(2)}/10`;
}

function downloadBeta1Csv(submissions: Beta1Submission[]) {
  const headers = [
    "Tester",
    "Submitted",
    "Device",
    "Browser",
    "Familiarity",
    ...questions.map((question) => question.label),
    "Bug reports",
  ];
  const rows = submissions.map((submission) => [
    submission.tester_name,
    submission.created_at,
    submission.device,
    submission.browser ?? "",
    submission.familiarity ?? "",
    ...questions.map((question) => csvValue(submission.answers[question.id])),
    JSON.stringify(submission.bug_reports ?? []),
  ]);
  const csv = rowsToSpreadsheetSafeCsv([headers, ...rows]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `solaris-beta-1-archive-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvValue(value: BetaAnswer | undefined) {
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${item}`)
      .join(" | ");
  }
  return String(value);
}
