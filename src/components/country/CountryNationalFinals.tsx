import { Link } from "@tanstack/react-router";
import { Crown, Music2 } from "lucide-react";

import { Panel } from "@/components/AppShell";
import { useCountryNationalFinals } from "@/lib/national-finals";
import type { Country } from "@/lib/data";

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

export function CountryNationalFinals({ country }: { country: Country }) {
  const { data: finals, isLoading } = useCountryNationalFinals(country.id);

  if (isLoading) {
    return (
      <Panel title="National finals" description="Selection history and competing songs">
        <p className="text-sm text-muted-foreground">Loading national-final history…</p>
      </Panel>
    );
  }

  if (!finals?.length) return null;

  return (
    <Panel
      title="National finals"
      description="Songs that competed to represent this country, including older selections stored in Solaris."
    >
      <div className="space-y-4">
        {finals.map((nationalFinal) => {
          const winner = nationalFinal.entries.find((entry) => entry.winner);
          const date = formatDate(nationalFinal.result_date ?? nationalFinal.nf_date);

          return (
            <article
              key={nationalFinal.id}
              className="overflow-hidden rounded-2xl border border-border/70 bg-surface/65"
            >
              <div className="flex flex-col gap-3 border-b border-border/55 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">
                    {nationalFinal.edition_number ? `SSC ${nationalFinal.edition_number}` : "National selection"}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-semibold">{nationalFinal.name}</h3>
                  {date && <p className="mt-1 text-xs text-muted-foreground">{date}</p>}
                </div>

                {nationalFinal.edition_slug && (
                  <Link
                    to="/editions/$slug"
                    params={{ slug: nationalFinal.edition_slug }}
                    className="shrink-0 text-xs font-semibold text-primary"
                  >
                    Open edition →
                  </Link>
                )}
              </div>

              {winner && (
                <div className="flex items-start gap-3 border-b border-border/55 bg-primary/[0.055] p-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Crown className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-primary">Winner</p>
                    <p className="mt-1 truncate text-sm font-semibold">
                      {[winner.artist, winner.song_title].filter(Boolean).join(" — ") || "Winner stored"}
                    </p>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border/50 px-4">
                {nationalFinal.entries.map((entry) => (
                  <div key={entry.id} className="flex min-w-0 items-center gap-3 py-3">
                    <span className="numeric w-7 shrink-0 text-center text-xs text-muted-foreground">
                      {entry.position ?? "·"}
                    </span>
                    <Music2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {[entry.artist, entry.song_title].filter(Boolean).join(" — ") || "Entry"}
                      </p>
                    </div>
                    {entry.winner && (
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-primary">
                        Winner
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
