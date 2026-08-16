import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Eye, Search, ShieldAlert, Users } from "lucide-react";

import { Input } from "@/components/ui/input";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { getMergedTelevotingIntelligence } from "@/integrations/televoting/intelligence.functions";

export const Route = createFileRoute("/televoting/admin/intelligence")({
  head: () => ({ meta: [{ title: "Televoting Intelligence — Solaris Operations" }, { name: "robots", content: "noindex" }] }),
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

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-intelligence"],
    queryFn: () => getIntelligence(),
    enabled: Boolean(admin),
    refetchInterval: 30_000,
  });

  const relationships = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.relationships ?? []).filter((row) => {
      if (row.riskScore < minRisk) return false;
      if (!term) return true;
      return `${row.votingCountry} ${row.targetCountry}`.toLowerCase().includes(term);
    });
  }, [data?.relationships, minRisk, search]);

  if (adminLoading || isLoading) {
    return <section className="glass p-8 text-center text-sm text-muted-foreground">Building integrity intelligence…</section>;
  }
  if (!admin) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 py-2">
      <header className="glass-strong p-5 sm:p-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/65">Televoting · Integrity intelligence</p>
        <h1 className="font-display mt-2 text-4xl uppercase leading-none sm:text-5xl">Detection & friend voting</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Anti-abuse signals, technical evidence and delegation-to-delegation voting patterns now live in one workspace. Country identity remains the primary Head-of-Delegation identity; usernames, VPNs and technical markers are supporting evidence only.
        </p>
      </header>

      {error ? <div className="glass border-red-300/20 p-4 text-sm text-red-100">{(error as Error).message}</div> : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          ["overview", "Overview", ShieldAlert],
          ["detection", "Detection", Eye],
          ["friend-voting", "Friend voting", Users],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
              tab === value ? "border-sky-200/20 bg-sky-200/10 text-sky-100" : "border-white/10 bg-white/[0.035] text-muted-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              ["Ballots", data?.stats.ballots ?? 0],
              ["Suspicious", data?.stats.suspicious ?? 0],
              ["High risk", data?.stats.highRisk ?? 0],
              ["VPN evidence", data?.stats.vpn ?? 0],
              ["Relationships", data?.stats.relationships ?? 0],
              ["Need attention", data?.stats.attentionRelationships ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="glass p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            {(data?.signals ?? []).map((signal) => (
              <article key={signal.key} className="glass p-5">
                <div className="flex items-start gap-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${signal.severity === "high" || signal.severity === "critical" ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-sky-200/15 bg-sky-200/[0.07] text-sky-100"}`}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">{signal.title}</h2>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">{signal.count}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{signal.description}</p>
                    {signal.countries.length ? <p className="mt-3 text-[11px] text-white/45">Most affected: {signal.countries.join(" · ")}</p> : null}
                  </div>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}

      {tab === "detection" ? (
        <section className="glass p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="font-display text-3xl uppercase">Detection signals</h2>
            <p className="mt-2 text-sm text-muted-foreground">Signals are prompts for organizer review, not automatic guilt. Open Integrity to inspect individual ballots and moderate them.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {(data?.signals ?? []).map((signal) => (
              <div key={signal.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{signal.title}</p>
                  <span className="text-lg font-semibold">{signal.count}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{signal.description}</p>
                <p className="mt-3 text-[11px] text-white/45">{signal.countries.join(" · ") || "No affected delegations"}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "friend-voting" ? (
        <section className="glass p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-display text-3xl uppercase">Delegation relationships</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Risk combines sample confidence, repeated support, maximum-score concentration, reciprocity and average support. Relationships with tiny samples are intentionally kept low.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search countries" className="pl-9" />
              </div>
              <select value={minRisk} onChange={(e) => setMinRisk(Number(e.target.value))} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs">
                <option value={0}>All relationships</option>
                <option value={30}>Notable 30+</option>
                <option value={50}>Review 50+</option>
                <option value={65}>Strong 65+</option>
                <option value={80}>Highly 80+</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {relationships.map((row) => (
              <article key={`${row.votingCountry}>${row.targetCountry}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(90px,.55fr))] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{row.votingCountry} → {row.targetCountry}</p>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${riskClass(row.riskScore)}`}>Risk {row.riskScore}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{row.reasons.join(" · ") || "No strong repeated pattern detected"}</p>
                  </div>
                  <Metric label="Opportunities" value={row.opportunities} />
                  <Metric label="Support" value={`${row.supportFrequency}%`} />
                  <Metric label="Maximum" value={`${row.maximumFrequency}%`} />
                  <Metric label="Reciprocity" value={`${row.reciprocalSupport}%`} />
                  <Metric label="Avg points" value={row.averagePoints} />
                </div>
              </article>
            ))}
            {!relationships.length ? <p className="py-8 text-center text-sm text-muted-foreground">No relationships match this filter.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
