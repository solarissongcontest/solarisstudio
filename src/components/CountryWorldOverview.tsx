import { Link } from "@tanstack/react-router";

import { Panel } from "@/components/AppShell";
import { CountryCustomSections } from "@/components/country/CountryCustomSections";
import { useCountryWorldProfile } from "@/lib/country-account";
import {
  buildCountryCharacter,
  type CountryContestSnapshot,
  type CountryFormSnapshot,
} from "@/lib/country-wiki";
import {
  editionLabel,
  useAllParticipants,
  useAllShows,
  useEditions,
  type Country,
  type Participant,
  type Show,
} from "@/lib/data";

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0 rounded-xl bg-surface px-3 py-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

export function CountryWorldOverview({
  country,
  stats,
  form,
}: {
  country: Country;
  stats?: CountryContestSnapshot | null;
  form?: CountryFormSnapshot | null;
}) {
  const { data } = useCountryWorldProfile(country.id);
  const { data: participants } = useAllParticipants();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();

  const editionMap = new Map((editions ?? []).map((edition) => [edition.id, edition]));
  const showMap = new Map((shows ?? []).map((show) => [show.id, show]));

  const entryByEdition = new Map<string, Participant>();
  (participants ?? [])
    .filter((participant) => participant.country_id === country.id)
    .forEach((participant) => {
      const existing = entryByEdition.get(participant.edition_id);
      if (!existing || entryQuality(participant, showMap) > entryQuality(existing, showMap)) {
        entryByEdition.set(participant.edition_id, participant);
      }
    });

  const entryRows = [...entryByEdition.values()].sort(
    (a, b) =>
      (editionMap.get(b.edition_id)?.edition_number ?? -1) -
      (editionMap.get(a.edition_id)?.edition_number ?? -1),
  );

  const profile = data?.profile;
  const hasWorldContent = Boolean(
    data?.schemaReady &&
      (profile?.summary ||
        profile?.capital ||
        profile?.government_type ||
        profile?.leader_name ||
        profile?.motto ||
        data.sections.length ||
        data.media.length),
  );

  const entryPanel = (
    <Panel
      title="Entries"
      description="One archived entry per edition. Semi-final and final are appearances of that same participation."
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
                {participant.qualified != null && (
                  <span
                    className={
                      participant.qualified
                        ? "rounded-full bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase text-primary"
                        : "rounded-full bg-surface px-2 py-1 text-[9px] font-semibold uppercase text-muted-foreground"
                    }
                  >
                    {participant.qualified ? "Q" : "NQ"}
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

  if (!hasWorldContent || !data?.schemaReady) {
    return entryPanel;
  }

  const character = buildCountryCharacter({
    country,
    profile,
    stats,
    form,
    sections: data.sections,
  });

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

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
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
            <p className="max-w-3xl whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
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

        <div className="min-w-0 space-y-5">
          <Panel
            title="Country character"
            description="A quick profile based on national information and SSC history"
          >
            <p className="font-display text-lg font-semibold">{character.title}</p>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{character.summary}</p>
            {character.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {character.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Panel>

          {data.media.length > 0 && (
            <Panel title="From the gallery">
              <div className="grid grid-cols-3 gap-2">
                {data.media.slice(0, 3).map((media) => (
                  <img
                    key={media.id}
                    src={media.public_url}
                    alt={media.alt_text || media.caption || `${country.name} gallery image`}
                    loading="lazy"
                    className="aspect-square min-w-0 rounded-xl object-cover"
                  />
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

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
    (show?.kind === "grand-final" ? 1 : 0)
  );
}
