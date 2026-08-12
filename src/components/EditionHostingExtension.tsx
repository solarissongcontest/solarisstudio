import { FlagChip } from "@/components/FlagChip";
import { Panel } from "@/components/AppShell";
import { useCountries, useEdition, useShows, type Show } from "@/lib/data";
import { isShowPublic } from "@/lib/publication";

type HostedShow = Show & {
  host_country_id?: string | null;
  host_city?: string | null;
};

export function EditionHostingExtension({ pathname }: { pathname: string }) {
  const match = pathname.match(/^\/editions\/([^/]+)\/?$/i);
  const slug = match?.[1] ? decodeURIComponent(match[1]) : null;
  const { data: edition } = useEdition(slug ?? undefined);
  const { data: shows } = useShows(edition?.id);
  const { data: countries } = useCountries();

  if (!edition || !slug) return null;

  const publicShows = ((shows ?? []) as HostedShow[])
    .filter((show) => isShowPublic(show))
    .sort((a, b) => a.sort_order - b.sort_order);

  const groups = new Map<
    string,
    {
      countryId: string | null;
      city: string | null;
      shows: HostedShow[];
    }
  >();

  for (const show of publicShows) {
    const countryId = show.host_country_id ?? edition.host_country_id ?? null;
    const city = show.host_city ?? edition.host_city ?? null;
    if (!countryId && !city) continue;

    const key = `${countryId ?? "none"}:${city ?? "none"}`;
    const current = groups.get(key) ?? { countryId, city, shows: [] };
    current.shows.push(show);
    groups.set(key, current);
  }

  const hosts = [...groups.values()];
  if (hosts.length <= 1) return null;

  const countryMap = new Map((countries ?? []).map((country) => [country.id, country]));

  return (
    <div className="mt-5 sm:mt-7">
      <Panel
        title="Split hosting"
        description="This edition was hosted across more than one Solaris location."
        variant="glass"
      >
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {hosts.map((host, index) => {
            const country = host.countryId ? countryMap.get(host.countryId) : null;
            return (
              <div key={`${host.countryId ?? "none"}-${host.city ?? "none"}`} className="min-w-0 rounded-xl border border-border/70 bg-surface p-4">
                <div className="flex min-w-0 items-center gap-3">
                  {country && (
                    <FlagChip
                      code={country.short_code}
                      color={country.accent_color}
                      image={country.flag_image}
                      size="md"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary">
                      Host {index + 1}
                    </p>
                    <p className="mt-1 break-words font-display text-lg font-semibold">
                      {[host.city, country?.name].filter(Boolean).join(", ") || "Host location"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {host.shows.map((show) => (
                    <span key={show.id} className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                      {show.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
