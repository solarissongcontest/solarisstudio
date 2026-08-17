import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  Bug,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  RefreshCw,
  Star,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  betaSections,
  formatBetaAnswer,
  isBetaQuestionVisible,
} from "@/features/beta-test/sections";
import type { BetaAnswer, BetaAnswers } from "@/features/beta-test/types";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/beta-feedback")({
  head: () => ({
    meta: [
      { title: "Beta Feedback — Solaris Studio" },
      {
        name: "description",
        content: "Organizer-only overview of Solaris Studio public beta feedback.",
      },
    ],
  }),
  component: BetaFeedbackDashboard,
});

type BetaBug = {
  id?: string;
  page?: string;
  did?: string;
  expected?: string;
  instead?: string;
  reproducibility?: string;
  severity?: string;
  screenshotPath?: string;
};

type BetaSubmission = {
  id: string;
  tester_name: string;
  device: string;
  browser: string | null;
  familiarity: string | null;
  answers: BetaAnswers;
  bug_reports: BetaBug[];
  screenshot_paths: string[];
  user_agent: string | null;
  form_version: number;
  created_at: string;
};

type SignedScreenshot = {
  path: string;
  url: string;
};

const TESTER_TARGET = 5;

const ratingMetrics = [
  { key: "overallNow", label: "Overall" },
  { key: "usefulness", label: "Usefulness" },
  { key: "fun", label: "Fun to explore" },
  { key: "professional", label: "Professional" },
  { key: "ease", label: "Ease of use" },
  { key: "return", label: "Return likelihood" },
  { key: "recommend", label: "Recommend" },
] as const;

const launchReadyOrder = [
  "Yes, definitely",
  "Yes, with a few small fixes",
  "Almost, but some important things should be improved first",
  "No, significant work is still needed",
];

