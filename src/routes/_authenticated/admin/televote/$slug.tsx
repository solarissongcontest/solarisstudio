import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, TriangleAlert, Vote } from "lucide-react";
import { useMemo } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { FlagChip } from "@/components/FlagChip";
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
import { parseTelevoteShowSearch } from "@/lib/v3-organizer-televote-show-search";
import { hasPublishedResults, resolveShowPublication } from "@/lib/publication";
import { resolveVoting } from "@/lib/voting";

type Identity = {
  country_id: string | null;
  contest_entity_id: string | null;
};

export const Route = createFileRoute("/_authenticated/admin/televote/$slug")({
  head: () => ({
    meta: [{ title: "Televote totals — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: parseTelevoteShowSearch,
  component: TelevoteTotalsRoute,
});

function TelevoteTotalsRoute() {
  const { editionId } = useAdminContext();
  return <TelevoteTotalsWorkspace key={editionId || "unscoped"} />;
}

function voteForIdentity(key: string, identity: Identity, votes: Televote[]) {
  return votes.find((vote) => {
    if (vote.contest_entity_id && identity.contest_entity_id)
      return vote.contest_entity_id === identity.contest_entity_id;
    if (vote.country_id === key) return true;
    return (
      !!identity.country_id &&
      !identity.contest_entity_id &&
      vote.country_id === identity.country_id
    );
  });
}

function TelevoteTotalsWorkspace() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { editionId: organizerEditionId } = useAdminContext();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined;
  const contextMismatch = Boolean(edition && organizerEditionId !== edition.id);
  const { data: shows = [], isLoading: loadingShows } = useShows(scopedEditionId);
  const { data: allParticipants = [] } = useParticipants(scopedEditionId);
  const { data: countries = [] } = useCountries();
  const { data: entities = [] } = useContestEntities(scopedEditionId);

  const orderedShows = useMemo(
    () => [...shows].sort((a, b) => a.sort_order - b.sort_order),
    [shows],
  );
  // A stale, renamed, or cross-edition show link must never silently select a
  // different show's official totals. The read hook is disabled with no show.
  const selectedShow = search.invalidShow
    ? null
    : search.show
      ? orderedShows.find((show) => show.id === search.show) ?? null
      : orderedShows[0] ?? null;
  const participants = useMemo(
    () =>
      allParticipants
        .filter((participant) => participant.show_id === selectedShow?.id)
        .sort((a, b) => (a.running_order ?? 9999) - (b.running_order ?? 9999)),
    [allParticipants, selectedShow?.id],
  );
  const { data: televotes = [], isLoading: loadingTelevotes } = useTelevotes(selectedShow?.id);
  const displays = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const voting = useMemo(
    () => resolveVoting(selectedShow?.voting_config),
    [selectedShow?.voting_config],
  );
  const publishedResults =
    !!selectedShow?.published && hasPublishedResults(resolveShowPublication(selectedShow));

  function identityFor(key: string): Identity {
    const entity = entities.find((item) => item.id === key || item.country_id === key);
    return entity
      ? { country_id: entity.country_id, contest_entity_id: entity.id }
      : { country_id: key || null, contest_entity_id: null };
  }

  function voteFor(key: string, votes: Televote[] = televotes) {
    return voteForIdentity(key, identityFor(key), votes);
  }

  const totalPoints = participants.reduce(
    (sum, participant) => sum + (voteFor(participant.country_id)?.points ?? 0),
    0,
  );

  if (loadingEdition) {
    return (
      <AdminCard>
        <p className="py-8 text-center text-sm text-muted-foreground">Loading televote totals…</p>
      </AdminCard>
    );
  }

  if (!edition) {
    return (
      <AdminCard>
        <AdminEmptyState
          icon={Vote}
          title="Edition not found"
          description="Choose another edition from the organizer workspace."
          action={
            <Link to="/admin" className="admin-action-secondary">
              Back to editions
            </Link>
          }
        />
      </AdminCard>
    );
  }

  if (!organizerEditionId) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={Vote}
            title="Choose an edition"
            description="Televote totals are edition-scoped official voting inputs. Select the matching Organizer edition before viewing them."
            action={
              <Link to="/televoting/admin" className="admin-action-secondary">
                Back to Voting
              </Link>
            }
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
            description="This Televote totals URL belongs to a different edition than the one selected in Solaris Organizer. Reads remain blocked until the contexts match."
            action={
              <Link to="/televoting/admin" className="admin-action-secondary">
                Back to Voting
              </Link>
            }
          />
        </AdminCard>
      </AdminPage>
    );
  }

  if (loadingShows) {
    return (
      <AdminCard>
        <p className="py-8 text-center text-sm text-muted-foreground">Loading televote totals…</p>
      </AdminCard>
    );
  }

  if ((search.invalidShow || search.show) && !selectedShow) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={TriangleAlert}
            title="Show link is no longer valid"
            description="This show link does not resolve inside the selected Organizer edition. No other show's Televote totals were substituted. Choose a show from the edition workspace."
            action={
              <Link to="/admin/$slug" params={{ slug }} className="admin-action-secondary">
                Back to edition
              </Link>
            }
          />
        </AdminCard>
      </AdminPage>
    );
  }

  if (!orderedShows.length) {
    return (
      <AdminPage>
        <AdminPageHeader
          eyebrow={editionLabel(edition)}
          title="Televote totals"
          description="Create a show before viewing aggregate Televote totals."
        />
        <AdminCard>
          <AdminEmptyState
            icon={Vote}
            title="No shows yet"
            description="Televote totals belong to a show."
            action={
              <Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">
                Create a show
              </Link>
            }
          />
        </AdminCard>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Televote totals"
        description="Read-only recorded aggregate Televote points for this show. Corrections, sanctions and deductions belong in the Televoting-owned Combined Results workflow."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/televoting/admin/combined"
              
              className="admin-action-primary"
            >
              Open Televoting corrections
            </Link>

            {publishedResults && selectedShow ? (
              <Link
                to="/shows/$showId"
                params={{ showId: selectedShow.id }}
                search={{ from: "results" }}
                className="admin-action-secondary"
              >
                View official Results
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet">
          <ArrowLeft className="size-4" /> Edition home
        </Link>
        <select
          value={selectedShow?.id ?? ""}
          onChange={(event) => void navigate({ search: { show: event.target.value || undefined } })}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
        >
          {orderedShows.map((show) => (
            <option key={show.id} value={show.id}>
              {show.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Entries" value={participants.length} />
        <Metric label="Total points" value={totalPoints} />
        <Metric label="Recorded votes" value={televotes.length} />
      </div>

      <AdminCard className="mb-4 !border-sky-200/15">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Edition</p>
            <p className="mt-1 font-semibold">{editionLabel(edition)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Show</p>
            <p className="mt-1 font-semibold">{selectedShow?.name ?? "Unavailable"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Publication</p>
            <p className="mt-1 font-semibold">
              {publishedResults ? "Official Results published" : "Not publicly published"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {televotes.length
                ? "Televote totals loaded (source provenance not certified here)"
                : "No Televote total rows recorded"}
            </p>
          </div>
        </div>
      </AdminCard>

      {!voting.televoteEnabled ? (
        <AdminCard className="mb-4 !border-amber-200/15">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-100" />
            <div>
              <p className="text-sm font-semibold">
                Televote is disabled in this show's voting system
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Existing totals are preserved, but they will not contribute normally until televote
                is enabled in Voting system.
              </p>
            </div>
          </div>
        </AdminCard>
      ) : null}

      {publishedResults ? (
        <AdminCard className="mb-4 !border-amber-200/15">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-100" />
            <div>
              <p className="text-sm font-semibold">Results from this show are already public</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Published-result corrections require a governed Televoting correction source and
                publication review. This screen cannot apply them directly.
              </p>
            </div>
          </div>
        </AdminCard>
      ) : null}

      {loadingTelevotes ? (
        <AdminCard>
          <p className="py-8 text-center text-sm text-muted-foreground">Loading totals…</p>
        </AdminCard>
      ) : !participants.length ? (
        <AdminCard>
          <AdminEmptyState
            icon={Vote}
            title="No entries in this show"
            description="Build the line-up before entering televote totals."
            action={
              <Link
                to="/admin/entries/$slug"
                params={{ slug }}
                search={{ show: selectedShow?.id }}
                className="admin-action-primary"
              >
                Open entries
              </Link>
            }
          />
        </AdminCard>
      ) : (
        <AdminCard className="!p-0 overflow-hidden">
          <div className="divide-y divide-white/[0.07]">
            {participants.map((participant, index) => {
              const display = displays.get(participant.country_id);
              const points = voteFor(participant.country_id)?.points ?? 0;
              return (
                <label
                  key={participant.id}
                  className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4"
                >
                  <span className="numeric w-7 shrink-0 text-center text-xs text-muted-foreground">
                    {participant.running_order ?? index + 1}
                  </span>
                  <FlagChip
                    code={display?.short_code ?? "??"}
                    color={display?.accent_color ?? "#8888aa"}
                    image={display?.flag_image}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {display?.name ?? participant.country_id}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {participant.artist || participant.song
                        ? [participant.artist, participant.song].filter(Boolean).join(" · ")
                        : "Entry"}
                    </span>
                  </span>
                  {points < 0 ? <AdminStatus tone="attention">Sanction</AdminStatus> : null}
                  <output
                    aria-label={`${display?.name ?? participant.country_id} televote points`}
                    className="numeric min-h-11 w-24 shrink-0 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-3 text-right text-sm font-semibold text-foreground"
                  >
                    {points}
                  </output>
                </label>
              );
            })}
          </div>
        </AdminCard>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        These are aggregate show totals, not individual public ballots. Negative sanctions remain
        visible here after publication. Select and verify the correct edition, show and aggregation
        in the Televoting correction workflow before changing any source. This link does not pass
        an authoritative edition/show command context. This screen cannot write official totals.
      </p>
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-card px-3 py-3 text-center">
      <p className="numeric text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
