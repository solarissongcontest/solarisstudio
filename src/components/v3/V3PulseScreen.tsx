import { CheckCircle2, Radio, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import {
  useEventReads,
  useMarkAllEventsRead,
  useMarkEventRead,
  useMyFollows,
  useNotificationPreferences,
} from "@/lib/engagement-data";
import { formatEventDateTime } from "@/lib/public-time";
import { PULSE_CATEGORY_OPTIONS, type PulseCategory } from "@/lib/pulse";
import { projectV3PulseFeed, type V3PulseEventProjection } from "@/lib/v3-pulse";
import { mergeV3PublicPulsePages } from "@/lib/v3-public-pulse";
import { useV3PublicPulsePages } from "@/lib/v3-public-pulse-runtime";
import { V3Screen, V3ScreenHeader, V3Section, V3Surface } from "./V3Foundation";

const ALL_CATEGORIES = PULSE_CATEGORY_OPTIONS.map(([value]) => value);

type PulseMode = "latest" | "for-you";

function isPulseCategory(value: string): value is PulseCategory {
  return ALL_CATEGORIES.includes(value as PulseCategory);
}

function provenanceLabel(event: V3PulseEventProjection) {
  switch (event.provenance) {
    case "official": return "Official update";
    case "prediction": return "Prediction insight";
    case "archive": return "Archive insight";
    case "contest": return "Contest update";
  }
}

function PulseEventCard({
  event,
  showUnread,
  onOpen,
}: {
  event: V3PulseEventProjection;
  showUnread: boolean;
  onOpen: (event: V3PulseEventProjection) => void;
}) {
  return (
    <a
      href={event.route}
      onClick={() => onOpen(event)}
      className="block"
      data-v3-pulse-event={event.id}
    >
      <V3Surface level="raised" className="p-4 transition-transform active:scale-[0.99]">
        <article>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[var(--v3-text-tertiary)]">
            {showUnread && event.unread ? (
              <span className="size-2 rounded-full bg-[var(--v3-accent)]" aria-label="Unread" />
            ) : null}
            <span>{provenanceLabel(event)}</span>
            <span aria-hidden="true">·</span>
            <span>{event.eventLabel}</span>
            {event.importance === "important" ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--v3-text-primary)]">Important</span>
              </>
            ) : null}
          </div>
          <h2 className="mt-2 text-base font-semibold leading-snug">{event.title}</h2>
          {event.summary ? (
            <p className="mt-2 text-sm leading-6 text-[var(--v3-text-secondary)]">{event.summary}</p>
          ) : null}
          <p className="mt-3 text-xs text-[var(--v3-text-tertiary)]">
            {formatEventDateTime(event.publishedAt)}
          </p>
        </article>
      </V3Surface>
    </a>
  );
}

