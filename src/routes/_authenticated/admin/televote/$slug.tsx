import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, TriangleAlert, Vote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
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
import { validateEditionCommandScope } from "@/lib/solaris-v6-edition-context";
import { resolveVoting } from "@/lib/voting";

type TelevoteSearch = { show?: string };

type Identity = {
  country_id: string | null;
  contest_entity_id: string | null;
};

type ReviewedTelevoteChange = {
  key: string;
  label: string;
  points: number;
  saved: number;
  existingId: string | null;
  identity: Identity;
};

type PendingTelevoteReview = {
  editionId: string;
  editionName: string;
  showId: string;
  showName: string;
  showEditionId: string;
  participantIds: string[];
  publishedResults: boolean;
  changes: ReviewedTelevoteChange[];
};

export const Route = createFileRoute("/_authenticated/admin/televote/$slug")({
  head: () => ({ meta: [{ title: "Televote totals — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): TelevoteSearch => ({
    show: typeof search.show === "string" && search.show ? search.show : undefined,
  }),
  component: TelevoteTotalsRoute,
});

function TelevoteTotalsRoute() {
  const { editionId } = useAdminContext();
  return <TelevoteTotalsWorkspace key={editionId || "unscoped"} />;
}

function voteForIdentity(key: string, identity: Identity, votes: Televote[]) {
  return votes.find((vote) => {
    if (vote.contest_entity_id && identity.contest_entity_id) return vote.contest_entity_id === identity.contest_entity_id;
    if (vote.country_id === key) return true;
    return !!identity.country_id && !identity.contest_entity_id && vote.country_id === identity.country_id;
  });
}

function sameIdSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function TelevoteTotalsWorkspace() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { editionId: organizerEditionId } = useAdminContext();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined;
  const contextMismatch = Boolean(edition && organizerEditionId !== edition.id);
  const { data: shows = [], isLoading: loadingShows } = useShows(scopedEditionId);
  const { data: allParticipants = [] } = useParticipants(scopedEditionId);
  const { data: countries = [] } = useCountries();
  const { data: entities = [] } = useContestEntities(scopedEditionId);

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
  const [pendingReview, setPendingReview] = useState<PendingTelevoteReview | null>(null);
  const [busy, setBusy] = useState(false);

  function identityFor(key: string): Identity {
    const entity = entities.find((item) => item.id === key || item.country_id === key);
    return entity
      ? { country_id: entity.country_id, contest_entity_id: entity.id }
      : { country_id: key || null, contest_entity_id: null };
  }

  function voteFor(key: string, votes: Televote[] = televotes) {
    return voteForIdentity(key, identityFor(key), votes);
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

  useEffect(() => {
    setPendingReview(null);
  }, [organizerEditionId, edition?.id, selectedShow?.id]);

  const changes = useMemo(() => participants.flatMap((participant) => {
    const key = participant.country_id;
    const saved = voteFor(key)?.points ?? 0;
    const parsed = Math.round(Number(draft[key] ?? 0) || 0);
    return parsed === saved ? [] : [{ key, points: parsed, saved }];
  // voteFor intentionally derives from the current entity/vote snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [participants, draft, televotes, entities]);

  const totalPoints = participants.reduce((sum, participant) => sum + Math.round(Number(draft[participant.country_id] ?? 0) || 0), 0);

  function assertTelevoteEditionScope(review?: PendingTelevoteReview) {
    if (!edition || !organizerEditionId || !selectedShow) {
      throw Object.assign(
        new Error("Televote totals require an exact Organizer edition and show context."),
        { status: 409 },
      );
    }
    if (review && (review.editionId !== edition.id || review.showId !== selectedShow.id)) {
      throw Object.assign(
        new Error("Edition or show context changed after this Televote review opened. Open a fresh review before applying."),
        { status: 409 },
      );
    }
    const scope = validateEditionCommandScope({
      routeEditionId: edition.id,
      commandEditionId: review?.editionId ?? organizerEditionId,
      entityEditionId: review?.showEditionId ?? selectedShow.edition_id,
      capabilityEditionId: organizerEditionId,
    });
    if (!scope.ok) {
      throw Object.assign(
        new Error(
          `Edition context changed before the Televote totals save (${scope.mismatches.join(", ")}). Refresh canonical state before retrying.`,
        ),
        { status: 409 },
      );
    }
    return edition.id;
  }

  function requestSave() {
    if (!edition || !selectedShow || !changes.length) return;
    assertTelevoteEditionScope();
    setPendingReview({
      editionId: edition.id,
      editionName: editionLabel(edition),
      showId: selectedShow.id,
      showName: selectedShow.name,
      showEditionId: selectedShow.edition_id,
      participantIds: participants.map((participant) => participant.id),
      publishedResults,
      changes: changes.map((change) => {
        const existing = voteFor(change.key);
        return {
          ...change,
          label: displays.get(change.key)?.name ?? change.key,
          existingId: existing?.id ?? null,
          identity: identityFor(change.key),
        };
      }),
    });
  }

  async function applyReviewedChanges() {
    const review = pendingReview;
    if (!review?.changes.length) return;
    setBusy(true);
    let mutationPhaseStarted = false;
    try {
      const commandEditionId = assertTelevoteEditionScope(review);

      const [showResult, participantResult, voteResult] = await Promise.all([
        supabase
          .from("shows")
          .select("id,edition_id,name,published,publication_config")
          .eq("id", review.showId)
          .eq("edition_id", review.editionId)
          .maybeSingle(),
        supabase
          .from("participants")
          .select("id")
          .eq("show_id", review.showId)
          .eq("edition_id", review.editionId),
        supabase
          .from("televote_votes")
          .select("id,edition_id,show_id,country_id,contest_entity_id,points")
          .eq("show_id", review.showId)
          .eq("edition_id", review.editionId),
      ]);

      if (showResult.error) throw showResult.error;
      if (participantResult.error) throw participantResult.error;
      if (voteResult.error) throw voteResult.error;
      if (!showResult.data) {
        throw Object.assign(new Error("The reviewed show no longer exists in this edition."), { status: 409 });
      }
      if (showResult.data.name !== review.showName) {
        throw Object.assign(new Error("The reviewed show changed after this review opened. Open a fresh review."), { status: 409 });
      }
      const livePublishedResults = !!showResult.data.published
        && hasPublishedResults(resolveShowPublication(showResult.data as any));
      if (livePublishedResults !== review.publishedResults) {
        throw Object.assign(
          new Error("Result publication state changed after this review opened. Review the Televote impact again before applying."),
          { status: 409 },
        );
      }
      const liveParticipantIds = (participantResult.data ?? []).map((participant) => participant.id);
      if (!sameIdSet(review.participantIds, liveParticipantIds)) {
        throw Object.assign(
          new Error("The show line-up changed after this review opened. Refresh Televote totals and review the exact current line-up."),
          { status: 409 },
        );
      }

      const liveVotes = (voteResult.data ?? []) as Televote[];
      for (const change of review.changes) {
        const liveExisting = voteForIdentity(change.key, change.identity, liveVotes);
        if (change.existingId) {
          if (!liveExisting || liveExisting.id !== change.existingId || liveExisting.points !== change.saved) {
            throw Object.assign(
              new Error(`${change.label}'s saved Televote total changed after this review opened. Refresh before retrying.`),
              { status: 409 },
            );
          }
        } else if (liveExisting) {
          throw Object.assign(
            new Error(`${change.label} received a Televote total after this review opened. Refresh before retrying.`),
            { status: 409 },
          );
        }
      }

      mutationPhaseStarted = true;
      for (const change of review.changes) {
        if (change.existingId) {
          const { data, error } = await (supabase.from("televote_votes") as any)
            .update({ points: change.points })
            .eq("id", change.existingId)
            .eq("edition_id", commandEditionId)
            .eq("show_id", review.showId)
            .eq("points", change.saved)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!data) {
            throw Object.assign(
              new Error(`${change.label}'s Televote total changed while this batch was being applied. Refresh canonical state before retrying.`),
              { status: 409 },
            );
          }
        } else {
          const { error } = await (supabase.from("televote_votes") as any).insert({
            edition_id: commandEditionId,
            show_id: review.showId,
            country_id: change.identity.country_id,
            contest_entity_id: change.identity.contest_entity_id,
            points: change.points,
          });
          if (error) throw error;
        }
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["televote_votes"] }),
        qc.invalidateQueries({ queryKey: ["results"] }),
      ]);
      setPendingReview(null);
      toast.success(`Saved ${review.changes.length} reviewed Televote total${review.changes.length === 1 ? "" : "s"}`);
    } catch (caught) {
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: ["televote_votes"] }),
        qc.invalidateQueries({ queryKey: ["results"] }),
      ]);
      setPendingReview(null);
      const fallback = mutationPhaseStarted
        ? "Televote totals could not be confirmed. The compatibility writer is sequential and non-atomic, so one or more earlier rows may already have committed. Refresh canonical state before retrying."
        : "Televote totals were not applied because canonical state changed before the reviewed batch could start. Refresh and open a fresh review.";
      toast.error(reportSupabaseError(caught, fallback));
    } finally {
      setBusy(false);
    }
  }

  if (loadingEdition) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading televote totals…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Vote} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  if (!organizerEditionId) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={Vote}
            title="Choose an edition"
            description="Televote totals are edition-scoped official voting inputs. Select the exact edition in the Organizer toolbar before loading or changing totals."
            action={<Link to="/televoting/admin" className="admin-action-secondary">Back to Voting</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
  }

  if (contextMismatch) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={TriangleAlert}
            title="Edition context mismatch"
            description="This Televote totals URL belongs to a different edition than the one selected in Solaris Organizer. Reads and saves stay blocked until the contexts match."
            action={<Link to="/televoting/admin" className="admin-action-secondary">Back to Voting</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
  }

  if (loadingShows) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading televote totals…</p></AdminCard>;
  }

  if (!orderedShows.length) {
    return <AdminPage><AdminPageHeader eyebrow={editionLabel(edition)} title="Televote totals" description="Create a show before entering aggregate televote totals." /><AdminCard><AdminEmptyState icon={Vote} title="No shows yet" description="Televote totals belong to a show." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create a show</Link>} /></AdminCard></AdminPage>;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Televote totals"
        description="Review or enter the aggregate televote points that feed this show's standings. Negative totals are allowed for sanctions or point deductions. Public voting rounds and integrity review remain in the Televoting service."
        actions={<button type="button" disabled={busy || !changes.length} onClick={requestSave} className="admin-action-primary"><Save className="size-4" /> {busy ? "Saving…" : changes.length ? `Review ${changes.length}` : "Saved"}</button>}
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
            <div><p className="text-sm font-semibold">Results from this show are already public</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Changing these totals may change calculated standings. Every save now requires reviewing the exact batch and typing the show name.</p></div>
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
              const current = Math.round(Number(draft[participant.country_id] ?? 0) || 0);
              const changed = current !== saved;
              return (
                <label key={participant.id} className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
                  <span className="numeric w-7 shrink-0 text-center text-xs text-muted-foreground">{participant.running_order ?? index + 1}</span>
                  <FlagChip code={display?.short_code ?? "??"} color={display?.accent_color ?? "#8888aa"} image={display?.flag_image} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{display?.name ?? participant.country_id}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{participant.artist || participant.song ? [participant.artist, participant.song].filter(Boolean).join(" · ") : "Entry"}</span>
                  </span>
                  {current < 0 ? <AdminStatus tone="attention">Sanction</AdminStatus> : changed ? <AdminStatus tone="attention">Edited</AdminStatus> : null}
                  <input
                    aria-label={`${display?.name ?? participant.country_id} televote points`}
                    inputMode="numeric"
                    type="number"
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

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">These are aggregate show totals, not individual public ballots. You can enter a negative value when an official sanction or penalty deducts points. Editing here never deletes public-voting submissions or integrity records.</p>

      <AdminConfirmSheet
        open={!!pendingReview}
        onClose={() => !busy && setPendingReview(null)}
        onConfirm={applyReviewedChanges}
        title={`Review Televote totals for ${pendingReview?.showName ?? "this show"}`}
        description={pendingReview ? (
          <div className="space-y-3 text-left">
            <p>You are changing {pendingReview.changes.length} official aggregate Televote total{pendingReview.changes.length === 1 ? "" : "s"} in <strong>{pendingReview.editionName}</strong>.</p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/[0.08] bg-black/10 p-3">
              {pendingReview.changes.map((change) => (
                <div key={change.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium text-foreground">{change.label}</span>
                  <span className="numeric shrink-0 text-muted-foreground">{change.saved} → <strong className="text-foreground">{change.points}</strong></span>
                </div>
              ))}
            </div>
            <p>Before applying, Solaris re-reads the exact show, line-up, publication state and reviewed totals. If any reviewed state changed, this batch is refused and must be reviewed again.</p>
            <p className="text-amber-100/90"><strong>Legacy authority:</strong> this compatibility writer is still sequential and non-atomic. System #585 owns the canonical atomic, versioned, idempotent Televote-total command and receipt. If a network failure makes the outcome uncertain, refresh canonical state before retrying.</p>
          </div>
        ) : undefined}
        confirmLabel="Apply reviewed totals"
        confirmationText={pendingReview?.showName}
        confirmationHint={pendingReview ? `Type ${pendingReview.showName} to confirm` : undefined}
        busy={busy}
        danger={pendingReview?.publishedResults ?? false}
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
