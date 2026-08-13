import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";

import { Panel } from "@/components/AppShell";
import { useAdminContext } from "@/components/admin/AdminContext";
import { editionLabel, useEditions } from "@/lib/data";
import { useAdminAudit, useAdminDeadlines, useCreateAdminDeadline, useToggleAdminDeadline } from "@/lib/admin-ops";

export const Route = createFileRoute("/_authenticated/admin/system")({
  head: () => ({ meta: [{ title: "Admin system — Solaris Studio" }] }),
  component: AdminSystemPage,
});

function AdminSystemPage() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const edition = editions.find((item) => item.id === editionId) ?? editions[0] ?? null;
  const { data: deadlines = [] } = useAdminDeadlines(edition?.id);
  const { data: audit = [] } = useAdminAudit(80);
  const createDeadline = useCreateAdminDeadline();
  const toggleDeadline = useToggleAdminDeadline();
  const [form, setForm] = useState({ label: "", kind: "entry", due_at: "", notes: "" });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.label.trim() || !form.due_at) return;
    createDeadline.mutate(
      {
        edition_id: edition?.id ?? null,
        show_id: null,
        kind: form.kind,
        label: form.label.trim(),
        due_at: new Date(form.due_at).toISOString(),
        notes: form.notes.trim() || null,
      },
      { onSuccess: () => setForm({ label: "", kind: "entry", due_at: "", notes: "" }) },
    );
  };

  const sortedAudit = useMemo(() => [...audit].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [audit]);

  return (
    <div className="space-y-4">
      <header className="border-b border-border/60 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">System</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl">Deadlines & audit</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Operational calendar and a permanent history of important changes.</p>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[.85fr_1.15fr]">
        <div className="space-y-4">
          <Panel title="Selected edition">
            <p className="text-sm font-semibold">{edition ? `${editionLabel(edition)} · ${edition.name}` : "No edition selected"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Change edition from the selector in the Control Room header.</p>
          </Panel>

          <Panel title="Add deadline" description="Deadlines inform the Control Room. They do not automatically lock a delegation.">
            <form onSubmit={submit} className="space-y-3">
              <input value={form.label} onChange={(event) => setForm((value) => ({ ...value, label: event.target.value }))} placeholder="Song submission closes" className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm" />
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={form.kind} onChange={(event) => setForm((value) => ({ ...value, kind: event.target.value }))} className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm">
                  <option value="entry">Entry</option>
                  <option value="jury">Jury</option>
                  <option value="televote">Televote</option>
                  <option value="publication">Publication</option>
                  <option value="broadcast">Broadcast</option>
                  <option value="other">Other</option>
                </select>
                <input type="datetime-local" value={form.due_at} onChange={(event) => setForm((value) => ({ ...value, due_at: event.target.value }))} className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm" />
              </div>
              <textarea value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} placeholder="Optional organizer note" className="min-h-24 w-full rounded-xl border border-border bg-surface p-3 text-sm" />
              <button disabled={createDeadline.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{createDeadline.isPending ? "Saving…" : "Add deadline"}</button>
            </form>
          </Panel>

          <Panel title="Deadlines">
            <div className="space-y-2">
              {deadlines.map((item) => (
                <button key={item.id} type="button" onClick={() => toggleDeadline.mutate({ id: item.id, complete: !item.completed_at })} className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface p-3 text-left">
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${item.completed_at ? "bg-emerald-400" : "bg-amber-300"}`} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">{item.label}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{new Date(item.due_at).toLocaleString()} · {item.kind}</span>
                    {item.notes && <span className="mt-1 block text-[10px] text-muted-foreground">{item.notes}</span>}
                  </span>
                </button>
              ))}
              {!deadlines.length && <p className="text-sm text-muted-foreground">No deadlines for this edition.</p>}
            </div>
          </Panel>
        </div>

        <Panel title="Audit log" description="Important contest and country changes appear here after the SQL migration is installed.">
          <div className="divide-y divide-border/55">
            {sortedAudit.map((row) => (
              <div key={row.id} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold">{row.action}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-primary">{row.table_name}</p>
                  </div>
                  <p className="shrink-0 text-[9px] text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
                </div>
                {row.record_id && <p className="mt-2 break-all text-[10px] text-muted-foreground">Record: {row.record_id}</p>}
              </div>
            ))}
            {!sortedAudit.length && <p className="text-sm text-muted-foreground">No audit rows available yet.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
