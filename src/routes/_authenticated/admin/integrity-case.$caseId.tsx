import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  Gavel,
  GitMerge,
  Link2,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Scale,
  SearchCheck,
  ShieldCheck,
  StickyNote,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { formatIntegrityStatus, getIntegrityCategory, type IntegrityCaseStatus, type IntegrityPriority } from "@/lib/integrity";
import { getRuleById, SSC_RULES } from "@/lib/ssc-rules-v4";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/integrity-case/$caseId")({
  head: () => ({
    meta: [
      { title: "Integrity Investigation — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvestigationDesk,
});

type RuleLink = { rule_id: string; relevance: "alleged" | "reviewed" | "context" | "supported" | "not_supported"; note: string | null };
type Finding = { id: string; outcome: string; summary: string; rationale: string; rule_ids: string[]; visible_to_reporter: boolean; created_at: string };
type Reviewer = { user_id: string; email: string | null; review_role: string; assigned_at: string; recused_at: string | null; recusal_reason: string | null };
type Relation = { id: string; related_case_id: string; related_public_code: string; relation_type: string; note: string | null; created_at: string };
type Evidence = { id: string; source_role: string; evidence_type: string; title: string; description: string | null; external_url: string | null; original_name: string | null; visible_to_reporter: boolean; created_at: string };
type RequestItem = { id: string; request_kind: string; prompt: string; status: string; created_at: string };
type EventItem = { id: string; event_type: string; detail: string | null; visible_to_reporter: boolean; created_at: string };
type NoteItem = { id: string; body: string; created_at: string };
type MessageItem = { id: string; author_role: string; body: string; created_at: string };

type CaseDetail = {
  case: {
    id: string;
    public_code: string;
    case_kind: string;
    category: string;
    identity_mode: "anonymous" | "sealed" | "confidential";
    summary: string;
    details: string;
    observed_facts: string | null;
    uncertainties: string | null;
    related_countries: string[];
    edition_reference: string | null;
    status: IntegrityCaseStatus;
    priority: IntegrityPriority;
    assigned_to: string | null;
    retention_until: string | null;
    created_at: string;
    updated_at: string;
  };
  messages: MessageItem[];
  notes: NoteItem[];
  events: EventItem[];
  rule_links: RuleLink[];
  findings: Finding[];
  reviewers: Reviewer[];
  relations: Relation[];
  requests: RequestItem[];
  evidence: Evidence[];
};

type CaseListItem = { id: string; public_code: string; summary: string; category: string; status: string };
type Organizer = { user_id: string; email: string | null };

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function InvestigationDesk() {
  const { caseId } = Route.useParams();
  const detailQuery = useQuery({ queryKey: ["integrity-investigation", caseId], queryFn: () => rpc<CaseDetail | null>("admin_integrity_case", { _case_id: caseId }) });
  const casesQuery = useQuery({ queryKey: ["admin-integrity-cases"], queryFn: () => rpc<CaseListItem[]>("admin_integrity_cases") });
  const organizersQuery = useQuery({ queryKey: ["integrity-organizers"], queryFn: () => rpc<Organizer[]>("admin_organizer_directory") });

  const refresh = async () => {
    await Promise.all([detailQuery.refetch(), casesQuery.refetch()]);
  };

  if (detailQuery.isLoading) return <AdminPage><div className="grid min-h-[60vh] place-items-center"><RefreshCw className="size-6 animate-spin text-sky-200" /></div></AdminPage>;
  if (!detailQuery.data) return <AdminPage><AdminCard><p className="font-bold text-rose-200">Integrity case not found or unavailable.</p></AdminCard></AdminPage>;

  const detail = detailQuery.data;
  const category = getIntegrityCategory(detail.case.category);
  const status = formatIntegrityStatus(detail.case.status);

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1540px]">
        <Link to="/admin/integrity" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Case queue</Link>
        <AdminPageHeader
          eyebrow={`${detail.case.public_code} · ${category.label}`}
          title={detail.case.summary}
          description={`${detail.case.identity_mode.replaceAll("_", " ")} identity · ${status.label} · ${detail.case.priority} priority`}
          actions={<div className="flex flex-wrap gap-2"><AdminStatus tone={detail.case.status.startsWith("closed") ? "ready" : detail.case.priority === "urgent" ? "blocked" : detail.case.priority === "high" ? "attention" : "info"}>{status.label}</AdminStatus><button type="button" onClick={() => void refresh()} className="admin-action-secondary"><RefreshCw className="size-4" /> Refresh</button></div>}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
          <main className="min-w-0 space-y-4">
            <CaseFacts detail={detail} />
            <EvidencePanel detail={detail} refresh={refresh} />
            <RulesPanel detail={detail} refresh={refresh} />
            <FindingPanel detail={detail} refresh={refresh} />
            <CommunicationPanel detail={detail} refresh={refresh} />
          </main>
          <aside className="space-y-4">
            <TriagePanel detail={detail} refresh={refresh} />
            <ReviewerPanel detail={detail} organizers={organizersQuery.data ?? []} refresh={refresh} />
            <RelationsPanel detail={detail} cases={casesQuery.data ?? []} refresh={refresh} />
            <IdentityPanel detail={detail} />
            <DecisionPublicationPanel detail={detail} refresh={refresh} />
            <TimelinePanel detail={detail} />
          </aside>
        </div>
      </div>
    </AdminPage>
  );
}

