import { Link } from "@tanstack/react-router";

import { Panel } from "@/components/AppShell";
import { CountryCustomSections } from "@/components/country/CountryCustomSections";
import { CountryNationalFinals } from "@/components/country/CountryNationalFinals";
import { useCountryWorldProfile } from "@/lib/country-account";
import type { Country } from "@/lib/data";
import type { CountrySectionLayoutVariant } from "@/lib/country-page-builder";

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0 border-block-end border-border/60 py-2 last:border-block-end-0">
      <dt className="text-[11px] font-bold uppercase tracking-[0.11em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
    </div>
  );
}

/**
 * The primary Country overview is intentionally narrow in purpose:
 * About first, then Quick Facts. Contest-specific modules are rendered by the
 * parent route afterwards so the canonical Overview order cannot drift.
 */
export function CountryWorldOverview({ country }: { country: Country }) {
  const { data } = useCountryWorldProfile(country.id);
  const profile = data?.profile;
  const summary = profile?.summary || country.description;
  const facts = [
    ["Capital", profile?.capital],
    ["Government", profile?.government_type],
    ["Leader", [profile?.leader_title, profile?.leader_name].filter(Boolean).join(" ") || null],
    ["Demonym", profile?.demonym],
    ["Languages", profile?.official_languages],
    ["Currency", profile?.currency],
  ] as const;
  const hasFacts = facts.some(([, value]) => Boolean(value));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
      <Panel
        title="About"
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
          <p className="mb-4 border-inline-start-2 border-primary ps-4 font-display text-sm italic leading-relaxed sm:text-base">
            “{profile.motto}”
          </p>
        )}
        {summary ? (
          <p className="max-w-[66ch] whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
            {summary}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            No national profile description is available for {country.name} yet.
          </p>
        )}
      </Panel>

      <Panel title="Quick Facts" description="National profile facts">
        {hasFacts ? (
          <dl className="divide-y divide-border/60">
            {facts.map(([label, value]) => <Fact key={label} label={label} value={value} />)}
          </dl>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            No national profile facts are available yet.
          </p>
        )}
      </Panel>
    </div>
  );
}

/**
 * Supporting world-profile content deliberately follows the canonical SSC
 * Overview sequence instead of competing with About/Quick Facts above it.
 */
export function CountryWorldSupplement({
  country,
  defaultLayout,
}: {
  country: Country;
  defaultLayout?: CountrySectionLayoutVariant;
}) {
  const { data } = useCountryWorldProfile(country.id);

  return (
    <div className="space-y-5">
      <CountryNationalFinals country={country} />
      {data?.schemaReady ? (
        <CountryCustomSections
          country={country}
          profile={data.profile}
          sections={data.sections}
          media={data.media}
          surface="country"
          defaultLayout={defaultLayout}
        />
      ) : null}
    </div>
  );
}
