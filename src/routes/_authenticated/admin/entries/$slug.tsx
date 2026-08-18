import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, ListOrdered, MoreHorizontal, Plus, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  editionLabel,
  useContestEntities,
  useCountries,
  useEdition,
  useParticipants,
  useShows,
  type Participant,
  type Show,
} from "@/lib/data";
import { entityDisplayMap, type ContestEntityRow } from "@/lib/entities";

type EntriesSearch = { show?: string };

type EntryDraft = {
  id: string;
  artist: string;
  song: string;
  running_order: number;
  qualified: boolean | null;
};

export const Route = createFileRoute("/_authenticated/admin/entries/$slug")({
  head: () => ({ meta: [{ title: "Entries & running order — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): EntriesSearch => ({ show: typeof search.show === "string" ? search.show : undefined }),
  component: EntriesWorkspace,
});

function EntriesWorkspace() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const { data: allParticipants = [], isLoading: loadingParticipants } = useParticipants(edition?.id);
  const { data: countries = [] } = useCountries();
  const { data: entities = [] } = useContestEntities(edition?.id);

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const selectedShow = orderedShows.find((show) => show.id === search.show) ?? orderedShows[0] ?? null;
  const participants = useMemo(
    () => allParticipants.filter((participant) => participant.show_id === selectedShow?.id).sort((a, b) => (a.running_order ?? 999) - (b.running_order ?? 999)),
    [allParticipants, selectedShow?.id],
  );
  const displays = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EntryDraft | null>(null);
  const [actionsTarget, setActionsTarget] = useState<Participant | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);
  const [busy, setBusy] = useState(false);
  const [addKey, setAddKey] = useState("");

  const presentKeys = useMemo(() => new Set(participants.map((participant) => participant.contest_entity_id ?? participant.country_id)), [participants]);
  const available = useMemo(() => {
    const rows = new Map<string, { key: string; name: string; entity?: ContestEntityRow; countryId?: string }>();
    for (const entity of entities) {
      const key = entity.id;
      if (!presentKeys.has(key) && !(entity.country_id && presentKeys.has(entity.country_id))) {
        rows.set(key, { key, name: displays.get(key)?.name ?? entity.display_name, entity });
      }
    }
    for (const country of countries) {
      const entity = entities.find((item) => item.country_id === country.id);
      const key = entity?.id ?? country.id;
      if (!presentKeys.has(key) && !presentKeys.has(country.id)) {
        rows.set(key, { key, name: country.name, entity, countryId: country.id });
      }
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, displays, entities, presentKeys]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["participants"] }),
      qc.invalidateQueries({ queryKey: ["contest_entities"] }),
    ]);
  }

  async function ensureEntity(countryId: string) {
    const existing = entities.find((entity) => entity.country_id === countryId);
    if (existing) return existing;
    if (!edition) return null;
    const country = countries.find((item) => item.id === countryId);
    const { data, error } = await supabase.from("contest_entities").insert({
      edition_id: edition.id,
      entity_type: "global",
      country_id: countryId,
      display_name: country?.name ?? "Country",
      abbreviation: country?.short_code ?? "???",
      flag_image: country?.flag_image ?? null,
      region: country?.region ?? null,
    }).select().maybeSingle();
    if (error) throw error;
    return data as ContestEntityRow | null;
  }

  async function addEntry() {
    if (!edition || !selectedShow || !addKey) return;
    const option = available.find((item) => item.key === addKey);
    if (!option) return;
    setBusy(true);
    try {
      const entity = option.entity ?? (option.countryId ? await ensureEntity(option.countryId) : null);
      if (!entity) throw new Error("Could not resolve that contest identity.");
      const prior = [...allParticipants].reverse().find((participant) =>
        participant.show_id !== selectedShow.id &&
        (participant.contest_entity_id === entity.id || (!!entity.country_id && participant.country_id === entity.country_id)) &&
        (participant.artist || participant.song),
      );
      const { error } = await supabase.from("participants").insert({
        edition_id: edition.id,
        show_id: selectedShow.id,
        country_id: entity.country_id,
        contest_entity_id: entity.id,
        running_order: participants.length + 1,
        semi_final: selectedShow.kind,
        artist: prior?.artist ?? null,
        song: prior?.song ?? null,
      });
      if (error) throw error;
      toast.success(`${displays.get(entity.id)?.name ?? entity.display_name} added`);
      setAddOpen(false);
      setAddKey("");
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Entry could not be added");
    } finally {
      setBusy(false);
    }
  }

  async function saveEntry() {
    if (!editTarget) return;
    setBusy(true);
    try {
      const { error } = await (supabase.from("participants") as any).update({
        artist: editTarget.artist.trim() || null,
        song: editTarget.song.trim() || null,
        running_order: Math.max(1, editTarget.running_order),
        qualified: editTarget.qualified,
      }).eq("id", editTarget.id);
      if (error) throw error;
      toast.success("Entry updated");
      setEditTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Entry could not be updated");
    } finally {
      setBusy(false);
    }
  }

  async function moveEntry(participant: Participant, direction: -1 | 1) {
    const index = participants.findIndex((item) => item.id === participant.id);
    const swap = participants[index + direction];
    if (!swap) return;
    setBusy(true);
    try {
      const currentOrder = participant.running_order ?? index + 1;
      const swapOrder = swap.running_order ?? index + direction + 1;
      const [first, second] = await Promise.all([
        (supabase.from("participants") as any).update({ running_order: swapOrder }).eq("id", participant.id),
        (supabase.from("participants") as any).update({ running_order: currentOrder }).eq("id", swap.id),
      ]);
      if (first.error) throw first.error;
      if (second.error) throw second.error;
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Running order could not be changed");
    } finally {
      setBusy(false);
    }
  }

  async function promoteQualifiers() {
    if (!edition || !selectedShow) return;
    const present = new Set(participants.map((participant) => participant.contest_entity_id ?? participant.country_id));
    const seen = new Set<string>();
    const promote = allParticipants.filter((participant) => {
      const key = participant.contest_entity_id ?? participant.country_id;
      if (participant.show_id === selectedShow.id || !participant.qualified || !key || present.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!promote.length) {
      toast.info("No marked qualifiers are waiting to be promoted");
      return;
    }
    setBusy(true);
    try {
      const { error } = await (supabase.from("participants") as any).insert(promote.map((participant, index) => ({
        edition_id: edition.id,
        show_id: selectedShow.id,
        country_id: participant.country_id || null,
        contest_entity_id: participant.contest_entity_id || null,
        running_order: participants.length + index + 1,
        semi_final: selectedShow.kind,
        artist: participant.artist,
        song: participant.song,
      })));
      if (error) throw error;
      toast.success(`Promoted ${promote.length} qualifier${promote.length === 1 ? "" : "s"}`);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Qualifiers could not be promoted");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry() {
    if (!removeTarget) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("participants").delete().eq("id", removeTarget.id);
      if (error) throw error;
      toast.success("Entry removed from show");
      setRemoveTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Entry could not be removed");
    } finally {
      setBusy(false);
    }
  }

  if (loadingEdition || loadingShows || loadingParticipants) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading entries…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Users} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  if (!orderedShows.length) {
    return <AdminPage><AdminPageHeader eyebrow={editionLabel(edition)} title="Entries" description="Create a show before adding entries." /><AdminCard><AdminEmptyState icon={ListOrdered} title="No shows yet" description="Entries belong to a show, so create the contest stages first." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create a show</Link>} /></AdminCard></AdminPage>;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Entries & running order"
        description="Manage each show line-up, song details, qualification state and running order without opening the legacy studio."
        actions={<button type="button" className="admin-action-primary" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add entry</button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-quiet"><ArrowLeft className="size-4" /> Shows</Link>
        <select
          value={selectedShow?.id ?? ""}
          onChange={(event) => void navigate({ search: { show: event.target.value || undefined } })}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
        >
          {orderedShows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
        </select>
      </div>

      {selectedShow ? (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Metric label="Entries" value={participants.length} />
          <Metric label="Qualified" value={participants.filter((participant) => participant.qualified === true).length} />
          <Metric label="Missing song" value={participants.filter((participant) => !participant.artist || !participant.song).length} />
        </div>
      ) : null}

      {selectedShow && (selectedShow.kind === "grand-final" || selectedShow.kind === "final") ? (
        <AdminCard className="mb-4 !p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold">Grand Final line-up</p><p className="mt-1 text-xs text-muted-foreground">Bring across countries marked as qualified in earlier shows.</p></div>
            <button type="button" disabled={busy} onClick={() => void promoteQualifiers()} className="admin-action-secondary">Promote qualifiers</button>
          </div>
        </AdminCard>
      ) : null}

      {!participants.length ? (
        <AdminCard><AdminEmptyState icon={Users} title="No entries in this show" description="Add participating countries or promote marked qualifiers into this line-up." action={<button type="button" className="admin-action-primary" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add first entry</button>} /></AdminCard>
      ) : (
        <div className="space-y-2">
          {participants.map((participant, index) => {
            const key = participant.contest_entity_id ?? participant.country_id;
            const display = displays.get(key) ?? displays.get(participant.country_id);
            return (
              <AdminCard key={participant.id} className="!p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="numeric grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-sm font-bold">{participant.running_order ?? index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-foreground">{display?.name ?? "Unknown country"}</p>
                      {participant.qualified === true ? <AdminStatus tone="ready">Qualified</AdminStatus> : participant.qualified === false ? <AdminStatus tone="blocked">Eliminated</AdminStatus> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{participant.artist || "Artist not set"} · {participant.song || "Song not set"}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" disabled={busy || index === 0} onClick={() => void moveEntry(participant, -1)} className="admin-action-secondary !min-h-10 !px-3" aria-label={`Move ${display?.name ?? "entry"} up`}><ArrowUp className="size-4" /></button>
                    <button type="button" disabled={busy || index === participants.length - 1} onClick={() => void moveEntry(participant, 1)} className="admin-action-secondary !min-h-10 !px-3" aria-label={`Move ${display?.name ?? "entry"} down`}><ArrowDown className="size-4" /></button>
                    <button type="button" onClick={() => setActionsTarget(participant)} className="admin-action-secondary !min-h-10 !px-3" aria-label={`More actions for ${display?.name ?? "entry"}`}><MoreHorizontal className="size-4" /></button>
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}

      <AdminSheet open={addOpen} onClose={() => !busy && setAddOpen(false)} title={`Add entry to ${selectedShow?.name ?? "show"}`} description="Existing edition identities and global countries are available here. Artist and song are copied from another show when known.">
        <div className="space-y-4">
          <label className="block"><span className="admin-section-label">Country</span><select value={addKey} onChange={(event) => setAddKey(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"><option value="">Choose country…</option>{available.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
          <button type="button" disabled={busy || !addKey} onClick={() => void addEntry()} className="admin-action-primary w-full">{busy ? "Adding…" : "Add to show"}</button>
          {!available.length ? <p className="text-xs text-muted-foreground">Every available country identity is already in this show.</p> : null}
        </div>
      </AdminSheet>

      <AdminSheet open={!!actionsTarget} onClose={() => setActionsTarget(null)} title={actionsTarget ? displays.get(actionsTarget.contest_entity_id ?? actionsTarget.country_id)?.name ?? "Entry actions" : "Entry actions"} description="Edit the entry or remove it from this show.">
        {actionsTarget ? <div className="space-y-2">
          <AdminActionItem title="Edit entry" description="Artist, song, qualification and exact running-order number." onClick={() => { const target = actionsTarget; setActionsTarget(null); setEditTarget({ id: target.id, artist: target.artist ?? "", song: target.song ?? "", running_order: target.running_order ?? 1, qualified: target.qualified }); }} />
          <AdminActionItem icon={Trash2} tone="danger" title="Remove from show" description="Removes this show entry. Other appearances by the country stay intact." onClick={() => { setRemoveTarget(actionsTarget); setActionsTarget(null); }} />
        </div> : null}
      </AdminSheet>

      <AdminSheet open={!!editTarget} onClose={() => !busy && setEditTarget(null)} title="Edit entry" description="Song identity is shared by copying where useful, but this row remains specific to the selected show.">
        {editTarget ? <div className="space-y-4">
          <label className="block"><span className="admin-section-label">Artist</span><input value={editTarget.artist} onChange={(event) => setEditTarget((current) => current ? { ...current, artist: event.target.value } : current)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Song</span><input value={editTarget.song} onChange={(event) => setEditTarget((current) => current ? { ...current, song: event.target.value } : current)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Running order</span><input type="number" min={1} value={editTarget.running_order} onChange={(event) => setEditTarget((current) => current ? { ...current, running_order: Number(event.target.value) || 1 } : current)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Qualification</span><select value={editTarget.qualified === null ? "unknown" : editTarget.qualified ? "qualified" : "eliminated"} onChange={(event) => setEditTarget((current) => current ? { ...current, qualified: event.target.value === "unknown" ? null : event.target.value === "qualified" } : current)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30"><option value="unknown">Not decided</option><option value="qualified">Qualified</option><option value="eliminated">Eliminated</option></select></label>
          <button type="button" disabled={busy} onClick={() => void saveEntry()} className="admin-action-primary w-full">{busy ? "Saving…" : "Save entry"}</button>
        </div> : null}
      </AdminSheet>

      <AdminConfirmSheet
        open={!!removeTarget}
        onClose={() => !busy && setRemoveTarget(null)}
        onConfirm={removeEntry}
        title="Remove entry from this show?"
        description={<>This removes only this show-specific participant row. It does not delete the country, its delegation, or appearances in other shows.</>}
        confirmLabel="Remove entry"
        busy={busy}
        danger
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
