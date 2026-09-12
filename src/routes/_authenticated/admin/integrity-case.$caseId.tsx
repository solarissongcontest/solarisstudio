import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Download,
  Eye,
  FileClock,
  FileText,
  Gavel,
  GitMerge,
  History,
  KeyRound,
  Link2,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Scale,
  SearchCheck,
  ShieldCheck,
  StickyNote,
  Trash2,
  Undo2,
  UserMinus,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { formatIntegrityStatus, getIntegrityCategory, type IntegrityCaseStatus, type IntegrityPriority } from "@/lib/integrity";
import {
  cancelEvidenceDeletion,
  getEvidenceAccessLog,
  getOrganizerEvidenceDownloadUrl,
  scheduleEvidenceDeletion,
  setCaseEvidenceRetention,
  type EvidenceAccessLogItem,
} from "@/lib/integrity-evidence";
import {
  decideSealedIdentityDisclosure,
  getCurrentIntegrityOrganizerId,
  listIdentityDisclosureRequests,
  requestSealedIdentityDisclosure,
  revealSealedIdentity,
  type RevealedSealedIdentity,
} from "@/lib/integrity-identity";
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

type RuleLink = {
  rule_id: string;
  relevance: "alleged" | "reviewed" | "context" | "supported" | "not_supported";
  note: string | null;
};
type Finding = {
  id: string;
  outcome: string;
  summary: string;
  rationale: string;
  rule_ids: string[];
  visible_to_reporter: boolean;
  created_at: string;
};
type Reviewer = {
  user_id: string;
  email: string | null;
  review_role: string;
  assigned_at: string;
  recused_at: string | null;
  recusal_reason: string | null;
};
type Relation = {
  id: string;
  related_case_id: string;
  related_public_code: string;
  relation_type: string;
  note: string | null;
  created_at: string;
};
type Evidence = {
  id: string;
  source_role: string;
  evidence_type: string;
  title: string;
  description: string | null;
  external_url: string | null;
  original_name: string | null;
  mime_type: string | null;
  provenance: string | null;
  redacted_from_id: string | null;
  disclosure_copy_of_id: string | null;
  visible_to_reporter: boolean;
  retention_until: string | null;
  lifecycle_status: "active" | "scheduled_for_deletion" | "deleted";
  deletion_reason: string | null;
  deleted_at: string | null;
  created_at: string;
};
type RequestItem = { id: string; request_kind: string; prompt: string; status: string; created_at: string };
type EventItem = { id: string; event_type: string; detail: string | null; visible_to_reporter: boolean; created_at: string };
type NoteItem = { id: string; body: string; created_at: string };
type MessageItem = { id: string; author_role: string; body: string; created_at: string };
type ResolutionSummary = {
  sanctions: Array<{ id: string; status: string; final_level: number }>;
  appeals: Array<{ id: string; status: string }>;
};

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
  const detailQuery = useQuery({
    queryKey: ["integrity-investigation", caseId],
    queryFn: () => rpc<CaseDetail | null>("admin_integrity_case", { _case_id: caseId }),
  });
  const casesQuery = useQuery({
    queryKey: ["admin-integrity-cases"],
    queryFn: () => rpc<CaseListItem[]>("admin_integrity_cases"),
  });
  const organizersQuery = useQuery({
    queryKey: ["integrity-organizers"],
    queryFn: () => rpc<Organizer[]>("admin_organizer_directory"),
  });
  const resolutionQuery = useQuery({
    queryKey: ["integrity-resolution-summary", caseId],
    queryFn: () => rpc<ResolutionSummary>("admin_integrity_case_resolution", { _case_id: caseId }),
  });

  const refresh = async () => {
    await Promise.all([detailQuery.refetch(), casesQuery.refetch(), resolutionQuery.refetch()]);
  };

  if (detailQuery.isLoading) {
    return (
      <AdminPage>
        <div className="grid min-h-[60vh] place-items-center">
          <RefreshCw className="size-6 animate-spin text-sky-200" />
        </div>
      </AdminPage>
    );
  }
  if (!detailQuery.data) {
    return (
      <AdminPage>
        <AdminCard><p className="font-bold text-rose-200">Integrity case not found or unavailable.</p></AdminCard>
      </AdminPage>
    );
  }

  const detail = detailQuery.data;
  const category = getIntegrityCategory(detail.case.category);
  const status = formatIntegrityStatus(detail.case.status);
  const resolution = resolutionQuery.data ?? { sanctions: [], appeals: [] };

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1540px]">
        <Link to="/admin/integrity" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Case queue
        </Link>
        <AdminPageHeader
          eyebrow={`${detail.case.public_code} · ${category.label}`}
          title={detail.case.summary}
          description={`${detail.case.identity_mode.replaceAll("_", " ")} identity · ${status.label} · ${detail.case.priority} priority`}
          actions={
            <div className="flex flex-wrap gap-2">
              <AdminStatus tone={detail.case.status.startsWith("closed") ? "ready" : detail.case.priority === "urgent" ? "blocked" : detail.case.priority === "high" ? "attention" : "info"}>
                {status.label}
              </AdminStatus>
              <button type="button" onClick={() => void refresh()} className="admin-action-secondary">
                <RefreshCw className="size-4" /> Refresh
              </button>
            </div>
          }
        />

        <CaseLifecycleStageTracker detail={detail} resolution={resolution} />

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
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

