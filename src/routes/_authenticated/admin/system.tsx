import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Plus,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  useAdminAudit,
  useAdminDeadlines,
  useCreateAdminDeadline,
  useToggleAdminDeadline,
} from "@/lib/admin-ops";
import { useAdminOperationalSchedule } from "@/lib/admin-schedule";
import { editionLabel, useEditions } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/system")({
  head: () => ({
    meta: [
      { title: "Schedule & system — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
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
  const {
    data: operationalSchedule = [],
    isLoading: scheduleLoading,
    isError: scheduleError,
    refetch: refetchSchedule,
  } = useAdminOperationalSchedule(selectedEdition?.id ?? null, selectedEdition?.slug ?? null);
  const { data: audit = [] } = useAdminAudit(80);
  const createDeadline = useCreateAdminDeadline();
  const toggleDeadline = useToggleAdminDeadline();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    label: "",
    due_at: "",
    notes: "",
  });

  const openReminders = deadlines.filter((item) => !item.completed_at);
  const completedReminders = deadlines.filter((item) => Boolean(item.completed_at));
  const overdueReminders = openReminders.filter(
    (item) => new Date(item.due_at).getTime() < Date.now(),
  );
  const workflowSchedule = operationalSchedule.filter((item) => item.source !== "reminder");
  const relevantSchedule = workflowSchedule.filter(
    (item) => new Date(item.at).getTime() >= Date.now() - 24 * 60 * 60 * 1000,
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEdition || !form.label.trim() || !form.due_at) return;

    createDeadline.mutate(
      {
        edition_id: selectedEdition.id,
        show_id: null,
        kind: "other",
        label: form.label.trim(),
        due_at: new Date(form.due_at).toISOString(),
        notes: form.notes.trim() || null,
      },
      {
        onSuccess: () => {
          setForm({ label: "", due_at: "", notes: "" });
          setCreateOpen(false);
        },
      },
    );
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Administration · System"
        title="Schedule & audit"
        description={
          selectedEdition
            ? `Operational dates for ${editionLabel(selectedEdition)} come from the workflows that actually control them. Custom reminders are kept separate.`
            : "Operational schedule and organizer change history."
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Metric label="Workflow dates" value={relevantSchedule.length} />
        <Metric label="Custom reminders" value={openReminders.length} />
        <Metric label="Overdue reminders" value={overdueReminders.length} attention={overdueReminders.length > 0} />
      </div>

      <AdminCard>
        <AdminCardHeader
          eyebrow={selectedEdition ? editionLabel(selectedEdition) : "Current edition"}
          title="Operational schedule"
          description="These dates come from the source workflow. Edit them there, and every Solaris surface sees the same date."
        />

        {scheduleLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Verifying workflow dates…</p>
        ) : scheduleError ? (
          <AdminEmptyState
            icon={CalendarClock}
            title="Schedule could not be verified"
            description="Solaris will not substitute custom reminders or guessed dates when a workflow source cannot be read."
            action={
              <button type="button" onClick={() => void refetchSchedule()} className="admin-action-primary">
                Retry
              </button>
            }
          />
        ) : relevantSchedule.length ? (
          <div className="divide-y divide-white/[0.07]">
            {relevantSchedule.map((item) => {
              const past = new Date(item.at).getTime() < Date.now();
              return (
                <Link key={item.id} to={item.href as any} className="admin-list-row group">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/12 bg-sky-200/[0.045] text-sky-100">
                    <Clock3 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {new Date(item.at).toLocaleString()} · {item.detail}
                    </span>
                  </span>
                  <AdminStatus tone={past ? "neutral" : "info"}>{past ? "Passed" : "Scheduled"}</AdminStatus>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        ) : (
          <AdminEmptyState
            icon={CalendarClock}
            title="No workflow dates scheduled"
            description="Set dates in Confirmations, entry publication, communications or the edition itself. They will appear here automatically."
          />
        )}
      </AdminCard>

      <AdminCard>
        <AdminCardHeader
          eyebrow="Organizer-only"
          title="Custom reminders"
          description="A custom reminder never controls a submission round, vote, publication or show. Use it only for work that has no owning Solaris workflow."
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={!selectedEdition}
              className="admin-action-secondary"
            >
              <Plus className="size-4" /> Add reminder
            </button>
          }
        />

        {!deadlines.length ? (
          <AdminEmptyState
            icon={CalendarClock}
            title="No custom reminders"
            description="Good. Workflow-owned dates should stay in their workflows rather than being duplicated here."
          />
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {[...deadlines]
              .sort((a, b) => {
                if (Boolean(a.completed_at) !== Boolean(b.completed_at)) return a.completed_at ? 1 : -1;
                return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
              })
              .map((item) => {
                const complete = Boolean(item.completed_at);
                const overdue = !complete && new Date(item.due_at).getTime() < Date.now();
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleDeadline.mutate({ id: item.id, complete: !complete })}
                    disabled={toggleDeadline.isPending}
                    className="admin-list-row w-full text-left disabled:opacity-60"
                  >
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
                        complete
                          ? "border-emerald-200/15 bg-emerald-200/[0.06] text-emerald-100"
                          : overdue
                            ? "border-rose-200/15 bg-rose-200/[0.06] text-rose-100"
                            : "border-amber-200/15 bg-amber-200/[0.05] text-amber-100"
                      }`}
                    >
                      {complete ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {new Date(item.due_at).toLocaleString()}
                      </span>
                      {item.notes ? (
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {item.notes}
                        </span>
                      ) : null}
                    </span>
                    <AdminStatus tone={complete ? "ready" : overdue ? "blocked" : "attention"}>
                      {complete ? "Done" : overdue ? "Overdue" : "Reminder"}
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
          description="Read-only history of significant changes across contest and country data."
        />

        {!audit.length ? (
          <AdminEmptyState
            icon={History}
            title="No audit rows yet"
            description="Important organizer changes will appear here when available."
          />
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </p>
                    {row.record_id ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                          Technical record
                        </summary>
                        <p className="mt-1 break-all text-xs leading-relaxed text-muted-foreground">
                          {row.record_id}
                        </p>
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
        title="Add custom reminder"
        description={
          selectedEdition
            ? `Add an organizer-only reminder for ${editionLabel(selectedEdition)}. Workflow dates must be changed in their owning workflow.`
            : "Choose an edition before adding a reminder."
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="admin-section-label">Reminder</span>
            <input
              value={form.label}
              onChange={(event) => setForm((value) => ({ ...value, label: event.target.value }))}
              placeholder="Prepare rehearsal assets"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
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
            <button
              type="button"
              disabled={createDeadline.isPending}
              onClick={() => setCreateOpen(false)}
              className="admin-action-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createDeadline.isPending || !selectedEdition || !form.label.trim() || !form.due_at}
              className="admin-action-primary w-full"
            >
              {createDeadline.isPending ? "Saving…" : "Add reminder"}
            </button>
          </div>
        </form>
      </AdminSheet>
    </AdminPage>
  );
}

function Metric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <div
      className={`admin-card px-3 py-3 text-center ${
        attention ? "!border-rose-200/15 !bg-rose-200/[0.045]" : ""
      }`}
    >
      <p className={`numeric text-xl font-bold ${attention ? "text-rose-100" : ""}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
