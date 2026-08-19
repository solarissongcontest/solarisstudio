import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Flag,
  ListOrdered,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";

import { CountryPicker } from "@/components/CountryPicker";
import { FlagChip } from "@/components/FlagChip";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminMoreMenu,
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
  useShowParticipants,
  useShows,
  type Participant,
} from "@/lib/data";
import { DEFAULT_ACCENT, entityDisplayMap, type ContestEntityRow } from "@/lib/entities";
import { reportSupabaseError } from "@/lib/errors";

type EntriesSearch = { show?: string };

type EntryDraft = {
  id: string;
  artist: string;
  song: string;
  running_order: number;
};

type CustomDraft = {
  id?: string;
  display_name: string;
  abbreviation: string;
  flag_image: string;
  region: string;
};

const emptyCustom: CustomDraft = {
  display_name: "",
  abbreviation: "",
  flag_image: "",
  region: "",
};

export const Route = createFileRoute("/_authenticated/admin/entries/$slug")({
  head: () => ({ meta: [{ title: "Entries & Running Order — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): EntriesSearch => ({
    show: typeof search.show === "string" && search.show ? search.show : undefined,
  }),
  component: EntriesWorkspace,
});

function EntriesWorkspace() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const { data: countries = [] } = useCountries();
  const { data: allParticipants = [] } = useParticipants(edition?.id);
  const { data: entities = [] } = useContestEntities(edition?.id);

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const [showId, setShowId] = useState(search.show ?? "");
  const activeShow = orderedShows.find((show) => show.id === showId) ?? orderedShows[0] ?? null;
  const activeShowId = activeShow?.id;
  const { data: showParticipants = [], isLoading: loadingParticipants } = useShowParticipants(activeShowId);

  const [addOpen, setAddOpen] = useState(false);
  const [countryPick, setCountryPick] = useState<string | null>(null);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomDraft | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);
  const [deleteCustomTarget, setDeleteCustomTarget] = useState<ContestEntityRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orderedShows.length) {
      setShowId("");
      return;
    }
    const requested = search.show && orderedShows.some((show) => show.id === search.show) ? search.show : null;
    if (requested && showId !== requested) {
      setShowId(requested);
      return;
    }
    if (!orderedShows.some((show) => show.id === showId)) setShowId(orderedShows[0].id);
  }, [orderedShows, search.show, showId]);

  const displayMap = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const orderedParticipants = useMemo(
    () => [...showParticipants].sort((a, b) => (a.running_order ?? 9999) - (b.running_order ?? 9999)),
    [showParticipants],
  );
  const presentKeys = useMemo(() => new Set(orderedParticipants.map((participant) => participant.country_id)), [orderedParticipants]);
  const customEntities = useMemo(() => entities.filter((entity) => entity.entity_type === "custom"), [entities]);
  const missingDetailCount = orderedParticipants.filter((participant) => !participant.artist || !participant.song).length;
  const qualifierCandidates = useMemo(() => {
    if (!activeShow || (activeShow.kind !== "grand-final" && activeShow.kind !== "final")) return [];
    const present = new Set(orderedParticipants.map((participant) => participant.country_id));
    const seen = new Set<string>();
    return allParticipants.filter((participant) => {
      if (participant.show_id === activeShow.id || !participant.qualified || present.has(participant.country_id) || seen.has(participant.country_id)) return false;
      seen.add(participant.country_id);
      return true;
    });
  }, [activeShow, allParticipants, orderedParticipants]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["participants"] }),
      qc.invalidateQueries({ queryKey: ["contest_entities"] }),
      qc.invalidateQueries({ queryKey: ["shows"] }),
    ]);
  }

  function identityFor(key: string) {
    const entity = entities.find((item) => item.id === key || item.country_id === key);
    return entity
      ? { country_id: entity.country_id, contest_entity_id: entity.id }
      : { country_id: key, contest_entity_id: null };
  }

  async function ensureGlobalEntity(countryId: string) {
    if (!edition) return null;
    const existing = entities.find((entity) => entity.country_id === countryId);
    if (existing) return existing;
    const country = countries.find((item) => item.id === countryId);
    const { data, error } = await supabase
      .from("contest_entities")
      .insert({
        edition_id: edition.id,
        entity_type: "global",
        country_id: countryId,
        display_name: country?.name ?? "Country",
        abbreviation: country?.short_code ?? "???",
        flag_image: country?.flag_image ?? null,
        region: country?.region ?? null,
      })
      .select()
      .maybeSingle();
    if (error || !data) throw error ?? new Error("Country identity could not be created.");
    await qc.invalidateQueries({ queryKey: ["contest_entities"] });
    return data as ContestEntityRow;
  }

  async function addEntityToShow(entity: ContestEntityRow) {
    if (!edition || !activeShowId || !activeShow) return;
    const key = entity.country_id ?? entity.id;
    if (presentKeys.has(key)) {
      toast.message(`${displayMap.get(key)?.name ?? entity.display_name} is already in this show`);
      return;
    }
    const prior = allParticipants
      .filter((participant) => participant.country_id === key && participant.show_id !== activeShowId && (participant.artist || participant.song))
      .at(-1);
    const nextOrder = Math.max(0, ...orderedParticipants.map((participant) => participant.running_order ?? 0)) + 1;
    const { error } = await (supabase.from("participants") as any).insert({
      edition_id: edition.id,
      show_id: activeShowId,
      country_id: entity.country_id,
      contest_entity_id: entity.id,
      running_order: nextOrder,
      semi_final: activeShow.kind,
      artist: prior?.artist ?? null,
      song: prior?.song ?? null,
    });
    if (error) throw error;
    await refresh();
  }

  async function addCountry(countryId: string) {
    setBusy(true);
    try {
      const entity = await ensureGlobalEntity(countryId);
      if (!entity) return;
      await addEntityToShow(entity);
      setCountryPick(null);
      setAddOpen(false);
      toast.success(`${displayMap.get(countryId)?.name ?? "Country"} added`);
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Entry could not be added."));
    } finally {
      setBusy(false);
    }
  }

  async function addExistingCustom(entity: ContestEntityRow) {
    setBusy(true);
    try {
      await addEntityToShow(entity);
      setAddOpen(false);
      toast.success(`${entity.display_name} added`);
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Custom entry could not be added."));
    } finally {
      setBusy(false);
    }
  }

  async function saveCustom() {
    if (!edition || !customDraft?.display_name.trim() || !customDraft.abbreviation.trim()) return;
    setBusy(true);
    try {
      if (customDraft.id) {
        const { error } = await (supabase.from("contest_entities") as any)
          .update({
            display_name: customDraft.display_name.trim(),
            abbreviation: customDraft.abbreviation.trim(),
            flag_image: customDraft.flag_image.trim() || null,
            region: customDraft.region.trim() || null,
          })
          .eq("id", customDraft.id);
        if (error) throw error;
        toast.success("Custom country updated");
      } else {
        const { data, error } = await supabase
          .from("contest_entities")
          .insert({
            edition_id: edition.id,
            entity_type: "custom",
            country_id: null,
            display_name: customDraft.display_name.trim(),
            abbreviation: customDraft.abbreviation.trim(),
            flag_image: customDraft.flag_image.trim() || null,
            region: customDraft.region.trim() || null,
          })
          .select()
          .maybeSingle();
        if (error || !data) throw error ?? new Error("Custom country could not be created.");
        await qc.invalidateQueries({ queryKey: ["contest_entities"] });
        await addEntityToShow(data as ContestEntityRow);
        toast.success(`${customDraft.display_name.trim()} created and added`);
      }
      setCustomDraft(null);
      setAddOpen(false);
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Custom country could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCustom() {
    if (!deleteCustomTarget) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("contest_entities").delete().eq("id", deleteCustomTarget.id);
      if (error) throw error;
      toast.success(`${deleteCustomTarget.display_name} deleted`);
      setDeleteCustomTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "That custom country is still used by a line-up, votes or results. Remove those first."));
    } finally {
      setBusy(false);
    }
  }

  function openEntry(participant: Participant) {
    setEntryDraft({
      id: participant.id,
      artist: participant.artist ?? "",
      song: participant.song ?? "",
      running_order: participant.running_order ?? orderedParticipants.findIndex((item) => item.id === participant.id) + 1,
    });
  }

  async function saveEntry() {
    if (!entryDraft) return;
    setBusy(true);
    try {
      const { error } = await (supabase.from("participants") as any)
        .update({
          artist: entryDraft.artist.trim() || null,
          song: entryDraft.song.trim() || null,
          running_order: Math.max(1, entryDraft.running_order || 1),
        })
        .eq("id", entryDraft.id);
      if (error) throw error;
      setEntryDraft(null);
      toast.success("Entry updated");
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Entry could not be updated."));
    } finally {
      setBusy(false);
    }
  }

  async function moveEntry(index: number, direction: -1 | 1) {
    const current = orderedParticipants[index];
    const other = orderedParticipants[index + direction];
    if (!current || !other) return;
    setBusy(true);
    try {
      const currentOrder = current.running_order ?? index + 1;
      const otherOrder = other.running_order ?? index + direction + 1;
      const [first, second] = await Promise.all([
        (supabase.from("participants") as any).update({ running_order: otherOrder }).eq("id", current.id),
        (supabase.from("participants") as any).update({ running_order: currentOrder }).eq("id", other.id),
      ]);
      if (first.error) throw first.error;
      if (second.error) throw second.error;
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Running order could not be changed."));
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
      const name = displayMap.get(removeTarget.country_id)?.name ?? "Entry";
      toast.success(`${name} removed from ${activeShow?.name ?? "show"}`);
      setRemoveTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Entry could not be removed."));
    } finally {
      setBusy(false);
    }
  }

  async function syncArtistSong() {
    const byCountry = new Map<string, { artist: string | null; song: string | null }>();
    allParticipants.forEach((participant) => {
      if (participant.artist || participant.song) byCountry.set(participant.country_id, { artist: participant.artist, song: participant.song });
    });
    const targets = allParticipants.filter((participant) => !participant.artist && !participant.song && byCountry.has(participant.country_id));
    if (!targets.length) {
      toast.message("Every reusable entry already has artist or song data");
      return;
    }
    setBusy(true);
    try {
      const responses = await Promise.all(targets.map((participant) => {
        const source = byCountry.get(participant.country_id)!;
        return (supabase.from("participants") as any).update({ artist: source.artist, song: source.song }).eq("id", participant.id);
      }));
      const failed = responses.find((response) => response.error);
      if (failed?.error) throw failed.error;
      toast.success(`Synced ${targets.length} entr${targets.length === 1 ? "y" : "ies"}`);
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Some entries could not be synced."));
    } finally {
      setBusy(false);
    }
  }

  async function addQualifiers() {
    if (!edition || !activeShow || !qualifierCandidates.length) {
      toast.message("No new semi-final qualifiers to add");
      return;
    }
    setBusy(true);
    try {
      const nextOrder = Math.max(0, ...orderedParticipants.map((participant) => participant.running_order ?? 0)) + 1;
      const rows = qualifierCandidates.map((participant, index) => ({
        edition_id: edition.id,
        show_id: activeShow.id,
        ...identityFor(participant.country_id),
        running_order: nextOrder + index,
        semi_final: activeShow.kind,
        artist: participant.artist,
        song: participant.song,
      }));
      const { error } = await (supabase.from("participants") as any).insert(rows);
      if (error) throw error;
      toast.success(`Added ${rows.length} qualifier${rows.length === 1 ? "" : "s"}`);
      await refresh();
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Qualifiers could not be added."));
    } finally {
      setBusy(false);
    }
  }

  if (loadingEdition || loadingShows) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading entries…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={ListOrdered} title="Edition not found" description="Return to the edition workspace and choose another edition." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  if (!orderedShows.length) {
    return (
      <AdminPage>
        <AdminPageHeader eyebrow={editionLabel(edition)} title="Entries & running order" description="Create a show before adding entries to its line-up." />
        <AdminCard><AdminEmptyState icon={ListOrdered} title="No shows yet" description="Entries belong to a show, so the first stage needs to exist before its line-up can be built." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create a show</Link>} /></AdminCard>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Entries & running order"
        description="Build each show's line-up, fill artist and song details, and adjust running order from one mobile-friendly workspace."
        actions={
          <div className="flex gap-2">
            <button type="button" className="admin-action-primary" onClick={() => setAddOpen(true)} disabled={!activeShow}><Plus className="size-4" /> Add entry</button>
            <AdminMoreMenu label="More" title="Line-up actions" description="Useful actions that should not compete with everyday entry editing.">
              <AdminActionItem icon={RefreshCw} title="Sync artist & song" description="Fill blank entry details from the same country in another show." disabled={busy} onClick={() => void syncArtistSong()} />
              {(activeShow?.kind === "grand-final" || activeShow?.kind === "final") ? <AdminActionItem icon={UserRoundPlus} title="Add semi-final qualifiers" description={qualifierCandidates.length ? `${qualifierCandidates.length} qualified entr${qualifierCandidates.length === 1 ? "y is" : "ies are"} not in this final yet.` : "No unpromoted qualifiers are currently available."} disabled={busy || !qualifierCandidates.length} onClick={() => void addQualifiers()} /> : null}
              <AdminActionItem icon={Flag} title="Create custom country" description="Add an edition-only nation without touching the global country library." onClick={() => { setAddOpen(false); setCustomDraft({ ...emptyCustom }); }} />
            </AdminMoreMenu>
          </div>
        }
      />

      <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet mb-4 inline-flex"><ArrowLeft className="size-4" /> Edition home</Link>

      <AdminCard className="mb-4">
        <label className="block">
          <span className="admin-section-label">Current show</span>
          <select value={activeShowId ?? ""} onChange={(event) => setShowId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
            {orderedShows.map((show) => <option key={show.id} value={show.id}>{show.name} · {show.kind.replaceAll("-", " ")}</option>)}
          </select>
        </label>
      </AdminCard>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Entries" value={orderedParticipants.length} />
        <Metric label="Missing info" value={missingDetailCount} />
        <Metric label="Qualifiers" value={qualifierCandidates.length} />
      </div>

      <AdminCard>
        <AdminCardHeader eyebrow="Running order" title={activeShow?.name ?? "Show"} description={orderedParticipants.length ? "Use the arrows for quick changes or open an entry for exact position, artist and song editing." : "No entries have been added to this show yet."} action={<AdminStatus tone={missingDetailCount ? "attention" : orderedParticipants.length ? "ready" : "neutral"}>{missingDetailCount ? `${missingDetailCount} incomplete` : orderedParticipants.length ? "Ready" : "Empty"}</AdminStatus>} />

        {loadingParticipants ? <p className="py-8 text-center text-sm text-muted-foreground">Loading line-up…</p> : !orderedParticipants.length ? (
          <AdminEmptyState icon={ListOrdered} title="Build the line-up" description="Add a Terra Solaris country, an existing edition-only country, or create a new custom country." action={<button type="button" className="admin-action-primary" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add first entry</button>} />
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {orderedParticipants.map((participant, index) => {
              const display = displayMap.get(participant.country_id);
              const subtitle = participant.artist && participant.song ? `${participant.artist} · ${participant.song}` : participant.artist || participant.song || "Artist / song not added";
              return (
                <div key={participant.id} className="flex min-w-0 items-center gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="numeric grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-sm font-bold">{participant.running_order ?? index + 1}</span>
                  <FlagChip code={display?.short_code ?? "?"} color={display?.accent_color ?? DEFAULT_ACCENT} image={display?.flag_image ?? null} size="sm" />
                  <button type="button" onClick={() => openEntry(participant)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-foreground">{display?.name ?? "Unknown entry"}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{subtitle}</span>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" disabled={busy || index === 0} onClick={() => void moveEntry(index, -1)} className="admin-action-quiet size-9 !p-0" aria-label={`Move ${display?.name ?? "entry"} up`}><ArrowUp className="size-4" /></button>
                    <button type="button" disabled={busy || index === orderedParticipants.length - 1} onClick={() => void moveEntry(index, 1)} className="admin-action-quiet size-9 !p-0" aria-label={`Move ${display?.name ?? "entry"} down`}><ArrowDown className="size-4" /></button>
                    <button type="button" onClick={() => setRemoveTarget(participant)} className="admin-action-quiet size-9 !p-0 text-rose-200" aria-label={`Remove ${display?.name ?? "entry"}`}><Trash2 className="size-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      {customEntities.length ? (
        <AdminCard className="mt-4">
          <AdminCardHeader eyebrow="Edition-only identities" title="Custom countries" description="These exist only in this edition and never alter the global Terra Solaris country library." />
          <div className="divide-y divide-white/[0.07]">
            {customEntities.map((entity) => {
              const inShow = presentKeys.has(entity.id);
              return (
                <div key={entity.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <FlagChip code={entity.abbreviation} color={DEFAULT_ACCENT} image={entity.flag_image} size="sm" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entity.display_name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{entity.abbreviation}{entity.region ? ` · ${entity.region}` : ""}</p></div>
                  {inShow ? <AdminStatus tone="info">In show</AdminStatus> : <button type="button" disabled={busy} onClick={() => void addExistingCustom(entity)} className="admin-action-secondary !min-h-9 !px-3">Add</button>}
                  <button type="button" className="admin-action-quiet size-9 !p-0" aria-label={`Edit ${entity.display_name}`} onClick={() => setCustomDraft({ id: entity.id, display_name: entity.display_name, abbreviation: entity.abbreviation, flag_image: entity.flag_image ?? "", region: entity.region ?? "" })}><MoreHorizontal className="size-4" /></button>
                </div>
              );
            })}
          </div>
        </AdminCard>
      ) : null}

      <AdminSheet open={addOpen} onClose={() => !busy && setAddOpen(false)} title={`Add to ${activeShow?.name ?? "show"}`} description="Choose a global country or an edition-only custom country.">
        <div className="space-y-5">
          <div>
            <p className="admin-section-label">Terra Solaris country</p>
            <CountryPicker countries={countries} value={countryPick} exclude={presentKeys} onChange={(id) => { setCountryPick(id); if (id) void addCountry(id); }} placeholder="Search country or code…" className="mt-2" />
          </div>

          <div className="border-t border-white/[0.07] pt-4">
            <div className="flex items-center justify-between gap-3"><p className="admin-section-label">Edition-only countries</p><button type="button" className="admin-action-secondary !min-h-9 !px-3" onClick={() => { setAddOpen(false); setCustomDraft({ ...emptyCustom }); }}><Plus className="size-3.5" /> Create</button></div>
            {!customEntities.length ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">No custom countries exist for this edition.</p> : <div className="mt-2 divide-y divide-white/[0.07]">{customEntities.map((entity) => {
              const inShow = presentKeys.has(entity.id);
              return <div key={entity.id} className="flex items-center gap-3 py-3"><FlagChip code={entity.abbreviation} color={DEFAULT_ACCENT} image={entity.flag_image} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entity.display_name}</p><p className="text-xs text-muted-foreground">{entity.abbreviation}</p></div>{inShow ? <AdminStatus tone="neutral">Already added</AdminStatus> : <button type="button" disabled={busy} onClick={() => void addExistingCustom(entity)} className="admin-action-primary !min-h-9 !px-3">Add</button>}</div>;
            })}</div>}
          </div>
        </div>
      </AdminSheet>

      <AdminSheet open={!!entryDraft} onClose={() => !busy && setEntryDraft(null)} title="Edit entry" description="Artist, song and exact running-order position for this show.">
        {entryDraft ? <div className="space-y-4">
          <label className="block"><span className="admin-section-label">Artist</span><input value={entryDraft.artist} onChange={(event) => setEntryDraft((current) => current ? { ...current, artist: event.target.value } : current)} placeholder="Artist" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Song</span><input value={entryDraft.song} onChange={(event) => setEntryDraft((current) => current ? { ...current, song: event.target.value } : current)} placeholder="Song" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Running order</span><input type="number" min={1} value={entryDraft.running_order} onChange={(event) => setEntryDraft((current) => current ? { ...current, running_order: Number(event.target.value) || 1 } : current)} className="numeric mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <button type="button" disabled={busy} onClick={() => void saveEntry()} className="admin-action-primary w-full">{busy ? "Saving…" : "Save entry"}</button>
        </div> : null}
      </AdminSheet>

      <AdminSheet open={!!customDraft} onClose={() => !busy && setCustomDraft(null)} title={customDraft?.id ? "Custom country" : "Create custom country"} description="Edition-only identity. It will never be added to the global country library.">
        {customDraft ? <div className="space-y-4">
          <label className="block"><span className="admin-section-label">Name</span><input value={customDraft.display_name} onChange={(event) => setCustomDraft((current) => current ? { ...current, display_name: event.target.value } : current)} placeholder="Novaria" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Abbreviation</span><input value={customDraft.abbreviation} onChange={(event) => setCustomDraft((current) => current ? { ...current, abbreviation: event.target.value } : current)} placeholder="NVA" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm uppercase outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Flag URL</span><input value={customDraft.flag_image} onChange={(event) => setCustomDraft((current) => current ? { ...current, flag_image: event.target.value } : current)} placeholder="https://…" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Region</span><input value={customDraft.region} onChange={(event) => setCustomDraft((current) => current ? { ...current, region: event.target.value } : current)} placeholder="Region" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <button type="button" disabled={busy || !customDraft.display_name.trim() || !customDraft.abbreviation.trim()} onClick={() => void saveCustom()} className="admin-action-primary w-full">{busy ? "Saving…" : customDraft.id ? "Save custom country" : "Create & add to show"}</button>
          {customDraft.id ? <button type="button" disabled={busy} onClick={() => { const target = entities.find((entity) => entity.id === customDraft.id); if (target) { setCustomDraft(null); setDeleteCustomTarget(target); } }} className="admin-action-danger w-full"><Trash2 className="size-4" /> Delete custom country</button> : null}
        </div> : null}
      </AdminSheet>

      <AdminConfirmSheet
        open={!!removeTarget}
        onClose={() => !busy && setRemoveTarget(null)}
        onConfirm={removeEntry}
        title={`Remove ${removeTarget ? displayMap.get(removeTarget.country_id)?.name ?? "entry" : "entry"}?`}
        description={<>This removes the participant row from <strong>{activeShow?.name}</strong>. It does not intentionally rewrite official result values, but you should only remove an entry when the show line-up itself is meant to change.</>}
        confirmLabel="Remove entry"
        busy={busy}
        danger
      />

      <AdminConfirmSheet
        open={!!deleteCustomTarget}
        onClose={() => !busy && setDeleteCustomTarget(null)}
        onConfirm={deleteCustom}
        title={`Delete ${deleteCustomTarget?.display_name ?? "custom country"}?`}
        description={<>This permanently removes the edition-only identity. Solaris will block deletion if it is still used by a line-up, votes or results.</>}
        confirmLabel="Delete custom country"
        confirmationText={deleteCustomTarget?.display_name}
        confirmationHint={deleteCustomTarget ? `Type ${deleteCustomTarget.display_name} to confirm` : undefined}
        busy={busy}
        danger
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}