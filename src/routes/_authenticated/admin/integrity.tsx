import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  EyeOff,
  FileText,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  StickyNote,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { formatIntegrityStatus, getIntegrityCategory, type IntegrityCaseStatus } from "@/lib/integrity";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/integrity")({
  head: () => ({
    meta: [
      { title: "Trust & Integrity — Solaris Organizer" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Review protected SSC integrity reports and communicate with anonymous reporters.",
      },
    ],
  }),
  component: IntegrityAdminPage,
});

type CaseListItem = {
  id: string;
  public_code: string;
  category: string;
  identity_mode: "anonymous" | "sealed" | "confidential";
  summary: string;
  status: IntegrityCaseStatus;
  priority: "information" | "standard" | "high" | "urgent";
  related_countries: string[];
  edition_reference: string | null;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  reporter_identity_available: boolean;
};

type AdminMessage = {
  id: string;
  case_id: string;
  author_role: "reporter" | "tsbc";
  body: string;
  visible_to_reporter: boolean;
  created_by: string | null;
  created_at: string;
};

type AdminNote = {
  id: string;
  case_id: string;
  body: string;
  created_by: string;
  created_at: string;
};

type AdminEvent = {
  id: string;
  case_id: string;
  event_type: string;
  detail: string | null;
  visible_to_reporter: boolean;
  actor_user_id: string | null;
  created_at: string;
};

type AdminCaseDetail = {
  case: CaseListItem & {
    details: string;
    observed_facts: string | null;
    uncertainties: string | null;
    closed_at: string | null;
  };
  messages: AdminMessage[];
  notes: AdminNote[];
  events: AdminEvent[];
};

