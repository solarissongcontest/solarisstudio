import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { useAllResults, useCountries } from "@/lib/data";

export const Route = createFileRoute("/countries/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris countries — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "Every Terra Solaris nation competing in the Solaris Song Contest, with participations, wins and points on record.",
      },
      { property: "og:title", content: "Terra Solaris countries — Solaris Scoreboard Studio" },
      { property: "og:description", content: "All Terra Solaris delegations and their SSC records." },
    ],
  }),
  component: CountriesPage,
});

function CountriesPage() {
  const { data: countries } = useCountries();
  const { data: results } = useAllResults();

  const regions = [...new Set((countries ?? []).map((c) => c.region))].sort();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Delegations"
        title="Terra Solaris countries"
        description="Profiles, historical results and voting relationships for every participating nation."
      />
      <div className="space-y-8">
        {regions.map((region) => (
          <section key={region}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{region}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {(countries ?? [])
                .filter((c) => c.region === region)
                .map((c) => {
                  const mine = (results ?? []).filter((r) => r.country_id === c.id);
                  const wins = mine.filter((r) => r.final_rank === 1).length;
                  const best = mine.length
                    ? Math.min(...mine.map((r) => r.final_rank ?? 99))
                    : null;
                  return (
                    <Link
                      key={c.id}
                      to="/countries/$code"
                      params={{ code: c.short_code }}
                      className="glass flex gap-4 p-4 transition-transform hover:-translate-y-0.5"
                    >
                      <FlagChip code={c.short_code} color={c.accent_color} size="lg" />
                      <div className="min-w-0">
                        <h3 className="font-display font-semibold">{c.name}</h3>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                        <p className="numeric mt-2 text-xs text-muted-foreground">
                          {mine.length} entries · {wins} win{wins === 1 ? "" : "s"} · best #{best ?? "—"}
                        </p>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
