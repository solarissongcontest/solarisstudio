import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { Panel } from "@/components/AppShell";
import { CountryCustomSections } from "@/components/country/CountryCustomSections";
import { CountryNationalFinals } from "@/components/country/CountryNationalFinals";
import { useCountryWorldProfile } from "@/lib/country-account";
import type {
  CountryContestSnapshot,
  CountryFormSnapshot,
} from "@/lib/country-wiki";
import {
  editionLabel,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useEditions,
  type Country,
  type Participant,
  type Show,
} from "@/lib/data";
import { buildPublicCountryArchive } from "@/lib/public-country-archive";

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0 rounded-xl bg-surface px-3 py-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

type Qualification = "aq" | true | false | null;

export function CountryWorldOverview({
  country,
  stats,
  form: _form,
}: {
  country: Country;
  stats?: CountryContestSnapshot | null;
  form?: CountryFormSnapshot | null;
}) {
  void _form;
  const { data } = useCountryWorldProfile(country.id);
  const { data: rawParticipants } = useAllParticipants();
  const { data: rawResults } = useAllResults();
  const { data: editions } = useEditions();
  const { data: rawShows } = useAllShows();

  // The parent country route owns the complete live archive subscriptions.
  // These ordinary query observers share the same React Query cache keys, so
  // the overview can reuse that data without mounting a second set of realtime
  // channels. Re-apply the public gate here because this component must remain
  // safe even if it is ever rendered outside the country route.
  const archive = useMemo(
    () => buildPublicCountryArchive({
      editions: editions ?? [],
      shows: rawShows ?? [],
      participants: rawParticipants ?? [],
      results: rawResults ?? [],
      jury: [],
      televote: [],
    }),
    [editions, rawShows, rawParticipants, rawResults],
  );

  const editionMap = new Map(archive.editions.map((edition) => [edition.id, edition]));
  const showMap = new Map(archive.shows.map((show) => [show.id, show]));
  const myParticipants = archive.participants.filter((participant) => participant.country_id === country.id);

  const entryByEdition = new Map<string, Participant>();
  myParticipants.forEach((participant) => {
    const existing = entryByEdition.get(participant.edition_id);
    if (!existing || entryQuality(participant, showMap) > entryQuality(existing, showMap)) {
      entryByEdition.set(participant.edition_id, participant);
    }
  });

  const semiEditionIds = new Set(
    archive.shows
      .filter((show) => show.kind === "semi-final" || show.kind === "semi")
      .map((show) => show.edition_id),
  );
  const semiPresence = new Set(
    myParticipants
      .filter((participant) => {
        const kind = showMap.get(participant.show_id ?? "")?.kind;
        return kind === "semi-final" || kind === "semi";
      })
      .map((participant) => participant.edition_id),
  );
  const finalPresence = new Set(
    myParticipants
      .filter((participant) => {
        const kind = showMap.get(participant.show_id ?? "")?.kind;
        return kind === "grand-final" || kind === "final";
      })
      .map((participant) => participant.edition_id),
  );

  const qualificationForEdition = (editionId: string): Qualification => {
    if (finalPresence.has(editionId) && semiEditionIds.has(editionId) && !semiPresence.has(editionId)) {
      return "aq";
    }
    const semiRows = myParticipants.filter((participant) => {
      if (participant.edition_id !== editionId) return false;
      const kind = showMap.get(participant.show_id ?? "")?.kind;
      return kind === "semi-final" || kind === "semi";
    });
    if (semiRows.some((participant) => participant.qualified === true)) return true;
    if (semiRows.some((participant) => participant.qualified === false)) return false;
    return null;
  };

  const entryRows = [...entryByEdition.values()].sort(
    (a, b) =>
      (editionMap.get(b.edition_id)?.edition_number ?? -1) -
      (editionMap.get(a.edition_id)?.edition_number ?? -1),
  );

  const allTimeScore = archive.results
    .filter((result) => {
      if (result.country_id !== country.id) return false;
      const kind = showMap.get(result.show_id ?? "")?.kind;
      return kind === "grand-final" || kind === "final";
    })
    .reduce((total, result) => total + result.total_points, 0);
  const allTimePosition = stats?.avgCombinedPlacement ?? null;

  const profile = data?.profile;
  const hasWorldContent = Boolean(
    data?.schemaReady &&
      (profile?.summary ||
        profile?.capital ||
        profile?.government_type ||
        profile?.leader_name ||
        profile?.motto ||
        data.sections.length),
  );

  const entryPanel = (
    <Panel
      title="Entries"
      description="Each edition has one entry. The semi-final and final use that same entry."
      actions={
        <Link
          to="/countries/$code"
          params={{ code: country.short_code }}
          className="text-xs font-semibold text-primary"
          onClick={(event) => {
            event.preventDefault();
            document.querySelector('[aria-label="Country section"]')?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
        >
          Full history below ↓
        </Link>
      }
    >
      {entryRows.length ? (
        <div className="divide-y divide-border/60">
          {entryRows.slice(0, 6).map((participant) => {
            const edition = editionMap.get(participant.edition_id);
            const show = showMap.get(participant.show_id ?? "");
            const entry = [participant.artist, participant.song].filter(Boolean).join(" · ");
            const qualification = qualificationForEdition(participant.edition_id);

            return (
              <div
                key={participant.edition_id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {entry || "Entry details not available yet"}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {edition ? editionLabel(edition) : "Edition"}
                    {show?.name ? ` · latest stored appearance: ${show.name}` : ""}
                  </p>
                </div>
                {qualification != null && (
                  <span
                    className={
                      qualification === "aq" || qualification === true
                        ? "rounded-full bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase text-primary"
                        : "rounded-full bg-surface px-2 py-1 text-[9px] font-semibold uppercase text-muted-foreground"
                    }
                  >
                    {qualification === "aq" ? "AQ" : qualification ? "Q" : "NQ"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No entry details are available for {country.name} yet.
        </p>
      )}
      <p className="mt-4 border-t border-border/60 pt-3 text-[10px] leading-relaxed text-muted-foreground">
        Historical information reflects the editions currently available in Solaris Studio. Missing editions are not counted as zeroes.
      </p>
    </Panel>
  );

  const allTimePanel = stats ? (
    <Panel
      title="All-time record"
      description="Only published contest results are counted. All-time position uses the combined edition ranking where finalists keep their final place and NQs follow them by semi-final performance."
    >
      <div className="grid grid-cols-2 gap-2">
        <Fact label="All-time score" value={allTimeScore} />
        <Fact label="All-time position" value={allTimePosition != null ? allTimePosition.toFixed(1) : "—"} />
      </div>
    </Panel>
  ) : null;

  if (!hasWorldContent || !data?.schemaReady) {
    return (
      <div className="space-y-5">
        {entryPanel}
        {allTimePanel}
        <CountryNationalFinals country={country} />
      </div>
    );
  }

  const facts = [
    ["Capital", profile?.capital],
    ["Government", profile?.government_type],
    ["Leader", [profile?.leader_title, profile?.leader_name].filter(Boolean).join(" ") || null],
    ["Demonym", profile?.demonym],
    ["Languages", profile?.official_languages],
    ["Currency", profile?.currency],
  ] as const;

  return (
    <div className="space-y-5">
      {entryPanel}
      {allTimePanel}
      <CountryNationalFinals country={country} />

      <Panel
        title={`Inside ${country.name}`}
        description="Terra Solaris national profile"
        actions={
          <Link
            to="/wiki/$code"
            params={{ code: country.short_code }}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold"
          >
            Open Wiki →
          </Link>
        }
      >
        {profile?.motto && (
          <p className="mb-4 rounded-xl bg-surface px-4 py-3 font-display text-sm italic leading-relaxed sm:text-base">
            “{profile.motto}”
          </p>
        )}

        {(profile?.summary || country.description) && (
          <p className="max-w-4xl whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
            {profile?.summary || country.description}
          </p>
        )}

        {facts.some(([, value]) => Boolean(value)) && (
          <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <Fact key={label} label={label} value={value} />
            ))}
          </div>
        )}
      </Panel>

      <CountryCustomSections
        country={country}
        profile={profile}
        sections={data.sections}
        media={data.media}
        surface="country"
      />
    </div>
  );
}

function entryQuality(participant: Participant, showMap: Map<string, Show>) {
  const show = showMap.get(participant.show_id ?? "");
  return (
    (participant.artist ? 2 : 0) +
    (participant.song ? 2 : 0) +
    (show?.kind === "grand-final" || show?.kind === "final" ? 1 : 0)
  );
}
