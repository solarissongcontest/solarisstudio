import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ListChecks, ListOrdered, MoreHorizontal, Plus, RadioTower, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminActionItem,
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { SHOW_KINDS, editionLabel, useEdition, useParticipants, useShows, type Show } from "@/lib/data";
import { DEFAULT_PUBLICATION_CONFIG, hasAnyPublicInformation, resolveShowPublication } from "@/lib/publication";

export const Route = createFileRoute("/_authenticated/admin/shows/$slug")({
  head: () => ({ meta: [{ title: "Shows — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: ShowsWorkspace,
});

type ShowDraft = {
  id?: string;
  name: string;
  kind: (typeof SHOW_KINDS)[number];
  sort_order: number;
};

const emptyDraft: ShowDraft = { name: "", kind: "semi-final", sort_order: 1 };

function ShowsWorkspace() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const { data: participants = [] } = useParticipants(edition?.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ShowDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Show | null>(null);
  const [actionsTarget, setActionsTarget] = useState<Show | null>(null);

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["shows"] }),
      qc.invalidateQueries({ queryKey: ["participants"] }),
      qc.invalidateQueries({ queryKey: ["edition"] }),
    ]);
  }

  function openCreate() {
    setDraft({ ...emptyDraft, sort_order: (orderedShows.at(-1)?.sort_order ?? 0) + 1 });
    setSheetOpen(true);
  }

  function openEdit(show: Show) {
    setDraft({ id: show.id, name: show.name, kind: show.kind as ShowDraft["kind"], sort_order: show.sort_order });
    setSheetOpen(true);
  }

  async function saveShow() {
    if (!edition || !draft.name.trim()) return;
    setBusy(true);
    try {
      if (draft.id) {
        const { error } = await (supabase.from("shows") as any)
          .update({ name: draft.name.trim(), kind: draft.kind, sort_order: draft.sort_order })
          .eq("id", draft.id);
        if (error) throw error;
        toast.success("Show updated");
      } else {
        const { error } = await supabase.from("shows").insert({
          edition_id: edition.id,
          name: draft.name.trim(),
          kind: draft.kind,
          sort_order: draft.sort_order,
          published: false,
          publication_config: DEFAULT_PUBLICATION_CONFIG,
        });
        if (error) throw error;
        toast.success("Show created");
      }
      setSheetOpen(false);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Show could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(show: Show) {
    setBusy(true);
    try {
      const { error } = await (supabase.from("shows") as any).update({ published: !show.published }).eq("id", show.id);
      if (error) throw error;
      toast.success(show.published ? "Show made private" : "Show route published");
      setActionsTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Publication state could not be changed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteShow() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("shows").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Show could not be deleted");
    } finally {
      setBusy(false);
    }
  }

  if (loadingEdition || loadingShows) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading shows…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={ListChecks} title="Edition not found" description="Return to the edition workspace and choose another edition." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Shows"
        description="Create the contest stages and keep their basic identity clear. Line-ups now have their own mobile workspace."
        actions={<button type="button" className="admin-action-primary" onClick={openCreate}><Plus className="size-4" /> New show</button>}
      />

      <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet mb-4 inline-flex"><ArrowLeft className="size-4" /> Edition home</Link>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Shows" value={orderedShows.length} />
        <Metric label="Entries" value={participants.length} />
        <Metric label="Public" value={orderedShows.filter((show) => show.published && hasAnyPublicInformation(resolveShowPublication(show))).length} />
      </div>

      {!orderedShows.length ? (
        <AdminCard>
          <AdminEmptyState icon={ListChecks} title="Create the first show" description="Start with a semi-final, Grand Final or another stage. You can build its line-up immediately afterwards." action={<button type="button" className="admin-action-primary" onClick={openCreate}><Plus className="size-4" /> Create show</button>} />
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {orderedShows.map((show) => {
            const count = participants.filter((participant) => participant.show_id === show.id).length;
            const publication = resolveShowPublication(show);
            const isPublic = show.published && hasAnyPublicInformation(publication);
            return (
              <AdminCard key={show.id} className="!p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-muted-foreground"><ListChecks className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-foreground">{show.name}</h2>
                      <AdminStatus tone={isPublic ? "ready" : "neutral"}>{isPublic ? "Public" : "Private"}</AdminStatus>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{show.kind.replaceAll("-", " ")} · {count} {count === 1 ? "entry" : "entries"} · order {show.sort_order}</p>
                  </div>
                  <button type="button" className="admin-action-secondary !min-h-10 !px-3" aria-label={`More actions for ${show.name}`} onClick={() => setActionsTarget(show)}><MoreHorizontal className="size-4" /></button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link to="/admin/entries/$slug" params={{ slug }} search={{ show: show.id }} className="admin-action-primary w-full"><ListOrdered className="size-4" /> Entries</Link>
                  <button type="button" className="admin-action-secondary w-full" onClick={() => openEdit(show)}>Edit show</button>
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}

      <AdminSheet open={sheetOpen} onClose={() => !busy && setSheetOpen(false)} title={draft.id ? "Edit show" : "Create show"} description="Keep the basic show identity simple here. Detailed voting, scoreboard and broadcast controls stay separate.">
        <div className="space-y-4">
          <label className="block"><span className="admin-section-label">Show name</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Grand Final" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Type</span><select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as ShowDraft["kind"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">{SHOW_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replaceAll("-", " ")}</option>)}</select></label>
          <label className="block"><span className="admin-section-label">Show order</span><input type="number" min={1} value={draft.sort_order} onChange={(event) => setDraft((current) => ({ ...current, sort_order: Number(event.target.value) || 1 }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" /></label>
          <button type="button" disabled={busy || !draft.name.trim()} onClick={() => void saveShow()} className="admin-action-primary w-full">{busy ? "Saving…" : draft.id ? "Save changes" : "Create show"}</button>
        </div>
      </AdminSheet>

      <AdminSheet open={!!actionsTarget} onClose={() => setActionsTarget(null)} title={actionsTarget?.name ?? "Show actions"} description="Secondary actions for this show.">
        {actionsTarget ? <div className="space-y-2">
          <AdminActionItem title="Edit show" description="Change the name, type or order." onClick={() => { const show = actionsTarget; setActionsTarget(null); openEdit(show); }} />
          <AdminActionItem title={actionsTarget.published ? "Make show private" : "Publish show route"} description={actionsTarget.published ? "Hide the public show route while keeping all data intact." : "Make the show route available. Individual publication layers still follow their publication settings."} onClick={() => void togglePublished(actionsTarget)} />
          <Link to="/admin/$slug" params={{ slug }} search={{ advanced: true }} onClick={() => setActionsTarget(null)} className="admin-action-row flex w-full items-center gap-3 text-left"><span className="admin-action-row-icon"><RadioTower className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Detailed studio</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Open voting, theme, scoreboard and broadcast controls that have not moved yet.</span></span></Link>
          <AdminActionItem icon={Trash2} tone="danger" title="Delete show" description="Permanently remove this show and dependent show data." onClick={() => { setDeleteTarget(actionsTarget); setActionsTarget(null); }} />
        </div> : null}
      </AdminSheet>

      <AdminConfirmSheet
        open={!!deleteTarget}
        onClose={() => !busy && setDeleteTarget(null)}
        onConfirm={deleteShow}
        title={`Delete ${deleteTarget?.name ?? "show"}?`}
        description={<>This permanently removes the show and dependent participant/voting data. Official archived results should only be deleted when you are certain this show is disposable.</>}
        confirmLabel="Delete show"
        confirmationText={deleteTarget?.name}
        confirmationHint={deleteTarget ? `Type ${deleteTarget.name} to confirm` : undefined}
        busy={busy}
        danger
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
