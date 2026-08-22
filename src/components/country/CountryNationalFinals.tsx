import { Link } from "@tanstack/react-router";
import { ChevronDown, Crown, Music2 } from "lucide-react";

import { Panel } from "@/components/AppShell";
import { useCountryNationalFinals } from "@/lib/national-finals";
import type { Country } from "@/lib/data";

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

function humanPosition(value: number | null, fallback: number) {
  return value != null && Number.isFinite(value) && value >= 1 ? value : fallback;
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
      description="Open a selection to see its published running order and, once released, its results."
    >
      <div className="space-y-2">
        {finals.map((nationalFinal) => {
          const runningOrder = [...nationalFinal.entries].sort(
            (a, b) => humanPosition(a.position, 999) - humanPosition(b.position, 999),
          );
          const resultRows = [...nationalFinal.entries].sort((a, b) => {
            const aResult = a.result_position != null && a.result_position >= 1 ? a.result_position : null;
            const bResult = b.result_position != null && b.result_position >= 1 ? b.result_position : null;
            if (aResult != null || bResult != null) {
              return (aResult ?? 999) - (bResult ?? 999);
            }
            if (a.winner !== b.winner) return a.winner ? -1 : 1;
            return humanPosition(a.position, 999) - humanPosition(b.position, 999);
          });
          const lineupDate = formatDate(nationalFinal.nf_date);
          const resultDate = formatDate(nationalFinal.result_date);

          return (
            <details
              key={nationalFinal.id}
              className="group w-full overflow-hidden rounded-2xl border border-border/70 bg-surface/55"
            >
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">
                      {nationalFinal.edition_number ? `SSC ${nationalFinal.edition_number}` : "National selection"}
                    </p>
                    {nationalFinal.results_published ? (
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary">
                        Results published
                      </span>
                    ) : (
                      <span className="rounded-full border border-border bg-background/35 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
                        Line-up published
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 truncate font-display text-base font-semibold sm:text-lg">
                    {nationalFinal.name}
                  </h3>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {runningOrder.length} entr{runningOrder.length === 1 ? "y" : "ies"}
                    {lineupDate ? ` · ${lineupDate}` : ""}
                  </p>
                </div>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>

              <div className="border-t border-border/55 px-4 pb-4 pt-4">
                <section>
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-primary">Running order</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">The songs released for this national final.</p>
                    </div>
                    {lineupDate && <span className="text-[10px] text-muted-foreground">{lineupDate}</span>}
                  </div>
                  <div className="divide-y divide-border/45 rounded-xl border border-border/55 bg-background/15 px-3">
                    {runningOrder.map((entry, index) => (
                      <div key={entry.id} className="flex min-w-0 items-center gap-3 py-2.5">
                        <span className="numeric w-7 shrink-0 text-center text-xs text-muted-foreground">
                          {humanPosition(entry.position, index + 1)}
                        </span>
                        <Music2 className="size-3.5 shrink-0 text-muted-foreground" />
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {[entry.artist, entry.song_title].filter(Boolean).join(" — ") || "Entry"}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="mt-5 border-t border-border/55 pt-4">
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-primary">Results</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {nationalFinal.results_published
                          ? "The published outcome of the selection."
                          : "Results have not been published yet."}
                      </p>
                    </div>
                    {resultDate && <span className="text-[10px] text-muted-foreground">{resultDate}</span>}
                  </div>

                  {nationalFinal.results_published ? (
                    <div className="divide-y divide-border/45 rounded-xl border border-border/55 bg-background/15 px-3">
                      {resultRows.map((entry, index) => (
                        <div key={entry.id} className="flex min-w-0 items-center gap-3 py-2.5">
                          <span className="numeric w-7 shrink-0 text-center text-xs text-muted-foreground">
                            {humanPosition(entry.result_position, entry.winner ? 1 : index + 1)}
                          </span>
                          {entry.winner ? (
                            <Crown className="size-3.5 shrink-0 text-primary" />
                          ) : (
                            <Music2 className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                            {[entry.artist, entry.song_title].filter(Boolean).join(" — ") || "Entry"}
                          </p>
                          {(entry.winner || entry.next_in_line) && (
                            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                              {entry.winner && (
                                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-primary">
                                  Winner
                                </span>
                              )}
                              {entry.next_in_line && (
                                <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-sky-200">
                                  Next in Line
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/10 px-3 py-4 text-xs text-muted-foreground">
                      The line-up can stay public while the result remains hidden until its separate release.
                    </div>
                  )}
                </section>

                {nationalFinal.edition_slug && (
                  <Link
                    to="/editions/$slug"
                    params={{ slug: nationalFinal.edition_slug }}
                    className="mt-4 inline-flex text-xs font-semibold text-primary"
                  >
                    Open edition →
                  </Link>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </Panel>
  );
}