const CASE_STAGES = [
  "Received",
  "Triage",
  "Assigned",
  "Evidence",
  "Response",
  "Finding",
  "Sanction",
  "Appeal",
  "Final",
  "Possible precedent",
] as const;

function caseStageIndex(detail: CaseDetail, resolution: ResolutionSummary) {
  const eventTypes = new Set(detail.events.map((event) => event.event_type));
  const activeReviewers = detail.reviewers.filter((reviewer) => !reviewer.recused_at);
  const hasResponse =
    detail.messages.length > 1 ||
    detail.requests.some((request) => request.status === "responded") ||
    [...eventTypes].some((type) => ["tsbc.question", "tsbc.message", "reporter.message"].includes(type));
  const finalAppeal = resolution.appeals.some((appeal) => !["submitted", "under_review"].includes(appeal.status));
  const finalWithoutSanction = detail.findings.some((finding) => finding.outcome !== "violation");

  if ([...eventTypes].some((type) => type.includes("decision.published"))) return 9;
  if (detail.case.status.startsWith("closed") || finalAppeal || finalWithoutSanction) return 8;
  if (resolution.appeals.length) return 7;
  if (resolution.sanctions.length) return 6;
  if (detail.findings.length) return 5;
  if (hasResponse) return 4;
  if (detail.evidence.length) return 3;
  if (activeReviewers.length || detail.case.assigned_to) return 2;
  if (detail.case.status !== "received") return 1;
  return 0;
}

