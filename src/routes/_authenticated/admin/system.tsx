import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, Clock3, History, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { useAdminContext } from "@/components/admin/AdminContext";
import { editionLabel, useEditions } from "@/lib/data";
import {
  useAdminAudit,
  useAdminDeadlines,
  useCreateAdminDeadline,
  useToggleAdminDeadline,
} from "@/lib/admin-ops";

export const Route = createFileRoute("/_authenticated/admin/system")({
  head: () => ({ meta: [{ title: "System — Solaris Organizer" }, { name: "robots", content: "noindex" }] }),
  component: AdminSystemPage,
});

function AdminSystemPage() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const selectedEdition = useMemo(() => {
    const ordered = [...editions].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    );
    return ordered.find((edition) => edition.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  const { data: deadlines = [] } = useAdminDeadlines(selectedEdition?.id ?? null);
  const { data: audit = [] } = useAdminAudit(80);
  const createDeadline = useCreateAdminDeadline();
  const toggleDeadline = useToggleAdminDeadline();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    label: "",
    kind: "entry",
    due_at: "",
    notes: "",
  });

  const openDeadlines = deadlines.filter((item) => !item.completed_at);
  const completedDeadlines = deadlines.filter((item) => !!item.completed_at);
  const overdueCount = openDeadlines.filter((item) => new Date(item.due_at).getTime() < Date.now()).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEdition || !form.label.trim() || !form.due_at) return;

    createDeadline.mutate(
      {
        edition_id: selectedEdition.id,
        show_id: null,
        kind: form.kind,
        label: form.label.trim(),
        due_at: new Date(form.due_at).toISOString(),
        notes: form.notes.trim() || null,
      },
      {
        onSuccess: () => {
          setForm({ label: "", kind: "entry", due_at: "", notes: "" });
          setCreateOpen(false);
        },
      },
    );
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="System"
        title="Deadlines & audit"
        description={
          selectedEdition
            ? `Operational deadlines for ${editionLabel(selectedEdition)} and the organizer change history.`
            : "Operational deadlines and organizer change history."
        }
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!selectedEdition}
            className="admin-action-primary"
          >
            <Plus className="size-4" /> Add deadline
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Metric label="Open" value={openDeadlines.length} />
        <Metric label="Overdue" value={overdueCount} attention={overdueCount > 0} />
        <Metric label="Completed" value={completedDeadlines.length} />
      </div>

      <AdminCard>
        <AdminCardHeader
          eyebrow={selectedEdition ? editionLabel(selectedEdition) : "Current edition"}
          title="Deadlines"
          description="Tap a deadline to mark it complete or reopen it. Deadlines are organizer reminders only and do not lock or punish delegations automatically."
        />

        {!deadlines.length ? (
          <AdminEmptyState
            icon={CalendarClock}
            title="No deadlines yet"
            description="Add only the dates you actually need to keep track of."
            action={
              <button type="button" onClick={() => setCreateOpen(true)} disabled={!selectedEdition} className="admin-action-primary">
                <Plus className="size-4" /> Add deadline
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {[...deadlines]
              .sort((a, b) => {
                if (!!a.completed_at !== !!b.completed_at) return a.completed_at ? 1 : -1;
                return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
              })
              .map((item) => {
                const complete = !!item.completed_at;
                const overdue = !complete && new Date(item.due_at).getTime() < Date.now();
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleDeadline.mutate({ id: item.id, complete: !complete })}
                    disabled={toggleDeadline.isPending}
                    className="admin-list-row w-full text-left disabled:opacity-60"
                  >
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl border ${complete ? "border-emerald-200/15 bg-emerald-200/[0.06] text-emerald-100" : overdue ? "border-rose-200/15 bg-rose-200/[0.06] text-rose-100" : "border-amber-200/15 bg-amber-200/[0.05] text-amber-100"}`}>
                      {complete ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {new Date(item.due_at).toLocaleString()} · {formatKind(item.kind)}
                      </span>
                      {item.notes ? <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.notes}</span> : null}
                    </span>
                    <AdminStatus tone={complete ? "ready" : overdue ? "blocked" : "attention"}>
                      {complete ? "Done" : overdue ? "Overdue" : "Open"}
                    </AdminStatus>
                  </button>
                );
              })}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <AdminCardHeader
          eyebrow="System history"
          title="Recent organizer changes"
          description="A read-only history of important changes across contest and country data."
        />

        {!audit.length ? (
          <AdminEmptyState icon={History} title="No audit rows yet" description="Important organizer changes will appear here when available." />
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {audit.map((row) => (
              <div key={row.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground">
                    <History className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">{humanize(row.action)}</p>
                      <AdminStatus tone="neutral">{humanize(row.table_name)}</AdminStatus>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
                    {row.record_id ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">Technical record</summary>
                        <p className="mt-1 break-all text-xs leading-relaxed text-muted-foreground">{row.record_id}</p>
                      </details>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminSheet
        open={createOpen}
        onClose={() => !createDeadline.isPending && setCreateOpen(false)}
        title="Add deadline"
        description={selectedEdition ? `Add an organizer reminder for ${editionLabel(selectedEdition)}.` : "Choose an edition before adding a deadline."}
      >
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="admin-section-label">Deadline</span>
            <input
              value={form.label}
              onChange={(event) => setForm((value) => ({ ...value, label: event.target.value }))}
              placeholder="Song submission closes"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>

          <label className="block">
            <span className="admin-section-label">Type</span>
            <select
              value={form.kind}
              onChange={(event) => setForm((value) => ({ ...value, kind: event.target.value }))}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            >
              <option value="entry">Entry</option>
              <option value="jury">Jury</option>
              <option value="televote">Televote</option>
              <option value="publication">Publication</option>
              <option value="broadcast">Broadcast</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="block">
            <span className="admin-section-label">Due date & time</span>
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(event) => setForm((value) => ({ ...value, due_at: event.target.value }))}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>

          <label className="block">
            <span className="admin-section-label">Organizer note</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))}
              placeholder="Optional"
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.035] p-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
          </label>

          <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button type="button" disabled={createDeadline.isPending} onClick={() => setCreateOpen(false)} className="admin-action-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createDeadline.isPending || !selectedEdition || !form.label.trim() || !form.due_at}
              className="admin-action-primary w-full"
            >
              {createDeadline.isPending ? "Saving…" : "Add deadline"}
            </button>
          </div>
        </form>
      </AdminSheet>
    </AdminPage>
  );
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return (
    <div className={`admin-card px-3 py-3 text-center ${attention ? "!border-rose-200/15 !bg-rose-200/[0.045]" : ""}`}>
      <p className={`numeric text-xl font-bold ${attention ? "text-rose-100" : ""}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function formatKind(value: string) {
  return humanize(value);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
