import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BookmarkCheck, ChevronRight, Radio, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAllShows, useCountries, useEditions } from "@/lib/data";
import { WorldOrganizationFollowControl } from "@/components/world/WorldOrganizationFollowControl";
import { setWorldOrganizationFollow } from "@/lib/world-organization-follows";
import { fetchPublishedFollowingOrganizations } from "@/lib/v3-world-following-public";
import { useMyFollows, useSetFanFollow } from "@/lib/engagement-data";
import {
  buildV3FollowingSavedProjection,
  searchV3FollowingSavedItems,
  type V3FollowingSavedItem,
  type V3FollowNotificationLevel,
} from "@/lib/v3-following-saved";
import { V3Screen, V3ScreenHeader, V3Section, V3StatusChip, V3Surface } from "./V3Foundation";

const LEVELS: Array<{ value: V3FollowNotificationLevel; label: string }> = [
  { value: "all", label: "All updates" },
  { value: "important", label: "Important only" },
  { value: "none", label: "Saved only" },
];

function typeLabel(type: V3FollowingSavedItem["entityType"]) {
  if (type === "country") return "Countries";
  if (type === "edition") return "Editions";
  if (type === "organization") return "Institutions";
  if (type === "unsupported") return "Other saved items";
  return "Shows";
}

function levelIcon(level: V3FollowNotificationLevel) {
  if (level === "all") return Radio;
  if (level === "important") return Bell;
  return BellOff;
}

function SavedItem({
  item,
  pending,
  onLevel,
  onRemove,
  topicsOpen,
  onTopics,
}: {
  item: V3FollowingSavedItem;
  pending: boolean;
  onLevel: (level: V3FollowNotificationLevel) => void;
  onRemove: () => void;
  topicsOpen: boolean;
  onTopics: () => void;
}) {
  const LevelIcon = levelIcon(item.notificationLevel);
  const title = item.href ? (
    <Link to={item.href as any} className="inline-flex min-h-10 items-center gap-1.5 font-semibold hover:underline">
      <span className="truncate">{item.title}</span>
      <ChevronRight className="size-3.5 shrink-0 text-[var(--v3-text-tertiary)]" aria-hidden="true" />
    </Link>
  ) : (
    <span className="inline-flex min-h-10 items-center font-semibold">{item.title}</span>
  );

  return (
    <V3Surface level="raised" className="p-4" data-v3-follow-item={item.followId}>
      <div className="flex items-start gap-3">
        <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-[var(--v3-text-secondary)]">
          <BookmarkCheck className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {title}
              <p className="text-xs text-[var(--v3-text-tertiary)]">{item.context ?? typeLabel(item.entityType)}</p>
            </div>
            {!item.resolved ? <V3StatusChip tone="warning">Unavailable</V3StatusChip> : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--v3-text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <LevelIcon className="size-3.5" aria-hidden="true" />
                Notifications
              </span>
              <select
                value={item.notificationLevel}
                disabled={pending || item.entityType === "unsupported"}
                onChange={(event) => onLevel(event.target.value as V3FollowNotificationLevel)}
                className="min-h-11 rounded-xl border border-[var(--v3-border)] bg-[var(--v3-bg-elevated)] px-3 text-sm font-medium text-[var(--v3-text-primary)] disabled:opacity-60"
                aria-label={`Notification level for ${item.title}`}
              >
                {LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={pending || item.entityType === "unsupported"}
              onClick={onRemove}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--v3-border)] px-3 text-sm font-semibold text-[var(--v3-text-secondary)] disabled:opacity-60"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Remove
            </button>
          </div>
          {item.entityType === "organization" ? (
            <button type="button" onClick={onTopics} disabled={pending} aria-expanded={topicsOpen}
              className="mt-3 min-h-11 rounded-xl border border-[var(--v3-border)] px-3 text-sm font-semibold">
              {topicsOpen ? "Close institution topics" : "Manage institution topics"}
            </button>
          ) : null}
        </div>
      </div>
    </V3Surface>
  );
}

