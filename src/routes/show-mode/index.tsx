import { createFileRoute, Link } from "@tanstack/react-router";
import { EyeOff, RadioTower, Tv2, Vote } from "lucide-react";
import { useMemo } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { Switch } from "@/components/ui/switch";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import { isShowPublic } from "@/lib/publication";

export const Route = createFileRoute("/show-mode/")({
  head: () => ({
    meta: [
      { title: "Show Mode — Solaris Studio" },
      {
        name: "description",
        content:
          "A calm, spoiler-aware Solaris Studio view for following the current edition and live show actions.",
      },
    ],
  }),
  component: ShowModePage,
});

function ShowModePage() {
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const { preferences, update } = useAppExperiencePreferences();

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

  return (
    <AppShell>
      <PageHeader
        eyebrow="Installed app"
        title="Show Mode"
        description="Follow the current edition without making results the centre of the screen. Voting and the broadcast stay one tap away."
      />

      <div className="space-y-4" data-solaris-show-mode>
        <Panel
          title="Spoiler-free experience"
          description="Hide winner and ranking previews on the installed app Results hub. You can still open official results deliberately."
        >
          <label className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-border bg-background/35 px-4 py-3">
            <span className="flex min-w-0 items-start gap-3">
              <EyeOff className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold">Hide result spoilers</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  This setting is cached on this device and syncs to your Solaris account when you’re signed in.
                </span>
              </span>
            </span>
            <Switch
              checked={preferences.spoilerFree}
              onCheckedChange={(checked) => update({ spoilerFree: checked })}
              aria-label="Hide result spoilers"
            />
          </label>
        </Panel>

        <Panel
          title={latestEdition ? editionLabel(latestEdition) : "Current edition"}
          description="Public shows for the newest edition"
        >
          {editionsQuery.isLoading || showsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading show information…</p>
          ) : shows.length ? (
            <div className="space-y-2">
              {shows.map((show) => (
                <div
                  key={show.id}
                  className="grid gap-3 rounded-xl border border-border bg-background/35 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{show.name}</p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {show.kind.replaceAll("-", " ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/broadcast/$showId"
                      params={{ showId: show.id }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
                    >
                      <Tv2 className="size-4" aria-hidden="true" />
                      Watch
                    </Link>
                    <Link
                      to="/shows/$showId"
                      params={{ showId: show.id }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold"
                    >
                      Show page
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No public show is available for the newest edition yet.
            </p>
          )}
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/participate"
            className="rounded-2xl border border-border bg-surface p-4"
          >
            <RadioTower className="size-5 text-primary" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold">Participation status</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              See your current tasks and official voting windows.
            </p>
          </Link>
          <Link
            to="/televoting"
            className="rounded-2xl border border-border bg-surface p-4"
          >
            <Vote className="size-5 text-primary" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold">Public televoting</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Open the public voting booth when a round is available.
            </p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
