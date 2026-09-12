import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CalendarClock, Gavel, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { RuleDecisionStrip } from "@/components/rules/RuleDecisionStrip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/integrity-appeals")({
  head: () => ({ meta: [{ title: "Integrity Appeals — Solaris Organizer" }, { name: "robots", content: "noindex" }] }),
  component: IntegrityAppeals,
});

type AppealItem = {
  id: string;
  case_id: string;
  case_code: string;
  case_summary: string;
  category: string;
  identity_mode: string;
  priority: string;
  sanction_id: string;
  sanction_level: number;
  sanction_label: string;
  grounds: string;
  submitted_via: string;
  submitted_at: string;
  deadline_at: string;
  was_timely: boolean;
  status: string;
  assigned_reviewer: string | null;
  extension_granted_at: string | null;
  extension_reason: string | null;
  decided_at: string | null;
};

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function loadAppeals() {
  return rpc<AppealItem[]>("admin_integrity_appeals");
}

function IntegrityAppeals() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"active" | "late" | "decided" | "all">("active");
  const appealsQuery = useQuery({
    queryKey: ["admin-integrity-appeals"],
    queryFn: loadAppeals,
    refetchInterval: 30_000,
  });
  const appeals = appealsQuery.data ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return appeals.filter((appeal) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "active"
            ? ["submitted", "under_review"].includes(appeal.status)
            : filter === "late"
              ? appeal.status === "rejected_late"
              : !["submitted", "under_review", "rejected_late"].includes(appeal.status);
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [
        appeal.case_code,
        appeal.case_summary,
        appeal.category,
        appeal.sanction_label,
        appeal.grounds,
      ].join(" ").toLowerCase().includes(needle);
    });
  }, [appeals, filter, query]);

  const counts = {
    active: appeals.filter((appeal) => ["submitted", "under_review"].includes(appeal.status)).length,
    late: appeals.filter((appeal) => appeal.status === "rejected_late").length,
    decided: appeals.filter((appeal) => !["submitted", "under_review", "rejected_late"].includes(appeal.status)).length,
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1450px]">
        <AdminPageHeader
          eyebrow="Trust & Integrity"
          title="Appeal queue"
          description="Review active appeals, identify late filings that may qualify for an exceptional extension, and route every serious challenge into a fresh-review decision record."
          actions={<div className="flex flex-wrap gap-2"><Link to="/admin/integrity-investigations" className="admin-action-secondary"><ShieldCheck className="size-4" />Investigations</Link><button type="button" onClick={() => void appealsQuery.refetch()} className="admin-action-secondary"><RefreshCw className="size-4" />Refresh</button></div>}
        />

        <RuleDecisionStrip
          title="Appeal timing & fresh review"
          description="The normal appeal window is 48 hours. Exceptional extensions require a recorded reason, and serious appeals must not simply return to the same original decision-maker."
          ruleIds={["18.1", "18.2", "18.3", "18.4"]}
          integrity
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Active appeals" value={counts.active} tone="attention" />
          <Metric label="Late · extension review" value={counts.late} tone={counts.late ? "blocked" : "info"} />
          <Metric label="Decided" value={counts.decided} tone="ready" />
        </div>

        <AdminCard className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-10 min-w-[18rem] flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3"><Search className="size-4 text-muted-foreground"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search case, sanction or appeal grounds…" className="min-w-0 flex-1 border-0 !bg-transparent text-xs shadow-none outline-none focus-visible:!shadow-none" /></label>
            <div className="flex flex-wrap gap-1.5">{(["active", "late", "decided", "all"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("rounded-lg border px-3 py-2 text-[10px] font-bold capitalize", filter === item ? "border-amber-200/20 bg-amber-200/[0.07] text-amber-50" : "border-white/[0.07] text-muted-foreground")}>{item}</button>)}</div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {filtered.map((appeal) => <AppealCard key={appeal.id} appeal={appeal} onChanged={() => appealsQuery.refetch().then(() => undefined)} />)}
          </div>
          {!appealsQuery.isLoading && !filtered.length ? <div className="py-12 text-center"><Gavel className="mx-auto size-7 text-amber-200"/><p className="mt-3 font-bold">No matching appeals</p><p className="mt-1 text-xs text-muted-foreground">A suspiciously peaceful administrative moment. Enjoy it responsibly.</p></div> : null}
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function AppealCard({ appeal, onChanged }: { appeal: AppealItem; onChanged: () => Promise<void> }) {
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => rpc("admin_grant_integrity_appeal_extension", {
      _appeal_id: appeal.id,
      _new_deadline: new Date(deadline).toISOString(),
      _reason: reason,
    }),
    onSuccess: async () => {
      setExtensionOpen(false);
      setDeadline("");
      setReason("");
      await onChanged();
      toast.success("Exceptional appeal extension granted");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not grant extension"),
  });

  const statusTone = appeal.status === "rejected_late" ? "blocked" : ["submitted", "under_review"].includes(appeal.status) ? "attention" : "ready";
  return (
    <article className="rounded-[1.35rem] border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-black text-sky-200">{appeal.case_code}</span><span className="text-[9px] uppercase text-muted-foreground">{appeal.identity_mode}</span></div><h2 className="mt-2 text-sm font-black">{appeal.case_summary}</h2></div>
        <AdminStatus tone={statusTone as any}>{appeal.status.replaceAll("_", " ")}</AdminStatus>
      </div>

      <div className="mt-3 rounded-xl border border-rose-200/10 bg-rose-200/[0.03] p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-rose-200/70">Appealed sanction</p><p className="mt-1 text-xs font-black">Level {appeal.sanction_level} · {appeal.sanction_label}</p></div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{appeal.grounds}</p>
      <div className="mt-3 grid gap-2 text-[9px] text-muted-foreground sm:grid-cols-2"><span>Submitted {new Date(appeal.submitted_at).toLocaleString()}</span><span>Deadline {new Date(appeal.deadline_at).toLocaleString()}</span></div>
      {appeal.extension_reason ? <div className="mt-3 rounded-lg border border-amber-200/10 bg-amber-200/[0.03] p-2.5"><p className="text-[8px] font-black uppercase tracking-[.1em] text-amber-200">Extension granted</p><p className="mt-1 text-[10px] leading-4 text-amber-50/70">{appeal.extension_reason}</p></div> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/admin/integrity-resolution/$caseId" params={{ caseId: appeal.case_id }} className="admin-action-secondary">Open fresh review <ArrowRight className="size-3.5"/></Link>
        {appeal.status === "rejected_late" ? <button type="button" onClick={() => setExtensionOpen((value) => !value)} className="admin-action-secondary"><CalendarClock className="size-3.5"/>Exceptional extension</button> : null}
      </div>

      {extensionOpen ? <div className="mt-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-200"/><p className="text-[10px] leading-5 text-amber-50/75">Use only where exceptional circumstances justify extending the ordinary 48-hour deadline. The reason becomes part of the reporter-visible case audit trail.</p></div><label className="mt-3 block"><span className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Extended deadline</span><input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-3 text-xs"/></label><label className="mt-3 block"><span className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Exceptional reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Explain why the ordinary deadline should be extended…" className="mt-1 w-full rounded-lg border p-3 text-xs"/></label><button type="button" disabled={!deadline || reason.trim().length < 10 || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-primary mt-3"><CalendarClock className="size-4"/>{mutation.isPending ? "Granting…" : "Grant extension"}</button></div> : null}
    </article>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "attention" | "blocked" | "info" | "ready" }) {
  return <AdminCard className="!p-4"><div className="flex items-start justify-between"><div><p className="text-2xl font-black">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{label}</p></div><AdminStatus tone={tone}>{value ? "Live" : "Clear"}</AdminStatus></div></AdminCard>;
}