export function V3PulseScreen({ viewerId }: { viewerId: string | null }) {
  const [mode, setMode] = useState<PulseMode>("latest");
  const [category, setCategory] = useState<PulseCategory | null>(null);
  const pulse = useV3PublicPulsePages(category, true);
  const follows = useMyFollows(viewerId ?? undefined);
  const reads = useEventReads(viewerId ?? undefined);
  const preferences = useNotificationPreferences(viewerId ?? undefined);
  const markRead = useMarkEventRead(viewerId ?? undefined);
  const markAllRead = useMarkAllEventsRead(viewerId ?? undefined);

  const pages = pulse.data?.pages ?? [];
  const firstPage = pages[0];
  const events = useMemo(() => mergeV3PublicPulsePages(pages), [pages]);
  const readIds = useMemo(
    () => new Set((reads.data ?? []).map((read) => read.event_id)),
    [reads.data],
  );

  const personalizationPending = Boolean(
    viewerId && (follows.isPending || reads.isPending || preferences.isPending),
  );
  const personalizationError = Boolean(
    viewerId && (follows.isError || reads.isError || preferences.isError),
  );
  const personalizationReady = Boolean(
    viewerId && !personalizationPending && !personalizationError,
  );

  const preferenceCategories = preferences.data
    ? preferences.data.categories.filter(isPulseCategory)
    : ALL_CATEGORIES;
  const activePersonalCategories = category
    ? preferenceCategories.includes(category) ? [category] : []
    : preferenceCategories;

  const latestFeed = useMemo(
    () => projectV3PulseFeed({
      events,
      follows: [],
      categories: category ? [category] : ALL_CATEGORIES,
      signedIn: false,
      inAppEnabled: true,
      readIds,
    }),
    [events, category, readIds],
  );

  const personalFeed = useMemo(
    () => projectV3PulseFeed({
      events,
      follows: follows.data?.follows ?? [],
      categories: activePersonalCategories,
      signedIn: Boolean(viewerId),
      inAppEnabled: preferences.data?.in_app_enabled ?? true,
      readIds,
    }),
    [
      events,
      follows.data?.follows,
      activePersonalCategories,
      viewerId,
      preferences.data?.in_app_enabled,
      readIds,
    ],
  );

  const visibleFeed = mode === "for-you" ? personalFeed : latestFeed;
  const unreadIds = personalizationReady
    ? visibleFeed.filter((event) => event.unread).map((event) => event.id)
    : [];

  const handleOpen = (event: V3PulseEventProjection) => {
    if (viewerId && personalizationReady && event.unread) {
      markRead.mutate(event.id);
    }
  };

  return (
    <V3Screen className="pb-8">
      <div data-v3-pulse-root="">
        <V3ScreenHeader
          kicker="What changed"
          title="Solaris Pulse"
          description="A server-authoritative stream of published Solaris updates. Personal filters change what you see, never what is public."
        />

        <V3Section
          title="Pulse"
          meta={firstPage?.serverTime ? `Updated ${formatEventDateTime(firstPage.serverTime)}` : undefined}
        >
          <V3Surface className="p-3">
            <div className="flex gap-2" role="tablist" aria-label="Pulse feed">
              {(["latest", "for-you"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => setMode(value)}
                  className="min-h-11 flex-1 rounded-xl border border-white/10 px-3 text-sm font-semibold data-[selected=true]:bg-white/[0.08]"
                  data-selected={mode === value}
                >
                  {value === "latest" ? "Latest" : "For you"}
                </button>
              ))}
            </div>
          </V3Surface>

          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Pulse category">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="min-h-11 shrink-0 rounded-full border border-white/10 px-4 text-sm font-semibold"
              aria-pressed={category === null}
            >
              All
            </button>
            {PULSE_CATEGORY_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className="min-h-11 shrink-0 rounded-full border border-white/10 px-4 text-sm font-semibold"
                aria-pressed={category === value}
              >
                {label}
              </button>
            ))}
          </div>

          {pulse.isLoading ? (
            <V3Surface>
              <p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">
                Loading published updates…
              </p>
            </V3Surface>
          ) : pulse.isError || firstPage?.schemaReady === false ? (
            <V3Surface>
              <p role="alert" className="text-sm font-semibold">Pulse could not verify the public feed.</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Solaris will not substitute browser-time visibility or an Organizer-widened event feed.
              </p>
            </V3Surface>
          ) : mode === "for-you" && !viewerId ? (
            <V3Surface>
              <Sparkles className="size-5" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold">Sign in for your Pulse</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Following and read state belong to your account. The public Latest feed stays available without signing in.
              </p>
              <a href="/auth" className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold">
                Sign in
              </a>
            </V3Surface>
          ) : mode === "for-you" && personalizationPending ? (
            <V3Surface>
              <p role="status" className="text-sm text-[var(--v3-text-secondary)]">
                Loading your follows and read state…
              </p>
            </V3Surface>
          ) : mode === "for-you" && (personalizationError || follows.data?.schemaReady === false) ? (
            <V3Surface>
              <p role="alert" className="text-sm font-semibold">Personal Pulse is unavailable.</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Latest still uses the same public event identities; Solaris will not invent personal state locally.
              </p>
            </V3Surface>
          ) : visibleFeed.length ? (
            <div className="grid gap-3">
              {personalizationReady && unreadIds.length ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => markAllRead.mutate(unreadIds)}
                    disabled={markAllRead.isPending}
                    className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold disabled:opacity-60"
                  >
                    {markAllRead.isPending ? "Saving…" : `Mark ${unreadIds.length} as read`}
                  </button>
                </div>
              ) : null}

              {visibleFeed.map((event) => (
                <PulseEventCard
                  key={event.id}
                  event={event}
                  showUnread={personalizationReady}
                  onOpen={handleOpen}
                />
              ))}

              {pulse.isFetchNextPageError ? (
                <V3Surface>
                  <p className="text-xs leading-5 text-[var(--v3-text-secondary)]">
                    Older updates could not be loaded. The published updates already on screen remain available.
                  </p>
                  <button
                    type="button"
                    onClick={() => void pulse.fetchNextPage()}
                    className="mt-3 min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold"
                  >
                    Retry older updates
                  </button>
                </V3Surface>
              ) : pulse.hasNextPage ? (
                <button
                  type="button"
                  disabled={pulse.isFetchingNextPage}
                  onClick={() => void pulse.fetchNextPage()}
                  className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold disabled:opacity-60"
                >
                  {pulse.isFetchingNextPage ? "Loading older updates…" : "Load older updates"}
                </button>
              ) : null}
            </div>
          ) : (
            <V3Surface>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Nothing to show here</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    {mode === "for-you"
                      ? "No published updates match your current follows and preferences."
                      : "No published Solaris updates match this category yet."}
                  </p>
                </div>
              </div>
            </V3Surface>
          )}
        </V3Section>

        <V3Section title="About Pulse">
          <V3Surface>
            <div className="flex items-start gap-3">
              <Radio className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="text-xs leading-5 text-[var(--v3-text-secondary)]">
                Pulse is context, not a task center. Required delegation work remains in Participate, and push delivery remains separate from canonical action state.
              </p>
            </div>
          </V3Surface>
        </V3Section>
      </div>
    </V3Screen>
  );
}
