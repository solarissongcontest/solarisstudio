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
    refetchInterval: 30_000,
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
          <div className="mb-5"><h2 className="font-display text-3xl uppercase">Detection signals</h2><p className="mt-2 text-sm text-muted-foreground">Signals are prompts for organizer review, not findings of misconduct. Technical identity evidence and long-term voting relationships remain separate forms of evidence.</p></div>
          <SignalGrid signals={data.signals} />
        </section>
      ) : null}

      {tab === "friend-voting" ? (
        <section className="glass p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="font-display text-3xl uppercase">Relationship signals</h2>
              <p className="mt-2 max-w-4xl text-sm text-muted-foreground">The HOD lens follows the person who actually controlled the delegation in each edition. Frequencies are edition-balanced so editions with extra rounds or both jury and Televoting do not get extra votes in the historical sample.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search HOD or country" className="pl-9" /></div>
              <select value={minRisk} onChange={(e) => setMinRisk(Number(e.target.value))} className={controlClass}>{riskOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </div>
          </div>

          <div className="space-y-2">
            {relationships.map((row) => (
              <article key={`${row.identityKey}>${row.targetCode}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{row.votingCountry} → {row.targetCountry}</p><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${riskClass(row.riskScore, data.settings)}`}>Signal {row.riskScore}</span><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-muted-foreground">Confidence {row.confidence}%</span></div>
                      {row.controllerName ? <p className="mt-1 text-[11px] text-violet-100/70">Controller: {row.controllerName} · acting through {row.votingCountries.join(" / ")}</p> : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">{row.reasons.join(" · ") || "No strong repeated pattern detected"}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5"><Metric label="Editions" value={row.uniqueEditions} /><Metric label="Raw obs." value={row.opportunities} /><Metric label="Support" value={`${row.supportFrequency}%`} /><Metric label="Reciprocity" value={`${row.reciprocalSupport}%`} /><Metric label="Intensity" value={`${row.normalizedAverage}%`} /></div>
                  </div>
                  <div className="grid gap-2 border-t border-white/8 pt-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px]">
                    <ChannelCard title="Televote evidence" tone="sky" opportunities={row.televoteOpportunities} support={row.televoteSupportFrequency} points={row.televotePoints} />
                    <ChannelCard title="Jury evidence" tone="violet" opportunities={row.juryOpportunities} support={row.jurySupportFrequency} points={row.juryPoints} />
                    <div className="rounded-xl border border-white/8 bg-black/10 p-3"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Cross-channel</p><p className="mt-2 text-xl font-semibold">{row.crossChannelEditions}</p><p className="mt-1 text-[10px] text-muted-foreground">editions supporting in both</p></div>
                  </div>
                </div>
              </article>
            ))}
            {!relationships.length ? <p className="py-8 text-center text-sm text-muted-foreground">No relationships match this lens and threshold.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "groups" ? (
        <section className="space-y-3">
          {lens !== "hod" ? (
            <div className="glass-strong p-7 text-center"><Network className="mx-auto h-7 w-7 text-violet-100/70" /><h2 className="mt-3 font-display text-3xl uppercase">HOD lens required</h2><p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">Coordination groups describe relationships between real controllers. Switch the identity lens to HOD tenure to avoid implying that countries themselves are friends with each other.</p></div>
          ) : (
            <>
              <div className="glass-strong p-5"><h2 className="font-display text-3xl uppercase">Coordination-group signals</h2><p className="mt-2 max-w-4xl text-sm text-muted-foreground">A group appears only when high-risk HOD-to-HOD edges are sufficiently dense and at least {Math.round(data.settings.cliqueInternalShareThreshold * 100)}% of known-HOD support by the members stays inside the group. These are review signals, not proof of coordination.</p><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Mini label="Known observations" value={data.coordination.stats.knownControllerObservations} /><Mini label="HOD edges" value={data.coordination.stats.knownControllerEdges} /><Mini label={`Edges ≥ ${data.settings.cliqueMinEdgeRisk}`} value={data.coordination.stats.qualifiedEdges} /><Mini label="Groups" value={data.coordination.stats.groups} /></div></div>
              {data.coordination.groups.map((group) => (
                <article key={group.id} className="glass p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{group.memberNames.join(" · ")}</h3><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${riskClass(group.riskScore, data.settings)}`}>Group signal {group.riskScore}</span></div><p className="mt-2 text-xs text-muted-foreground">{group.memberIds.length} HODs · {group.qualifiedEdges}/{group.possibleEdges} qualifying undirected edges</p></div>
                    <div className="grid grid-cols-3 gap-4"><Metric label="Density" value={`${group.density}%`} /><Metric label="Internal support" value={`${group.internalSupportShare}%`} /><Metric label="Avg. edge" value={group.averageEdgeRisk} /></div>
                  </div>
                  <div className="mt-4 grid gap-2 border-t border-white/8 pt-4 md:grid-cols-2 xl:grid-cols-3">{group.strongestEdges.slice(0, 6).map((edge) => <div key={`${edge.sourcePersonId}>${edge.targetPersonId}`} className="rounded-xl border border-white/8 bg-black/10 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold">{edge.sourceName} → {edge.targetName}</p><span className="text-xs tabular-nums text-amber-100">{edge.riskScore}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{edge.supportEditions}/{edge.uniqueEditions} supported editions · reciprocity {edge.reciprocalSupport}%</p></div>)}</div>
                </article>
              ))}
              {!data.coordination.groups.length ? <div className="glass p-8 text-center text-sm text-muted-foreground">No HOD group meets the current edge, density and internal-support thresholds.</div> : null}
            </>
          )}
        </section>
      ) : null}

      {tab === "settings" ? <SettingsPanel settings={data.settings} saving={saveSettings.isPending} onSave={(next) => saveSettings.mutate(next)} /> : null}
    </div>
  );
}

function SignalGrid({ signals }: { signals: Array<{ key: string; severity: string; title: string; description: string; count: number; countries: string[] }> }) {
  return <section className="grid gap-3 lg:grid-cols-2">{signals.map((signal) => <article key={signal.key} className="glass p-5"><div className="flex items-start gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${signal.severity === "high" || signal.severity === "critical" ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-sky-200/15 bg-sky-200/[0.07] text-sky-100"}`}><AlertTriangle className="h-4 w-4" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{signal.title}</h2><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">{signal.count}</span></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{signal.description}</p>{signal.countries.length ? <p className="mt-3 text-[11px] text-white/45">Most affected: {signal.countries.join(" · ")}</p> : null}</div></div></article>)}</section>;
}

function SettingsPanel({ settings, saving, onSave }: { settings: FriendVotingSettings; saving: boolean; onSave: (settings: FriendVotingSettings) => void }) {
  const [draft, setDraft] = useState<FriendVotingSettings>(settings);
  useEffect(() => setDraft(settings), [settings]);
  const set = <K extends keyof FriendVotingSettings>(key: K, value: FriendVotingSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <section className="space-y-4">
      <div className="glass-strong flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-display text-3xl uppercase">Friend-voting model</h2><p className="mt-2 max-w-4xl text-sm text-muted-foreground">These settings compare jury history with Televoting. Changes update relationships and groups immediately; they never change ballots or official results.</p></div><button type="button" disabled={saving} onClick={() => onSave(draft)} className="rounded-xl border border-sky-200/15 bg-sky-200/10 px-4 py-2 text-xs font-semibold text-sky-100 disabled:opacity-50">{saving ? "Saving…" : "Save & recalculate"}</button></div>

      <SettingsSection title="Independent sample" description="Controls how many distinct HOD-controlled editions are required before history becomes persuasive.">
        <NumberSetting label="Minimum independent editions" value={draft.minIndependentEditions} onChange={(v) => set("minIndependentEditions", v)} min={1} />
        <NumberSetting label="Editions for 100% confidence" value={draft.fullConfidenceEditions} onChange={(v) => set("fullConfidenceEditions", v)} min={1} />
        <NumberSetting label="One-edition risk cap" value={draft.oneEditionCap} onChange={(v) => set("oneEditionCap", v)} min={0} max={100} />
        <NumberSetting label="Two-edition risk cap" value={draft.twoEditionCap} onChange={(v) => set("twoEditionCap", v)} min={0} max={100} />
      </SettingsSection>

      <SettingsSection title="Pattern thresholds" description="Edition-balanced frequencies required before each behavioural signal contributes risk.">
        <PercentSetting label="Repeated support" value={draft.supportEditionThreshold} onChange={(v) => set("supportEditionThreshold", v)} />
        <PercentSetting label="Maximum-score concentration" value={draft.maximumEditionThreshold} onChange={(v) => set("maximumEditionThreshold", v)} />
        <PercentSetting label="Reciprocity" value={draft.reciprocalEditionThreshold} onChange={(v) => set("reciprocalEditionThreshold", v)} />
        <PercentSetting label="Score intensity" value={draft.intensityThreshold} onChange={(v) => set("intensityThreshold", v)} />
        <NumberSetting label="Cross-channel editions" value={draft.crossChannelMinEditions} onChange={(v) => set("crossChannelMinEditions", v)} min={1} />
      </SettingsSection>

      <SettingsSection title="Risk weights" description="How strongly each qualified signal contributes to the 0–100 relationship score.">
        <NumberSetting label="Confidence base" value={draft.baseConfidenceWeight} onChange={(v) => set("baseConfidenceWeight", v)} min={0} />
        <NumberSetting label="Repeated support" value={draft.supportWeight} onChange={(v) => set("supportWeight", v)} min={0} />
        <NumberSetting label="Maximum score" value={draft.maximumWeight} onChange={(v) => set("maximumWeight", v)} min={0} />
        <NumberSetting label="Reciprocity" value={draft.reciprocityWeight} onChange={(v) => set("reciprocityWeight", v)} min={0} />
        <NumberSetting label="Intensity" value={draft.intensityWeight} onChange={(v) => set("intensityWeight", v)} min={0} />
        <NumberSetting label="Cross-channel cap" value={draft.crossChannelWeight} onChange={(v) => set("crossChannelWeight", v)} min={0} />
        <NumberSetting label="Cross-channel per edition" value={draft.crossChannelPerEditionWeight} onChange={(v) => set("crossChannelPerEditionWeight", v)} min={0} />
      </SettingsSection>

      <SettingsSection title="Coordination groups" description="Requires strong HOD-to-HOD edges plus enough internal support and graph density before a group is surfaced.">
        <NumberSetting label="Minimum edge risk" value={draft.cliqueMinEdgeRisk} onChange={(v) => set("cliqueMinEdgeRisk", v)} min={0} max={100} />
        <NumberSetting label="Minimum members" value={draft.cliqueMinMembers} onChange={(v) => set("cliqueMinMembers", v)} min={2} />
        <PercentSetting label="Minimum edge density" value={draft.cliqueMinDensity} onChange={(v) => set("cliqueMinDensity", v)} />
        <PercentSetting label="Minimum internal support" value={draft.cliqueInternalShareThreshold} onChange={(v) => set("cliqueInternalShareThreshold", v)} />
      </SettingsSection>

      <SettingsSection title="Risk bands" description="Organizer-facing labels and default filtering thresholds.">
        <NumberSetting label="Notable" value={draft.riskNotable} onChange={(v) => set("riskNotable", v)} min={0} max={100} />
        <NumberSetting label="Review" value={draft.riskReview} onChange={(v) => set("riskReview", v)} min={0} max={100} />
        <NumberSetting label="Strong" value={draft.riskStrong} onChange={(v) => set("riskStrong", v)} min={0} max={100} />
        <NumberSetting label="High" value={draft.riskHigh} onChange={(v) => set("riskHigh", v)} min={0} max={100} />
        <NumberSetting label="Critical" value={draft.riskCritical} onChange={(v) => set("riskCritical", v)} min={0} max={100} />
      </SettingsSection>
    </section>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="glass p-5"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div></section>;
}
function NumberSetting({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return <label><span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span><input type="number" value={value} min={min} max={max} step="1" onChange={(e) => onChange(Number(e.target.value))} className={controlClass} /></label>;
}
function PercentSetting({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span><div className="relative"><input type="number" value={Math.round(value * 1000) / 10} min={0} max={100} step="0.5" onChange={(e) => onChange(Number(e.target.value) / 100)} className={`${controlClass} pr-8`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span></div></label>;
}
function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</span>{children}</label>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function Mini({ label, value }: { label: string; value: string | number }) { return <div><p className="text-[8px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div>; }
function ChannelCard({ title, tone, opportunities, support, points }: { title: string; tone: "sky" | "violet"; opportunities: number; support: number; points: number }) {
  const toneClass = tone === "sky" ? "border-sky-200/10 bg-sky-200/[0.035] text-sky-100/60" : "border-violet-200/10 bg-violet-200/[0.035] text-violet-100/60";
  return <div className={`rounded-xl border p-3 ${toneClass}`}><p className="text-[9px] font-bold uppercase tracking-[0.13em]">{title}</p><div className="mt-2 grid grid-cols-3 gap-2 text-foreground"><Mini label="Raw obs." value={opportunities} /><Mini label="Support" value={`${support}%`} /><Mini label="Points" value={points} /></div></div>;
}
