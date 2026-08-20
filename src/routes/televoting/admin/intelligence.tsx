import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Eye, Network, Search, Settings, ShieldAlert, UserRoundCog, Users } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { updateFriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.functions";
import type { FriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.server";
import { getMergedTelevotingIntelligence } from "@/integrations/televoting/intelligence.functions";
import type { IntelligenceChannel, IntelligenceLens } from "@/integrations/televoting/intelligence.server";

export const Route = createFileRoute("/televoting/admin/intelligence")({
  head: () => ({ meta: [{ title: "Voting Intelligence — Solaris Operations" }, { name: "robots", content: "noindex" }] }),
  component: IntelligencePage,
});

type Tab = "overview" | "detection" | "friend-voting" | "groups" | "settings";

const controlClass = "min-h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs outline-none focus:border-sky-200/30";

function riskClass(risk: number, settings: FriendVotingSettings) {
  if (risk >= settings.riskCritical) return "border-red-300/25 bg-red-300/10 text-red-100";
  if (risk >= settings.riskHigh) return "border-orange-300/25 bg-orange-300/10 text-orange-100";
  if (risk >= settings.riskStrong) return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (risk >= settings.riskReview) return "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";
  return "border-white/10 bg-white/[0.04] text-muted-foreground";
}

function IntelligencePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getIntelligence = useServerFn(getMergedTelevotingIntelligence);
  const saveSettingsFn = useServerFn(updateFriendVotingSettings);
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

  const intelligenceQuery = useQuery({
    queryKey: ["merged-televoting-intelligence", lens, channel, hodPersonId ?? "all-hods", editionId ?? "all-editions"],
    queryFn: () => getIntelligence({ data: { lens, channel, hodPersonId, editionId } }),
    enabled: Boolean(admin),
    staleTime: 30_000,
    // This calculation spans historical jury + televote evidence and is much
    // heavier than a live scoreboard. Settings changes still invalidate it
    // immediately, while background refreshes can safely be less aggressive.
    refetchInterval: 60_000,
  });
  const { data, isLoading, error } = intelligenceQuery;

  const saveSettings = useMutation({
    mutationFn: (settings: FriendVotingSettings) => saveSettingsFn({ data: settings }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["merged-televoting-intelligence"] });
      toast.success("Friend-voting model updated and recalculated");
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Settings could not be saved"),
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
  if (error || !data) return <section className="glass border-red-300/20 p-6 text-sm text-red-100">{error instanceof Error ? error.message : "Voting intelligence could not be loaded."}</section>;

  const riskOptions = [...new Map([
    [0, "All relationships"],
    [data.settings.riskNotable, `Notable ${data.settings.riskNotable}+`],
    [data.settings.riskReview, `Review ${data.settings.riskReview}+`],
    [data.settings.riskStrong, `Strong ${data.settings.riskStrong}+`],
    [data.settings.riskHigh, `High ${data.settings.riskHigh}+`],
    [data.settings.riskCritical, `Critical ${data.settings.riskCritical}+`],
  ]).entries()];

  const tabs: Array<[Tab, string, typeof ShieldAlert]> = [
    ["overview", "Overview", ShieldAlert],
    ["detection", "Detection", Eye],
    ["friend-voting", "Friend voting", Users],
    ["groups", "Groups", Network],
    ["settings", "Settings", Settings],
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 py-2">
      <header className="glass-strong p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/65">Solaris · Integrity intelligence</p>
            <h1 className="font-display mt-2 text-4xl uppercase leading-none sm:text-5xl">Detection & friend voting</h1>
            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Jury and Televoting evidence are combined through edition-specific HOD history. Distinct HOD-controlled editions are the independent historical sample, while extra channels inside one edition only reinforce that edition instead of pretending to be extra people.
            </p>
          </div>
          <Link to="/admin/hod-history" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-violet-200/15 bg-violet-200/[0.07] px-4 py-2 text-xs font-semibold text-violet-100"><UserRoundCog className="size-3.5" /> HOD History</Link>
        </div>
      </header>

      <section className="glass grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <Filter label="Identity lens">
          <select value={lens} onChange={(e) => setLens(e.target.value as IntelligenceLens)} className={controlClass}>
            <option value="hod">HOD tenure (recommended)</option>
            <option value="country">Country history (context)</option>
          </select>
        </Filter>
        <Filter label="Evidence channel">
          <select value={channel} onChange={(e) => setChannel(e.target.value as IntelligenceChannel)} className={controlClass}>
            <option value="combined">Jury + televote</option>
            <option value="televote">Televote only</option>
            <option value="jury">Jury only</option>
          </select>
        </Filter>
        <Filter label="Specific HOD">
          <select value={hodPersonId ?? ""} onChange={(e) => setHodPersonId(e.target.value || null)} className={controlClass}>
            <option value="">All HODs</option>
            {data.filters.people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
        </Filter>
        <Filter label="Edition">
          <select value={editionId ?? ""} onChange={(e) => setEditionId(e.target.value || null)} className={controlClass}>
            <option value="">All editions</option>
            {data.filters.editions.map((edition) => <option key={edition.id} value={edition.id}>{edition.editionNumber ? `SSC${edition.editionNumber}` : edition.name}</option>)}
          </select>
        </Filter>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${tab === value ? "border-sky-200/20 bg-sky-200/10 text-sky-100" : "border-white/10 bg-white/[0.035] text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" /> {label}</button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {[
              ["TV ballots", data.stats.ballots],
              ["Jury ballots", data.stats.juryBallots],
              ["Suspicious", data.stats.suspicious],
              ["High risk", data.stats.highRisk],
              ["Relationships", data.stats.relationships],
              ["Need attention", data.stats.attentionRelationships],
              ["Groups", data.coordination.stats.groups],
              ["HOD unknown", data.stats.hodUnknownEditionCountries],
            ].map(([label, value]) => <div key={String(label)} className="glass p-4"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
          </section>

          <section className="glass-strong p-5">
            <h2 className="font-display text-3xl uppercase">Confidence model</h2>
            <p className="mt-2 max-w-5xl text-sm leading-relaxed text-muted-foreground">
              Full historical confidence currently requires {data.settings.fullConfidenceEditions} distinct HOD-controlled editions. Repeated-support and maximum-score bonuses begin at {data.settings.minIndependentEditions} independent editions. One-edition relationships are capped at {data.settings.oneEditionCap}; two-edition relationships are capped at {data.settings.twoEditionCap}.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Mini label="HOD-covered units" value={data.stats.hodAssignedEditionCountries} />
              <Mini label="HOD unknown units" value={data.stats.hodUnknownEditionCountries} />
              <Mini label="Known HOD edges" value={data.coordination.stats.knownControllerEdges} />
              <Mini label="Qualified group edges" value={data.coordination.stats.qualifiedEdges} />
            </div>
          </section>

          <SignalGrid signals={data.signals} />
        </div>
      ) : null}

      {tab === "detection" ? (
        <section className="glass p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-display text-3xl uppercase">Detected relationships</h2><p className="mt-2 text-sm text-muted-foreground">Filter by risk score or search country and HOD names.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search relationships" className="min-h-10 pl-9 text-xs sm:w-56" /></div>
              <select value={minRisk} onChange={(event) => setMinRisk(Number(event.target.value))} className={`${controlClass} sm:w-48`}>{riskOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </div>
          </div>
          <RelationshipTable relationships={relationships} settings={data.settings} />
        </section>
      ) : null}

      {tab === "friend-voting" ? <FriendVotingTab data={data} /> : null}
      {tab === "groups" ? <GroupsTab data={data} /> : null}
      {tab === "settings" ? <SettingsTab data={data} saveSettings={saveSettings} /> : null}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>{children}</label>;
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>;
}

function SignalGrid({ signals }: { signals: Array<{ label: string; value: number | string; tone?: string }> }) {
  return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{signals.map((signal) => <div key={signal.label} className="glass p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{signal.label}</p><p className="mt-2 text-xl font-semibold">{signal.value}</p></div>)}</section>;
}

function RelationshipTable({ relationships, settings }: { relationships: Array<{ votingCountry: string; votingCountries: string[]; controllerName: string | null; targetCountry: string; riskScore: number; independentEditions: number; supportRate: number; maximumRate: number; averagePoints: number; reasons: string[] }>; settings: FriendVotingSettings }) {
  if (!relationships.length) return <div className="mt-5 rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">No relationships match these filters.</div>;
  return (
    <div className="mt-5 space-y-2">
      {relationships.map((row, index) => (
        <article key={`${row.votingCountry}-${row.controllerName ?? "country"}-${row.targetCountry}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{row.votingCountry}</span><span className="text-muted-foreground">→</span><span className="font-semibold">{row.targetCountry}</span>{row.controllerName ? <span className="rounded-full border border-violet-200/15 bg-violet-200/[0.06] px-2 py-1 text-[10px] text-violet-100">{row.controllerName}</span> : null}</div>
              {row.votingCountries.length > 1 ? <p className="mt-1 text-xs text-muted-foreground">Controlled countries: {row.votingCountries.join(", ")}</p> : null}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{row.reasons.join(" · ")}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskClass(row.riskScore, settings)}`}>Risk {row.riskScore}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">{row.independentEditions} editions</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">Support {Math.round(row.supportRate * 100)}%</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">Max {Math.round(row.maximumRate * 100)}%</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground">Avg {row.averagePoints.toFixed(1)}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function FriendVotingTab({ data }: { data: Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getMergedTelevotingIntelligence>>>> }) {
  if (!data) return null;
  return <section className="glass p-5 sm:p-6"><h2 className="font-display text-3xl uppercase">Friend-voting model</h2><p className="mt-2 text-sm text-muted-foreground">The model combines repeated support, maximum-score frequency, preference lift, audience uplift, reciprocity, streaks, historical moderation and coordination evidence. Country remains the permanent delegation identity; HOD history controls independent-sample confidence.</p></section>;
}

function GroupsTab({ data }: { data: Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getMergedTelevotingIntelligence>>>> }) {
  if (!data) return null;
  return <section className="glass p-5 sm:p-6"><h2 className="font-display text-3xl uppercase">Coordination groups</h2><p className="mt-2 text-sm text-muted-foreground">Groups are built from qualified relationship edges and shown as evidence clusters, not automatic findings.</p></section>;
}

function SettingsTab({ data, saveSettings }: { data: Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getMergedTelevotingIntelligence>>>>; saveSettings: ReturnType<typeof useMutation<FriendVotingSettings, Error, FriendVotingSettings>> }) {
  if (!data) return null;
  return <section className="glass p-5 sm:p-6"><div className="flex items-start gap-3"><Settings className="mt-1 size-5 text-sky-100" /><div><h2 className="font-display text-3xl uppercase">Model settings</h2><p className="mt-2 text-sm text-muted-foreground">Current model thresholds are loaded from the voting service. Saving recalculates the intelligence view immediately.</p><button type="button" disabled={saveSettings.isPending} onClick={() => saveSettings.mutate(data.settings)} className="mt-4 rounded-xl border border-sky-200/15 bg-sky-200/[0.08] px-4 py-2 text-xs font-semibold text-sky-100">{saveSettings.isPending ? "Saving…" : "Recalculate with current settings"}</button></div></div></section>;
}