function BetaFeedbackDashboard() {
  const [submissions, setSubmissions] = useState<BetaSubmission[]>([]);
  const [screenshots, setScreenshots] = useState<Record<string, SignedScreenshot>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: selectError } = await supabase
        .from("beta_test_submissions" as never)
        .select("*")
        .order("created_at", { ascending: false });

      if (selectError) throw selectError;

      const rows = (data ?? []) as unknown as BetaSubmission[];
      setSubmissions(rows);

      const paths = Array.from(
        new Set(
          rows.flatMap((submission) => [
            ...(submission.screenshot_paths ?? []),
            ...(submission.bug_reports ?? [])
              .map((bug) => bug.screenshotPath)
              .filter((value): value is string => Boolean(value)),
          ]),
        ),
      );

      if (!paths.length) {
        setScreenshots({});
        return;
      }

      const signedEntries = await Promise.all(
        paths.map(async (path) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from("beta-feedback")
            .createSignedUrl(path, 60 * 60);

          if (signedError || !signed?.signedUrl) return null;
          return [path, { path, url: signed.signedUrl }] as const;
        }),
      );

      setScreenshots(
        Object.fromEntries(signedEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))),
      );
    } catch (loadError) {
      console.error("Failed to load beta feedback", loadError);
      setError(loadError instanceof Error ? loadError.message : "Could not load beta feedback.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ratingData = useMemo(
    () =>
      ratingMetrics.map((metric) => ({
        metric: metric.label,
        value: averageNumeric(submissions, metric.key),
      })),
    [submissions],
  );

  const launchData = useMemo(
    () =>
      launchReadyOrder.map((status) => ({
        status: shortenLaunchLabel(status),
        count: submissions.filter((submission) => submission.answers.launchReady === status).length,
      })),
    [submissions],
  );

  const areaData = useMemo(() => {
    const labels = Array.from(
      new Set(
        submissions.flatMap((submission) => [
          stringAnswer(submission.answers.mostFinished),
          stringAnswer(submission.answers.leastFinished),
        ]),
      ),
    ).filter(Boolean);

    return labels.map((area) => ({
      area,
      mostFinished: submissions.filter(
        (submission) => stringAnswer(submission.answers.mostFinished) === area,
      ).length,
      leastFinished: submissions.filter(
        (submission) => stringAnswer(submission.answers.leastFinished) === area,
      ).length,
    }));
  }, [submissions]);

  const bugSeverityData = useMemo(() => {
    const severities = [
      "Tiny visual problem",
      "Annoying but usable",
      "Makes a feature difficult to use",
      "Feature doesn't work",
      "Major problem / blocks normal use",
    ];

    return severities.map((severity) => ({
      severity: shortenSeverity(severity),
      count: submissions.flatMap((submission) => submission.bug_reports ?? []).filter(
        (bug) => bug.severity === severity,
      ).length,
    }));
  }, [submissions]);

  const bugCount = useMemo(
    () => submissions.reduce((total, submission) => total + (submission.bug_reports?.length ?? 0), 0),
    [submissions],
  );

  const overallAverage = averageNumeric(submissions, "overallNow");
  const launchPositive = submissions.filter((submission) => {
    const value = stringAnswer(submission.answers.launchReady);
    return value === "Yes, definitely" || value === "Yes, with a few small fixes";
  }).length;

  const exportCsv = () => {
    const allQuestions = betaSections.flatMap((section) => section.questions);
    const headers = [
      "Tester",
      "Submitted",
      "Device",
      "Browser",
      "Familiarity",
      ...allQuestions.map((question) => question.label),
      "Bug reports",
    ];

    const rows = submissions.map((submission) => [
      submission.tester_name,
      submission.created_at,
      submission.device,
      submission.browser ?? "",
      submission.familiarity ?? "",
      ...allQuestions.map((question) => csvValue(submission.answers[question.id])),
      JSON.stringify(submission.bug_reports ?? []),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => escapeCsv(String(value ?? ""))).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `solaris-beta-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="glass-strong relative overflow-hidden p-5 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-fuchsia-300/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-fuchsia-200/15 bg-fuchsia-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-100/80">
              <BarChart3 className="h-3.5 w-3.5" /> Public beta
            </div>
            <h1 className="font-display text-5xl uppercase leading-[0.9] sm:text-6xl lg:text-7xl">
              Beta Feedback
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              One view for every tester response, launch-readiness signal, recurring weak spot and bug found before the public release.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/beta-test"
              target="_blank"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-xs font-semibold text-foreground"
            >
              Open beta form <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!submissions.length}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-xs font-semibold text-foreground disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-200/15 bg-sky-200/10 px-4 text-xs font-semibold text-sky-100 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-300/20 bg-red-300/[0.07] p-4 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Could not load beta feedback</p>
              <p className="mt-1 text-xs text-red-100/70">{error}</p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Responses"
          value={`${submissions.length}/${TESTER_TARGET}`}
          helper={submissions.length >= TESTER_TARGET ? "Target reached" : `${TESTER_TARGET - submissions.length} remaining`}
          icon={Users}
        />
        <StatCard
          label="Overall average"
          value={overallAverage ? `${overallAverage.toFixed(1)}/10` : "—"}
          helper="Final overall rating"
          icon={Star}
        />
        <StatCard
          label="Launch-positive"
          value={submissions.length ? `${launchPositive}/${submissions.length}` : "—"}
          helper="Ready or only small fixes"
          icon={CheckCircle2}
        />
        <StatCard label="Bugs reported" value={String(bugCount)} helper="Structured bug reports" icon={Bug} />
      </section>

      {loading && !submissions.length ? (
        <div className="glass flex min-h-64 items-center justify-center p-8 text-sm text-muted-foreground">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading beta responses…
        </div>
      ) : null}

      {!loading && !submissions.length ? (
        <div className="glass-strong p-8 text-center sm:p-12">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h2 className="font-display mt-4 text-3xl uppercase">No responses yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            The dashboard is ready. Once the first tester submits, averages, charts, priorities and their full response will appear here automatically.
          </p>
        </div>
      ) : null}

      {submissions.length ? (
        <>
          <section className="grid gap-5 xl:grid-cols-2">
            <ChartPanel title="Experience averages" description="Average final 1–10 ratings across all submitted beta tests.">
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={ratingData} layout="vertical" margin={{ left: 10, right: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.12} horizontal={false} />
                  <XAxis type="number" domain={[0, 10]} allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="metric" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toFixed(1)}/10`, "Average"]} />
                  <Bar dataKey="value" fill="var(--primary)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Launch readiness" description="How testers judge the site’s readiness for a public release.">
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={launchData} margin={{ left: 4, right: 8, bottom: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
                  <XAxis dataKey="status" interval={0} angle={-18} textAnchor="end" height={72} tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} domain={[0, TESTER_TARGET]} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="var(--primary)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Most vs least finished" description="Which public areas feel strongest and which still look unfinished.">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={areaData} layout="vertical" margin={{ left: 14, right: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.12} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} domain={[0, TESTER_TARGET]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="area" width={125} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="mostFinished" name="Most finished" fill="var(--primary)" radius={[0, 7, 7, 0]} />
                  <Bar dataKey="leastFinished" name="Least finished" fill="var(--muted-foreground)" radius={[0, 7, 7, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Bug severity" description="How serious the reported issues are, not merely how many exist.">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={bugSeverityData} layout="vertical" margin={{ left: 14, right: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.12} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="severity" width={135} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="var(--primary)" radius={[0, 7, 7, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </section>

          <section className="grid gap-5 xl:grid-cols-3">
            <InsightPanel title="Fix first" description="Each tester’s #1 launch priority.">
              {submissions.map((submission) => (
                <Insight key={submission.id} name={submission.tester_name} text={stringAnswer(submission.answers.priorityOne)} />
              ))}
            </InsightPanel>
            <InsightPanel title="Would be better if…" description="Direct improvement ideas in testers’ own words.">
              {submissions.map((submission) => (
                <Insight key={submission.id} name={submission.tester_name} text={stringAnswer(submission.answers.betterIf)} />
              ))}
            </InsightPanel>
            <InsightPanel title="Do not remove" description="What testers think Solaris Studio must preserve.">
              {submissions.map((submission) => (
                <Insight key={submission.id} name={submission.tester_name} text={stringAnswer(submission.answers.mustKeep)} />
              ))}
            </InsightPanel>
          </section>

          <section className="glass-strong p-4 sm:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Individual responses</p>
                <h2 className="font-display mt-2 text-3xl uppercase sm:text-4xl">Tester feedback</h2>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  Open a tester to read every answer exactly as submitted, plus their structured bug reports and screenshots.
                </p>
              </div>
              <p className="text-xs font-semibold text-muted-foreground">{submissions.length} submitted</p>
            </div>

            <div className="space-y-3">
              {submissions.map((submission) => (
                <SubmissionDetails
                  key={submission.id}
                  submission={submission}
                  screenshots={screenshots}
                />
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Users;
}) {
  return (
    <div className="glass p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary/65" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{helper}</p>
    </div>
  );
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass overflow-hidden p-4 sm:p-5">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function InsightPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass p-4 sm:p-5">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Insight({ name, text }: { name: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary/75">{name}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
        {text || "No answer"}
      </p>
    </div>
  );
}

function SubmissionDetails({
  submission,
  screenshots,
}: {
  submission: BetaSubmission;
  screenshots: Record<string, SignedScreenshot>;
}) {
  const finalScore = numberAnswer(submission.answers.overallNow);
  const launchReady = stringAnswer(submission.answers.launchReady);
  const bugReports = submission.bug_reports ?? [];

  return (
    <details className="group rounded-2xl border border-white/10 bg-white/[0.025] open:bg-white/[0.04]">
      <summary className="cursor-pointer list-none p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-foreground">{submission.tester_name}</h3>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold text-muted-foreground">
                {submission.device}
                {submission.browser ? ` · ${submission.browser}` : ""}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Submitted {new Date(submission.created_at).toLocaleString()}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <MiniStat label="Overall" value={finalScore ? `${finalScore}/10` : "—"} />
            <MiniStat label="Bugs" value={String(bugReports.length)} />
            <MiniStat label="Launch" value={shortenLaunchLabel(launchReady) || "—"} wide />
          </div>
        </div>
      </summary>

      <div className="border-t border-white/10 p-4 sm:p-5">
        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Meta label="Device" value={submission.device} />
          <Meta label="Browser" value={submission.browser ?? "Not provided"} />
          <Meta label="Familiarity" value={submission.familiarity ?? "Not provided"} />
          <Meta label="Form version" value={String(submission.form_version)} />
        </section>

        <div className="space-y-5">
          {betaSections.map((section) => {
            const questions = section.questions.filter((question) =>
              isBetaQuestionVisible(question, submission.answers),
            );

            return (
              <section key={section.id} className="rounded-2xl border border-white/[0.07] bg-black/10 p-4">
                <h4 className="text-xs font-black uppercase tracking-[0.15em] text-primary/80">
                  {section.title}
                </h4>
                <div className="mt-3 divide-y divide-white/[0.06]">
                  {questions.map((question) => (
                    <div key={question.id} className="grid gap-1 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-5">
                      <p className="text-[11px] font-semibold leading-relaxed text-muted-foreground">
                        {question.label}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90 lg:text-right">
                        {formatBetaAnswer(submission.answers[question.id])}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {bugReports.length ? (
            <section className="rounded-2xl border border-red-200/10 bg-red-200/[0.025] p-4">
              <h4 className="text-xs font-black uppercase tracking-[0.15em] text-red-100/80">Bug reports</h4>
              <div className="mt-3 space-y-3">
                {bugReports.map((bug, index) => (
                  <div key={bug.id ?? `${submission.id}-${index}`} className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold">Bug {index + 1}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {bug.severity ? <Badge>{bug.severity}</Badge> : null}
                        {bug.reproducibility ? <Badge>{bug.reproducibility}</Badge> : null}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <Meta label="Page" value={bug.page || "Not provided"} />
                      <Meta label="I did" value={bug.did || "Not provided"} />
                      <Meta label="I expected" value={bug.expected || "Not provided"} />
                      <Meta label="Instead" value={bug.instead || "Not provided"} />
                    </div>
                    {bug.screenshotPath && screenshots[bug.screenshotPath] ? (
                      <a
                        href={screenshots[bug.screenshotPath].url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 block overflow-hidden rounded-xl border border-white/10 bg-black/20"
                      >
                        <img
                          src={screenshots[bug.screenshotPath].url}
                          alt={`Bug ${index + 1} screenshot from ${submission.tester_name}`}
                          className="max-h-96 w-full object-contain"
                        />
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function MiniStat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2", wide && "sm:min-w-32")}>
      <p className="text-[8px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

function averageNumeric(submissions: BetaSubmission[], key: string) {
  const values = submissions
    .map((submission) => numberAnswer(submission.answers[key]))
    .filter((value): value is number => value !== null);

  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function numberAnswer(value: BetaAnswer | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringAnswer(value: BetaAnswer | undefined) {
  return typeof value === "string" ? value : "";
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

function escapeCsv(value: string) {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function shortenLaunchLabel(value: string) {
  switch (value) {
    case "Yes, definitely":
      return "Ready";
    case "Yes, with a few small fixes":
      return "Small fixes";
    case "Almost, but some important things should be improved first":
      return "Important fixes";
    case "No, significant work is still needed":
      return "Not ready";
    default:
      return value;
  }
}

function shortenSeverity(value: string) {
  switch (value) {
    case "Tiny visual problem":
      return "Tiny visual";
    case "Annoying but usable":
      return "Annoying";
    case "Makes a feature difficult to use":
      return "Hard to use";
    case "Feature doesn't work":
      return "Feature broken";
    case "Major problem / blocks normal use":
      return "Blocking";
    default:
      return value;
  }
}

const tooltipStyle = {
  background: "rgba(10, 10, 18, 0.96)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  color: "white",
  fontSize: 12,
};