const STATUS_OPTIONS: IntegrityCaseStatus[] = [
  "received",
  "awaiting_review",
  "under_review",
  "waiting_for_reporter",
  "investigation_opened",
  "action_taken",
  "closed_no_violation",
  "closed_insufficient_evidence",
  "closed_outside_jurisdiction",
  "closed_duplicate",
  "closed",
];

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function IntegrityAdminPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "all" | IntegrityCaseStatus>("open");

  const casesQuery = useQuery({
    queryKey: ["admin-integrity-cases"],
    queryFn: () => rpc<CaseListItem[]>("admin_integrity_cases"),
    refetchInterval: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ["admin-integrity-case", selectedId],
    queryFn: () => rpc<AdminCaseDetail | null>("admin_integrity_case", { _case_id: selectedId }),
    enabled: Boolean(selectedId),
  });

  const cases = casesQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases.filter((item) => {
      const statusMatches =
        statusFilter === "all"
          ? true
          : statusFilter === "open"
            ? !item.status.startsWith("closed")
            : item.status === statusFilter;
      if (!statusMatches) return false;
      if (!needle) return true;
      return [
        item.public_code,
        item.summary,
        item.category,
        item.edition_reference ?? "",
        ...(item.related_countries ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [cases, query, statusFilter]);

  const openCount = cases.filter((item) => !item.status.startsWith("closed")).length;
  const urgentCount = cases.filter((item) => item.priority === "urgent" && !item.status.startsWith("closed")).length;
  const waitingCount = cases.filter((item) => item.status === "waiting_for_reporter").length;

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1480px]">
        <AdminPageHeader
          eyebrow="Trust & Integrity"
          title="Integrity case workspace"
          description="Review reports without exposing anonymous identities, ask follow-up questions and keep the case history separate from the Friend Voting engine itself."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/rules" target="_blank" className="admin-action-secondary">
                <FileText className="size-4" /> Public rules
              </Link>
              <Link to="/integrity" target="_blank" className="admin-action-secondary">
                <EyeOff className="size-4" /> Reporter view
              </Link>
            </div>
          }
        />

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Open cases" value={openCount} icon={ShieldCheck} tone="info" />
          <Metric label="Urgent" value={urgentCount} icon={AlertTriangle} tone={urgentCount ? "blocked" : "ready"} />
          <Metric label="Waiting for reporter" value={waitingCount} icon={MessageCircle} tone={waitingCount ? "attention" : "ready"} />
        </div>

        <div className="grid min-h-[680px] gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <AdminCard className="!p-0 overflow-hidden">
            <div className="border-b border-white/[0.07] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="admin-section-label">Case queue</p>
                  <p className="mt-1 text-sm font-bold">{filtered.length} shown</p>
                </div>
                <button type="button" onClick={() => casesQuery.refetch()} disabled={casesQuery.isFetching} className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-muted-foreground transition hover:text-foreground">
                  <RefreshCw className={cn("size-4", casesQuery.isFetching && "animate-spin")} />
                </button>
              </div>

              <label className="mt-4 flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3">
                <Search className="size-4 text-muted-foreground" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search case, country or edition…" className="min-w-0 flex-1 border-0 !bg-transparent text-xs shadow-none outline-none focus-visible:!shadow-none" />
              </label>

              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {(["open", "all", "waiting_for_reporter", "investigation_opened"] as const).map((filter) => (
                  <button key={filter} type="button" onClick={() => setStatusFilter(filter)} className={cn("min-h-8 shrink-0 rounded-lg border px-2.5 text-[10px] font-bold", statusFilter === filter ? "border-sky-200/20 bg-sky-200/[0.09] text-sky-100" : "border-white/[0.06] bg-white/[0.02] text-muted-foreground")}>{filter === "open" ? "Open" : filter === "all" ? "All" : formatIntegrityStatus(filter).label}</button>
                ))}
              </div>
            </div>

            <div className="max-h-[720px] overflow-y-auto scroll-slim">
              {casesQuery.isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading integrity cases…</div>
              ) : casesQuery.isError ? (
                <div className="p-6"><p className="text-sm font-bold text-rose-200">Could not load cases</p><p className="mt-1 text-xs text-muted-foreground">{casesQuery.error instanceof Error ? casesQuery.error.message : "Unknown error"}</p></div>
              ) : filtered.length ? (
                filtered.map((item) => <CaseQueueItem key={item.id} item={item} selected={selectedId === item.id} onClick={() => setSelectedId(item.id)} />)
              ) : (
                <div className="p-6 text-center"><CheckCircle2 className="mx-auto size-6 text-emerald-200" /><p className="mt-2 text-sm font-bold">No cases here</p><p className="mt-1 text-xs text-muted-foreground">The selected filters have nothing waiting. A rare moment of administrative peace.</p></div>
              )}
            </div>
          </AdminCard>

          {selectedId ? (
            <CaseWorkspace
              detail={detailQuery.data ?? null}
              loading={detailQuery.isLoading}
              error={detailQuery.error}
              refresh={async () => {
                await Promise.all([detailQuery.refetch(), casesQuery.refetch()]);
              }}
            />
          ) : (
            <AdminCard>
              <div className="grid min-h-[560px] place-items-center text-center">
                <div className="max-w-sm">
                  <ShieldCheck className="mx-auto size-9 text-sky-200" />
                  <h2 className="mt-4 text-xl font-black">Choose a case</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">The queue contains only case information. Recovery secrets are stored separately and are never exposed to the organizer workspace.</p>
                </div>
              </div>
            </AdminCard>
          )}
        </div>
      </div>
    </AdminPage>
  );
}

