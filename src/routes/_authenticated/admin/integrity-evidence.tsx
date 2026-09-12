import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArchiveRestore,
  ArrowRight,
  FileClock,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import {
  cleanExpiredEvidenceUpload,
  deleteDueEvidence,
  listDueEvidenceDeletions,
  listExpiredEvidenceUploads,
  type DueEvidenceDeletion,
  type ExpiredEvidenceUpload,
} from "@/lib/integrity-evidence";

export const Route = createFileRoute("/_authenticated/admin/integrity-evidence")({
  head: () => ({
    meta: [
      { title: "Integrity Evidence Lifecycle — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegrityEvidenceLifecycle,
});

function IntegrityEvidenceLifecycle() {
  const dueQuery = useQuery({
    queryKey: ["admin-integrity-evidence-due"],
    queryFn: listDueEvidenceDeletions,
    refetchInterval: 60_000,
  });
  const expiredQuery = useQuery({
    queryKey: ["admin-integrity-evidence-expired-uploads"],
    queryFn: listExpiredEvidenceUploads,
    refetchInterval: 60_000,
  });
  const due = dueQuery.data ?? [];
  const expired = expiredQuery.data ?? [];

  const refresh = async () => {
    await Promise.all([dueQuery.refetch(), expiredQuery.refetch()]);
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1450px]">
        <AdminPageHeader
          eyebrow="Trust & Integrity"
          title="Evidence lifecycle"
          description="Complete scheduled evidence deletion after retention expires, clean abandoned uploads and keep private case storage from becoming an eternal attic."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/integrity-investigations" className="admin-action-secondary"><ShieldCheck className="size-4" />Investigations</Link>
              <button type="button" onClick={() => void refresh()} className="admin-action-secondary"><RefreshCw className="size-4" />Refresh</button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Due deletions" value={due.length} tone={due.length ? "blocked" : "ready"} />
          <Metric label="Expired uploads" value={expired.length} tone={expired.length ? "attention" : "ready"} />
          <Metric label="Private bucket" value={1} tone="info" suffix="locked" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <AdminCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="admin-section-label">Scheduled evidence deletion</p>
                <h2 className="mt-1 text-lg font-black">Retention period completed</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">The storage object is removed first, then the evidence record is marked deleted. The audit record remains.</p>
              </div>
              <FileClock className="size-5 text-rose-200" />
            </div>

            <div className="mt-4 space-y-3">
              {due.map((item) => <DueEvidenceCard key={item.id} item={item} onChanged={refresh} />)}
              {!dueQuery.isLoading && !due.length ? <EmptyState text="No evidence has reached a scheduled deletion date." /> : null}
            </div>
          </AdminCard>

          <AdminCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="admin-section-label">Abandoned uploads</p>
                <h2 className="mt-1 text-lg font-black">Expired unfinished upload tokens</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">These are uploads that were prepared but never finalised into evidence. Any orphaned private object is removed before the token is discarded.</p>
              </div>
              <ArchiveRestore className="size-5 text-amber-200" />
            </div>

            <div className="mt-4 space-y-3">
              {expired.map((item) => <ExpiredUploadCard key={item.token_id} item={item} onChanged={refresh} />)}
              {!expiredQuery.isLoading && !expired.length ? <EmptyState text="No expired unfinished evidence uploads." /> : null}
            </div>
          </AdminCard>
        </div>

        <AdminCard className="mt-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-200" />
            <div>
              <p className="font-black">Deletion is deliberately two-step</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Solaris removes the private storage object before finalising the database deletion state. If storage deletion fails, the evidence record remains scheduled rather than pretending the bytes disappeared. A surprisingly radical commitment to reality.</p>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function DueEvidenceCard({ item, onChanged }: { item: DueEvidenceDeletion; onChanged: () => Promise<unknown> }) {
  const mutation = useMutation({
    mutationFn: () => deleteDueEvidence(item),
    onSuccess: async () => {
      await onChanged();
      toast.success("Evidence deletion completed");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete evidence"),
  });

  const confirmDeletion = () => {
    if (!window.confirm(`Permanently delete this private evidence item for ${item.case_code}? The audit record will remain, but the stored file cannot be recovered.`)) return;
    mutation.mutate();
  };

  return (
    <article className="rounded-xl border border-rose-200/10 bg-rose-200/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-black text-sky-200">{item.case_code}</span><span className="text-[9px] uppercase text-muted-foreground">due {new Date(item.retention_until).toLocaleString()}</span></div>
          <p className="mt-2 text-sm font-black">{item.title}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{item.original_name ?? "Non-file evidence"}{item.mime_type ? ` · ${item.mime_type}` : ""}</p>
        </div>
        <Trash2 className="size-4 shrink-0 text-rose-200" />
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.deletion_reason}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/admin/integrity-case/$caseId" params={{ caseId: item.case_id }} className="admin-action-secondary">Open case <ArrowRight className="size-3.5" /></Link>
        <button type="button" disabled={mutation.isPending} onClick={confirmDeletion} className="admin-action-secondary text-rose-100"><Trash2 className="size-3.5" />{mutation.isPending ? "Deleting…" : "Delete private evidence"}</button>
      </div>
    </article>
  );
}

function ExpiredUploadCard({ item, onChanged }: { item: ExpiredEvidenceUpload; onChanged: () => Promise<unknown> }) {
  const mutation = useMutation({
    mutationFn: () => cleanExpiredEvidenceUpload(item),
    onSuccess: async () => {
      await onChanged();
      toast.success("Expired upload cleaned");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not clean expired upload"),
  });

  const confirmCleanup = () => {
    if (!window.confirm(`Clean this expired unfinished upload? ${item.object_exists ? "Its orphaned private storage object will be permanently removed first." : "No storage object remains; the expired token will be discarded."}`)) return;
    mutation.mutate();
  };

  return (
    <article className="rounded-xl border border-amber-200/10 bg-amber-200/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">{item.original_name}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Expired {new Date(item.expires_at).toLocaleString()} · storage object {item.object_exists ? "exists" : "absent"}</p>
        </div>
        <ArchiveRestore className="size-4 shrink-0 text-amber-200" />
      </div>
      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Private storage location hidden from the interface.</p>
      <button type="button" disabled={mutation.isPending} onClick={confirmCleanup} className="admin-action-secondary mt-4"><Trash2 className="size-3.5" />{mutation.isPending ? "Cleaning…" : "Clean expired upload"}</button>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function Metric({ label, value, tone, suffix }: { label: string; value: number; tone: "blocked" | "attention" | "ready" | "info"; suffix?: string }) {
  return <AdminCard className="!p-4"><div className="flex items-start justify-between"><div><p className="text-2xl font-black">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">{label}</p></div><AdminStatus tone={tone}>{suffix ?? (value ? "Needs action" : "Clear")}</AdminStatus></div></AdminCard>;
}
