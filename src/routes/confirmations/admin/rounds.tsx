import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteConfirmationRound,
  loadConfirmationEditions,
  requireConfirmationsAdmin,
  saveConfirmationRound,
  setConfirmationRoundEditing,
  setConfirmationRoundStatus,
  type ConfirmationEdition,
  type ConfirmationRound,
} from "@/integrations/confirmations/admin";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/admin/rounds")({
  head: () => ({ meta: [{ title: "Confirmation Rounds — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: RoundsPage,
});

const emptyForm = {
  name: "",
  status: "draft" as ConfirmationRound["status"],
  opens_at: "",
  closes_at: "",
  response_limit: "",
  editing_enabled: true,
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function RoundsPage() {
  const navigate = useNavigate();
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [editionId, setEditionId] = useState("");
  const [form, setForm] = useState<typeof emptyForm & { id?: string }>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(preferredEditionId?: string) {
    const rows = await loadConfirmationEditions();
    setEditions(rows);
    setEditionId((current) =>
      preferredEditionId ?? current || rows.find((item) => item.status === "active")?.id || rows[0]?.id || "",
    );
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
        if (!alive) return;
        setEditions(rows);
        setEditionId(rows.find((item) => item.status === "active")?.id ?? rows[0]?.id ?? "");
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load submission rounds.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  const edition = useMemo(() => editions.find((item) => item.id === editionId) ?? null, [editions, editionId]);
  const rounds = edition?.rounds ?? [];

  async function submit() {
    setError(null);
    if (!editionId) return setError("Create an edition first.");
    if (!form.name.trim()) return setError("Round name is required.");
    if (form.response_limit && !/^\d+$/.test(form.response_limit)) return setError("Response limit must be a whole number.");

    const opens = form.opens_at ? new Date(form.opens_at).toISOString() : null;
    const closes = form.closes_at ? new Date(form.closes_at).toISOString() : null;
    if (opens && closes && new Date(closes) <= new Date(opens)) return setError("Closing time must be after opening time.");

    setBusy(true);
    try {
      await saveConfirmationRound({
        ...(form.id ? { id: form.id } : {}),
        edition_id: editionId,
        name: form.name.trim(),
        status: form.status,
        opens_at: opens,
        closes_at: closes,
        response_limit: form.response_limit ? Number(form.response_limit) : null,
        editing_enabled: form.editing_enabled,
      });
      toast.success(form.id ? "Round updated" : "Round created");
      setForm(emptyForm);
      await refresh(editionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Round could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6"><Link to="/confirmations/admin" className="text-xs text-white/55 hover:text-white">← Organiser overview</Link></div>
        <ConfirmationsAdminNav current="/confirmations/admin/rounds" />

        <header className="mb-7">
          <p className="text-[10px] uppercase tracking-[0.22em] text-sky-200/65">Organiser workspace</p>
          <h1 className="confirmations-display mt-2 text-5xl font-normal uppercase leading-none sm:text-6xl">Submission rounds</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">Round status controls new responses. Existing-response editing is deliberately separate, so a closed wave can still allow delegations to correct their entry.</p>
        </header>

        {loading ? <div className="confirmations-surface p-8 text-center text-sm text-white/55">Loading rounds…</div> : (
          <>
            <div className="confirmations-surface mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:max-w-sm">
                <Label htmlFor="confirmation-edition">Edition</Label>
                <select id="confirmation-edition" value={editionId} onChange={(event) => { setEditionId(event.target.value); setForm(emptyForm); }} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none">
                  {editions.map((item) => <option key={item.id} value={item.id}>{`SSC ${item.edition_number} — ${item.name}`}</option>)}
                </select>
              </div>
              <Button asChild variant="outline"><Link to="/confirmations/next-in-line"><ExternalLink className="size-4" /> Open Next in Line</Link></Button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <section className="confirmations-surface h-fit p-5">
                <div className="flex items-center justify-between"><h2 className="text-lg font-medium text-white">{form.id ? "Edit round" : "New round"}</h2>{!form.id ? <Plus className="size-4 text-white/35" /> : null}</div>
                <div className="mt-5 space-y-4">
                  <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Second wave" /></div>
                  <div className="space-y-2"><Label>Response limit</Label><Input inputMode="numeric" value={form.response_limit} onChange={(e) => setForm({ ...form, response_limit: e.target.value })} placeholder="10" /></div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="space-y-2"><Label>Opens at</Label><Input type="datetime-local" value={form.opens_at} onChange={(e) => setForm({ ...form, opens_at: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Closes at</Label><Input type="datetime-local" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2"><Label>Status</Label><div className="flex flex-wrap gap-2">{(["draft", "open", "closed", "auto_closed"] as const).map((status) => <button key={status} type="button" onClick={() => setForm({ ...form, status })} className={cn("rounded-full border px-3 py-1.5 text-xs", form.status === status ? "border-sky-200/25 bg-sky-200/10 text-sky-100" : "border-white/10 text-white/45")}>{status.replace("_", " ")}</button>)}</div></div>
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 p-3 text-sm text-white/65">Existing-response editing<input type="checkbox" checked={form.editing_enabled} onChange={(e) => setForm({ ...form, editing_enabled: e.target.checked })} className="size-4" /></label>
                  {error ? <p className="text-sm text-red-100">{error}</p> : null}
                  <div className="flex gap-2"><Button onClick={() => void submit()} disabled={busy || !editionId}>{busy ? "Saving…" : form.id ? "Save changes" : "Create round"}</Button>{form.id ? <Button variant="ghost" onClick={() => setForm(emptyForm)}>Cancel</Button> : null}</div>
                </div>
              </section>

              <section className="space-y-3">
                {rounds.map((round) => (
                  <article key={round.id} className="confirmations-surface p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.16em]", round.status === "open" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : round.status === "closed" || round.status === "auto_closed" ? "border-white/10 bg-white/[0.04] text-white/45" : "border-amber-200/25 bg-amber-200/10 text-amber-100")}>{round.status.replace("_", " ")}</span>
                          <span className="text-[10px] text-white/35">{round.response_count}{round.response_limit ? ` / ${round.response_limit}` : ""} responses</span>
                        </div>
                        <h2 className="mt-3 text-xl font-medium text-white">{round.name}</h2>
                        <p className="mt-2 text-xs leading-relaxed text-white/40">{round.opens_at ? `Opens ${new Date(round.opens_at).toLocaleString()}` : "No opening time"} · {round.closes_at ? `Closes ${new Date(round.closes_at).toLocaleString()}` : "No closing time"}</p>
                      </div>
                      <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setForm({ id: round.id, name: round.name, status: round.status, opens_at: toLocalInput(round.opens_at), closes_at: toLocalInput(round.closes_at), response_limit: round.response_limit ? String(round.response_limit) : "", editing_enabled: round.editing_enabled })}><Pencil className="size-3.5" /> Edit</Button><Button size="sm" variant="ghost" onClick={async () => { if (!confirm(`Delete ${round.name} and any dependent responses allowed by the database?`)) return; try { await deleteConfirmationRound(round.id); await refresh(editionId); toast.success("Round deleted"); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Round could not be deleted"); } }}><Trash2 className="size-3.5" /></Button></div>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                        <p className="text-sm font-medium text-white">New submissions</p><p className="mt-1 text-xs text-white/35">Change the round state without changing edit permissions.</p>
                        <div className="mt-3 flex flex-wrap gap-2">{(["open", "closed", "draft"] as const).map((status) => <Button key={status} size="sm" variant={round.status === status ? "default" : "outline"} onClick={async () => { try { await setConfirmationRoundStatus(round.id, status); await refresh(editionId); toast.success(`Round ${status}`); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Status could not be changed"); } }}>{status === "open" ? "Open" : status === "closed" ? "Close" : "Draft"}</Button>)}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                        <p className="text-sm font-medium text-white">Existing-response editing</p><p className="mt-1 text-xs text-white/35">Can remain open even after the confirmation wave closes or fills.</p>
                        <div className="mt-3 flex gap-2"><Button size="sm" variant={round.editing_enabled ? "default" : "outline"} onClick={async () => { await setConfirmationRoundEditing(round.id, true); await refresh(editionId); toast.success("Editing opened"); }}>Open</Button><Button size="sm" variant={!round.editing_enabled ? "default" : "outline"} onClick={async () => { await setConfirmationRoundEditing(round.id, false); await refresh(editionId); toast.success("Editing closed"); }}>Closed</Button></div>
                      </div>
                    </div>
                  </article>
                ))}
                {!rounds.length ? <div className="confirmations-surface p-8 text-center text-sm text-white/55">No rounds in this edition yet.</div> : null}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
