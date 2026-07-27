import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { countryProfile, topRecipients, topSupporters } from "@/lib/analysis";
import { useAllJuryVotes, useAllResults, useCountries, useEditions } from "@/lib/data";

export const Route = createFileRoute("/countries/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.code} country profile — Solaris Scoreboard Studio` },
      {
        name: "description",
        content:
          "Participations, wins, points received and given, biggest supporters and rivals for this Terra Solaris nation.",
      },
      { property: "og:title", content: "Terra Solaris country profile — Solaris Scoreboard Studio" },
      {
        property: "og:description",
        content: "Full SSC history and voting relationships for this Terra Solaris nation.",
      },
    ],
  }),
  component: CountryProfilePage,
});

function CountryProfilePage() {
  const { code } = Route.useParams();
  const { data: countries } = useCountries();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const { data: editions } = useEditions();

  const country = (countries ?? []).find((c) => c.short_code === code);
  const cMap = new Map((countries ?? []).map((c) => [c.id, c]));
  const editionYear = new Map((editions ?? []).map((e) => [e.id, e.year]));

  if (!country) {
    return (
      <AppShell>
        <PageHeader title="Country not found" />
        <Link to="/countries" className="text-primary hover:underline">
          ← All countries
        </Link>
      </AppShell>
    );
  }

  const profile = countryProfile(country.id, results ?? [], jury ?? [], editionYear);
  const supporters = topSupporters(jury ?? [], country.id);
  const recipients = topRecipients(jury ?? [], country.id);
  const rivals = [...(countries ?? [])]
    .filter((c) => c.id !== country.id)
    .map((c) => ({
      c,
      given: (jury ?? [])
        .filter((v) => v.voter_country_id === country.id && v.receiving_country_id === c.id)
        .reduce((a, v) => a + v.points, 0),
    }))
    .sort((a, b) => a.given - b.given)
    .slice(0, 3);

  const juryDetail = (jury ?? [])
    .filter((v) => v.receiving_country_id === country.id)
    .sort((a, b) => b.points - a.points);

  return (
    <AppShell>
      <PageHeader
        eyebrow={country.region}
        title={country.name}
        description={country.description ?? undefined}
        actions={<FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="xl" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Participations" value={profile.participations} />
        <StatTile label="Wins" value={profile.wins} />
        <StatTile label="Best result" value={profile.best ? `#${profile.best}` : "—"} />
        <StatTile
          label="Average placement"
          value={profile.average ? profile.average.toFixed(1) : "—"}
        />
        <StatTile label="Points received" value={profile.pointsReceived} />
        <StatTile label="Points given" value={profile.pointsGiven} />
        <StatTile label="12 points received" value={profile.twelvesReceived} />
        <StatTile label="12 points given" value={profile.twelvesGiven} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Historical results" description="Final placement across editions">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profile.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis reversed allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                  }}
                />
                <Line type="monotone" dataKey="rank" stroke="var(--jury)" strokeWidth={3} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={`How countries voted for ${country.name}`} description="Jury points received, all editions">
          <ul className="space-y-2">
            {juryDetail.slice(0, 12).map((v, i) => {
              const from = cMap.get(v.voter_country_id);
              if (!from) return null;
              return (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                  <FlagChip code={from.short_code} color={from.accent_color} image={from.flag_image} size="sm" />
                  <span className="flex-1 text-sm">{from.name}</span>
                  <span className="numeric text-sm font-semibold">{v.points}</span>
                </li>
              );
            })}
            {!juryDetail.length && <p className="text-sm text-muted-foreground">No votes recorded yet.</p>}
          </ul>
        </Panel>

        <Panel title="Biggest supporters" description="Countries that gave the most points">
          <RelationList rows={supporters} cMap={cMap} />
        </Panel>

        <Panel title={`How ${country.name} voted`} description="Points given to other nations">
          <RelationList rows={recipients} cMap={cMap} />
        </Panel>

        <Panel title="Biggest rivals" description="Nations this country consistently overlooks">
          <ul className="space-y-2">
            {rivals.map(({ c, given }) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                <span className="flex-1 text-sm">{c.name}</span>
                <span className="numeric text-sm text-muted-foreground">{given} pts given</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}

function RelationList({
  rows,
  cMap,
}: {
  rows: [string, number][];
  cMap: Map<
    string,
    { short_code: string; name: string; accent_color: string; flag_image?: string | null }
  >;

}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const max = rows[0][1] || 1;
  return (
    <ul className="space-y-2">
      {rows.map(([id, pts]) => {
        const c = cMap.get(id);
        if (!c) return null;
        return (
          <li key={id} className="relative overflow-hidden rounded-xl bg-surface px-3 py-2">
            <span
              className="absolute inset-y-0 left-0 opacity-25"
              style={{ width: `${(pts / max) * 100}%`, background: c.accent_color }}
            />
            <span className="relative flex items-center gap-3">
              <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
              <span className="flex-1 text-sm">{c.name}</span>
              <span className="numeric text-sm font-semibold">{pts}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
