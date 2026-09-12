import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Gavel, Search, SearchCheck, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { RuleDecisionStrip } from "@/components/rules/RuleDecisionStrip";
import { supabase } from "@/integrations/supabase/client";
import { formatIntegrityStatus, getIntegrityCategory } from "@/lib/integrity";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/integrity-investigations")({
  head: () => ({ meta: [{ title: "Integrity Investigations — Solaris Organizer" }, { name: "robots", content: "noindex" }] }),
  component: IntegrityInvestigations,
});

type CaseItem = {
  id: string;
  public_code: string;
  case_kind: string;
  category: string;
  identity_mode: string;
  summary: string;
  status: string;
  priority: "information" | "standard" | "high" | "urgent";
  related_countries: string[];
  edition_reference: string | null;
  created_at: string;
  updated_at: string;
};

async function loadCases(): Promise<CaseItem[]> {
  const { data, error } = await (supabase as any).rpc("admin_integrity_cases");
  if (error) throw new Error(error.message);
  return data as CaseItem[];
}

export function IntegrityInvestigations() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"open" | "urgent" | "waiting" | "all">("open");
  const casesQuery = useQuery({ queryKey: ["admin-integrity-cases"], queryFn: loadCases, refetchInterval: 30_000 });
  const cases = casesQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases.filter((item) => {
      const matchesFilter = filter === "all" ? true : filter === "open" ? !item.status.startsWith("closed") : filter === "urgent" ? item.priority === "urgent" && !item.status.startsWith("closed") : item.status === "waiting_for_reporter";
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [item.public_code, item.summary, item.category, item.case_kind, item.edition_reference ?? "", ...(item.related_countries ?? [])].join(" ").toLowerCase().includes(needle);
    });
  }, [cases, filter, query]);

  return <AdminPage><div className="mx-auto max-w-[1480px]"><AdminPageHeader eyebrow="Trust & Integrity" title="Investigation desk" description="Triage cases, assign reviewers, examine evidence, link exact rules, record findings and publish anonymised precedent without mixing allegations with verdicts." actions={<div className="flex flex-wrap gap-2"><Link to="/admin/integrity-appeals" className="admin-action-secondary"><Gavel className="size-4"/>Appeal queue</Link><Link to="/integrity" target="_blank" className="admin-action-secondary"><ShieldCheck className="size-4"/>Reporter view</Link></div>}/>
    <RuleDecisionStrip
      title="Evidence, findings & investigator independence"
      description="A report starts a review, not a presumption of guilt. Keep reporter-visible material separate from internal notes, record which rules were actually supported by the evidence, use the official sanction scale and recuse conflicted investigators."
      ruleIds={["16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "17.1", "17.2", "17.3", "17.7", "18.3"]}
      integrity
    />
    <div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric value={cases.filter((item) => !item.status.startsWith("closed")).length} label="Open"/><Metric value={cases.filter((item) => item.priority === "urgent" && !item.status.startsWith("closed")).length} label="Urgent" danger/><Metric value={cases.filter((item) => item.status === "waiting_for_reporter").length} label="Waiting for reporter"/><Metric value={cases.filter((item) => item.status === "investigation_opened").length} label="Formal investigations"/></div>
    <AdminCard className="mt-4"><div className="flex flex-wrap items-center justify-between gap-3"><label className="flex min-h-10 min-w-[18rem] flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3"><Search className="size-4 text-muted-foreground"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search case, country, category or edition…" className="min-w-0 flex-1 border-0 !bg-transparent text-xs shadow-none outline-none focus-visible:!shadow-none"/></label><div className="flex gap-1.5">{(["open","urgent","waiting","all"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("rounded-lg border px-3 py-2 text-[10px] font-bold capitalize", filter === item ? "border-sky-200/20 bg-sky-200/[0.08] text-sky-100" : "border-white/[0.07] text-muted-foreground")}>{item}</button>)}</div></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{filtered.map((item) => { const category = getIntegrityCategory(item.category); const status = formatIntegrityStatus(item.status); return <article key={item.id} className="rounded-[1.3rem] border border-white/[0.08] bg-white/[0.02] p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><span className="font-mono text-[10px] font-black text-sky-200">{item.public_code}</span><span className="text-[9px] uppercase text-muted-foreground">{item.identity_mode}</span><span className="text-[9px] uppercase text-muted-foreground">{item.case_kind.replaceAll("_"," ")}</span></div><h2 className="mt-2 text-sm font-black">{item.summary}</h2><p className="mt-1 text-[10px] text-muted-foreground">{category.label} · {status.label} · updated {new Date(item.updated_at).toLocaleString()}</p></div>{item.priority === "urgent" ? <AlertTriangle className="size-4 shrink-0 text-rose-200"/> : null}</div><div className="mt-4 flex flex-wrap gap-2"><Link to="/admin/integrity-case/$caseId" params={{ caseId: item.id }} className="admin-action-secondary">Investigation <ArrowRight className="size-3.5"/></Link><Link to="/admin/integrity-resolution/$caseId" params={{ caseId: item.id }} className="admin-action-secondary"><Gavel className="size-3.5"/>Sanctions & appeals</Link></div></article>; })}</div>
      {!casesQuery.isLoading && !filtered.length ? <div className="py-12 text-center"><SearchCheck className="mx-auto size-7 text-emerald-200"/><p className="mt-3 font-bold">No matching cases</p><p className="mt-1 text-xs text-muted-foreground">The queue is, for once, not plotting against you.</p></div> : null}
    </AdminCard>
  </div></AdminPage>;
}

function Metric({ value, label, danger = false }: { value: number; label: string; danger?: boolean }) { return <AdminCard className="!p-4"><div className="flex items-start justify-between"><div><p className="text-2xl font-black">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{label}</p></div><AdminStatus tone={danger && value ? "blocked" : "info"}>{danger && value ? "Priority" : "Live"}</AdminStatus></div></AdminCard>; }