export function V3FollowingSavedScreen({ viewerId }: { viewerId: string }) {
  const follows = useMyFollows(viewerId);
  const countries = useCountries();
  const editions = useEditions();
  const shows = useAllShows();
  const setFollow = useSetFanFollow(viewerId);
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const mutationInFlight = useRef(false);
  const [message, setMessage] = useState<{ viewerId: string; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [expandedWorldFollow, setExpandedWorldFollow] = useState<string | null>(null);

  // Private follow IDs may seed this bounded public-name lookup ONLY when the
  // complete follow result is verified to belong to the current actor.
  const accountScopedFollows = follows.data?.schemaReady === true &&
    follows.data.follows.every((follow) => follow.profile_id === viewerId);
  const organizationIds = useMemo(() => {
    if (!accountScopedFollows) return [];
    return [...new Set((follows.data?.follows ?? [])
      .filter((follow) => String(follow.entity_type) === "organization")
      .map((follow) => follow.entity_id))].sort();
  }, [accountScopedFollows, follows.data]);
  const publishedOrganizations = useQuery({
    queryKey: ["v3-world-following-public", viewerId, organizationIds],
    enabled: accountScopedFollows && organizationIds.length > 0,
    queryFn: () => fetchPublishedFollowingOrganizations(organizationIds),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const verifiedOrganizations = publishedOrganizations.isSuccess &&
    publishedOrganizations.isFetchedAfterMount && !publishedOrganizations.isFetching
    ? publishedOrganizations.data : [];

  useEffect(() => {
    setMessage(null);
    setSearch("");
  }, [viewerId]);

  useEffect(() => {
    setExpandedWorldFollow(null);
  }, [viewerId]);

  const projection = useMemo(() => {
    if (!follows.data?.schemaReady) return null;
    return buildV3FollowingSavedProjection({
      viewerId,
      follows: follows.data.follows,
      countries: countries.data ?? [],
      editions: editions.data ?? [],
      shows: shows.data ?? [],
      organizations: verifiedOrganizations,
    });
  }, [countries.data, editions.data, follows.data, shows.data, verifiedOrganizations, viewerId]);
  const visibleItems = useMemo(
    () => searchV3FollowingSavedItems(projection?.items ?? [], search),
    [projection, search],
  );

  const loading = follows.isLoading || countries.isLoading || editions.isLoading || shows.isLoading;
  const failed = follows.isError || countries.isError || editions.isError || shows.isError;
  const paused = !failed && (
    (follows.isPending && follows.isPaused) ||
    (countries.isPending && countries.isPaused) ||
    (editions.isPending && editions.isPaused) ||
    (shows.isPending && shows.isPaused)
  );
  // Only a query being retried should disable error recovery. Other public
  // collections can still be loading or refreshing independently.
  const retrying =
    (follows.isError && follows.isFetching) ||
    (countries.isError && countries.isFetching) ||
    (editions.isError && editions.isFetching) ||
    (shows.isError && shows.isFetching);

  // Retry only failed reads. Refetching every public collection would waste egress
  // and could invalidate unrelated successful data.
  const retryFailedReads = () => {
    if (follows.isError) void follows.refetch();
    if (countries.isError) void countries.refetch();
    if (editions.isError) void editions.refetch();
    if (shows.isError) void shows.refetch();
  };

  const updateFollow = async (
    item: V3FollowingSavedItem,
    following: boolean,
    notificationLevel = item.notificationLevel,
  ) => {
    if (mutationInFlight.current) return;
    if (item.entityType === "unsupported") return;
    mutationInFlight.current = true;
    const operationKey = `${item.entityType}:${item.entityId}`;
    setPendingKey(operationKey);
    setMessage(null);
    try {
      if (item.entityType === "organization") {
        await setWorldOrganizationFollow(item.entityId, following, notificationLevel);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["fan-follows", viewerId] }),
          queryClient.invalidateQueries({ queryKey: ["world-organization-follow", viewerId, item.entityId] }),
        ]);
      } else {
        await setFollow.mutateAsync({
          entityType: item.entityType,
          entityId: item.entityId,
          following,
          notificationLevel,
        });
      }
      setMessage({ viewerId, text: following ? `Updated ${item.title}.` : `Removed ${item.title} from Following & Saved.` });
    } catch (error) {
      console.error("[V3 Following & Saved] Preference update failed", error);
      setMessage({ viewerId, text: "Update not confirmed. Check your saved items before trying again." });
    } finally {
      mutationInFlight.current = false;
      setPendingKey(null);
    }
  };

  return (
    <V3Screen className="pb-8">
      <div data-v3-following-saved-root="">
        <V3ScreenHeader
          kicker="Me"
          title="Following & Saved"
          description="Keep meaningful Solaris entities close and choose how many updates you want from each one."
        />

        {message?.viewerId === viewerId ? (
          <p className="mb-4 rounded-xl border border-[var(--v3-border)] px-4 py-3 text-sm" role="status" aria-live="polite">
            {message.text}
          </p>
        ) : null}

        {organizationIds.length > 0 && publishedOrganizations.isError ? (
          <p role="status" className="mb-4 text-sm text-[var(--v3-text-secondary)]">
            Institution names cannot currently be verified. Your private follows remain manageable.
          </p>
        ) : null}

        {pendingKey ? (
          <p role="status" aria-live="polite" className="mb-4 text-sm text-[var(--v3-text-secondary)]">
            Saving your preference…
          </p>
        ) : null}

        {failed ? (
          <V3Surface className="p-5" data-v3-following-saved-state="error">
            <p role="alert" className="text-sm font-semibold">Following & Saved could not be loaded.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">Solaris did not substitute public or browser-local data for your private preferences.</p>
            <button
              type="button"
              disabled={retrying}
              onClick={retryFailedReads}
              className="mt-3 min-h-11 rounded-xl border border-[var(--v3-border)] px-4 text-sm font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {retrying ? "Retrying…" : "Retry saved items"}
            </button>
          </V3Surface>
        ) : paused ? (
          <V3Surface className="p-5" data-v3-following-saved-state="paused">
            <p role="status" className="text-sm font-semibold">Saved items cannot be verified while the connection is paused.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
              Reconnect to load your private preferences. Solaris will not mistake an unverified list for an empty one.
            </p>
          </V3Surface>
        ) : loading ? (
          <V3Surface className="p-5">
            <p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">Loading your saved items…</p>
          </V3Surface>
        ) : follows.data?.schemaReady === false ? (
          <V3Surface className="p-5" data-v3-following-saved-state="unavailable">
            <p className="text-sm font-semibold">Following & Saved is not available on this database yet.</p>
          </V3Surface>
        ) : projection && !projection.scoped ? (
          <V3Surface className="p-5" data-v3-following-saved-state="scope-error">
            <p role="alert" className="text-sm font-semibold">Solaris could not safely scope these preferences to your account.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">No saved entities are shown until account scope is authoritative.</p>
          </V3Surface>
        ) : projection?.items.length ? (
          <>
            <V3Surface className="mb-4 p-4">
              <label className="grid gap-2 text-xs font-semibold text-[var(--v3-text-secondary)]">
                Search saved items
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Country, edition, show or institution"
                  className="min-h-11 rounded-xl border border-[var(--v3-border)] bg-[var(--v3-bg-elevated)] px-3 text-sm text-[var(--v3-text-primary)]"
                />
              </label>
              <p role="status" className="mt-2 text-xs text-[var(--v3-text-tertiary)]">
                {visibleItems.length} of {projection.items.length} saved items
              </p>
            </V3Surface>
            {search.trim() && visibleItems.length === 0 ? (
              <V3Surface className="p-5" data-v3-following-saved-state="no-search-results">
                <p className="text-sm font-semibold">No saved items match your search</p>
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-3 min-h-11 rounded-xl border border-[var(--v3-border)] px-4 text-sm font-semibold"
                >
                  Clear search
                </button>
              </V3Surface>
            ) : null}
            {(["country", "edition", "show", "organization", "unsupported"] as const).map((entityType) => {
              const items = visibleItems.filter((item) => item.entityType === entityType);
              if (!items.length) return null;
              return (
                <V3Section key={entityType} title={typeLabel(entityType)} meta={search.trim() ? `${items.length} matching` : `${items.length} saved`}>
                  <div className="grid gap-3">
                    {items.map((item) => (
                      <div key={item.followId}>
                        <SavedItem
                          item={item}
                          pending={Boolean(pendingKey)}
                          onLevel={(level) => void updateFollow(item, true, level)}
                          onRemove={() => void updateFollow(item, false)}
                          topicsOpen={expandedWorldFollow === item.followId}
                          onTopics={() => setExpandedWorldFollow((previous) => previous === item.followId ? null : item.followId)}
                        />
                        {item.entityType === "organization" && expandedWorldFollow === item.followId ? (
                          <div className="mt-2 rounded-xl border border-[var(--v3-border)] p-4">
                            <WorldOrganizationFollowControl organizationId={item.entityId} organizationName={item.title} />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </V3Section>
              );
            })}
          </>
        ) : (
          <V3Surface className="p-5" data-v3-following-saved-state="empty">
            <p className="text-sm font-semibold">Nothing saved yet</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">Follow a country, edition, show or public institution and it will appear here.</p>
            <Link to={"/explore" as any} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-[var(--v3-bg-base)]">
              Explore Solaris
            </Link>
          </V3Surface>
        )}
      </div>
    </V3Screen>
  );
}
