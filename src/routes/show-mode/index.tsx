import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Clock3,
  ExternalLink,
  EyeOff,
  ListOrdered,
  RadioTower,
  Sun,
  Trophy,
  Vote,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { Switch } from "@/components/ui/switch";
import { televotingSupabase } from "@/integrations/televoting/client";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import {
  editionLabel,
  useAllContestEntities,
  useAllParticipants,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import {
  preferredShowModeShow,
  resolveShowCompanionState,
  safeShowModeYoutubeUrl,
  showModeConfig,
  type ShowModeTelevoteRound,
} from "@/lib/show-mode";

export const Route = createFileRoute("/show-mode/")({
  head: () => ({
    meta: [
      { title: "Show Mode — Solaris Studio" },
      {
        name: "description",
        content:
          "A spoiler-aware live companion for reliable Solaris show, voting and result events.",
      },
    ],
  }),
  component: ShowModePage,
});

type WakeLockSentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

function activeCompanionPhase(phase: string) {
  return [
    "live",
    "voting_open",
    "voting_closed",
    "results_in_progress",
  ].includes(phase);
}

function ShowModePage() {
  const { isAppMode } = useSolarisApp();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const countriesQuery = useCountries();
  const entitiesQuery = useAllContestEntities();
  const { preferences, update } = useAppExperiencePreferences();
  const [selectedShowId, setSelectedShowId] = useState("");
  const [wakeActive, setWakeActive] = useState(false);

  const latestEdition = useMemo(
    () =>
      [...(editionsQuery.data ?? [])].sort(
        (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
      )[0] ?? null,
    [editionsQuery.data],
  );

  const shows = useMemo(
    () =>
      (showsQuery.data ?? [])
        .filter(
          (show) =>
            Boolean(latestEdition) &&
            show.edition_id === latestEdition!.id &&
            isShowPublic(show),
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [latestEdition, showsQuery.data],
  );

  const preferredShow = useMemo(() => preferredShowModeShow(shows), [shows]);

  useEffect(() => {
    if (!shows.length) {
      if (selectedShowId) setSelectedShowId("");
      return;
    }
    if (!selectedShowId || !shows.some((show) => show.id === selectedShowId)) {
      setSelectedShowId(preferredShow?.id ?? shows[0]!.id);
    }
  }, [preferredShow?.id, selectedShowId, shows]);

  const selectedShow =
    shows.find((show) => show.id === selectedShowId) ?? preferredShow ?? shows[0] ?? null;
  const selectedConfig = showModeConfig(selectedShow);
  const linkedRoundId = selectedConfig.televoteRoundId;

  const roundQuery = useQuery({
    enabled: Boolean(linkedRoundId),
    queryKey: ["show-mode-televote-round", linkedRoundId ?? "none"],
    queryFn: async (): Promise<ShowModeTelevoteRound | null> => {
      const { data, error } = await televotingSupabase
        .from("rounds")
        .select("id,name,status,opened_at,closed_at")
        .eq("id", linkedRoundId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: String(data.id),
        name: String(data.name),
        status:
          data.status === "open" || data.status === "closed"
            ? data.status
            : "draft",
        openedAt: typeof data.opened_at === "string" ? data.opened_at : null,
        closedAt: typeof data.closed_at === "string" ? data.closed_at : null,
      };
    },
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const companion = selectedShow
    ? resolveShowCompanionState({
        show: selectedShow,
        televoteRound: roundQuery.data ?? null,
      })
    : null;

  const displayMap = useMemo(
    () =>
      entityDisplayMap(
        entitiesQuery.data ?? [],
        countriesQuery.data ?? [],
      ),
    [countriesQuery.data, entitiesQuery.data],
  );

  const runningOrder = useMemo(
    () =>
      selectedShow
        ? (participantsQuery.data ?? [])
            .filter(
              (participant) =>
                participant.show_id === selectedShow.id &&
                participant.running_order != null,
            )
            .sort(
              (a, b) =>
                (a.running_order ?? Number.MAX_SAFE_INTEGER) -
                (b.running_order ?? Number.MAX_SAFE_INTEGER),
            )
        : [],
    [participantsQuery.data, selectedShow],
  );

  const publication = selectedShow
    ? resolveShowPublication(selectedShow)
    : null;
  const youtubeUrl = safeShowModeYoutubeUrl(companion?.config.youtubeUrl);
  const scheduledStart =
    companion?.config.scheduledStart &&
    Number.isFinite(new Date(companion.config.scheduledStart).getTime())
      ? new Date(companion.config.scheduledStart)
      : null;

  const wakeLockSupported =
    typeof navigator !== "undefined" &&
    Boolean((navigator as NavigatorWithWakeLock).wakeLock);
  const shouldWake =
    Boolean(
      wakeLockSupported &&
        preferences.keepScreenAwake &&
        companion &&
        activeCompanionPhase(companion.phase),
    );

  useEffect(() => {
    if (!shouldWake || typeof document === "undefined") {
      setWakeActive(false);
      return;
    }

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const release = async () => {
      const current = sentinel;
      sentinel = null;
      if (current && !current.released) {
        await current.release().catch(() => undefined);
      }
      if (!cancelled) setWakeActive(false);
    };

    const request = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
        if (!wakeLock) return;
        sentinel = await wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        setWakeActive(true);
        sentinel.addEventListener?.("release", () => {
          if (!cancelled) setWakeActive(false);
        });
      } catch {
        if (!cancelled) setWakeActive(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
      else void release();
    };

    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [shouldWake]);

  const loading =
    editionsQuery.isLoading ||
    showsQuery.isLoading ||
    participantsQuery.isLoading ||
    countriesQuery.isLoading ||
    entitiesQuery.isLoading;

  return (
    <AppShell>
      {!isAppMode ? (
        <PageHeader
          eyebrow="Live companion"
          title="Show Mode"
          description="Follow reliable Solaris show, voting and result events alongside the real YouTube broadcast."
        />
      ) : null}

      <div className="space-y-4" data-solaris-show-mode>
        {loading ? (
          <section className="solaris-show-mode-state is-loading" aria-busy="true">
            <p className="text-sm text-muted-foreground">Loading current show state…</p>
          </section>
        ) : !selectedShow || !latestEdition || !companion ? (
          <section className="solaris-show-mode-state">
            <RadioTower className="size-6 text-primary" aria-hidden="true" />
            <h2 className="mt-3 text-xl font-bold">No public show is ready yet</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Show Mode will activate when the current edition has a public show.
            </p>
          </section>
        ) : (
          <>
            {shows.length > 1 ? (
              <div className="solaris-show-mode-picker" aria-label="Choose show">
                {shows.map((show) => (
                  <button
                    key={show.id}
                    type="button"
                    onClick={() => setSelectedShowId(show.id)}
                    className={show.id === selectedShow.id ? "is-active" : undefined}
                  >
                    {show.name}
                  </button>
                ))}
              </div>
            ) : null}

            <section
              className="solaris-show-mode-state"
              data-show-phase={companion.phase}
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="solaris-show-mode-phase">{companion.label}</span>
                <span className="text-xs text-muted-foreground">
                  {editionLabel(latestEdition)}
                </span>
              </div>

              <h1 className="mt-3 text-2xl font-bold tracking-[-0.025em]">
                {selectedShow.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {companion.description}
              </p>

              {scheduledStart ? (
                <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="size-4" aria-hidden="true" />
                  <span>
                    Scheduled {scheduledStart.toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {youtubeUrl ? (
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    Watch on YouTube
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                ) : null}

                {companion.votingOpen ? (
                  <Link
                    to="/televoting"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.08] px-4 text-sm font-semibold text-emerald-100"
                  >
                    <Vote className="size-4" aria-hidden="true" />
                    Vote now
                  </Link>
                ) : null}

                <Link
                  to="/shows/$showId"
                  params={{ showId: selectedShow.id }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"
                >
                  Show page
                </Link>
              </div>
            </section>

            {roundQuery.error ? (
              <section className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-xs leading-5 text-muted-foreground">
                Voting status could not be refreshed. Solaris will not guess whether voting is open or closed.
              </section>
            ) : null}

            {companion.resultsPublished ? (
              <section className="solaris-show-mode-result">
                <Trophy className="size-5 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Official results are available</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {preferences.spoilerFree
                      ? "Spoiler-free mode is on. Solaris will not show the winner here until you deliberately open the result."
                      : "The publication engine has released this show’s official result."}
                  </p>
                </div>
                <Link
                  to="/shows/$showId"
                  params={{ showId: selectedShow.id }}
                  className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-border px-3 text-xs font-semibold"
                >
                  {preferences.spoilerFree ? "Reveal result" : "Open result"}
                </Link>
              </section>
            ) : null}

            {publication?.running_order && runningOrder.length ? (
              <Panel
                title="Running order"
                description="Reference order only. Solaris does not mark a current performer automatically."
              >
                <div className="divide-y divide-border/60">
                  {runningOrder.map((participant) => {
                    const identity = displayMap.get(participant.country_id);
                    return (
                      <div
                        key={participant.id}
                        className="grid grid-cols-[2.2rem_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="numeric text-sm font-bold text-muted-foreground">
                          {participant.running_order}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {identity?.name ?? "Solaris entry"}
                          </p>
                          {publication.artists || publication.songs ? (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {[
                                publication.artists ? participant.artist : null,
                                publication.songs ? participant.song : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            ) : null}

            <Panel
              title="Show Mode settings"
              description="These settings affect the companion app, not the YouTube broadcast."
            >
              <div className="space-y-2">
                <label className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-border bg-background/35 px-4 py-3">
                  <span className="flex min-w-0 items-start gap-3">
                    <EyeOff className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold">Spoiler-free mode</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        Hide winner and ranking previews until you deliberately reveal them. This setting syncs with your Solaris account when you’re signed in.
                      </span>
                    </span>
                  </span>
                  <Switch
                    checked={preferences.spoilerFree}
                    onCheckedChange={(checked) => update({ spoilerFree: checked })}
                    aria-label="Hide result spoilers"
                  />
                </label>

                {wakeLockSupported ? (
                  <label className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-border bg-background/35 px-4 py-3">
                    <span className="flex min-w-0 items-start gap-3">
                      <Sun className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-semibold">Keep screen awake</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {activeCompanionPhase(companion.phase)
                            ? wakeActive
                              ? "Screen wake lock is active while Show Mode stays visible."
                              : "Solaris will request a screen wake lock while this live phase is visible."
                            : "The wake lock activates only during live, voting or results phases."}
                        </span>
                      </span>
                    </span>
                    <Switch
                      checked={preferences.keepScreenAwake}
                      onCheckedChange={(checked) => update({ keepScreenAwake: checked })}
                      aria-label="Keep screen awake during live Show Mode"
                    />
                  </label>
                ) : null}
              </div>
            </Panel>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                to="/participate"
                className="rounded-2xl border border-border bg-surface p-4"
              >
                <RadioTower className="size-5 text-primary" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">Participation status</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  See delegation tasks and official voting windows.
                </p>
              </Link>
              <Link
                to="/televoting"
                className="rounded-2xl border border-border bg-surface p-4"
              >
                <ListOrdered className="size-5 text-primary" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">Public televoting</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Open the voting booth when the linked round is available.
                </p>
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
