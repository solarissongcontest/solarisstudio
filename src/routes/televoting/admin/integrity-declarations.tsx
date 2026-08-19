import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileSignature,
  Search,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  listMergedIntegrityDeclarations,
} from "@/integrations/televoting/integrity-declarations.functions";
import type { IntegrityDeclarationRow } from "@/integrations/televoting/integrity-declarations.server";

export const Route = createFileRoute("/televoting/admin/integrity-declarations")({
  head: () => ({
    meta: [
      { title: "Voting integrity declarations — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityDeclarationsPage,
});

type Filter = "all" | "signed" | "submitted" | "unsigned";

function IntegrityDeclarationsPage() {
  const navigate = useNavigate();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getDeclarations = useServerFn(listMergedIntegrityDeclarations);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) {
      void navigate({
        to: "/auth",
        search: { redirect: "/televoting/admin/integrity-declarations" },
      });
    }
  }, [admin, adminLoading, navigate]);

  const { data: rows = [], isLoading, error } = useQuery<IntegrityDeclarationRow[]>({
    queryKey: ["merged-integrity-declarations"],
    queryFn: () => getDeclarations({ data: { limit: 500, signedOnly: false } }),
    enabled: Boolean(admin),
    refetchInterval: 15_000,
  });

  const now = Date.now();
  const signedCount = rows.filter((row) => Boolean(row.attested_at)).length;
  const submittedCount = rows.filter((row) => Boolean(row.submitted_at)).length;
  const unsignedCount = rows.filter((row) => !row.attested_at).length;
  const abandonedCount = rows.filter(
    (row) => !row.submitted_at && new Date(row.expires_at).getTime() <= now,
  ).length;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "signed" && !row.attested_at) return false;
      if (filter === "submitted" && !row.submitted_at) return false;
      if (filter === "unsigned" && row.attested_at) return false;
      if (!term) return true;
      return [
        row.username,
        row.country_code,
        row.round_name,
        row.edition_name ?? "",
        row.severity,
        ...row.findings.flatMap((finding) => [finding.targetCode, finding.targetName, finding.scopeLabel, ...finding.reasons]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [filter, query, rows]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <AdminPageHeader
        eyebrow="Voting integrity"
        title="Declarations"
        description="Review ballots that the automatic Voting Integrity System flagged before submission, including the evidence shown to the voter and any declaration they signed. An automatic flag is evidence for review, not a finding of misconduct by itself."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/televoting/admin/integrity" className="admin-action-secondary">Integrity cases</Link>
            <Link to="/televoting/admin" className="admin-action-secondary">Back to Voting</Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric icon={ShieldAlert} label="Flagged checks" value={rows.length} />
        <Metric icon={FileSignature} label="Signed" value={signedCount} />
        <Metric icon={CheckCircle2} label="Submitted" value={submittedCount} />
        <Metric icon={Clock3} label="Expired unsubmitted" value={abandonedCount} attention={abandonedCount > 0} />
      </div>

      <AdminCard>
        <AdminCardHeader
          eyebrow="Filter"
          title={`${filtered.length} visible integrity record${filtered.length === 1 ? "" : "s"}`}
          description="The same voter can have more than one record if they went back and changed the ballot after a warning. That is intentional: every analysed ballot snapshot remains traceable."
        />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search voter, country, round or finding…"
              className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] pl-9 pr-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
            {(["all", "signed", "submitted", "unsigned"] as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={filter === value ? "admin-action-primary !min-h-9 !px-2" : "admin-action-quiet !min-h-9 !px-2"}
              >
                {value === "all" ? "All" : value === "signed" ? "Signed" : value === "submitted" ? "Submitted" : "Unsigned"}
              </button>
            ))}
          </div>
        </div>
      </AdminCard>

      {adminLoading || isLoading ? (
        <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading integrity declarations…</p></AdminCard>
      ) : error ? (
        <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]"><p className="text-sm text-rose-100">{error instanceof Error ? error.message : "Integrity declarations could not be loaded."}</p></AdminCard>
      ) : filtered.length ? (
        <div className="space-y-3">
          {filtered.map((row) => <DeclarationCard key={row.id} row={row} />)}
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={FileSignature}
            title={rows.length ? "No records match" : "No automatic warnings yet"}
            description={rows.length ? "Change the search or filter to widen the list." : "When the automatic system requires a pre-submit declaration, the exact warning, evidence and signature trail will appear here."}
          />
        </AdminCard>
      )}

      {unsignedCount > 0 ? (
        <AdminCard className="!border-sky-200/10 !bg-sky-200/[0.025]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-sky-100" />
            <div>
              <p className="text-sm font-semibold text-foreground">Unsigned warnings are not violations</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">An unsigned preflight can simply mean the voter used one of the offered opportunities to go back and change the ballot, closed the page, or let the check expire. Do not treat that alone as evidence of misconduct.</p>
            </div>
          </div>
        </AdminCard>
      ) : null}
    </div>
  );
}