function CaseLifecycleStageTracker({ detail, resolution }: { detail: CaseDetail; resolution: ResolutionSummary }) {
  const current = caseStageIndex(detail, resolution);
  return (
    <AdminCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.14em] text-sky-200/70">Case lifecycle</p>
          <h2 className="mt-1 font-black">One investigation record, distinct legal stages</h2>
          <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
            An allegation is not evidence, evidence is not a finding, a finding is not a sanction, and an appeal is a fresh review rather than a rewrite of history.
          </p>
        </div>
        <Link to="/admin/integrity-resolution/$caseId" params={{ caseId: detail.case.id }} className="admin-action-secondary text-[10px]">
          <Gavel className="size-3.5" /> Resolution workspace
        </Link>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Integrity case lifecycle stages">
        {CASE_STAGES.map((stage, index) => {
          const complete = index < current;
          const active = index === current;
          return (
            <li
              key={stage}
              aria-current={active ? "step" : undefined}
              className={cn(
                "rounded-xl border p-3",
                active
                  ? "border-sky-200/25 bg-sky-200/[0.07]"
                  : complete
                    ? "border-emerald-200/12 bg-emerald-200/[0.035]"
                    : "border-white/[0.06] bg-white/[0.015]",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("grid size-6 place-items-center rounded-full text-[9px] font-black", active ? "bg-sky-200 text-slate-950" : complete ? "bg-emerald-200/15 text-emerald-100" : "bg-white/[0.05] text-muted-foreground")}>{index + 1}</span>
                <span className="text-[10px] font-black">{stage}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </AdminCard>
  );
}

function CaseFacts({ detail }: { detail: CaseDetail }) {
  return (
    <AdminCard strong>
      <div className="grid gap-3 lg:grid-cols-2">
        <CaseText title="Reported concern" value={detail.case.details} />
        <div className="space-y-3">
          {detail.case.observed_facts ? <CaseText title="Personally observed" value={detail.case.observed_facts} /> : null}
          {detail.case.uncertainties ? <CaseText title="Uncertain / suspected" value={detail.case.uncertainties} /> : null}
          {detail.case.related_countries?.length ? <CaseText title="Countries named" value={detail.case.related_countries.join(", ")} /> : null}
          <CaseText title="Case type" value={detail.case.case_kind.replaceAll("_", " ")} />
        </div>
      </div>
    </AdminCard>
  );
}

function EvidencePanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [type, setType] = useState("text");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [visible, setVisible] = useState(false);
  const [retentionDate, setRetentionDate] = useState(() => toLocalDateTimeValue(detail.case.retention_until));
  const [retentionReason, setRetentionReason] = useState("");

  const accessQuery = useQuery({
    queryKey: ["integrity-evidence-access-log", detail.case.id],
    queryFn: () => getEvidenceAccessLog(detail.case.id),
  });
  const addMutation = useMutation({
    mutationFn: () => rpc("admin_register_integrity_evidence", {
      _case_id: detail.case.id,
      _evidence_type: type,
      _title: title,
      _description: description || null,
      _external_url: url || null,
      _visible_to_reporter: visible,
    }),
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setUrl("");
      await refresh();
      toast.success("Evidence item added");
    },
    onError: errorToast,
  });
  const downloadMutation = useMutation({
    mutationFn: (evidenceId: string) => getOrganizerEvidenceDownloadUrl(evidenceId),
    onSuccess: async ({ url: signedUrl }) => {
      await accessQuery.refetch();
      window.location.assign(signedUrl);
    },
    onError: errorToast,
  });
  const retentionMutation = useMutation({
    mutationFn: () => {
      const iso = localDateTimeToIso(retentionDate);
      if (!iso) throw new Error("Choose a valid future retention date.");
      return setCaseEvidenceRetention(detail.case.id, iso, retentionReason);
    },
    onSuccess: async () => {
      setRetentionReason("");
      await refresh();
      toast.success("Case evidence retention updated");
    },
    onError: errorToast,
  });

  return (
    <AdminCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle icon={FileText} eyebrow="Evidence vault" title={`${detail.evidence.length} evidence item${detail.evidence.length === 1 ? "" : "s"}`} />
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/integrity-disclosure" className="admin-action-secondary text-[10px]">Redaction & disclosure</Link>
          <Link to="/admin/integrity-evidence" className="admin-action-secondary text-[10px]">Lifecycle queue</Link>
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
        Originals stay immutable. Reporter-safe redactions and disclosures are linked derivatives. Private file retrieval uses audit-logged 60-second signed URLs, and deletion is scheduled through the server lifecycle rather than direct browser storage calls.
      </p>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2"><CalendarClock className="size-4 text-amber-200" /><p className="text-xs font-black">Case evidence retention</p></div>
        <p className="mt-1 text-[10px] text-muted-foreground">Current: {detail.case.retention_until ? new Date(detail.case.retention_until).toLocaleString() : "No explicit case retention date"}</p>
        <div className="mt-3 grid gap-2 lg:grid-cols-[13rem_1fr_auto]">
          <input type="datetime-local" value={retentionDate} onChange={(event) => setRetentionDate(event.target.value)} className="min-h-10 rounded-lg border px-2 text-xs" />
          <input value={retentionReason} onChange={(event) => setRetentionReason(event.target.value)} placeholder="Reason for retention period" className="min-h-10 rounded-lg border px-3 text-xs" />
          <button type="button" disabled={!retentionDate || retentionReason.trim().length < 10 || retentionMutation.isPending} onClick={() => retentionMutation.mutate()} className="admin-action-secondary">Set retention</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {detail.evidence.map((item) => (
          <EvidenceCard
            key={item.id}
            item={item}
            accessLog={accessQuery.data ?? []}
            downloading={downloadMutation.isPending && downloadMutation.variables === item.id}
            onDownload={() => downloadMutation.mutate(item.id)}
            refresh={async () => {
              await Promise.all([refresh(), accessQuery.refetch()]);
            }}
          />
        ))}
      </div>
      {!detail.evidence.length ? <Empty text="No evidence has been attached yet." /> : null}

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <p className="text-xs font-black">Register non-file evidence</p>
        <div className="mt-3 grid gap-2 md:grid-cols-[10rem_1fr]">
          <select value={type} onChange={(event) => setType(event.target.value)} className="min-h-10 rounded-lg border px-2 text-xs">
            <option value="text">Text / note</option>
            <option value="url">URL</option>
            <option value="statement">Statement</option>
            <option value="voting_analysis">Voting analysis</option>
          </select>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Evidence title" className="min-h-10 rounded-lg border px-3 text-xs" />
        </div>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Description / provenance / context" className="mt-2 w-full rounded-lg border p-3 text-xs" />
        {type === "url" ? <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs" /> : null}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> Reporter can see this item</label>
          <button type="button" disabled={title.trim().length < 2 || addMutation.isPending} onClick={() => addMutation.mutate()} className="admin-action-secondary">Add evidence</button>
        </div>
      </div>
    </AdminCard>
  );
}

function EvidenceCard({
  item,
  accessLog,
  downloading,
  onDownload,
  refresh,
}: {
  item: Evidence;
  accessLog: EvidenceAccessLogItem[];
  downloading: boolean;
  onDownload: () => void;
  refresh: () => Promise<void>;
}) {
  const [deleteAfter, setDeleteAfter] = useState(() => toLocalDateTimeValue(item.retention_until));
  const [reason, setReason] = useState("");
  const accesses = accessLog.filter((entry) => entry.evidence_id === item.id);
  const scheduleMutation = useMutation({
    mutationFn: () => {
      const iso = localDateTimeToIso(deleteAfter);
      if (!iso) throw new Error("Choose a valid future deletion time.");
      return scheduleEvidenceDeletion(item.id, iso, reason);
    },
    onSuccess: async () => {
      setReason("");
      await refresh();
      toast.success("Evidence deletion scheduled");
    },
    onError: errorToast,
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelEvidenceDeletion(item.id, reason),
    onSuccess: async () => {
      setReason("");
      await refresh();
      toast.success("Evidence deletion cancelled");
    },
    onError: errorToast,
  });

  const lineage = item.redacted_from_id
    ? "Redacted derivative"
    : item.disclosure_copy_of_id
      ? "Disclosure derivative"
      : "Original / standalone record";

  return (
    <article className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="text-[9px] font-black uppercase tracking-[.1em] text-sky-200">{item.evidence_type.replaceAll("_", " ")}</span>
          <p className="mt-1 text-sm font-bold">{item.title}</p>
        </div>
        <span className={cn("rounded-full border px-2 py-1 text-[8px] font-black uppercase", item.lifecycle_status === "active" ? "border-emerald-200/12 text-emerald-100" : item.lifecycle_status === "scheduled_for_deletion" ? "border-amber-200/12 text-amber-100" : "border-rose-200/12 text-rose-100")}>{item.lifecycle_status.replaceAll("_", " ")}</span>
      </div>
      {item.description ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p> : null}
      {item.provenance ? <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Provenance: {item.provenance}</p> : null}
      <dl className="mt-3 grid gap-2 text-[9px] text-muted-foreground sm:grid-cols-2">
        <div><dt className="font-black uppercase">Source</dt><dd>{item.source_role}</dd></div>
        <div><dt className="font-black uppercase">Reporter access</dt><dd>{item.visible_to_reporter ? "Visible" : "Private"}</dd></div>
        <div><dt className="font-black uppercase">Retention</dt><dd>{item.retention_until ? new Date(item.retention_until).toLocaleString() : "Not scheduled"}</dd></div>
        <div><dt className="font-black uppercase">Redaction status</dt><dd>{lineage}</dd></div>
      </dl>
      {item.original_name ? <p className="mt-2 text-[10px] text-muted-foreground">File: {item.original_name}</p> : null}
      {item.external_url ? <a href={item.external_url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-[10px] text-sky-200 hover:underline">{item.external_url}</a> : null}
      {item.deletion_reason ? <p className="mt-2 rounded-lg border border-amber-200/10 bg-amber-200/[0.025] p-2 text-[9px] leading-4 text-amber-50/75">Deletion reason: {item.deletion_reason}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {item.evidence_type === "file" && item.original_name && item.lifecycle_status !== "deleted" ? (
          <button type="button" disabled={downloading} onClick={onDownload} className="admin-action-secondary text-[10px]"><Download className="size-3.5" />{downloading ? "Preparing…" : "View securely"}</button>
        ) : null}
        <Link to="/admin/integrity-disclosure" className="admin-action-secondary text-[10px]"><FileText className="size-3.5" />Redact / disclose</Link>
      </div>

      <details className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.015] p-2.5">
        <summary className="cursor-pointer text-[10px] font-black"><History className="mr-1 inline size-3.5" />Access history · {accesses.length}</summary>
        <div className="mt-2 space-y-1.5">
          {accesses.slice(0, 8).map((entry) => <p key={entry.id} className="text-[9px] leading-4 text-muted-foreground">{new Date(entry.created_at).toLocaleString()} · {entry.actor_role} · {entry.action.replaceAll("_", " ")}</p>)}
          {!accesses.length ? <p className="text-[9px] text-muted-foreground">No audited access yet.</p> : null}
        </div>
      </details>

      {item.lifecycle_status !== "deleted" ? (
        <div className="mt-3 rounded-lg border border-white/[0.06] p-2.5">
          <div className="flex items-center gap-2"><FileClock className="size-3.5 text-amber-200" /><p className="text-[10px] font-black">Lifecycle action</p></div>
          <input type="datetime-local" value={deleteAfter} onChange={(event) => setDeleteAfter(event.target.value)} disabled={item.lifecycle_status === "scheduled_for_deletion"} className="mt-2 min-h-9 w-full rounded-lg border px-2 text-[10px]" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={item.lifecycle_status === "scheduled_for_deletion" ? "Reason to cancel scheduled deletion" : "Reason to schedule deletion"} className="mt-2 min-h-9 w-full rounded-lg border px-2 text-[10px]" />
          {item.lifecycle_status === "scheduled_for_deletion" ? (
            <button type="button" disabled={reason.trim().length < 10 || cancelMutation.isPending} onClick={() => cancelMutation.mutate()} className="admin-action-secondary mt-2 text-[10px]"><Undo2 className="size-3.5" />Cancel deletion</button>
          ) : (
            <button type="button" disabled={!deleteAfter || reason.trim().length < 10 || scheduleMutation.isPending} onClick={() => scheduleMutation.mutate()} className="admin-action-secondary mt-2 text-[10px]"><Trash2 className="size-3.5" />Schedule deletion</button>
          )}
        </div>
      ) : null}
    </article>
  );
}

function RulesPanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [ruleId, setRuleId] = useState("");
  const [relevance, setRelevance] = useState<RuleLink["relevance"]>("reviewed");
  const [note, setNote] = useState("");
  const rule = getRuleById(ruleId);
  const add = useMutation({
    mutationFn: () => rpc("admin_upsert_integrity_rule_link", { _case_id: detail.case.id, _rule_id: ruleId, _relevance: relevance, _note: note || null }),
    onSuccess: async () => { setRuleId(""); setNote(""); await refresh(); toast.success("Rule linked"); },
    onError: errorToast,
  });
  const remove = useMutation({
    mutationFn: (id: string) => rpc("admin_remove_integrity_rule_link", { _case_id: detail.case.id, _rule_id: id }),
    onSuccess: refresh,
    onError: errorToast,
  });

  return (
    <AdminCard>
      <SectionTitle icon={BookOpen} eyebrow="Rules under review" title="Tie the investigation to exact regulations" />
      <div className="mt-4 space-y-2">
        {detail.rule_links.map((item) => {
          const resolved = getRuleById(item.rule_id);
          return (
            <div key={item.rule_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-black/10 p-3">
              <Link to="/rules/$ruleId" params={{ ruleId: item.rule_id }} target="_blank" className="font-mono text-xs font-black text-sky-200">{item.rule_id}</Link>
              <span className="text-xs font-bold">{resolved?.title ?? "Unknown rule"}</span>
              <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[9px] uppercase text-muted-foreground">{item.relevance.replaceAll("_", " ")}</span>
              {item.note ? <span className="basis-full text-[10px] text-muted-foreground">{item.note}</span> : null}
              <button type="button" onClick={() => remove.mutate(item.rule_id)} className="ml-auto text-[10px] text-rose-200">Remove</button>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_10rem]">
        <input list="ssc-rule-list" value={ruleId} onChange={(event) => setRuleId(event.target.value)} placeholder="Rule, e.g. 11.2" className="min-h-10 rounded-lg border px-3 text-xs" />
        <datalist id="ssc-rule-list">{SSC_RULES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</datalist>
        <select value={relevance} onChange={(event) => setRelevance(event.target.value as RuleLink["relevance"])} className="min-h-10 rounded-lg border px-2 text-xs">
          <option value="alleged">Alleged</option><option value="reviewed">Reviewed</option><option value="context">Context</option><option value="supported">Supported</option><option value="not_supported">Not supported</option>
        </select>
      </div>
      <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional case-specific note" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs" />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[10px] text-muted-foreground">{rule ? `${rule.id} ${rule.title}` : "Use the current v4 rule number."}</p>
        <button type="button" disabled={!rule || add.isPending} onClick={() => add.mutate()} className="admin-action-secondary">Link rule</button>
      </div>
    </AdminCard>
  );
}

function FindingPanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [outcome, setOutcome] = useState("insufficient_evidence");
  const [summary, setSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [visible, setVisible] = useState(true);
  const [selectedRules, setSelectedRules] = useState<string[]>(detail.rule_links.map((item) => item.rule_id));
  const mutation = useMutation({
    mutationFn: () => rpc("admin_record_integrity_finding", { _case_id: detail.case.id, _outcome: outcome, _summary: summary, _rationale: rationale, _rule_ids: selectedRules, _visible_to_reporter: visible }),
    onSuccess: async () => { setSummary(""); setRationale(""); await refresh(); toast.success("Formal finding recorded"); },
    onError: errorToast,
  });

  return (
    <AdminCard>
      <SectionTitle icon={Gavel} eyebrow="Findings" title="Record what the evidence actually establishes" />
      <div className="mt-4 space-y-2">
        {detail.findings.map((item) => (
          <div key={item.id} className="rounded-xl border border-violet-300/12 bg-violet-300/[0.035] p-3">
            <div className="flex justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-[.1em] text-violet-200">{item.outcome.replaceAll("_", " ")}</span><span className="text-[9px] text-muted-foreground">{item.visible_to_reporter ? "reporter-visible" : "internal"}</span></div>
            <p className="mt-1 text-sm font-bold">{item.summary}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.rationale}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="min-h-10 w-full rounded-lg border px-2 text-xs">
          <option value="violation">Rule violation confirmed</option><option value="no_violation">No violation found</option><option value="insufficient_evidence">Insufficient evidence</option><option value="outside_jurisdiction">Outside SSC jurisdiction</option><option value="duplicate">Duplicate / linked case</option><option value="administrative_resolution">Administrative resolution</option>
        </select>
        <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Finding summary" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs" />
        <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={4} placeholder="Reasoning: facts established, evidence considered, uncertainties and rule application" className="mt-2 w-full rounded-lg border p-3 text-xs" />
        <div className="mt-3 flex flex-wrap gap-2">
          {detail.rule_links.map((item) => (
            <label key={item.rule_id} className={cn("rounded-lg border px-2 py-1 text-[10px]", selectedRules.includes(item.rule_id) ? "border-violet-300/20 bg-violet-300/[0.06]" : "border-white/[0.07]")}>
              <input type="checkbox" className="mr-1" checked={selectedRules.includes(item.rule_id)} onChange={() => setSelectedRules((current) => current.includes(item.rule_id) ? current.filter((id) => id !== item.rule_id) : [...current, item.rule_id])} />{item.rule_id}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> Share finding with reporter</label>
          <button type="button" disabled={summary.trim().length < 5 || rationale.trim().length < 20 || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-primary">Record finding</button>
        </div>
      </div>
    </AdminCard>
  );
}

function CommunicationPanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [request, setRequest] = useState(true);
  const [note, setNote] = useState("");
  const reply = useMutation({ mutationFn: () => rpc("admin_reply_integrity_case", { _case_id: detail.case.id, _body: message, _request_response: request }), onSuccess: async () => { setMessage(""); await refresh(); toast.success("Message sent"); }, onError: errorToast });
  const addNote = useMutation({ mutationFn: () => rpc("admin_add_integrity_case_note", { _case_id: detail.case.id, _body: note }), onSuccess: async () => { setNote(""); await refresh(); toast.success("Internal note added"); }, onError: errorToast });

  return (
    <AdminCard>
      <SectionTitle icon={MessageSquareText} eyebrow="Communication" title="Reporter thread & internal notes" />
      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
        {detail.messages.map((item) => <div key={item.id} className={cn("max-w-[85%] rounded-xl border p-3", item.author_role === "tsbc" ? "ml-auto border-sky-300/12 bg-sky-300/[0.035]" : "border-emerald-300/12 bg-emerald-300/[0.035]")}><p className="text-[9px] uppercase text-muted-foreground">{item.author_role}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{item.body}</p></div>)}
      </div>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="Message reporter…" className="mt-3 w-full rounded-lg border p-3 text-xs" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={request} onChange={(event) => setRequest(event.target.checked)} /> Request a response</label><button type="button" disabled={message.trim().length < 2 || reply.isPending} onClick={() => reply.mutate()} className="admin-action-secondary">Send</button></div>
      <div className="mt-5 border-t border-white/[0.07] pt-4"><div className="flex items-center gap-2"><StickyNote className="size-4 text-amber-200" /><p className="text-xs font-bold">Internal notes</p></div>{detail.notes.map((item) => <div key={item.id} className="mt-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] p-2.5 text-xs">{item.body}</div>)}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Organizer-only note" className="mt-2 w-full rounded-lg border p-3 text-xs" /><button type="button" disabled={note.trim().length < 2 || addNote.isPending} onClick={() => addNote.mutate()} className="admin-action-secondary mt-2">Add note</button></div>
    </AdminCard>
  );
}

function TriagePanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const status = useMutation({ mutationFn: (value: string) => rpc("admin_update_integrity_case_status", { _case_id: detail.case.id, _status: value }), onSuccess: refresh, onError: errorToast });
  const priority = useMutation({ mutationFn: (value: string) => rpc("admin_set_integrity_priority", { _case_id: detail.case.id, _priority: value }), onSuccess: refresh, onError: errorToast });
  return (
    <AdminCard>
      <SectionTitle icon={SearchCheck} eyebrow="Triage" title="Case state" />
      <label className="mt-4 block text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Status
        <select value={detail.case.status} onChange={(event) => status.mutate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs font-normal normal-case tracking-normal">
          <option value="received">Received</option><option value="awaiting_review">Awaiting review</option><option value="under_review">Under review</option><option value="waiting_for_reporter">Waiting for reporter</option><option value="investigation_opened">Investigation opened</option><option value="action_taken">Action taken</option><option value="closed_no_violation">Closed · no violation</option><option value="closed_insufficient_evidence">Closed · insufficient evidence</option><option value="closed_outside_jurisdiction">Closed · outside jurisdiction</option><option value="closed_duplicate">Closed · duplicate</option><option value="closed">Closed</option>
        </select>
      </label>
      <label className="mt-3 block text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Priority
        <select value={detail.case.priority} onChange={(event) => priority.mutate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-xs font-normal normal-case tracking-normal"><option value="information">Information</option><option value="standard">Standard</option><option value="high">High</option><option value="urgent">Urgent</option></select>
      </label>
    </AdminCard>
  );
}

function ReviewerPanel({ detail, organizers, refresh }: { detail: CaseDetail; organizers: Organizer[]; refresh: () => Promise<void> }) {
  const [user, setUser] = useState("");
  const [role, setRole] = useState("investigator");
  const [reason, setReason] = useState("");
  const assign = useMutation({ mutationFn: () => rpc("admin_assign_integrity_reviewer", { _case_id: detail.case.id, _user_id: user, _review_role: role }), onSuccess: refresh, onError: errorToast });
  const recuse = useMutation({ mutationFn: () => rpc("admin_recuse_from_integrity_case", { _case_id: detail.case.id, _reason: reason }), onSuccess: async () => { setReason(""); await refresh(); toast.success("Recusal recorded"); }, onError: errorToast });
  return (
    <AdminCard>
      <SectionTitle icon={UserPlus} eyebrow="Review team" title="Roles & conflicts" />
      <div className="mt-3 space-y-2">{detail.reviewers.map((item) => <div key={`${item.user_id}-${item.review_role}`} className="rounded-lg border border-white/[0.07] p-2.5"><div className="flex justify-between gap-2"><span className="text-xs font-bold">{item.email ?? item.user_id}</span><span className="text-[9px] uppercase text-muted-foreground">{item.review_role.replaceAll("_", " ")}</span></div>{item.recused_at ? <p className="mt-1 text-[10px] text-amber-200">Recused: {item.recusal_reason}</p> : null}</div>)}</div>
      <div className="mt-3 grid gap-2"><select value={user} onChange={(event) => setUser(event.target.value)} className="min-h-10 rounded-lg border px-2 text-xs"><option value="">Select organizer</option>{organizers.map((item) => <option key={item.user_id} value={item.user_id}>{item.email ?? item.user_id}</option>)}</select><select value={role} onChange={(event) => setRole(event.target.value)} className="min-h-10 rounded-lg border px-2 text-xs"><option value="triage">Triage reviewer</option><option value="investigator">Investigator</option><option value="decision_maker">Decision maker</option><option value="appeal_reviewer">Appeal reviewer</option></select><button type="button" disabled={!user || assign.isPending} onClick={() => assign.mutate()} className="admin-action-secondary"><UserPlus className="size-3.5" />Assign</button></div>
      <div className="mt-4 border-t border-white/[0.07] pt-3"><p className="text-[10px] font-black uppercase tracking-[.1em] text-amber-200">Conflict of interest</p><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why should you recuse?" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs" /><button type="button" disabled={reason.trim().length < 5 || recuse.isPending} onClick={() => recuse.mutate()} className="admin-action-secondary mt-2"><UserMinus className="size-3.5" />Recuse myself</button></div>
    </AdminCard>
  );
}

function RelationsPanel({ detail, cases, refresh }: { detail: CaseDetail; cases: CaseListItem[]; refresh: () => Promise<void> }) {
  const [related, setRelated] = useState("");
  const [type, setType] = useState("related");
  const [note, setNote] = useState("");
  const mutation = useMutation({ mutationFn: () => rpc("admin_link_integrity_cases", { _case_id: detail.case.id, _related_case_id: related, _relation_type: type, _note: note || null }), onSuccess: async () => { setRelated(""); setNote(""); await refresh(); toast.success("Cases linked"); }, onError: errorToast });
  return (
    <AdminCard>
      <SectionTitle icon={GitMerge} eyebrow="Related cases" title="Duplicates & corroboration" />
      <div className="mt-3 space-y-2">{detail.relations.map((item) => <div key={item.id} className="rounded-lg border border-white/[0.07] p-2.5"><span className="font-mono text-xs font-black text-sky-200">{item.related_public_code}</span><span className="ml-2 text-[9px] uppercase text-muted-foreground">{item.relation_type.replaceAll("_", " ")}</span>{item.note ? <p className="mt-1 text-[10px] text-muted-foreground">{item.note}</p> : null}</div>)}</div>
      <select value={related} onChange={(event) => setRelated(event.target.value)} className="mt-3 min-h-10 w-full rounded-lg border px-2 text-xs"><option value="">Choose another case</option>{cases.filter((item) => item.id !== detail.case.id).map((item) => <option key={item.id} value={item.id}>{item.public_code} · {item.summary}</option>)}</select>
      <select value={type} onChange={(event) => setType(event.target.value)} className="mt-2 min-h-10 w-full rounded-lg border px-2 text-xs"><option value="related">Related</option><option value="duplicate">Duplicate</option><option value="corroborating">Corroborating report</option><option value="same_incident">Same incident</option><option value="appeal_of">Appeal of</option></select>
      <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional relation note" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs" />
      <button type="button" disabled={!related || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-secondary mt-2"><Link2 className="size-3.5" />Link cases</button>
    </AdminCard>
  );
}

function IdentityPanel({ detail }: { detail: CaseDetail }) {
  const mode = detail.case.identity_mode;
  const [revealedConfidential, setRevealedConfidential] = useState<{ email: string | null } | null>(null);
  const [revealedSealed, setRevealedSealed] = useState<RevealedSealedIdentity | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const organizerQuery = useQuery({ queryKey: ["current-integrity-organizer-id"], queryFn: getCurrentIntegrityOrganizerId, enabled: mode === "sealed", staleTime: 10 * 60 * 1000 });
  const requestsQuery = useQuery({ queryKey: ["admin-identity-disclosure-requests", detail.case.id], queryFn: listIdentityDisclosureRequests, enabled: mode === "sealed", refetchInterval: 30_000 });
  const confidentialMutation = useMutation({ mutationFn: () => rpc<{ email: string | null }>("admin_integrity_reporter_identity", { _case_id: detail.case.id }), onSuccess: (data) => { setRevealedConfidential(data); toast.success("Confidential identity access recorded in audit log"); }, onError: errorToast });
  const refreshRequests = async () => { await requestsQuery.refetch(); };
  const requestMutation = useMutation({ mutationFn: () => requestSealedIdentityDisclosure(detail.case.id, requestReason), onSuccess: async () => { setRequestReason(""); await refreshRequests(); toast.success("Break-glass request created. A different organizer must decide it."); }, onError: errorToast });
  const caseRequests = (requestsQuery.data ?? []).filter((item) => item.case_id === detail.case.id);
  const activeRequest = caseRequests.find((item) => item.status === "pending" || item.status === "approved") ?? null;
  const currentUserId = organizerQuery.data ?? null;
  const isRequester = Boolean(activeRequest && currentUserId && activeRequest.requested_by === currentUserId);
  const approvalExpired = Boolean(activeRequest?.approval_expires_at && new Date(activeRequest.approval_expires_at).getTime() <= Date.now());
  const decideMutation = useMutation({ mutationFn: (approve: boolean) => { if (!activeRequest) throw new Error("No active disclosure request."); return decideSealedIdentityDisclosure(activeRequest.id, approve, decisionReason); }, onSuccess: async (result) => { setDecisionReason(""); await refreshRequests(); toast.success(result.status === "approved" ? "Disclosure approved for 30 minutes" : "Disclosure request rejected"); }, onError: errorToast });
  const revealMutation = useMutation({ mutationFn: () => { if (!activeRequest) throw new Error("No approved disclosure request."); return revealSealedIdentity(activeRequest.id); }, onSuccess: async (identity) => { setRevealedSealed(identity); await refreshRequests(); toast.success("Sealed identity revealed once and audit event recorded"); }, onError: errorToast });

  return (
    <AdminCard>
      <div className="flex items-start justify-between gap-3"><SectionTitle icon={LockKeyhole} eyebrow="Reporter protection" title={mode === "anonymous" ? "Fully anonymous" : mode === "sealed" ? "Sealed identity" : "Confidential identity"} /><Link to="/admin/integrity-identity" className="text-[9px] font-bold text-sky-200 hover:underline">Identity queue</Link></div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{mode === "anonymous" ? "There is no reporter account ID to reveal." : mode === "sealed" ? "Ordinary reviewers cannot reveal this identity. Exceptional access requires a written request, approval by a second different organizer, a 30-minute one-use window and a reporter-visible audit event when used." : "Identity is hidden by default. Explicit access is audit-logged."}</p>
      {mode === "confidential" ? <button type="button" onClick={() => confidentialMutation.mutate()} disabled={confidentialMutation.isPending || Boolean(revealedConfidential)} className="admin-action-secondary mt-3"><Eye className="size-3.5" />{revealedConfidential ? revealedConfidential.email ?? "Identity accessed" : "Reveal confidential identity"}</button> : null}
      {mode === "sealed" && requestsQuery.isLoading ? <p className="mt-3 text-[10px] text-muted-foreground">Loading break-glass status…</p> : null}
      {mode === "sealed" && !requestsQuery.isLoading && !activeRequest ? <div className="mt-4 rounded-xl border border-emerald-200/10 bg-emerald-200/[0.025] p-3"><div className="flex gap-2"><KeyRound className="mt-0.5 size-4 shrink-0 text-emerald-200" /><p className="text-[10px] leading-5 text-muted-foreground">Create a request only when knowing the reporter is genuinely necessary and ordinary sealed review is insufficient.</p></div><textarea value={requestReason} onChange={(event) => setRequestReason(event.target.value)} rows={4} placeholder="Exceptional reason…" className="admin-input mt-3 w-full resize-y" /><button type="button" disabled={requestReason.trim().length < 20 || requestMutation.isPending} onClick={() => requestMutation.mutate()} className="admin-action-secondary mt-2"><KeyRound className="size-3.5" />Request sealed identity access</button></div> : null}
      {mode === "sealed" && activeRequest?.status === "pending" ? <div className="mt-4 rounded-xl border border-sky-200/10 bg-sky-200/[0.03] p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-sky-200">Pending second-person review</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{activeRequest.reason}</p>{isRequester ? <p className="mt-3 text-[10px] leading-5 text-sky-100/70">You requested this disclosure. A different organizer must approve or reject it; self-approval is not available.</p> : <div className="mt-3"><textarea value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} rows={3} placeholder="Decision reason…" className="admin-input w-full resize-y" /><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={decisionReason.trim().length < 20 || decideMutation.isPending} onClick={() => decideMutation.mutate(true)} className="admin-action-primary"><CheckCircle2 className="size-3.5" />Approve 30 min</button><button type="button" disabled={decisionReason.trim().length < 20 || decideMutation.isPending} onClick={() => decideMutation.mutate(false)} className="admin-action-secondary text-rose-100"><XCircle className="size-3.5" />Reject</button></div></div>}</div> : null}
      {mode === "sealed" && activeRequest?.status === "approved" ? <div className="mt-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-200" /><div><p className="text-xs font-black text-amber-50">One-time disclosure window</p><p className="mt-1 text-[10px] leading-5 text-amber-50/70">Approval expires {activeRequest.approval_expires_at ? new Date(activeRequest.approval_expires_at).toLocaleString() : "soon"}. Only the requesting organizer can use it.</p></div></div>{isRequester && !approvalExpired && !revealedSealed ? <button type="button" disabled={revealMutation.isPending} onClick={() => revealMutation.mutate()} className="admin-action-primary mt-3"><Eye className="size-3.5" />Reveal sealed identity once</button> : null}{approvalExpired ? <p className="mt-3 text-[10px] text-amber-100/70">This approval has expired. Refreshing the queue will move it into history.</p> : null}{revealedSealed ? <div className="mt-3 rounded-lg border border-rose-200/12 bg-rose-200/[0.035] p-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-rose-100">Transient reveal</p><p className="mt-1 break-all text-sm font-black">{revealedSealed.email ?? revealedSealed.user_id}</p><p className="mt-1 text-[9px] leading-4 text-muted-foreground">Shown only in this browser state. It is not copied into the case model.</p></div> : null}</div> : null}
    </AdminCard>
  );
}

function DecisionPublicationPanel({ detail, refresh }: { detail: CaseDetail; refresh: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const rules = useMemo(() => Array.from(new Set(detail.findings.flatMap((item) => item.rule_ids))), [detail.findings]);
  const mutation = useMutation({ mutationFn: () => rpc("admin_publish_integrity_decision", { _case_id: detail.case.id, _title: title, _summary: summary, _rationale: rationale, _rule_ids: rules }), onSuccess: async () => { setTitle(""); setSummary(""); setRationale(""); await refresh(); toast.success("Anonymised decision published"); }, onError: errorToast });
  return (
    <AdminCard>
      <SectionTitle icon={BadgeCheck} eyebrow="Precedent" title="Publish anonymised decision" />
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Publish only reusable rule reasoning. Do not copy private evidence, usernames or details that identify a protected source.</p>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Decision title" className="mt-3 min-h-10 w-full rounded-lg border px-3 text-xs" />
      <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} placeholder="Public summary" className="mt-2 w-full rounded-lg border p-3 text-xs" />
      <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={3} placeholder="Anonymised reasoning" className="mt-2 w-full rounded-lg border p-3 text-xs" />
      <button type="button" disabled={title.trim().length < 3 || summary.trim().length < 5 || rationale.trim().length < 20 || mutation.isPending} onClick={() => mutation.mutate()} className="admin-action-secondary mt-2"><BadgeCheck className="size-3.5" />Publish decision</button>
    </AdminCard>
  );
}

function TimelinePanel({ detail }: { detail: CaseDetail }) {
  return (
    <AdminCard>
      <SectionTitle icon={Scale} eyebrow="Audit trail" title="Case timeline" />
      <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">{[...detail.events].reverse().map((item) => <div key={item.id} className="border-l border-white/[0.1] pl-3"><p className="text-xs font-semibold">{item.detail ?? item.event_type}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{new Date(item.created_at).toLocaleString()} · {item.visible_to_reporter ? "reporter-visible" : "internal"}</p></div>)}</div>
    </AdminCard>
  );
}

function toLocalDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function CaseText({ title, value }: { title: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4"><p className="text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{title}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-200/88">{value}</p></div>;
}

function SectionTitle({ icon: Icon, eyebrow, title }: { icon: LucideIcon; eyebrow: string; title: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025]"><Icon className="size-4 text-sky-200" /></span><div><p className="text-[9px] font-black uppercase tracking-[.13em] text-muted-foreground">{eyebrow}</p><h2 className="mt-0.5 font-black">{title}</h2></div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="mt-3 rounded-xl border border-dashed border-white/[0.09] p-5 text-center text-xs text-muted-foreground">{text}</div>;
}

function errorToast(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Integrity action failed");
}

function InlineLabel({ children }: { children: ReactNode }) {
  return <span className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">{children}</span>;
}
