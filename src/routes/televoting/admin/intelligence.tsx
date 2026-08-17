import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Eye, Search, ShieldAlert, UserRoundCog, Users } from "lucide-react";

import { Input } from "@/components/ui/input";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { getMergedTelevotingIntelligence } from "@/integrations/televoting/intelligence.functions";
import type { IntelligenceChannel, IntelligenceLens } from "@/integrations/televoting/intelligence.server";

export const Route = createFileRoute("/televoting/admin/intelligence")({
  head: () => ({ meta: [{ title: "Voting Intelligence — Solaris Operations" }, { name: "robots", content: "noindex" }] }),
  component: IntelligencePage,
});

type Tab = "overview" | "detection" | "friend-voting";

const riskClass = (risk: number) => {
  if (risk >= 90) return "border-red-300/25 bg-red-300/10 text-red-100";
  if (risk >= 65) return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (risk >= 50) return "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";
  return "border-white/10 bg-white/[0.04] text-muted-foreground";
};

function IntelligencePage() {
  const navigate = useNavigate();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getIntelligence = useServerFn(getMergedTelevotingIntelligence);
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [minRisk, setMinRisk] = useState(30);
  const [lens, setLens] = useState<IntelligenceLens>("hod");
  const [channel, setChannel] = useState<IntelligenceChannel>("combined");
  const [hodPersonId, setHodPersonId] = useState<string | null>(null);
  const [editionId, setEditionId] = useState<string | null>(null);

  const { data: admin, isLoading: adminLoading } = useQuery({ queryKey: ["merged-televoting-admin"], queryFn: () => getAdmin() });
  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-intelligence", lens, channel, hodPersonId ?? "all-hods", editionId ?? "all-editions"],
    queryFn: () => getIntelligence({ data: { lens, channel, hodPersonId, editionId } }),
    enabled: Boolean(admin),
    refetchInterval: 30_000,
  });

  const relationships = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.relationships ?? []).filter((row) => {
      if (row.riskScore < minRisk) return false;
      if (!term) return true;
      return `${row.votingCountry} ${row.votingCountries.join(" ")} ${row.controllerName ?? ""} ${row.targetCountry}`.toLowerCase().includes(term);
    });
  }, [data?.relationships, minRisk, search]);

  if (adminLoading || isLoading) return <section className="glass p-8 text-center text-sm text-muted-foreground">Building HOD-aware jury and televote intelligence…</section>;
  if (!admin) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 py-2">
      <header className="glass-strong p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/65">Solaris · Integrity intelligence</p>
            <h1 className="font-display mt-2 text-4xl uppercase leading-none sm:text-5xl">Detection & friend voting</h1>
            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Relationship analysis now combines canonical jury history with Televoting and follows HOD tenures across editions. A country stays the official delegation identity, but one HOD never inherits another HOD’s behavioural history merely because they controlled the same flag later.
            </p>
          </div>
          <Link to="/admin/hod-history" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-violet-200/15 bg-violet-200/[0.07] px-4 py-2 text-xs font-semibold text-violet-100"><UserRoundCog className="size-3.5" /> HOD History</Link>
        </div>
      </header>

      {error ? <div className="glass border-red-300/20 p-4 text-sm text-red-100">{(error as Error).message}</div> : null}

      <section className="glass grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <Filter label="Identity lens">
          <select value={lens} onChange={(e) => setLens(e.target.value as IntelligenceLens)} className="filter-control">
            <option value="hod">HOD tenure (recommended)</option>
            <option value="country">Country history (context)</option>
          </select>
        </Filter>
        <Filter label="Evidence channel">
          <select value={channel} onChange={(e) => setChannel(e.target.value as IntelligenceChannel)} className="filter-control">
            <option value="combined">Jury + televote</option>
            <option value="televote">Televote only</option>
            <option value="jury">Jury only</option>
          </select>
        </Filter>
        <Filter label="Specific HOD">
          <select value={hodPersonId ?? ""} onChange={(e) => setHodPersonId(e.target.value || null)} className="filter-control">
            <option value="">All HODs</option>
            {(data?.filters.people ?? []).map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
        </Filter>
        <Filter label="Edition">
          <select value={editionId ?? ""} onChange={(e) => setEditionId(e.target.value || null)} className="filter-control">
            <option value="">All editions</option>
            {(data?.filters.editions ?? []).map((edition) => <option key={edition.id} value={edition.id}>{edition.editionNumber ? `SSC${edition.editionNumber}` : edition.name}</option>)}
          </select>
        </Filter>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([[
          "overview", "Overview", ShieldAlert,
        ], ["detection", "Detection", Eye], ["friend-voting", "Friend voting", Users]] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${tab === value ? "border-sky-200/20 bg-sky-200/10 text-sky-100" : "border-white/10 bg-white/[0.035] text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" /> {label}</button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {[
              ["TV ballots", data?.stats.ballots ?? 0],
              ["Jury ballots", data?.stats.juryBallots ?? 0],
              ["Suspicious", data?.stats.suspicious ?? 0],
              ["High risk", data?.stats.highRisk ?? 0],
              ["VPN evidence", data?.stats.vpn ?? 0],
              ["Relationships", data?.stats.relationships ?? 0],
              ["Need attention", data?.stats.attentionRelationships ?? 0],
              ["HOD unknown", data?.stats.hodUnknownEditionCountries ?? 0],
            ].map(([label, value]) => <div key={String(label)} className="glass p-4"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
          </section>

          <section className="glass-strong p-5">
            <h2 className="font-display text-3xl uppercase">How confidence works now</h2>
            <p className="mt-2 max-w-5xl text-sm leading-relaxed text-muted-foreground">
              Distinct editions drive historical confidence. If the same HOD submits a jury and a Televote in one edition, those channels can strengthen the pattern but they do not count as two independent people or two independent editions. One-edition samples are capped below review level; two-edition samples are capped below the strong-risk band.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Mini label="HOD-covered units" value={data?.stats.hodAssignedEditionCountries ?? 0} />
              <Mini label="HOD unknown units" value={data?.stats.hodUnknownEditionCountries ?? 0} />
              <Mini label="Jury scores" value={data?.stats.juryVotes ?? 0} />
              <Mini label="Televote rounds" value={data?.stats.rounds ?? 0} />
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            {(data?.signals ?? []).map((signal) => <article key={signal.key} className="glass p-5"><div className="flex items-start gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${signal.severity === "high" || signal.severity === "critical" ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-sky-200/15 bg-sky-200/[0.07] text-sky-100"}`}><AlertTriangle className="h-4 w-4" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{signal.title}</h2><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">{signal.count}</span></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{signal.description}</p>{signal.countries.length ? <p className="mt-3 text-[11px] text-white/45">Most affected: {signal.countries.join(" · ")}</p> : null}</div></div></article>)}
          </section>
        </>
      ) : null}

      {tab === "detection" ? (
        <section className="glass p-5 sm:p-6">
          <div className="mb-5"><h2 className="font-display text-3xl uppercase">Detection signals</h2><p className="mt-2 text-sm text-muted-foreground">Signals are prompts for organizer review, not findings of misconduct. Technical identity evidence and long-term voting relationships remain separate forms of evidence.</p></div>
          <div className="grid gap-3 lg:grid-cols-2">{(data?.signals ?? []).map((signal) => <div key={signal.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{signal.title}</p><span className="text-lg font-semibold">{signal.count}</span></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{signal.description}</p><p className="mt-3 text-[11px] text-white/45">{signal.countries.join(" · ") || "No affected delegations"}</p></div>)}</div>
        </section>
      ) : null}

      {tab === "friend-voting" ? (
        <section className="glass p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="font-display text-3xl uppercase">Relationship signals</h2>
              <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
                The default HOD lens follows the controller rather than pretending a country has one permanent personality. Risk combines edition-level confidence, repeated support, score intensity, reciprocity and modest cross-channel reinforcement.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search HOD or country" className="pl-9" /></div>
              <select value={minRisk} onChange={(e) => setMinRisk(Number(e.target.value))} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs"><option value={0}>All relationships</option><option value={30}>Notable 30+</option><option value={50}>Review 50+</option><option value={65}>Strong 65+</option><option value={80}>Highly 80+</option></select>
            </div>
          </div>

          <div className="space-y-2">
            {relationships.map((row) => (
              <article key={`${row.identityKey}>${row.targetCode}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{row.votingCountry} → {row.targetCountry}</p><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${riskClass(row.riskScore)}`}>Signal {row.riskScore}</span><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-muted-foreground">Confidence {row.confidence}%</span></div>
                      {row.controllerName ? <p className="mt-1 text-[11px] text-violet-100/70">Controller: {row.controllerName} · acting through {row.votingCountries.join(" / ")}</p> : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">{row.reasons.join(" · ") || "No strong repeated pattern detected"}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                      <Metric label="Editions" value={row.uniqueEditions} />
                      <Metric label="Opportunities" value={row.opportunities} />
                      <Metric label="Support" value={`${row.supportFrequency}%`} />
                      <Metric label="Reciprocity" value={`${row.reciprocalSupport}%`} />
                      <Metric label="Intensity" value={`${row.normalizedAverage}%`} />
                    </div>
                  </div>

                  <div className="grid gap-2 border-t border-white/8 pt-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px]">
                    <div className="rounded-xl border border-sky-200/10 bg-sky-200/[0.035] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-sky-100/60">Televote evidence</p><div className="mt-2 grid grid-cols-3 gap-2"><Mini label="Opp." value={row.televoteOpportunities} /><Mini label="Support" value={`${row.televoteSupportFrequency}%`} /><Mini label="Points" value={row.televotePoints} /></div></div>
                    <div className="rounded-xl border border-violet-200/10 bg-violet-200/[0.035] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-violet-100/60">Jury evidence</p><div className="mt-2 grid grid-cols-3 gap-2"><Mini label="Opp." value={row.juryOpportunities} /><Mini label="Support" value={`${row.jurySupportFrequency}%`} /><Mini label="Points" value={row.juryPoints} /></div></div>
                    <div className="rounded-xl border border-white/8 bg-black/10 p-3"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Cross-channel</p><p className="mt-2 text-xl font-semibold">{row.crossChannelEditions}</p><p className="mt-1 text-[10px] text-muted-foreground">editions supporting in both</p></div>
                  </div>
                </div>
              </article>
            ))}
            {!relationships.length ? <p className="py-8 text-center text-sm text-muted-foreground">No relationships match this lens and threshold.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</span>{children}</label>;
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}
function Mini({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-[8px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div>;
}
