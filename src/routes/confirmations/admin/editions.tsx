import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteConfirmationEdition,
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  saveConfirmationEdition,
  setConfirmationEditionEditing,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/admin/editions")({
  head: () => ({ meta: [{ title: "Confirmation Editions — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: EditionsPage,
});

const emptyForm = {
  name: "",
  edition_number: "",
  description: "",
  status: "draft" as ConfirmationEdition["status"],
  editing_enabled: true,
};

function EditionsPage() {
  const navigate = useNavigate();
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [form, setForm] = useState<typeof emptyForm & { id?: string }>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setEditions(await loadConfirmationEditions());
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const admin = await requireConfirmationsAdmin();
        if (!admin) {
          await navigate({ to: "/confirmations/admin/sign-in" });
          return;
        }
        const rows = await loadConfirmationEditions();
        if (alive) setEditions(rows);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load editions.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  async function submit() {
    setError(null);
    const editionNumber = Number(form.edition_number);
    if (!form.name.trim()) return setError("Edition name is required.");
    if (!Number.isInteger(editionNumber) || editionNumber < 0) return setError("Edition number must be a whole number.");

    setBusy(true);
    try {
      await saveConfirmationEdition({
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        edition_number: editionNumber,
        description: form.description.trim(),
        status: form.status,
        editing_enabled: form.editing_enabled,
      });
      toast.success(form.id ? "Edition updated" : "Edition created");
      setForm(emptyForm);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Edition could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6"><Link to="/confirmations/admin" className="text-xs text-white/55 hover:text-white">← Organiser overview</Link></div>
        <ConfirmationsAdminNav current="/confirmations/admin/editions" />

        <header className="mb-7">
          <p className="text-[10px] uppercase tracking-[0.22em] text-sky-200/65">Organiser workspace</p>
          <h1 className="confirmations-display mt-2 text-5xl font-normal uppercase leading-none sm:text-6xl">Editions</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/55">Choose which SSC edition is active and whether existing confirmation responses may be edited at edition level.</p>
        </header>

        {loading ? <div className="confirmations-surface p-8 text-center text-sm text-white/55">Loading editions…</div> : (
          <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
            <section className="confirmations-surface h-fit p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium text-white">{form.id ? "Edit edition" : "New edition"}</h2>
                {!form.id ? <Plus className="size-4 text-white/35" /> : null}
              </div>
              <div className="mt-5 space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Solaris Song Contest 23" /></div>
                <div className="space-y-2"><Label>Edition number</Label><Input inputMode="numeric" value={form.edition_number} onChange={(e) => setForm({ ...form, edition_number: e.target.value })} placeholder="23" /></div>
                <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional organiser note" /></div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["draft", "active", "finished"] as const).map((status) => (
                      <button key={status} type="button" onClick={() => setForm({ ...form, status })} className={cn("rounded-full border px-3 py-1.5 text-xs capitalize", form.status === status ? "border-sky-200/25 bg-sky-200/10 text-sky-100" : "border-white/10 text-white/45")}>{status}</button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 p-3 text-sm text-white/65">
                  Existing-response editing
                  <input type="checkbox" checked={form.editing_enabled} onChange={(e) => setForm({ ...form, editing_enabled: e.target.checked })} className="size-4" />
                </label>
                {error ? <p className="text-sm text-red-100">{error}</p> : null}
                <div className="flex gap-2">
                  <Button onClick={() => void submit()} disabled={busy}>{busy ? "Saving…" : form.id ? "Save changes" : "Create edition"}</Button>
                  {form.id ? <Button variant="ghost" onClick={() => setForm(emptyForm)}>Cancel</Button> : null}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              {editions.map((edition) => (
                <article key={edition.id} className="confirmations-surface p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-white/50">SSC {edition.edition_number}</span>
                        <span className={cn("rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.16em]", edition.status === "active" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-white/10 text-white/45")}>{edition.status}</span>
                      </div>
                      <h2 className="mt-3 text-xl font-medium text-white">{edition.name}</h2>
                      {edition.description ? <p className="mt-1 text-sm text-white/45">{edition.description}</p> : null}
                      <p className="mt-3 text-xs text-white/35">{edition.rounds.length} rounds · {edition.response_count} responses</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setForm({ id: edition.id, name: edition.name, edition_number: String(edition.edition_number), description: edition.description ?? "", status: edition.status, editing_enabled: edition.editing_enabled })}><Pencil className="size-3.5" /> Edit</Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!confirm(`Delete ${edition.name}? This also removes its rounds and any dependent data allowed by the database.`)) return;
                        try { await deleteConfirmationEdition(edition.id); await refresh(); toast.success("Edition deleted"); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Edition could not be deleted"); }
                      }}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 p-3">
                    <div><p className="text-sm text-white/70">Existing-response editing</p><p className="mt-0.5 text-xs text-white/35">Edition-level master permission for editing submitted confirmations.</p></div>
                    <div className="flex gap-2">
                      <Button size="sm" variant={edition.editing_enabled ? "default" : "outline"} onClick={async () => { await setConfirmationEditionEditing(edition.id, true); await refresh(); }}>Open</Button>
                      <Button size="sm" variant={!edition.editing_enabled ? "default" : "outline"} onClick={async () => { await setConfirmationEditionEditing(edition.id, false); await refresh(); }}>Closed</Button>
                    </div>
                  </div>
                </article>
              ))}
              {!editions.length ? <div className="confirmations-surface p-8 text-center text-sm text-white/55">No editions configured.</div> : null}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