function CaseFacts({ detail }: { detail: CaseDetail }) {
  return <AdminCard strong><div className="grid gap-3 lg:grid-cols-2"><CaseText title="Reported concern" value={detail.case.details}/><div className="space-y-3">{detail.case.observed_facts ? <CaseText title="Personally observed" value={detail.case.observed_facts}/> : null}{detail.case.uncertainties ? <CaseText title="Uncertain / suspected" value={detail.case.uncertainties}/> : null}{detail.case.related_countries?.length ? <CaseText title="Countries named" value={detail.case.related_countries.join(", ")}/> : null}<CaseText title="Case type" value={detail.case.case_kind.replaceAll("_", " ")}/></div></div></AdminCard>;
}

function EvidencePanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [type, setType] = useState("text");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [visible, setVisible] = useState(false);
  const mutation = useMutation({ mutationFn: () => rpc("admin_register_integrity_evidence", { _case_id: detail.case.id, _evidence_type: type, _title: title, _description: description || null, _external_url: url || null, _visible_to_reporter: visible }), onSuccess: async () => { setTitle(""); setDescription(""); setUrl(""); await refresh(); toast.success("Evidence item added"); }, onError: errorToast });
  return <AdminCard><SectionTitle icon={FileText} eyebrow="Evidence vault" title={`${detail.evidence.length} evidence item${detail.evidence.length === 1 ? "" : "s"}`}/><div className="mt-4 grid gap-2 md:grid-cols-2">{detail.evidence.map((item) => <div key={item.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-3"><div className="flex justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-[.1em] text-sky-200">{item.evidence_type.replaceAll("_", " ")}</span><span className="text-[9px] text-muted-foreground">{item.source_role}</span></div><p className="mt-1 text-sm font-bold">{item.title}</p>{item.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p> : null}{item.original_name ? <p className="mt-2 text-[10px] text-muted-foreground">File: {item.original_name}</p> : null}{item.external_url ? <p className="mt-2 break-all text-[10px] text-sky-200">{item.external_url}</p> : null}</div>)}</div><div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><div className="grid gap-2 md:grid-cols-[10rem_1fr]"><select value={type} onChange={(e) => setType(e.target.value)} className="min-h-10 rounded-lg border px-2 text-xs"><option value="text">Text / note</option><option value="url">URL</option><option value="statement">Statement</option><option value="voting_analysis">Voting analysis</option></select><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Evidence title" className="min-h-10 rounded-lg border px-3 text-xs"/></div><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Description / provenance / context" className="mt-2 w-full rounded-lg border p-3 text-xs"/>{type === "url" ? <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs"/> : null}<div className="mt-2 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)}/> Reporter can see this item</label><button type="button" disabled={title.trim().length < 2 || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-secondary">Add evidence</button></div></div></AdminCard>;
}

function RulesPanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [ruleId, setRuleId] = useState("");
  const [relevance, setRelevance] = useState<RuleLink["relevance"]>("reviewed");
  const [note, setNote] = useState("");
  const rule = getRuleById(ruleId);
  const add = useMutation({ mutationFn: () => rpc("admin_upsert_integrity_rule_link", { _case_id: detail.case.id, _rule_id: ruleId, _relevance: relevance, _note: note || null }), onSuccess: async () => { setRuleId(""); setNote(""); await refresh(); toast.success("Rule linked"); }, onError: errorToast });
  const remove = useMutation({ mutationFn: (id: string) => rpc("admin_remove_integrity_rule_link", { _case_id: detail.case.id, _rule_id: id }), onSuccess: refresh, onError: errorToast });
  return <AdminCard><SectionTitle icon={BookOpen} eyebrow="Rules under review" title="Tie the investigation to exact regulations"/><div className="mt-4 space-y-2">{detail.rule_links.map((item) => { const resolved = getRuleById(item.rule_id); return <div key={item.rule_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-black/10 p-3"><Link to="/rules/$ruleId" params={{ ruleId: item.rule_id }} target="_blank" className="font-mono text-xs font-black text-sky-200">{item.rule_id}</Link><span className="text-xs font-bold">{resolved?.title ?? "Unknown rule"}</span><span className="rounded-full bg-white/[0.05] px-2 py-1 text-[9px] uppercase text-muted-foreground">{item.relevance.replaceAll("_", " ")}</span>{item.note ? <span className="basis-full text-[10px] text-muted-foreground">{item.note}</span> : null}<button type="button" onClick={() => remove.mutate(item.rule_id)} className="ml-auto text-[10px] text-rose-200">Remove</button></div>; })}</div><div className="mt-4 grid gap-2 md:grid-cols-[1fr_10rem]"><input list="ssc-rule-list" value={ruleId} onChange={(e) => setRuleId(e.target.value)} placeholder="Rule, e.g. 11.2" className="min-h-10 rounded-lg border px-3 text-xs"/><datalist id="ssc-rule-list">{SSC_RULES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</datalist><select value={relevance} onChange={(e) => setRelevance(e.target.value as RuleLink["relevance"])} className="min-h-10 rounded-lg border px-2 text-xs"><option value="alleged">Alleged</option><option value="reviewed">Reviewed</option><option value="context">Context</option><option value="supported">Supported</option><option value="not_supported">Not supported</option></select></div><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional case-specific note" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs"/><div className="mt-2 flex items-center justify-between"><p className="text-[10px] text-muted-foreground">{rule ? `${rule.id} ${rule.title}` : "Use the current v4 rule number."}</p><button type="button" disabled={!rule || add.isPending} onClick={() => add.mutate()} className="admin-action-secondary">Link rule</button></div></AdminCard>;
}

function FindingPanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [outcome, setOutcome] = useState("insufficient_evidence");
  const [summary, setSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [visible, setVisible] = useState(true);
  const [selectedRules, setSelectedRules] = useState<string[]>(detail.rule_links.map((item) => item.rule_id));
  const mutation = useMutation({ mutationFn: () => rpc("admin_record_integrity_finding", { _case_id: detail.case.id, _outcome: outcome, _summary: summary, _rationale: rationale, _rule_ids: selectedRules, _visible_to_reporter: visible }), onSuccess: async () => { setSummary(""); setRationale(""); await refresh(); toast.success("Formal finding recorded"); }, onError: errorToast });
  return <AdminCard><SectionTitle icon={Gavel} eyebrow="Findings" title="Record what the evidence actually establishes"/><div className="mt-4 space-y-2">{detail.findings.map((item) => <div key={item.id} className="rounded-xl border border-violet-300/12 bg-violet-300/[0.035] p-3"><div className="flex justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-[.1em] text-violet-200">{item.outcome.replaceAll("_", " ")}</span><span className="text-[9px] text-muted-foreground">{item.visible_to_reporter ? "reporter-visible" : "internal"}</span></div><p className="mt-1 text-sm font-bold">{item.summary}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.rationale}</p></div>)}</div><div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3"><select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="min-h-10 w-full rounded-lg border px-2 text-xs"><option value="violation">Rule violation confirmed</option><option value="no_violation">No violation found</option><option value="insufficient_evidence">Insufficient evidence</option><option value="outside_jurisdiction">Outside SSC jurisdiction</option><option value="duplicate">Duplicate / linked case</option><option value="administrative_resolution">Administrative resolution</option></select><input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Finding summary" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs"/><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={4} placeholder="Reasoning: facts established, evidence considered, uncertainties and rule application" className="mt-2 w-full rounded-lg border p-3 text-xs"/><div className="mt-3 flex flex-wrap gap-2">{detail.rule_links.map((item) => <label key={item.rule_id} className={cn("rounded-lg border px-2 py-1 text-[10px]", selectedRules.includes(item.rule_id) ? "border-violet-300/20 bg-violet-300/[0.06]" : "border-white/[0.07]")}><input type="checkbox" className="mr-1" checked={selectedRules.includes(item.rule_id)} onChange={() => setSelectedRules((current) => current.includes(item.rule_id) ? current.filter((id) => id !== item.rule_id) : [...current, item.rule_id])}/>{item.rule_id}</label>)}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)}/> Share finding with reporter</label><button type="button" disabled={summary.trim().length < 5 || rationale.trim().length < 20 || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-primary">Record finding</button></div></div></AdminCard>;
}

function CommunicationPanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [request, setRequest] = useState(true);
  const [note, setNote] = useState("");
  const reply = useMutation({ mutationFn: () => rpc("admin_reply_integrity_case", { _case_id: detail.case.id, _body: message, _request_response: request }), onSuccess: async () => { setMessage(""); await refresh(); toast.success("Message sent"); }, onError: errorToast });
  const addNote = useMutation({ mutationFn: () => rpc("admin_add_integrity_case_note", { _case_id: detail.case.id, _body: note }), onSuccess: async () => { setNote(""); await refresh(); toast.success("Internal note added"); }, onError: errorToast });
  return <AdminCard><SectionTitle icon={MessageSquareText} eyebrow="Communication" title="Reporter thread & internal notes"/><div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{detail.messages.map((item) => <div key={item.id} className={cn("max-w-[85%] rounded-xl border p-3", item.author_role === "tsbc" ? "ml-auto border-sky-300/12 bg-sky-300/[0.035]" : "border-emerald-300/12 bg-emerald-300/[0.035]")}><p className="text-[9px] uppercase text-muted-foreground">{item.author_role}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{item.body}</p></div>)}</div><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Message reporter…" className="mt-3 w-full rounded-lg border p-3 text-xs"/><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={request} onChange={(e) => setRequest(e.target.checked)}/> Request a response</label><button type="button" disabled={message.trim().length < 2 || reply.isPending} onClick={() => reply.mutate()} className="admin-action-secondary">Send</button></div><div className="mt-5 border-t border-white/[0.07] pt-4"><div className="flex items-center gap-2"><StickyNote className="size-4 text-amber-200"/><p className="text-xs font-bold">Internal notes</p></div>{detail.notes.map((item) => <div key={item.id} className="mt-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] p-2.5 text-xs">{item.body}</div>)}<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Organizer-only note" className="mt-2 w-full rounded-lg border p-3 text-xs"/><button type="button" disabled={note.trim().length < 2 || addNote.isPending} onClick={() => addNote.mutate()} className="admin-action-secondary mt-2">Add note</button></div></AdminCard>;
}

function TriagePanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const status = useMutation({ mutationFn: (value: string) => rpc("admin_update_integrity_case_status", { _case_id: detail.case.id, _status: value }), onSuccess: refresh, onError: errorToast });
  const priority = useMutation({ mutationFn: (value: string) => rpc("admin_set_integrity_priority", { _case_id: detail.case.id, _priority: value }), onSuccess: refresh, onError: errorToast });
  return <AdminCard><SectionTitle icon={SearchCheck} eyebrow="Triage" title="Case state"/><label className="mt-4 block text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Status<select value={detail.case.status} onChange={(e) => status.mutate(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs font-normal normal-case tracking-normal"><option value="received">Received</option><option value="awaiting_review">Awaiting review</option><option value="under_review">Under review</option><option value="waiting_for_reporter">Waiting for reporter</option><option value="investigation_opened">Investigation opened</option><option value="action_taken">Action taken</option><option value="closed_no_violation">Closed · no violation</option><option value="closed_insufficient_evidence">Closed · insufficient evidence</option><option value="closed_outside_jurisdiction">Closed · outside jurisdiction</option><option value="closed_duplicate">Closed · duplicate</option><option value="closed">Closed</option></select></label><label className="mt-3 block text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Priority<select value={detail.case.priority} onChange={(e) => priority.mutate(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs font-normal normal-case tracking-normal"><option value="information">Information</option><option value="standard">Standard</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></AdminCard>;
}