function DeclarationCard({ row }: { row: IntegrityDeclarationRow }) {
  const expired = !row.submitted_at && new Date(row.expires_at).getTime() <= Date.now();
  const state = row.submitted_at
    ? "Submitted after declaration"
    : row.attested_at
      ? "Signed, not submitted"
      : expired
        ? "Warning expired"
        : "Awaiting decision";
  const stateTone = row.submitted_at ? "ready" : row.attested_at ? "attention" : expired ? "neutral" : "info";

  return (
    <AdminCard className="!p-4 sm:!p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-black text-foreground">{row.username}</p>
            <AdminStatus tone="info">{row.country_code}</AdminStatus>
            <AdminStatus tone={severityTone(row.severity)}>{humanize(row.severity)} · {row.risk_score}/100</AdminStatus>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{row.edition_name ? `${row.edition_name} · ` : ""}{row.round_name}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Automatic check {new Date(row.created_at).toLocaleString()}</p>
        </div>
        <AdminStatus tone={stateTone}>{state}</AdminStatus>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniMetric label="Relationship" value={`${row.relationship_risk}/100`} />
        <MiniMetric label="Televotes scanned" value={String(row.history_summary.televoteBallotsConsidered ?? 0)} />
        <MiniMetric label="Juries scanned" value={String(row.history_summary.juryBallotsConsidered ?? 0)} />
      </div>

      {row.history_summary.ipChanged ? (
        <div className="mt-3 rounded-xl border border-violet-200/15 bg-violet-200/[0.045] p-3">
          <p className="text-xs font-semibold text-violet-100">Connection fingerprint changed</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">The hashed IP differed from the most recent ballot in this HOD/country history. This is supporting context only. Real-world IP geography is never expected to match a fictional Solaris country.</p>
        </div>
      ) : null}

      <details className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <summary className="cursor-pointer text-sm font-semibold">Evidence shown to voter</summary>
        <div className="mt-4 space-y-3">
          {row.findings.length ? row.findings.map((finding, index) => (
            <article key={`${finding.lens}-${finding.targetCode}-${index}`} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{finding.targetName}</p>
                <AdminStatus tone="neutral">{finding.lens === "hod" ? "HOD history" : "Country history"}</AdminStatus>
                <AdminStatus tone={finding.riskScore >= 65 ? "blocked" : finding.riskScore >= 30 ? "attention" : "info"}>Signal {finding.riskScore}</AdminStatus>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{finding.scopeLabel}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniMetric label="Editions" value={String(finding.uniqueEditions)} />
                <MiniMetric label="Support" value={`${finding.supportFrequency}%`} />
                <MiniMetric label="Max-score" value={`${finding.maximumFrequency}%`} />
                <MiniMetric label="Reciprocity" value={`${finding.reciprocalSupport}%`} />
              </div>
              {finding.reasons.length ? <ul className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">{finding.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul> : null}
              {finding.crossChannelEditions > 0 ? <p className="mt-2 text-xs text-amber-100">Jury + televote reinforcement in {finding.crossChannelEditions} edition{finding.crossChannelEditions === 1 ? "" : "s"}.</p> : null}
            </article>
          )) : <p className="text-xs text-muted-foreground">No structured relationship findings were stored with this warning.</p>}

          {row.technical_signals.length ? (
            <div>
              <p className="admin-section-label mb-2">Technical context</p>
              {row.technical_signals.map((signal) => <div key={signal.key} className="rounded-xl border border-white/[0.07] p-3"><p className="text-xs font-semibold">{signal.title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{signal.description}</p></div>)}
            </div>
          ) : null}
        </div>
      </details>

      <details className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <summary className="cursor-pointer text-sm font-semibold">Declaration & submission trail</summary>
        <div className="mt-4 space-y-3 text-xs leading-5">
          <TimelineRow icon={ShieldAlert} label="Automatic warning generated" value={new Date(row.created_at).toLocaleString()} />
          {row.attested_at ? <TimelineRow icon={UserCheck} label={`Signed by ${row.signed_name ?? row.username}`} value={new Date(row.attested_at).toLocaleString()} /> : <TimelineRow icon={Clock3} label="No declaration signed" value={expired ? "Warning expired without submission" : "Voter can still change the ballot or sign"} />}
          {row.submitted_at ? <TimelineRow icon={CheckCircle2} label="Ballot submitted" value={`${new Date(row.submitted_at).toLocaleString()}${row.submission_status ? ` · ${humanize(row.submission_status)}` : ""}`} /> : null}

          {row.attestation_text ? (
            <div className="rounded-xl border border-rose-200/10 bg-rose-200/[0.035] p-3">
              <p className="admin-section-label">Recorded declaration · v{row.statement_version}</p>
              <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">{row.attestation_text}</p>
            </div>
          ) : null}
          {row.submission_id ? <p className="break-all text-[10px] text-muted-foreground">Submission ID: {row.submission_id}</p> : null}
        </div>
      </details>
    </AdminCard>
  );
}

function TimelineRow({ icon: Icon, label, value }: { icon: typeof ShieldAlert; label: string; value: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-sky-100"><Icon className="size-3.5" /></span><div className="min-w-0"><p className="font-semibold text-foreground">{label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{value}</p></div></div>;
}

function Metric({ icon: Icon, label, value, attention = false }: { icon: typeof ShieldAlert; label: string; value: number; attention?: boolean }) {
  return <AdminCard className={`!p-3 sm:!p-4 ${attention ? "!border-amber-200/15 !bg-amber-200/[0.035]" : ""}`}><div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" /><p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p></div><p className={`numeric mt-3 text-2xl font-black ${attention ? "text-amber-100" : ""}`}>{value}</p></AdminCard>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-black/10 p-2.5 text-center"><p className="numeric text-sm font-bold text-foreground">{value}</p><p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p></div>;
}

function severityTone(severity: string): "ready" | "attention" | "blocked" | "info" | "neutral" {
  if (severity === "critical" || severity === "high") return "blocked";
  if (severity === "strong" || severity === "review") return "attention";
  if (severity === "notable") return "info";
  return "neutral";
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
