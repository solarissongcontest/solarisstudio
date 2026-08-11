import { Link } from "@tanstack/react-router";

import { Panel } from "@/components/AppShell";
import { useCountryWorldProfile } from "@/lib/country-account";
import {
  buildCountryCharacter,
  type CountryContestSnapshot,
  type CountryFormSnapshot,
} from "@/lib/country-wiki";
import type { Country } from "@/lib/data";

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
  if (!data?.schemaReady) return null;

  const profile = data.profile;
  const hasWorldContent = Boolean(
    profile?.summary ||
      profile?.capital ||
      profile?.government_type ||
      profile?.leader_name ||
      profile?.motto ||
      data.sections.length ||
      data.media.length,
  );

  if (!hasWorldContent) return null;

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
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
      <Panel
        title={`Inside ${country.name}`}
        description="Terra Solaris profile and owner-maintained worldbuilding"
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

        {data.sections.length > 0 && (
          <div className="mt-5 border-t border-border/60 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
              From the country article
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {data.sections.slice(0, 2).map((section) => (
                <div key={section.id} className="min-w-0 overflow-hidden rounded-xl bg-surface">
                  {section.image_url && (
                    <img
                      src={section.image_url}
                      alt={section.image_caption || `${country.name} article image`}
                      loading="lazy"
                      className="aspect-[16/8] w-full object-cover"
                    />
                  )}
                  <div className="p-3">
                    <p className="break-words text-sm font-semibold">{section.heading}</p>
                    {section.body && (
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {section.body}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <div className="min-w-0 space-y-5">
        <Panel title="Country character" description="Automatically derived from submitted information and SSC history">
          <p className="font-display text-lg font-semibold">{character.title}</p>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">{character.summary}</p>
          {character.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {character.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold">
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
  );
}
