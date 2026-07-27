import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { useCountries, useEditions } from "@/lib/data";

export const Route = createFileRoute("/editions/")({
  head: () => ({
    meta: [
      { title: "SSC Editions — Solaris Scoreboard Studio" },
      {
        name: "description",
        content: "Browse every Solaris Song Contest edition, its host nation, status and final scoreboard.",
      },
      { property: "og:title", content: "SSC Editions — Solaris Scoreboard Studio" },
      { property: "og:description", content: "Every Solaris Song Contest edition and its final scoreboard." },
    ],
  }),
  component: EditionsPage,
});

function EditionsPage() {
  const { data: editions } = useEditions();
  const { data: countries } = useCountries();
  const cMap = new Map((countries ?? []).map((c) => [c.id, c]));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Archive"
        title="Contest editions"
        description="Each edition holds its own delegations, running order, jury votes, televote and final scoreboard."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(editions ?? []).map((e) => {
          const host = e.host_country_id ? cMap.get(e.host_country_id) : undefined;
          return (
            <Panel key={e.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-primary">{e.year}</p>
                  <h2 className="font-display text-xl font-semibold">{e.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {host ? `Hosted by ${host.name}` : "Host TBA"}
                    {e.host_city ? ` · ${e.host_city}` : ""}
                  </p>
                </div>
                {host && <FlagChip code={host.short_code} color={host.accent_color} image={host.flag_image} size="lg" />}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {e.status}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  jury {e.jury_weight}% / tele {100 - e.jury_weight}%
                </span>
              </div>
              <div className="mt-auto flex gap-2">
                <Link
                  to="/editions/$slug"
                  params={{ slug: e.slug }}
                  className="bg-aurora flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold text-primary-foreground"
                >
                  Scoreboard
                </Link>
                <Link
                  to="/broadcast/$slug"
                  params={{ slug: e.slug }}
                  className="glass flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold"
                >
                  Broadcast
                </Link>
              </div>
            </Panel>
          );
        })}
      </div>
    </AppShell>
  );
}
