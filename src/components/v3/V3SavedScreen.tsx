import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, Bookmark, Trash2 } from "lucide-react";
import { useState } from "react";

import { useSetFanFollow } from "@/lib/engagement-data";
import type {
  V3SavedItem,
  V3SavedNotificationLevel,
  V3SavedProjection,
} from "@/lib/v3-saved";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

function levelLabel(level: V3SavedNotificationLevel) {
  if (level === "all") return "All updates";
  if (level === "none") return "No alerts";
  return "Important only";
}

function SavedCard({
  item,
  busy,
  onChangeLevel,
  onRemove,
}: {
  item: V3SavedItem;
  busy: boolean;
  onChangeLevel: (level: V3SavedNotificationLevel) => void;
  onRemove: () => void;
}) {
  return (
    <V3Surface level="raised" className="p-4" data-v3-saved-item={item.entityType}>
      <div className="flex items-start gap-3">
        {item.flagUrl ? (
          <img
            src={item.flagUrl}
            alt=""
            className="aspect-[3/2] w-14 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        ) : (
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-white/55"
            aria-hidden="true"
          >
            <Bookmark className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {item.href ? (
            <Link to={item.href as any} className="block min-h-11 py-1">
              <span className="block truncate text-sm font-semibold">{item.title}</span>
              {item.subtitle ? (
                <span className="mt-1 block text-xs text-[var(--v3-text-secondary)]">
                  {item.subtitle}
                </span>
              ) : null}
            </Link>
          ) : (
            <div className="min-h-11 py-1">
              <p className="text-sm font-semibold">{item.title}</p>
              {item.subtitle ? (
                <p className="mt-1 text-xs text-[var(--v3-text-secondary)]">{item.subtitle}</p>
              ) : null}
            </div>
          )}
        </div>
        <V3StatusChip tone={item.notificationLevel === "none" ? "neutral" : "progress"}>
          {levelLabel(item.notificationLevel)}
        </V3StatusChip>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--v3-border-subtle)] pt-3">
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] px-3 text-xs font-semibold">
          {item.notificationLevel === "none" ? (
            <BellOff className="size-4" aria-hidden="true" />
          ) : (
            <Bell className="size-4" aria-hidden="true" />
          )}
          <span className="sr-only">Notification level for {item.title}</span>
          <select
            aria-label={`Notification level for ${item.title}`}
            value={item.notificationLevel}
            disabled={busy || !item.available}
            onChange={(event) => onChangeLevel(event.target.value as V3SavedNotificationLevel)}
            className="bg-transparent outline-none disabled:opacity-50"
          >
            <option value="all">All updates</option>
            <option value="important">Important only</option>
            <option value="none">No alerts</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold disabled:opacity-50"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Remove
        </button>
      </div>
    </V3Surface>
  );
}

export function V3SavedScreen({
  viewerId,
  projection,
}: {
  viewerId: string;
  projection: V3SavedProjection;
}) {
  const queryClient = useQueryClient();
  const setFollow = useSetFanFollow(viewerId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["v3-saved-projection", viewerId] });
  };

  const updateItem = async (
    item: V3SavedItem,
    following: boolean,
    notificationLevel = item.notificationLevel,
  ) => {
    if (pendingId) return;
    setPendingId(item.followId);
    setError(null);
    try {
      await setFollow.mutateAsync({
        entityType: item.entityType,
        entityId: item.entityId,
        following,
        notificationLevel,
      });
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Solaris could not update this saved item. Its current server state was kept.",
      );
    } finally {
      setPendingId(null);
    }
  };

  const total =
    projection.countries.length + projection.editions.length + projection.unavailable.length;

  return (
    <V3Screen>
      <div data-v3-saved-root="">
        <V3ScreenHeader
          kicker="Me"
          title="Following & Saved"
          description="Countries and editions you follow, plus how much notification attention each one is allowed to generate."
        />

        {error ? (
          <V3Surface className="mb-4 p-4">
            <p role="alert" className="text-sm text-[var(--v3-danger)]">
              {error}
            </p>
          </V3Surface>
        ) : null}

        {total === 0 ? (
          <V3Surface className="p-5" data-v3-saved-state="empty">
            <p className="text-sm font-semibold">Nothing saved yet</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
              Follow a country or edition from Explore and it will appear here.
            </p>
            <Link
              to="/explore"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-black"
            >
              Explore Solaris
            </Link>
          </V3Surface>
        ) : null}

        {projection.countries.length ? (
          <V3Section
            title="Countries"
            meta={`${projection.countries.length} followed`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {projection.countries.map((item) => (
                <SavedCard
                  key={item.followId}
                  item={item}
                  busy={pendingId === item.followId}
                  onChangeLevel={(level) => void updateItem(item, true, level)}
                  onRemove={() => void updateItem(item, false)}
                />
              ))}
            </div>
          </V3Section>
        ) : null}

        {projection.editions.length ? (
          <V3Section
            title="Editions"
            meta={`${projection.editions.length} followed`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {projection.editions.map((item) => (
                <SavedCard
                  key={item.followId}
                  item={item}
                  busy={pendingId === item.followId}
                  onChangeLevel={(level) => void updateItem(item, true, level)}
                  onRemove={() => void updateItem(item, false)}
                />
              ))}
            </div>
          </V3Section>
        ) : null}

        {projection.unavailable.length ? (
          <V3Section title="Unavailable" meta={`${projection.unavailable.length} saved`}>
            <V3Surface className="p-4">
              <p className="text-xs leading-5 text-[var(--v3-text-secondary)]">
                These follow records no longer point to a public country or edition. You can remove them without exposing unpublished entity data.
              </p>
              <div className="mt-3 grid gap-2">
                {projection.unavailable.map((item) => (
                  <SavedCard
                    key={item.followId}
                    item={item}
                    busy={pendingId === item.followId}
                    onChangeLevel={() => undefined}
                    onRemove={() => void updateItem(item, false)}
                  />
                ))}
              </div>
            </V3Surface>
          </V3Section>
        ) : null}
      </div>
    </V3Screen>
  );
}
