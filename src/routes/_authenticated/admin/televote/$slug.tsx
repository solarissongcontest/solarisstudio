import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, TriangleAlert, Vote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { FlagChip } from "@/components/FlagChip";
import { supabase } from "@/integrations/supabase/client";
import {
  editionLabel,
  useContestEntities,
  useCountries,
  useEdition,
  useParticipants,
  useShows,
  useTelevotes,
  type Televote,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import { reportSupabaseError } from "@/lib/errors";
import { hasPublishedResults, resolveShowPublication } from "@/lib/publication";
import { resolveVoting } from "@/lib/voting";

type TelevoteSearch = { show?: string };

type Identity = {
  country_id: string | null;
  contest_entity_id: string | null;
};

export const Route = createFileRoute("/_authenticated/admin/televote/$slug")({
  head: () => ({ meta: [{ title: "Televote totals — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): TelevoteSearch => ({
    show: typeof search.show === "string" && search.show ? search.show : undefined,
  }),
  component: TelevoteTotalsWorkspace,
});

function TelevoteTotalsWorkspace() {
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
  const participants = useMemo(
    () => allParticipants
      .filter((participant) => participant.show_id === selectedShow?.id)
      .sort((a, b) => (a.running_order ?? 9999) - (b.running_order ?? 9999)),
    [allParticipants, selectedShow?.id],
  );
  const { data: televotes = [], isLoading: loadingTelevotes } = useTelevotes(selectedShow?.id);
  const displays = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const voting = useMemo(() => resolveVoting(selectedShow?.voting_config), [selectedShow?.voting_config]);
  const publishedResults = !!selectedShow?.published && hasPublishedResults(resolveShowPublication(selectedShow));

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function identityFor(key: string): Identity {
    const entity = entities.find((item) => item.id === key || item.country_id === key);
    return entity
      ? { country_id: entity.country_id, contest_entity_id: entity.id }
      : { country_id: key || null, contest_entity_id: null };
  }

  function voteFor(key: string, votes: Televote[] = televotes) {
    const identity = identityFor(key);
    return votes.find((vote) => {
      if (vote.contest_entity_id && identity.contest_entity_id) return vote.contest_entity_id === identity.contest_entity_id;
      if (vote.country_id === key) return true;
      return !!identity.country_id && !identity.contest_entity_id && vote.country_id === identity.country_id;
    });
  }

  useEffect(() => {
    const next: Record<string, string> = {};
    participants.forEach((participant) => {
      next[participant.country_id] = String(voteFor(participant.country_id, televotes)?.points ?? 0);
    });
    setDraft(next);
  // voteFor intentionally derives from the selected show's current entity/vote snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShow?.id, participants, televotes, entities]);

  const changes = useMemo(() => participants.flatMap((participant) => {
    const key = participant.country_id;
    const saved = voteFor(key)?.points ?? 0;
    const parsed = Math.max(0, Math.round(Number(draft[key] ?? 0) || 0));
    return parsed === saved ? [] : [{ key, points: parsed, saved }];
  // voteFor intentionally derives from the current entity/vote snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [participants, draft, televotes, entities]);

  const totalPoints = participants.reduce((sum, participant) => sum + Math.max(0, Math.round(Number(draft[participant.country_id] ?? 0) || 0)), 0);
  const hasExistingTotals = televotes.some((vote) => vote.points !== 0);
  const requiresConfirmation = hasExistingTotals || publishedResults;

  async function saveChanges() {
    if (!edition || !selectedShow || !changes.length) return;
    setBusy(true);
    try {
      for (const change of changes) {
        const existing = voteFor(change.key);
        const identity = identityFor(change.key);
        const query = existing
          ? (supabase.from("televote_votes") as any).update({ points: change.points }).eq("id", existing.id)
          : (supabase.from("televote_votes") as any).insert({
              edition_id: edition.id,
              show_id: selectedShow.id,
              country_id: identity.country_id,
              contest_entity_id: identity.contest_entity_id,
              points: change.points,
            });
        const { error } = await query;
        if (error) throw error;
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["televote_votes"] }),
        qc.invalidateQueries({ queryKey: ["results"] }),
      ]);
      setConfirmOpen(false);
      toast.success(`Saved ${changes.length} televote total${changes.length === 1 ? "" : "s"}`);
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Televote totals could not be saved. No further rows were changed."));
    } finally {
      setBusy(false);
    }
  }

  function requestSave() {
    if (!changes.length) return;
    if (requiresConfirmation) setConfirmOpen(true);
    else void saveChanges();
  }

  if (loadingEdition || loadingShows) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading televote totals…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Vote} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  if (!orderedShows.length) {
    return <AdminPage><AdminPageHeader eyebrow={editionLabel(edition)} title="Televote totals" description="Create a show before entering aggregate televote totals." /><AdminCard><AdminEmptyState icon={Vote} title="No shows yet" description="Televote totals belong to a show." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create a show</Link>} /></AdminCard></AdminPage>;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Televote totals"
        description="Review or enter the aggregate televote points that feed this show's standings. Public voting rounds and integrity review remain in the Televoting service."
        actions={<button type="button" disabled={busy || !changes.length} onClick={requestSave} className="admin-action-primary"><Save className="size-4" /> {busy ? "Saving…" : changes.length ? `Save ${changes.length}` : "Saved"}</button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet"><ArrowLeft className="size-4" /> Edition home</Link>
        <select
          value={selectedShow?.id ?? ""}
          onChange={(event) => void navigate({ search: { show: event.target.value || undefined } })}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
        >
          {orderedShows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Entries" value={participants.length} />
        <Metric label="Total points" value={totalPoints} />
        <Metric label="Changed" value={changes.length} />
      </div>

      {!voting.televoteEnabled ? (
        <AdminCard className="mb-4 !border-amber-200/15">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-100" />
            <div><p className="text-sm font-semibold">Televote is disabled in this show's voting system</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Existing totals are preserved, but they will not contribute normally until televote is enabled in Voting system.</p></div>
          </div>
        </AdminCard>
      ) : null}

      {publishedResults ? (
        <AdminCard className="mb-4 !border-amber-200/15">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-100" />
            <div><p className="text-sm font-semibold">Results from this show are already public</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Changing these totals may change calculated standings. Saving requires typing the show name first.</p></div>
          </div>
        </AdminCard>
      ) : null}

      {loadingTelevotes ? (
        <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading totals…</p></AdminCard>
      ) : !participants.length ? (
        <AdminCard><AdminEmptyState icon={Vote} title="No entries in this show" description="Build the line-up before entering televote totals." action={<Link to="/admin/entries/$slug" params={{ slug }} search={{ show: selectedShow?.id }} className="admin-action-primary">Open entries</Link>} /></AdminCard>
      ) : (
        <AdminCard className="!p-0 overflow-hidden">
          <div className="divide-y divide-white/[0.07]">
            {participants.map((participant, index) => {
              const display = displays.get(participant.country_id);
              const saved = voteFor(participant.country_id)?.points ?? 0;
              const current = Math.max(0, Math.round(Number(draft[participant.country_id] ?? 0) || 0));
              const changed = current !== saved;
              return (
                <label key={participant.id} className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
                  <span className="numeric w-7 shrink-0 text-center text-xs text-muted-foreground">{participant.running_order ?? index + 1}</span>
                  <FlagChip code={display?.short_code ?? "??"} color={display?.accent_color ?? "#8888aa"} image={display?.flag_image} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{display?.name ?? participant.country_id}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{participant.artist || participant.song ? [participant.artist, participant.song].filter(Boolean).join(" · ") : "Entry"}</span>
                  </span>
                  {changed ? <AdminStatus tone="attention">Edited</AdminStatus> : null}
                  <input
                    aria-label={`${display?.name ?? participant.country_id} televote points`}
                    inputMode="numeric"
                    type="number"
                    min={0}
                    step={1}
                    value={draft[participant.country_id] ?? "0"}
                    onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, [participant.country_id]: event.target.value }))}
                    className="numeric min-h-11 w-24 shrink-0 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-right text-sm font-semibold text-foreground outline-none focus:border-sky-200/30"
                  />
                </label>
              );
            })}
          </div>
        </AdminCard>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">These are aggregate show totals, not individual public ballots. Editing here never deletes public-voting submissions or integrity records.</p>

      <AdminConfirmSheet
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={saveChanges}
        title={`Save televote totals for ${selectedShow?.name ?? "this show"}?`}
        description={<>You are changing {changes.length} canonical televote total{changes.length === 1 ? "" : "s"}. Existing ballot rows remain intact, but standings may change immediately after recalculation.</>}
        confirmLabel="Save changed totals"
        confirmationText={selectedShow?.name}
        confirmationHint={selectedShow ? `Type ${selectedShow.name} to confirm` : undefined}
        busy={busy}
        danger={publishedResults}
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
