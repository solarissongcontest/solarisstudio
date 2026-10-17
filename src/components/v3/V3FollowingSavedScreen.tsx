import { Link } from "@tanstack/react-router";
import { Bell, BellOff, BookmarkCheck, ChevronRight, Radio, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAllShows, useCountries, useEditions } from "@/lib/data";
import { useMyFollows, useSetFanFollow } from "@/lib/engagement-data";
import {
  buildV3FollowingSavedProjection,
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
}: {
  item: V3FollowingSavedItem;
  pending: boolean;
  onLevel: (level: V3FollowNotificationLevel) => void;
  onRemove: () => void;
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
                disabled={pending}
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
              disabled={pending}
              onClick={onRemove}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--v3-border)] px-3 text-sm font-semibold text-[var(--v3-text-secondary)] disabled:opacity-60"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Remove
            </button>
          </div>
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
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const projection = useMemo(() => {
    if (!follows.data?.schemaReady) return null;
    return buildV3FollowingSavedProjection({
      viewerId,
      follows: follows.data.follows,
      countries: countries.data ?? [],
      editions: editions.data ?? [],
      shows: shows.data ?? [],
    });
  }, [countries.data, editions.data, follows.data, shows.data, viewerId]);

  const loading = follows.isLoading || countries.isLoading || editions.isLoading || shows.isLoading;
  const failed = follows.isError || countries.isError || editions.isError || shows.isError;

  const updateFollow = async (
    item: V3FollowingSavedItem,
    following: boolean,
    notificationLevel = item.notificationLevel,
  ) => {
    if (pendingKey) return;
    const operationKey = `${item.entityType}:${item.entityId}`;
    setPendingKey(operationKey);
    setMessage(null);
    try {
      await setFollow.mutateAsync({
        entityType: item.entityType,
        entityId: item.entityId,
        following,
        notificationLevel,
      });
      setMessage(following ? `Updated ${item.title}.` : `Removed ${item.title} from Following & Saved.`);
    } catch (error) {
      console.error("[V3 Following & Saved] Preference update failed", error);
      setMessage("Solaris could not save that preference. Nothing else was changed.");
    } finally {
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

        {message ? (
          <p className="mb-4 rounded-xl border border-[var(--v3-border)] px-4 py-3 text-sm" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}

        {loading ? (
          <V3Surface className="p-5">
            <p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">Loading your saved items…</p>
          </V3Surface>
        ) : failed ? (
          <V3Surface className="p-5">
            <p role="alert" className="text-sm font-semibold">Following & Saved could not be loaded.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">Solaris did not substitute public or browser-local data for your private preferences.</p>
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
            {(["country", "edition", "show"] as const).map((entityType) => {
              const items = projection.items.filter((item) => item.entityType === entityType);
              if (!items.length) return null;
              return (
                <V3Section key={entityType} title={typeLabel(entityType)} meta={`${items.length} saved`}>
                  <div className="grid gap-3">
                    {items.map((item) => (
                      <SavedItem
                        key={item.followId}
                        item={item}
                        pending={pendingKey === `${item.entityType}:${item.entityId}`}
                        onLevel={(level) => void updateFollow(item, true, level)}
                        onRemove={() => void updateFollow(item, false)}
                      />
                    ))}
                  </div>
                </V3Section>
              );
            })}
          </>
        ) : (
          <V3Surface className="p-5" data-v3-following-saved-state="empty">
            <p className="text-sm font-semibold">Nothing saved yet</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">Follow a country, edition or show from its public page and it will appear here.</p>
            <Link to={"/explore" as any} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-[var(--v3-bg-base)]">
              Explore Solaris
            </Link>
          </V3Surface>
        )}
      </div>
    </V3Screen>
  );
}
