import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Scale, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
} from "@/components/admin/AdminUI";
import { FastJuryEntry } from "@/components/studio/FastEntry";
import { supabase } from "@/integrations/supabase/client";
import {
  VOTER_KINDS,
  editionLabel,
  resolveShowVoters,
  useContestEntities,
  useCountries,
  useEdition,
  useJuryVotes,
  useParticipants,
  useShowVoters,
  useShows,
  type Voter,
  type VoterKind,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import { resolveVoting } from "@/lib/voting";

type JurySearch = { show?: string };
type VoterDraft = { kind: VoterKind; countryId: string; name: string; flag_image: string; accent_color: string };
const emptyVoter: VoterDraft = { kind: "country", countryId: "", name: "", flag_image: "", accent_color: "#8888aa" };

export const Route = createFileRoute("/_authenticated/admin/jury/$slug")({
  head: () => ({ meta: [{ title: "Jury — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): JurySearch => ({ show: typeof search.show === "string" ? search.show : undefined }),
  component: JuryWorkspace,
});

function JuryWorkspace() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const { data: allParticipants = [] } = useParticipants(edition?.id);
  const { data: countries = [] } = useCountries();
  const { data: entities = [] } = useContestEntities(edition?.id);

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const selectedShow = orderedShows.find((show) => show.id === search.show) ?? orderedShows[0] ?? null;
  const participants = useMemo(() => allParticipants.filter((participant) => participant.show_id === selectedShow?.id).sort((a, b) => (a.running_order ?? 999) - (b.running_order ?? 999)), [allParticipants, selectedShow?.id]);
  const { data: showVoters = [] } = useShowVoters(selectedShow?.id);
  const { data: juryVotes = [] } = useJuryVotes(selectedShow?.id);
  const displays = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const order = useMemo(() => participants.map((participant) => participant.contest_entity_id ?? participant.country_id).filter(Boolean), [participants]);
  const receiverDisplays = useMemo(() => order.map((id) => displays.get(id)).filter((item): item is NonNullable<typeof item> => !!item), [displays, order]);
  const voterOptions = useMemo(() => resolveShowVoters(showVoters, order, receiverDisplays), [order, receiverDisplays, showVoters]);
  const [activeVoter, setActiveVoter] = useState("");
  const resolvedActiveVoter = voterOptions.some((option) => option.key === activeVoter) ? activeVoter : voterOptions[0]?.key ?? "";
  const [manageOpen, setManageOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<VoterDraft>(emptyVoter);
  const [deleteTarget, setDeleteTarget] = useState<Voter | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["voters"] }),
      qc.invalidateQueries({ queryKey: ["jury_votes"] }),
    ]);
  }

  function identityFor(key: string) {
    const entity = entities.find((item) => item.id === key || item.country_id === key);
    return entity ? { country_id: entity.country_id, contest_entity_id: entity.id } : { country_id: key || null, contest_entity_id: null };
  }

  async function addAllParticipants() {
    if (!edition || !selectedShow) return;
    const existing = new Set(showVoters.map((voter) => voter.contest_entity_id ?? voter.country_id).filter(Boolean));
    const missing = order.filter((key) => {
      const identity = identityFor(key);
      return !existing.has(key) && !existing.has(identity.country_id) && !existing.has(identity.contest_entity_id);
    });
    if (!missing.length) {
      toast.info("All participating countries are already juries");
      return;
    }
    setBusy(true);
    try {
      const rows = missing.map((key, index) => {
        const identity = identityFor(key);
        const display = displays.get(key);
        return {
          edition_id: edition.id,
          show_id: selectedShow.id,
          ...identity,
          name: display?.name ?? "Country",
          kind: "country",
          flag_image: display?.flag_image ?? null,
          accent_color: display?.accent_color ?? "#8888aa",
          sort_order: showVoters.length + index + 1,
        };
      });
      const { error } = await (supabase.from("voters") as any).insert(rows);
      if (error) throw error;
      toast.success(`Added ${rows.length} countr${rows.length === 1 ? "y" : "ies"} to the jury`);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Juries could not be added");
    } finally {
      setBusy(false);
    }
  }

  async function addVoter() {
    if (!edition || !selectedShow) return;
    const country = countries.find((item) => item.id === draft.countryId);
    const isCountryKind = draft.kind === "country" || draft.kind === "external-country";
    const name = (isCountryKind ? (country?.name ?? "") : draft.name).trim();
    if (!name) return;
    setBusy(true);
    try {
      const identity = draft.kind === "country" && draft.countryId ? identityFor(draft.countryId) : { country_id: draft.countryId || null, contest_entity_id: null };
      const { error } = await (supabase.from("voters") as any).insert({
        edition_id: edition.id,
        show_id: selectedShow.id,
        ...identity,
        name,
        kind: draft.kind,
        flag_image: draft.flag_image || country?.flag_image || null,
        accent_color: draft.accent_color || country?.accent_color || "#8888aa",
        sort_order: showVoters.length + 1,
      });
      if (error) throw error;
      toast.success("Jury voter added");
      setDraft({ ...emptyVoter });
      setAddOpen(false);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Jury voter could not be added");
    } finally {
      setBusy(false);
    }
  }

  async function renameVoter(voter: Voter, name: string) {
    if (!name.trim() || name.trim() === voter.name) return;
    const { error } = await (supabase.from("voters") as any).update({ name: name.trim() }).eq("id", voter.id);
    if (error) toast.error(error.message);
    else await refresh();
  }

  async function deleteVoter() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("voters").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`${deleteTarget.name} removed from the jury`);
      setDeleteTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Jury voter could not be removed");
    } finally {
      setBusy(false);
    }
  }

  function decodeVoterKey(key: string) {
    const option = voterOptions.find((item) => item.key === key);
    return { voterId: option?.voterId ?? null, countryId: option?.countryId ?? null };
  }

  async function assign(voterKey: string, receiver: string, points: number) {
    if (!edition || !selectedShow) return;
    const { voterId, countryId } = decodeVoterKey(voterKey);
    const voterIdentity = countryId ? identityFor(countryId) : { country_id: null, contest_entity_id: null };
    const target = identityFor(receiver);
    const { error } = await (supabase as any).rpc("assign_jury_vote", {
      p_edition_id: edition.id,
      p_show_id: selectedShow.id,
      p_voter_id: voterId,
      p_voter_country_id: voterIdentity.country_id,
      p_voter_entity_id: voterIdentity.contest_entity_id,
      p_receiving_country_id: target.country_id,
      p_receiving_entity_id: target.contest_entity_id,
      p_points: points,
    });
    if (error) toast.error(error.message);
    else await refresh();
  }

  async function clearPoint(voterKey: string, points: number) {
    if (!edition || !selectedShow) return;
    const { voterId, countryId } = decodeVoterKey(voterKey);
    const voterIdentity = countryId ? identityFor(countryId) : { country_id: null, contest_entity_id: null };
    const { error } = await (supabase as any).rpc("clear_jury_point", {
      p_edition_id: edition.id,
      p_show_id: selectedShow.id,
      p_voter_id: voterId,
      p_voter_country_id: voterIdentity.country_id,
      p_voter_entity_id: voterIdentity.contest_entity_id,
      p_points: points,
    });
    if (error) toast.error(error.message);
    else await refresh();
  }

  if (loadingEdition || loadingShows) return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading jury workspace…</p></AdminCard>;
  if (!edition) return <AdminCard><AdminEmptyState icon={Scale} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  if (!orderedShows.length) return <AdminPage><AdminPageHeader eyebrow={editionLabel(edition)} title="Jury" description="Create a show before configuring its jury." /><AdminCard><AdminEmptyState icon={Users} title="No shows yet" description="Juries belong to a show." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create a show</Link>} /></AdminCard></AdminPage>;

  const completedVoters = voterOptions.filter((option) => juryVotes.some((vote) => vote.voter_id === option.voterId || (!!option.countryId && (vote.voter_country_id === option.countryId || vote.voter_entity_id === option.countryId)))).length;

  return (
    <AdminPage>
      <AdminPageHeader eyebrow={editionLabel(edition)} title="Jury" description="Manage who votes and enter jury scores show by show without opening the old edition studio." actions={<button type="button" className="admin-action-secondary" onClick={() => setManageOpen(true)}><Users className="size-4" /> Manage juries</button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-quiet"><ArrowLeft className="size-4" /> Shows</Link>
        <select value={selectedShow?.id ?? ""} onChange={(event) => void navigate({ search: { show: event.target.value || undefined } })} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
          {orderedShows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Juries" value={voterOptions.length} />
        <Metric label="With votes" value={completedVoters} />
        <Metric label="Awards" value={juryVotes.length} />
      </div>

      {!participants.length ? (
        <AdminCard><AdminEmptyState icon={Users} title="No entries in this show" description="Build the line-up before entering jury votes." action={<Link to="/admin/entries/$slug" params={{ slug }} search={{ show: selectedShow?.id }} className="admin-action-primary">Open entries</Link>} /></AdminCard>
      ) : !voterOptions.length ? (
        <AdminCard><AdminEmptyState icon={Scale} title="No jury voters" description="Add the participating countries as juries, or create external/individual voters." action={<button type="button" disabled={busy} onClick={() => void addAllParticipants()} className="admin-action-primary">Add participating countries</button>} /></AdminCard>
      ) : (
        <AdminCard>
          <FastJuryEntry voters={voterOptions} receivers={receiverDisplays} voting={resolveVoting(selectedShow?.voting_config)} votes={juryVotes} activeVoter={resolvedActiveVoter} onVoterChange={setActiveVoter} onAssign={(voter, receiver, points) => void assign(voter, receiver, points)} onClear={(voter, points) => void clearPoint(voter, points)} />
        </AdminCard>
      )}

      <AdminSheet open={manageOpen} onClose={() => setManageOpen(false)} title={`Juries · ${selectedShow?.name ?? "show"}`} description="Participating countries can vote by default. Explicit voter rows let you add external juries, organisations or people.">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => void addAllParticipants()} className="admin-action-secondary w-full">Add all countries</button>
          <button type="button" onClick={() => setAddOpen(true)} className="admin-action-primary w-full"><Plus className="size-4" /> Add voter</button>
        </div>
        {!showVoters.length ? <p className="rounded-xl border border-dashed border-white/[0.1] p-4 text-xs leading-relaxed text-muted-foreground">No explicit jury list exists yet. Until one is created, participating countries are used as the default voters.</p> : (
          <div className="space-y-2">
            {showVoters.map((voter) => (
              <div key={voter.id} className="admin-action-row flex items-center gap-3">
                <div className="min-w-0 flex-1"><input defaultValue={voter.name} onBlur={(event) => void renameVoter(voter, event.target.value)} className="min-h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-sm font-semibold outline-none focus:border-sky-200/30" /><p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{voter.kind.replaceAll("-", " ")}</p></div>
                <button type="button" onClick={() => setDeleteTarget(voter)} className="admin-action-secondary !min-h-10 !px-3" aria-label={`Remove ${voter.name}`}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        )}
      </AdminSheet>

      <AdminSheet open={addOpen} onClose={() => !busy && setAddOpen(false)} title="Add jury voter" description="Country voters stay linked to contest identity. External juries and people can have their own display identity.">
        <div className="space-y-4">
          <label className="block"><span className="admin-section-label">Kind</span><select value={draft.kind} onChange={(event) => setDraft({ ...emptyVoter, kind: event.target.value as VoterKind })} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30">{VOTER_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replaceAll("-", " ")}</option>)}</select></label>
          {draft.kind === "country" || draft.kind === "external-country" ? <label className="block"><span className="admin-section-label">Country</span><select value={draft.countryId} onChange={(event) => { const country = countries.find((item) => item.id === event.target.value); setDraft((current) => ({ ...current, countryId: event.target.value, name: country?.name ?? "", flag_image: country?.flag_image ?? "", accent_color: country?.accent_color ?? current.accent_color })); }} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30"><option value="">Choose country…</option>{countries.filter((country) => draft.kind === "external-country" || order.includes(country.id) || entities.some((entity) => entity.country_id === country.id && order.includes(entity.id))).map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label> : <label className="block"><span className="admin-section-label">Name</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="International Jury" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>}
          <label className="block"><span className="admin-section-label">Flag / logo URL</span><input value={draft.flag_image} onChange={(event) => setDraft((current) => ({ ...current, flag_image: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Accent colour</span><input value={draft.accent_color} onChange={(event) => setDraft((current) => ({ ...current, accent_color: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30" /></label>
          <button type="button" disabled={busy || ((draft.kind === "country" || draft.kind === "external-country") ? !draft.countryId : !draft.name.trim())} onClick={() => void addVoter()} className="admin-action-primary w-full">{busy ? "Adding…" : "Add voter"}</button>
        </div>
      </AdminSheet>

      <AdminConfirmSheet open={!!deleteTarget} onClose={() => !busy && setDeleteTarget(null)} onConfirm={deleteVoter} title={`Remove ${deleteTarget?.name ?? "jury voter"}?`} description={<>This removes the voter identity from this show. Existing jury awards linked to it may also become unusable, so only remove a voter when the jury list is being corrected.</>} confirmLabel="Remove voter" busy={busy} danger />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