function CaseQueueItem({ item, selected, onClick }: { item: CaseListItem; selected: boolean; onClick: () => void }) {
  const category = getIntegrityCategory(item.category);
  const status = formatIntegrityStatus(item.status);
  const priorityClass = item.priority === "urgent" ? "text-rose-200" : item.priority === "high" ? "text-amber-200" : "text-muted-foreground";
  return (
    <button type="button" onClick={onClick} className={cn("w-full border-b border-white/[0.055] p-4 text-left transition last:border-b-0", selected ? "bg-sky-200/[0.07]" : "hover:bg-white/[0.025]")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-black text-sky-200">{item.public_code}</p>
          <p className="mt-1 line-clamp-2 text-sm font-bold leading-5">{item.summary}</p>
        </div>
        <span className={cn("shrink-0 text-[9px] font-black uppercase tracking-[.1em]", priorityClass)}>{item.priority}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span>{category.label}</span><span>•</span><span>{status.label}</span><span>•</span><span>{new Date(item.updated_at).toLocaleDateString()}</span>
      </div>
    </button>
  );
}

function CaseWorkspace({ detail, loading, error, refresh }: { detail: AdminCaseDetail | null; loading: boolean; error: unknown; refresh: () => Promise<void> }) {
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [requestResponse, setRequestResponse] = useState(true);

  const replyMutation = useMutation({
    mutationFn: () => {
      if (!detail) throw new Error("Case not loaded");
      return rpc("admin_reply_integrity_case", { _case_id: detail.case.id, _body: reply, _request_response: requestResponse });
    },
    onSuccess: async () => { setReply(""); await refresh(); toast.success("Message sent to reporter"); },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not send message"),
  });

  const noteMutation = useMutation({
    mutationFn: () => {
      if (!detail) throw new Error("Case not loaded");
      return rpc("admin_add_integrity_case_note", { _case_id: detail.case.id, _body: note });
    },
    onSuccess: async () => { setNote(""); await refresh(); toast.success("Internal note added"); },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not add note"),
  });

  const statusMutation = useMutation({
    mutationFn: (status: IntegrityCaseStatus) => {
      if (!detail) throw new Error("Case not loaded");
      return rpc("admin_update_integrity_case_status", { _case_id: detail.case.id, _status: status });
    },
    onSuccess: async () => { await refresh(); toast.success("Case status updated"); },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Could not update status"),
  });

  if (loading) return <AdminCard><div className="grid min-h-[560px] place-items-center"><RefreshCw className="size-6 animate-spin text-sky-200" /></div></AdminCard>;
  if (error || !detail) return <AdminCard><div className="p-6"><p className="font-bold text-rose-200">Could not open this case.</p><p className="mt-1 text-xs text-muted-foreground">{error instanceof Error ? error.message : "No case data returned."}</p></div></AdminCard>;

  const category = getIntegrityCategory(detail.case.category);
  const status = formatIntegrityStatus(detail.case.status);

  return (
    <div className="min-w-0 space-y-4">
      <AdminCard strong>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-black text-sky-200">{detail.case.public_code}</span>
              <span className="rounded-full border border-emerald-300/12 bg-emerald-300/[0.05] px-2 py-1 text-[9px] font-black uppercase tracking-[.1em] text-emerald-100">{detail.case.identity_mode === "anonymous" ? "Anonymous reporter" : detail.case.identity_mode}</span>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-[-.035em]">{detail.case.summary}</h2>
            <p className="mt-2 text-xs text-muted-foreground">{category.label} · {detail.case.edition_reference || "No edition specified"} · {new Date(detail.case.created_at).toLocaleString()}</p>
          </div>
          <AdminStatus tone={detail.case.status.startsWith("closed") ? "ready" : detail.case.priority === "urgent" ? "blocked" : detail.case.priority === "high" ? "attention" : "info"}>{status.label}</AdminStatus>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <CaseText title="Reported concern" value={detail.case.details} />
          <div className="space-y-3">
            {detail.case.observed_facts ? <CaseText title="Personally observed" value={detail.case.observed_facts} /> : null}
            {detail.case.uncertainties ? <CaseText title="Uncertain / suspected" value={detail.case.uncertainties} /> : null}
            {detail.case.related_countries?.length ? <CaseText title="Countries named" value={detail.case.related_countries.join(", ")} /> : null}
          </div>
        </div>
      </AdminCard>

      <div className="grid gap-4 2xl:grid-cols-[1.2fr_.8fr]">
        <AdminCard>
          <div className="flex items-center justify-between gap-3"><div><p className="admin-section-label">Reporter thread</p><h3 className="mt-1 text-lg font-black">Two-way messages</h3></div><MessageCircle className="size-5 text-sky-200" /></div>
          <div className="mt-4 max-h-[430px] space-y-3 overflow-y-auto pr-1 scroll-slim">
            {detail.messages.map((message) => <div key={message.id} className={cn("max-w-[88%] rounded-2xl border p-3", message.author_role === "tsbc" ? "ml-auto border-sky-300/12 bg-sky-300/[0.045]" : "border-emerald-300/12 bg-emerald-300/[0.045]")}><div className="flex items-center justify-between gap-3 text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground"><span>{message.author_role === "tsbc" ? "TSBC" : "Anonymous reporter"}</span><span>{new Date(message.created_at).toLocaleString()}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-200/90">{message.body}</p></div>)}
          </div>
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
            <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={4} placeholder="Message the reporter without asking them to reveal their identity…" className="w-full resize-y border-0 !bg-transparent text-xs leading-5 shadow-none outline-none focus-visible:!shadow-none" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
              <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={requestResponse} onChange={(event) => setRequestResponse(event.target.checked)} className="size-4" /> Mark case as waiting for reporter</label>
              <button type="button" onClick={() => replyMutation.mutate()} disabled={replyMutation.isPending || reply.trim().length < 2} className="admin-action-primary"><Send className="size-3.5" />{replyMutation.isPending ? "Sending…" : "Send"}</button>
            </div>
          </div>
        </AdminCard>

        <div className="space-y-4">
          <AdminCard>
            <p className="admin-section-label">Case status</p>
            <select value={detail.case.status} onChange={(event) => statusMutation.mutate(event.target.value as IntegrityCaseStatus)} disabled={statusMutation.isPending} className="mt-3 min-h-11 w-full rounded-xl border px-3 text-xs">
              {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{formatIntegrityStatus(item).label}</option>)}
            </select>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Status changes are added to the case timeline. Closed outcomes deliberately distinguish “no violation” from “insufficient evidence”.</p>
          </AdminCard>

          <AdminCard>
            <div className="flex items-center gap-2"><StickyNote className="size-4 text-amber-200" /><p className="admin-section-label">Internal notes</p></div>
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto scroll-slim">
              {detail.notes.length ? detail.notes.map((item) => <div key={item.id} className="rounded-xl border border-amber-300/10 bg-amber-300/[0.035] p-3"><p className="whitespace-pre-wrap text-xs leading-5">{item.body}</p><p className="mt-1 text-[9px] text-muted-foreground">{new Date(item.created_at).toLocaleString()} · organizer only</p></div>) : <p className="text-xs text-muted-foreground">No internal notes.</p>}
            </div>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Internal investigator note…" className="mt-3 w-full resize-y rounded-xl border p-3 text-xs leading-5" />
            <button type="button" onClick={() => noteMutation.mutate()} disabled={noteMutation.isPending || note.trim().length < 2} className="admin-action-secondary mt-2"><StickyNote className="size-3.5" />Add internal note</button>
          </AdminCard>

          <AdminCard>
            <div className="flex items-center gap-2"><Clock3 className="size-4 text-sky-200" /><p className="admin-section-label">Audit timeline</p></div>
            <div className="mt-3 max-h-56 space-y-3 overflow-y-auto scroll-slim">
              {[...detail.events].reverse().map((event) => <div key={event.id} className="border-l border-white/[0.09] pl-3"><p className="text-xs font-semibold">{event.detail ?? event.event_type}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{new Date(event.created_at).toLocaleString()}{event.visible_to_reporter ? " · reporter-visible" : " · internal"}</p></div>)}
            </div>
          </AdminCard>
        </div>
      </div>
    </div>
  );
}

function CaseText({ title, value }: { title: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4"><p className="admin-section-label">{title}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-200/88">{value}</p></div>;
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof ShieldCheck; tone: "ready" | "attention" | "blocked" | "info" }) {
  return <AdminCard className="!p-4"><div className="flex items-start justify-between gap-3"><div><p className="numeric text-2xl font-black">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[.12em] text-muted-foreground">{label}</p></div><AdminStatus tone={tone}><Icon className="size-3.5" /></AdminStatus></div></AdminCard>;
}