function ReviewerPanel({ detail, organizers, refresh }: { detail: CaseDetail; organizers: Organizer[]; refresh: () => Promise<void> }) {
  const [user, setUser] = useState(""); const [role, setRole] = useState("investigator"); const [reason, setReason] = useState("");
  const assign = useMutation({ mutationFn: () => rpc("admin_assign_integrity_reviewer", { _case_id: detail.case.id, _user_id: user, _review_role: role }), onSuccess: refresh, onError: errorToast });
  const recuse = useMutation({ mutationFn: () => rpc("admin_recuse_from_integrity_case", { _case_id: detail.case.id, _reason: reason }), onSuccess: async () => { setReason(""); await refresh(); toast.success("Recusal recorded"); }, onError: errorToast });
  return <AdminCard><SectionTitle icon={UserPlus} eyebrow="Review team" title="Roles & conflicts"/><div className="mt-3 space-y-2">{detail.reviewers.map((item) => <div key={`${item.user_id}-${item.review_role}`} className="rounded-lg border border-white/[0.07] p-2.5"><div className="flex justify-between gap-2"><span className="text-xs font-bold">{item.email ?? item.user_id}</span><span className="text-[9px] uppercase text-muted-foreground">{item.review_role.replaceAll("_", " ")}</span></div>{item.recused_at ? <p className="mt-1 text-[10px] text-amber-200">Recused: {item.recusal_reason}</p> : null}</div>)}</div><div className="mt-3 grid gap-2"><select value={user} onChange={(e) => setUser(e.target.value)} className="min-h-10 rounded-lg border px-2 text-xs"><option value="">Select organizer</option>{organizers.map((item) => <option key={item.user_id} value={item.user_id}>{item.email ?? item.user_id}</option>)}</select><select value={role} onChange={(e) => setRole(e.target.value)} className="min-h-10 rounded-lg border px-2 text-xs"><option value="triage">Triage reviewer</option><option value="investigator">Investigator</option><option value="decision_maker">Decision maker</option><option value="appeal_reviewer">Appeal reviewer</option></select><button type="button" disabled={!user || assign.isPending} onClick={() => assign.mutate()} className="admin-action-secondary"><UserPlus className="size-3.5"/>Assign</button></div><div className="mt-4 border-t border-white/[0.07] pt-3"><p className="text-[10px] font-black uppercase tracking-[.1em] text-amber-200">Conflict of interest</p><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why should you recuse?" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs"/><button type="button" disabled={reason.trim().length < 5 || recuse.isPending} onClick={() => recuse.mutate()} className="admin-action-secondary mt-2"><UserMinus className="size-3.5"/>Recuse myself</button></div></AdminCard>;
}

