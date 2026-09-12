import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Download,
  Eye,
  EyeOff,
  FileLock2,
  FileUp,
  GitBranch,
  RefreshCw,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import {
  createOrganizerEvidenceDisclosureCopy,
  getOrganizerEvidenceDownloadUrl,
  uploadOrganizerEvidenceDerivative,
  type EvidenceDerivativeKind,
} from "@/lib/integrity-evidence";

export const Route = createFileRoute("/_authenticated/admin/integrity-disclosure")({
  head: () => ({
    meta: [
      { title: "Evidence Disclosure Desk — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityEvidenceDisclosureDesk,
});

type CaseListItem = {
  id: string;
  public_code: string;
  summary: string;
  case_kind: string;
  status: string;
  priority: string;
  updated_at: string;
};

type EvidenceItem = {
  id: string;
  source_role: string;
  evidence_type: "file" | "url" | "text" | "voting_analysis" | "statement";
  title: string;
  description: string | null;
  external_url: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  provenance: string | null;
  redacted_from_id: string | null;
  disclosure_copy_of_id: string | null;
  visible_to_reporter: boolean;
  lifecycle_status: "active" | "scheduled_for_deletion" | "deleted";
  retention_until: string | null;
  deleted_at: string | null;
  created_at: string;
};

type CaseDetail = {
  case: {
    id: string;
    public_code: string;
    summary: string;
    status: string;
    priority: string;
  };
  evidence: EvidenceItem[];
};

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function IntegrityEvidenceDisclosureDesk() {
  const casesQuery = useQuery({
    queryKey: ["admin-integrity-cases", "disclosure"],
    queryFn: () => rpc<CaseListItem[]>("admin_integrity_cases"),
  });
  const [selectedCase, setSelectedCase] = useState("");
  const cases = casesQuery.data ?? [];
  const caseId = selectedCase || cases[0]?.id || "";
  const detailQuery = useQuery({
    queryKey: ["admin-integrity-case", "disclosure", caseId],
    queryFn: () => rpc<CaseDetail | null>("admin_integrity_case", { _case_id: caseId }),
    enabled: Boolean(caseId),
  });

  const refresh = async () => {
    await Promise.all([casesQuery.refetch(), detailQuery.refetch()]);
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1540px]">
        <AdminPageHeader
          eyebrow="Trust & Integrity · Evidence"
          title="Evidence disclosure desk"
          description="Prepare a redacted or disclosure copy while preserving the original evidence unchanged. Reporter-facing copies keep explicit lineage back to the internal source without exposing private storage locations."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/integrity-evidence" className="admin-action-secondary"><FileLock2 className="size-4" />Lifecycle</Link>
              <button type="button" onClick={() => void refresh()} className="admin-action-secondary"><RefreshCw className="size-4" />Refresh</button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Integrity cases" value={cases.length} tone="info" />
          <Metric label="Selected-case evidence" value={detailQuery.data?.evidence.length ?? 0} tone="info" />
          <Metric label="Original mutation" value={0} tone="ready" suffix="append-only" />
        </div>

        <AdminCard className="mt-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="block">
              <span className="admin-section-label">Case</span>
              <select value={caseId} onChange={(event) => setSelectedCase(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border px-3 text-sm">
                {!cases.length ? <option value="">No integrity cases</option> : null}
                {cases.map((item) => <option key={item.id} value={item.id}>{item.public_code} · {item.summary}</option>)}
              </select>
            </label>
            {caseId ? <Link to="/admin/integrity-case/$caseId" params={{ caseId }} className="admin-action-secondary">Open investigation <ArrowRight className="size-3.5" /></Link> : null}
          </div>
        </AdminCard>

        {!caseId ? (
          <AdminCard className="mt-4"><EmptyState text="There are no Integrity cases to review." /></AdminCard>
        ) : detailQuery.isLoading ? (
          <AdminCard className="mt-4"><LoadingState /></AdminCard>
        ) : detailQuery.data ? (
          <DisclosureWorkspace detail={detailQuery.data} onChanged={refresh} />
        ) : (
          <AdminCard className="mt-4"><EmptyState text="The selected case is no longer available." /></AdminCard>
        )}
      </div>
    </AdminPage>
  );
}

function DisclosureWorkspace({ detail, onChanged }: { detail: CaseDetail; onChanged: () => Promise<unknown> }) {
  const available = useMemo(
    () => detail.evidence.filter((item) => item.lifecycle_status !== "deleted"),
    [detail.evidence],
  );
  const [selectedEvidence, setSelectedEvidence] = useState("");
  const source = available.find((item) => item.id === selectedEvidence) ?? available[0] ?? null;

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(360px,.78fr)_minmax(0,1.22fr)]">
      <AdminCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="admin-section-label">Source evidence</p>
            <h2 className="mt-1 text-lg font-black">Choose the immutable original or an existing derivative</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Deleted evidence cannot seed a new copy. Existing derivatives remain selectable when they are still active.</p>
          </div>
          <GitBranch className="size-5 text-violet-200" />
        </div>

        <div className="mt-4 space-y-2">
          {available.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedEvidence(item.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${source?.id === item.id ? "border-violet-200/22 bg-violet-200/[0.055]" : "border-white/[0.07] bg-black/10 hover:border-white/[0.12]"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[.1em] text-sky-200">{item.evidence_type.replaceAll("_", " ")}</span>
                {item.visible_to_reporter ? <span className="rounded-full border border-emerald-200/12 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-100">reporter-visible</span> : <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[8px] font-black uppercase text-muted-foreground">internal</span>}
                {item.redacted_from_id ? <span className="rounded-full border border-amber-200/12 px-2 py-0.5 text-[8px] font-black uppercase text-amber-100">redacted derivative</span> : null}
                {item.disclosure_copy_of_id ? <span className="rounded-full border border-violet-200/12 px-2 py-0.5 text-[8px] font-black uppercase text-violet-100">disclosure copy</span> : null}
              </div>
              <p className="mt-2 text-xs font-black">{item.title}</p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{item.description ?? item.original_name ?? item.provenance ?? "No description"}</p>
            </button>
          ))}
          {!available.length ? <EmptyState text="This case has no active evidence available for disclosure." /> : null}
        </div>
      </AdminCard>

      {source ? <DerivativeComposer source={source} onChanged={onChanged} /> : <AdminCard><EmptyState text="Choose a source evidence item first." /></AdminCard>}
    </div>
  );
}

function DerivativeComposer({ source, onChanged }: { source: EvidenceItem; onChanged: () => Promise<unknown> }) {
  const [kind, setKind] = useState<EvidenceDerivativeKind>("redacted_disclosure");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(`${source.title} · disclosure copy`);
  const [description, setDescription] = useState(source.description ?? "");
  const [externalUrl, setExternalUrl] = useState(source.external_url ?? "");
  const [reason, setReason] = useState("");
  const [redactedText, setRedactedText] = useState(true);

  const downloadMutation = useMutation({
    mutationFn: () => getOrganizerEvidenceDownloadUrl(source.id),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: errorToast,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (source.evidence_type === "file") {
        if (!file) throw new Error("Choose the prepared derivative file to upload.");
        return uploadOrganizerEvidenceDerivative(source.id, file, kind, title, description, reason);
      }
      return createOrganizerEvidenceDisclosureCopy(source.id, {
        title,
        description,
        externalUrl: externalUrl || undefined,
        redacted: redactedText,
        reason,
      });
    },
    onSuccess: async (result) => {
      setFile(null);
      setReason("");
      await onChanged();
      toast.success(result.visible_to_reporter ? "Reporter-visible disclosure copy created" : "Internal redacted derivative created");
    },
    onError: errorToast,
  });

  const fileMode = source.evidence_type === "file";
  const reporterVisible = fileMode ? kind !== "redacted" : true;
  const valid = title.trim().length >= 2 && reason.trim().length >= 10 && (fileMode ? Boolean(file) : description.trim().length >= 2);

  return (
    <AdminCard strong>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="admin-section-label">Derivative builder</p>
          <h2 className="mt-1 text-lg font-black">{source.title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">The source row stays unchanged. This workflow creates a new evidence record linked back to source ID <span className="font-mono text-slate-300">{source.id.slice(0, 8)}…</span>.</p>
        </div>
        {source.evidence_type === "file" ? (
          <button type="button" disabled={downloadMutation.isPending} onClick={() => downloadMutation.mutate()} className="admin-action-secondary">
            <Download className="size-4" />{downloadMutation.isPending ? "Preparing…" : "Secure source download"}
          </button>
        ) : null}
      </div>

      {fileMode ? (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <ModeButton active={kind === "redacted_disclosure"} onClick={() => setKind("redacted_disclosure")} icon={Scissors} title="Redacted disclosure" text="Reporter-visible copy with sensitive material removed." />
          <ModeButton active={kind === "disclosure"} onClick={() => setKind("disclosure")} icon={Eye} title="Disclosure copy" text="Reporter-visible copy without claiming redaction." />
          <ModeButton active={kind === "redacted"} onClick={() => setKind("redacted")} icon={EyeOff} title="Internal redaction" text="Private derivative for organizer review only." />
        </div>
      ) : (
        <label className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.08] bg-black/10 p-3 text-xs">
          <input type="checkbox" checked={redactedText} onChange={(event) => setRedactedText(event.target.checked)} className="mt-0.5" />
          <span><strong>Mark this disclosure as redacted.</strong><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">The new text/URL copy is always reporter-visible. This flag records whether identifying or irrelevant material was deliberately removed.</span></span>
        </label>
      )}

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em]">
          {reporterVisible ? <Eye className="size-3.5 text-emerald-200" /> : <EyeOff className="size-3.5 text-amber-200" />}
          <span className={reporterVisible ? "text-emerald-100" : "text-amber-100"}>{reporterVisible ? "Reporter-visible derivative" : "Internal derivative"}</span>
        </div>

        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Derivative title" className="mt-3 min-h-10 w-full rounded-lg border px-3 text-xs" />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder={fileMode ? "Optional description of what was redacted or disclosed" : "Reporter-facing redacted/disclosed content"} className="mt-2 w-full rounded-lg border p-3 text-xs leading-5" />

        {fileMode ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/[0.1] p-3">
            <div className="flex items-start gap-2"><FileUp className="mt-0.5 size-4 text-sky-200" /><div><p className="text-xs font-bold">Upload the prepared derivative</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Redact locally before upload. Solaris stores this as a new private object and links the resulting evidence row to the immutable source.</p></div></div>
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-3 block w-full text-xs" />
          </div>
        ) : source.evidence_type === "url" ? (
          <input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="Optional reporter-facing URL" className="mt-2 min-h-10 w-full rounded-lg border px-3 text-xs" />
        ) : null}

        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Required internal reason for creating this derivative, including what was removed or why disclosure is necessary" className="mt-2 w-full rounded-lg border p-3 text-xs leading-5" />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[9px] leading-4 text-muted-foreground">The disclosure event is audit-recorded. File downloads remain signed for 60 seconds and private bucket locators never appear here.</p>
          <button type="button" disabled={!valid || createMutation.isPending} onClick={() => createMutation.mutate()} className="admin-action-primary">
            <GitBranch className="size-4" />{createMutation.isPending ? "Creating…" : "Create derivative"}
          </button>
        </div>
      </div>
    </AdminCard>
  );
}

function ModeButton({ active, onClick, icon: Icon, title, text }: { active: boolean; onClick: () => void; icon: typeof Eye; title: string; text: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border p-3 text-left transition ${active ? "border-violet-200/24 bg-violet-200/[0.065]" : "border-white/[0.07] bg-black/10 hover:border-white/[0.12]"}`}>
      <Icon className="size-4 text-violet-200" />
      <p className="mt-2 text-xs font-black">{title}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{text}</p>
    </button>
  );
}

function Metric({ label, value, tone, suffix }: { label: string; value: number; tone: "blocked" | "attention" | "ready" | "info"; suffix?: string }) {
  return <AdminCard className="!p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-2xl font-black">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{label}</p></div><AdminStatus tone={tone}>{suffix ?? (value ? "Available" : "None")}</AdminStatus></div></AdminCard>;
}

function LoadingState() {
  return <div className="grid min-h-28 place-items-center"><RefreshCw className="size-5 animate-spin text-sky-200" /></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function errorToast(error: unknown) {
  toast.error(error instanceof Error ? error.message : "The evidence disclosure action could not be completed");
}
