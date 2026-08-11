import { useMemo } from "react";

import { useCountryWorldProfile } from "@/lib/country-account";
import { useCountries } from "@/lib/data";

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="min-w-0 rounded-xl bg-surface p-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

export function CountryProfileExtension({ pathname }: { pathname: string }) {
  const code = useMemo(() => {
    const match = pathname.match(/^\/countries\/([^/]+)\/?$/i);
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  const { data: countries } = useCountries();
  const country = code
    ? (countries ?? []).find((item) => item.short_code.toUpperCase() === code.toUpperCase())
    : undefined;
  const { data } = useCountryWorldProfile(country?.id);

  if (!country || !data?.schemaReady) return null;

  const profile = data.profile;
  const facts = profile
    ? [
        ["Capital", profile.capital],
        ["Government", profile.government_type],
        ["Leader", [profile.leader_title, profile.leader_name].filter(Boolean).join(" ") || null],
        ["Demonym", profile.demonym],
        ["Languages", profile.official_languages],
        ["Currency", profile.currency],
        ["Population", profile.population],
        ["Established", profile.established],
      ]
    : [];

  const hasContent = Boolean(
    profile?.summary ||
      profile?.motto ||
      facts.some(([, value]) => Boolean(value)) ||
      data.sections.length ||
      data.media.length,
  );

  if (!hasContent) return null;

  return (
    <div className="mt-5 space-y-5" aria-label={`${country.name} Terra Solaris profile`}>
      <section className="glass min-w-0 p-4 sm:p-5">
        <div className="mb-4 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            Terra Solaris
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold sm:text-2xl">
            Country profile
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Worldbuilding information maintained by {country.name}.
          </p>
        </div>

        {profile?.motto && (
          <p className="mb-4 rounded-xl bg-surface px-4 py-3 text-sm italic leading-relaxed">
            “{profile.motto}”
          </p>
        )}

        {profile?.summary && (
          <p className="mb-4 max-w-4xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {profile.summary}
          </p>
        )}

        {facts.some(([, value]) => Boolean(value)) && (
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {facts.map(([label, value]) => (
              <Fact key={label} label={label} value={value} />
            ))}
          </div>
        )}
      </section>

      {data.sections.map((section) => (
        <section key={section.id} className="glass min-w-0 overflow-hidden p-4 sm:p-5">
          <div className={section.image_url ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" : ""}>
            <div className="min-w-0">
              <h2 className="break-words font-display text-lg font-semibold sm:text-xl">
                {section.heading}
              </h2>
              {section.body && (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                  {section.body}
                </p>
              )}
            </div>

            {section.image_url && (
              <figure className="min-w-0">
                <img
                  src={section.image_url}
                  alt={section.image_caption || `${country.name} image`}
                  loading="lazy"
                  className="max-h-80 w-full rounded-xl object-cover"
                />
                {section.image_caption && (
                  <figcaption className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {section.image_caption}
                  </figcaption>
                )}
              </figure>
            )}
          </div>
        </section>
      ))}

      {data.media.length > 0 && (
        <section className="glass min-w-0 p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="font-display text-lg font-semibold">Gallery</h2>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.media.map((media) => (
              <figure key={media.id} className="min-w-0 overflow-hidden rounded-xl bg-surface">
                <img
                  src={media.public_url}
                  alt={media.alt_text || media.caption || `${country.name} gallery image`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                {media.caption && (
                  <figcaption className="p-3 text-xs leading-relaxed text-muted-foreground">
                    {media.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