function RelationsPanel({ detail, cases, refresh }: { detail: CaseDetail; cases: CaseListItem[]; refresh: () => Promise<void> }) {
  const [related, setRelated] = useState(""); const [type, setType] = useState("related"); const [note, setNote] = useState("");
  const mutation = useMutation({ mutationFn: () => rpc("admin_link_integrity_cases", { _case_id: detail.case.id, _related_case_id: related, _relation_type: type, _note: note || null }), onSuccess: async () => { setRelated(""); setNote(""); await refresh(); toast.success("Cases linked"); }, onError: errorToast });
  return <AdminCard><SectionTitle icon={GitMerge} eyebrow="Related cases" title="Duplicates & corroboration"/><div className="mt-3 space-y-2">{detail.relations.map((item) => <div key={item.id} className="rounded-lg border border-white/[0.07] p-2.5"><span className="font-mono text-xs font-black text-sky-200">{item.related_public_code}</span><span className="ml-2 text-[9px] uppercase text-muted-foreground">{item.relation_type.replaceAll("_", " ")}</span>{item.note ? <p className="mt-1 text-[10px] text-muted-foreground">{item.note}</p> : null}</div>)}</div><select value={related} onChange={(e) => setRelated(e.target.value)} className="mt-3 min-h-10 w-full rounded-lg border px-2 text-xs"><option value="">Choose another case</option>{cases.filter((item) => item.id !== detail.case.id).map((item) => <option key={item.id} value={item.id}>{item.public_code} · {item.summary}</option>)}</select><select value={type} onChange={(e) => setType(e.target.value)} className="mt-2 min-h-10 w-full rounded-lg border px-2 text-xs"><option value="related">Related</option><option value="duplicate">Duplicate</option><option value="corroborating">Corroborating report</option><option value="same_incident">Same incident</option><option value="appeal_of">Appeal of</option></select><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional relation note" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs"/><button type="button" disabled={!related || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-secondary mt-2"><Link2 className="size-3.5"/>Link cases</button></AdminCard>;
}

function IdentityPanel({ detail }: { detail: CaseDetail }) {
  const [revealed, setRevealed] = useState<{ email: string | null } | null>(null);
  const mutation = useMutation({ mutationFn: () => rpc<{ email: string | null }>("admin_integrity_reporter_identity", { _case_id: detail.case.id }), onSuccess: (data) => { setRevealed(data); toast.success("Confidential identity access recorded in audit log"); }, onError: errorToast });
  const mode = detail.case.identity_mode;
  return <AdminCard><SectionTitle icon={LockKeyhole} eyebrow="Reporter protection" title={mode === "anonymous" ? "Fully anonymous" : mode === "sealed" ? "Sealed identity" : "Confidential identity"}/><p className="mt-3 text-xs leading-5 text-muted-foreground">{mode === "anonymous" ? "There is no reporter account ID to reveal." : mode === "sealed" ? "The account exists only for recovery. The organizer identity RPC deliberately refuses to reveal sealed identities." : "Identity is hidden by default. Explicit access is audit-logged."}</p>{mode === "confidential" ? <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || Boolean(revealed)} className="admin-action-secondary mt-3"><Eye className="size-3.5"/>{revealed ? revealed.email ?? "Identity accessed" : "Reveal confidential identity"}</button> : null}</AdminCard>;
}

function DecisionPublicationPanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [title, setTitle] = useState(""); const [summary, setSummary] = useState(""); const [rationale, setRationale] = useState("");
  const rules = useMemo(() => Array.from(new Set(detail.findings.flatMap((item) => item.rule_ids))), [detail.findings]);
  const mutation = useMutation({ mutationFn: () => rpc("admin_publish_integrity_decision", { _case_id: detail.case.id, _title: title, _summary: summary, _rationale: rationale, _rule_ids: rules }), onSuccess: async () => { setTitle(""); setSummary(""); setRationale(""); await refresh(); toast.success("Anonymised decision published"); }, onError: errorToast });
  return <AdminCard><SectionTitle icon={BadgeCheck} eyebrow="Precedent" title="Publish anonymised decision"/><p className="mt-2 text-xs leading-5 text-muted-foreground">Publish only reusable rule reasoning. Do not copy private evidence, usernames or details that identify a protected source.</p><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Decision title" className="mt-3 min-h-10 w-full rounded-lg border px-3 text-xs"/><textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Public summary" className="mt-2 w-full rounded-lg border p-3 text-xs"/><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} placeholder="Anonymised reasoning" className="mt-2 w-full rounded-lg border p-3 text-xs"/><button type="button" disabled={title.trim().length < 3 || summary.trim().length < 5 || rationale.trim().length < 20 || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-secondary mt-2"><BadgeCheck className="size-3.5"/>Publish decision</button></AdminCard>;
}

function TimelinePanel({ detail }: { detail: CaseDetail }) { return <AdminCard><SectionTitle icon={Scale} eyebrow="Audit trail" title="Case timeline"/><div className="mt-3 max-h-80 space-y-3 overflow-y-auto">{[...detail.events].reverse().map((item) => <div key={item.id} className="border-l border-white/[0.1] pl-3"><p className="text-xs font-semibold">{item.detail ?? item.event_type}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{new Date(item.created_at).toLocaleString()} · {item.visible_to_reporter ? "reporter-visible" : "internal"}</p></div>)}</div></AdminCard>; }
function CaseText({ title, value }: { title: string; value: string }) { return <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{title}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-200/88">{value}</p></div>; }
function SectionTitle({ icon: Icon, eyebrow, title }: { icon: typeof ShieldCheck; eyebrow: string; title: string }) { return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025]"><Icon className="size-4 text-sky-200"/></span><div><p className="text-[9px] font-black uppercase tracking-[.13em] text-muted-foreground">{eyebrow}</p><h2 className="mt-0.5 font-black">{title}</h2></div></div>; }
function errorToast(error: unknown) { toast.error(error instanceof Error ? error.message : "Integrity action failed"); }
