import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Gavel,
  Music2,
  RotateCcw,
  Scale,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { RuleChip } from "@/components/rules/ContextualRuleGuide";
import { cn } from "@/lib/utils";

type YesNoUnknown = "no" | "yes" | "unknown";

type EligibilityResult = {
  state: "eligible" | "ineligible" | "permission" | "check";
  title: string;
  detail: string;
  blockers: string[];
  cautions: string[];
};

const SANCTION_LEVELS = [
  "Official Warning",
  "Loss of 50% of Bonus Points",
  "No Bonus Points Awarded",
  "−5 Contest Points",
  "−25 Contest Points",
  "−50 Contest Points",
  "−100 Contest Points",
  "Disqualification",
  "Disqualification + One-Edition Ban",
  "Lifetime Ban",
] as const;

const APPEAL_STEPS = [
  { label: "Decision issued", detail: "The participant receives the decision, rule basis and enough reasoning to understand what was decided." },
  { label: "48-hour appeal window", detail: "An appeal should normally be submitted within 48 hours of the official sanction being communicated." },
  { label: "Conflict check", detail: "A reviewer with a significant conflict should recuse where another suitable reviewer is available." },
  { label: "Fresh review", detail: "A serious appeal should genuinely reconsider the evidence and reasoning rather than simply rubber-stamp the original decision." },
  { label: "Appeal outcome", detail: "The decision may be upheld, reduced, increased or overturned where the review justifies it." },
] as const;

function parseMetric(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  return normalized ? Number(normalized) : Number.NaN;
}

export function AdvancedRulesTools() {
  return (
    <section className="mt-6 space-y-5" aria-labelledby="rules-tools-heading">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-200/70">INTERACTIVE RULE TOOLS</p>
          <h2 id="rules-tools-heading" className="mt-2 text-3xl font-black tracking-[-.045em] text-white">Check first. Read the official wording second.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">These tools apply the headline rules visually, then link to the regulations controlling the real decision. They do not replace TSBC verification where facts are uncertain.</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">Visual guidance ≠ separate rules</div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <EligibilityLab />
        <div className="space-y-5">
          <SanctionsVisual />
          <AppealTimeline />
        </div>
      </div>
    </section>
  );
}

function EligibilityLab() {
  const [spotify, setSpotify] = useState("");
  const [youtube, setYoutube] = useState("");
  const [eurovision, setEurovision] = useState<YesNoUnknown>("no");
  const [nationalSelection, setNationalSelection] = useState<YesNoUnknown>("no");
  const [appearances, setAppearances] = useState("0");
  const [winner, setWinner] = useState<YesNoUnknown>("no");
  const [otherCountry, setOtherCountry] = useState<YesNoUnknown>("no");
  const [permission, setPermission] = useState<YesNoUnknown>("unknown");

  const result = useMemo<EligibilityResult>(() => {
    const blockers: string[] = [];
    const cautions: string[] = [];
    const spotifyNumber = parseMetric(spotify);
    const youtubeNumber = parseMetric(youtube);
    const appearanceNumber = Number(appearances);

    if (!Number.isNaN(spotifyNumber) && spotifyNumber >= 25_000_000) blockers.push("Artist is at or above 25M monthly Spotify listeners at the check time.");
    if (!Number.isNaN(youtubeNumber) && youtubeNumber >= 20_000_000) blockers.push("Relevant official music video is at or above 20M YouTube views at the check time.");
    if (eurovision === "yes") blockers.push("Artist has participated in Eurovision.");
    if (nationalSelection === "yes") blockers.push("Artist has participated in a National Selection after 2015.");
    if (appearanceNumber >= 3) blockers.push("Artist has already reached the three-appearance SSC limit.");
    if (winner === "yes") blockers.push("A previous winning artist cannot return as a competing artist.");

    if (!spotify.trim()) cautions.push("Spotify listener count has not been entered.");
    if (!youtube.trim()) cautions.push("Official music-video view count has not been entered.");
    if (eurovision === "unknown") cautions.push("Eurovision history still needs verification.");
    if (nationalSelection === "unknown") cautions.push("National Selection history still needs verification.");
    if (winner === "unknown") cautions.push("Previous SSC winner history still needs verification.");

    if (blockers.length) {
      return { state: "ineligible", title: "Likely ineligible", detail: "At least one entered fact conflicts with the current headline eligibility rules.", blockers, cautions };
    }

    if (otherCountry === "yes" && permission !== "yes") {
      return {
        state: "permission",
        title: "Eligible only with representation permission",
        detail: "The artist's existing SSC country association must be respected. Another country needs the required permission before reuse.",
        blockers: [],
        cautions: permission === "no" ? ["Permission is currently marked as not granted."] : ["Permission has not yet been confirmed."],
      };
    }

    if (cautions.length) {
      return { state: "check", title: "Needs verification", detail: "Nothing entered definitely blocks the artist, but unresolved facts remain before the entry can be treated as verified.", blockers: [], cautions };
    }

    return { state: "eligible", title: "Passes the headline checks", detail: "The information entered does not conflict with the main artist-eligibility rules. Final entry verification still applies to the song, media and submitted facts.", blockers: [], cautions: [] };
  }, [appearances, eurovision, nationalSelection, otherCountry, permission, spotify, winner, youtube]);

  const reset = () => {
    setSpotify("");
    setYoutube("");
    setEurovision("no");
    setNationalSelection("no");
    setAppearances("0");
    setWinner("no");
    setOtherCountry("no");
    setPermission("unknown");
  };

  return (
    <article className="overflow-hidden rounded-[1.8rem] border border-violet-200/14 bg-[linear-gradient(150deg,rgba(72,52,122,.12),rgba(5,19,40,.93))]">
      <header className="border-b border-white/[0.07] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.18em] text-violet-200/70">ENTRY LAB</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-.035em]">Artist eligibility checker</h3>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">Enter the facts as they stand at the official eligibility-check time. Later popularity growth does not normally retroactively invalidate an accepted entry.</p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-violet-200/12 bg-violet-200/[0.06] text-violet-100"><Music2 className="size-5" /></span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><RuleChip ruleId="6.4"/><RuleChip ruleId="6.5"/><RuleChip ruleId="6.6"/><RuleChip ruleId="6.10"/></div>
      </header>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <NumberField label="Spotify monthly listeners" value={spotify} onChange={setSpotify} placeholder="e.g. 18,500,000" threshold="Must be under 25,000,000 at the official check time" />
          <NumberField label="Official music-video YouTube views" value={youtube} onChange={setYoutube} placeholder="e.g. 8,200,000" threshold="Must be under 20,000,000 at the official check time" />
          <Choice label="Competed in Eurovision?" value={eurovision} onChange={setEurovision} />
          <Choice label="Competed in a National Selection after 2015?" value={nationalSelection} onChange={setNationalSelection} />
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">Previous SSC appearances</span>
            <select value={appearances} onChange={(event) => setAppearances(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border px-3 text-sm">
              <option value="0">0 appearances</option>
              <option value="1">1 appearance</option>
              <option value="2">2 appearances</option>
              <option value="3">3 or more appearances</option>
            </select>
            <span className="mt-1 block text-[9px] text-muted-foreground">The current artist-reuse cap is three appearances.</span>
          </label>
          <Choice label="Previously won SSC as a competing artist?" value={winner} onChange={setWinner} />
          <Choice label="Previously associated with another SSC country?" value={otherCountry} onChange={setOtherCountry} />
          {otherCountry === "yes" ? <Choice label="Has the original delegation granted reuse permission?" value={permission} onChange={setPermission} /> : null}
        </div>
      </div>

      <div className="border-t border-white/[0.07] p-5 sm:p-6">
        <EligibilityOutcome result={result} />
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-[10px] font-bold text-muted-foreground hover:bg-white/[0.04] hover:text-white"><RotateCcw className="size-3.5"/>Reset checker</button>
        </div>
      </div>
    </article>
  );
}

function EligibilityOutcome({ result }: { result: EligibilityResult }) {
  const config = result.state === "eligible"
    ? { icon: CheckCircle2, className: "border-emerald-200/18 bg-emerald-200/[0.06] text-emerald-50" }
    : result.state === "ineligible"
      ? { icon: XCircle, className: "border-rose-200/18 bg-rose-200/[0.06] text-rose-50" }
      : result.state === "permission"
        ? { icon: ShieldCheck, className: "border-amber-200/18 bg-amber-200/[0.06] text-amber-50" }
        : { icon: AlertTriangle, className: "border-sky-200/18 bg-sky-200/[0.06] text-sky-50" };
  const Icon = config.icon;

  return (
    <div className={cn("rounded-2xl border p-4", config.className)}>
      <div className="flex gap-3"><Icon className="mt-0.5 size-5 shrink-0"/><div><p className="text-base font-black">{result.title}</p><p className="mt-1 text-[11px] leading-5 opacity-75">{result.detail}</p></div></div>
      {result.blockers.length ? <ul className="mt-3 space-y-1.5 text-[10px] leading-5">{result.blockers.map((item) => <li key={item}>✕ {item}</li>)}</ul> : null}
      {result.cautions.length ? <ul className="mt-3 space-y-1.5 text-[10px] leading-5 opacity-80">{result.cautions.map((item) => <li key={item}>⚠ {item}</li>)}</ul> : null}
    </div>
  );
}

function SanctionsVisual() {
  return (
    <article className="rounded-[1.8rem] border border-rose-200/12 bg-[#08172f]/88 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-rose-200/65">SANCTION SCALE</p>
          <h3 className="mt-2 text-xl font-black">The ten official SSC levels</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">The scale stays fixed. The circumstances of the case determine the appropriate level, including seriousness, intent, history, cooperation and impact.</p>
        </div>
        <Scale className="size-6 shrink-0 text-rose-200"/>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><RuleChip ruleId="17.1"/><RuleChip ruleId="17.2"/><RuleChip ruleId="17.4"/><RuleChip ruleId="17.5"/><RuleChip ruleId="17.6"/></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {SANCTION_LEVELS.map((label, index) => (
          <div key={label} className={cn("grid grid-cols-[2.15rem_1fr] gap-3 rounded-xl border p-3", index >= 7 ? "border-rose-200/14 bg-rose-200/[0.045]" : "border-white/[0.07] bg-white/[0.02]")}>
            <span className="grid size-8 place-items-center rounded-lg border border-rose-200/10 bg-rose-200/[0.045] text-[10px] font-black text-rose-100">{index + 1}</span>
            <div><p className="text-xs font-black">{label}</p><p className="mt-1 text-[9px] uppercase tracking-[.08em] text-muted-foreground">Level {index + 1}{index >= 7 ? " · severe" : ""}</p></div>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-xl border border-amber-200/10 bg-amber-200/[0.035] p-3 text-[10px] leading-5 text-amber-50/70">The ladder is not automatic sentencing. Typical violation levels are starting points, and aggravating or mitigating factors can justify movement within the scale.</p>
    </article>
  );
}

function AppealTimeline() {
  return (
    <article className="rounded-[1.8rem] border border-amber-200/12 bg-[#08172f]/88 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-200/65">APPEALS</p>
          <h3 className="mt-2 text-xl font-black">48 hours to challenge a decision</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">The appeal process is meant to be a genuine second look, not the original reviewer rereading their own paragraph and admiring it.</p>
        </div>
        <Gavel className="size-6 shrink-0 text-amber-200"/>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><RuleChip ruleId="18.1"/><RuleChip ruleId="18.2"/><RuleChip ruleId="18.3"/><RuleChip ruleId="18.4"/></div>
      <div className="relative mt-5">
        {APPEAL_STEPS.map((step, index) => (
          <div key={step.label} className="relative grid grid-cols-[2rem_1fr] gap-3 pb-4 last:pb-0">
            {index < APPEAL_STEPS.length - 1 ? <span aria-hidden="true" className="absolute left-[.96rem] top-7 h-[calc(100%-1rem)] w-px bg-white/[0.09]"/> : null}
            <span className="relative z-10 grid size-8 place-items-center rounded-full border border-amber-200/15 bg-[#101d32] text-[10px] font-black text-amber-100">{index + 1}</span>
            <div className="pt-1"><p className="text-xs font-black">{step.label}</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{step.detail}</p></div>
          </div>
        ))}
      </div>
    </article>
  );
}

function NumberField({ label, value, onChange, placeholder, threshold }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; threshold: string }) {
  const display = value.replaceAll(",", "");
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">{label}</span>
      <input inputMode="numeric" value={value} onChange={(event) => { const cleaned = event.target.value.replace(/[^0-9]/g, ""); onChange(cleaned ? Number(cleaned).toLocaleString("en-US") : ""); }} placeholder={placeholder} className="mt-2 min-h-11 w-full rounded-xl border px-3 text-sm"/>
      <span className="mt-1 block text-[9px] text-muted-foreground">{threshold}{display ? ` · entered ${Number(display).toLocaleString("en-US")}` : ""}</span>
    </label>
  );
}

function Choice({ label, value, onChange }: { label: string; value: YesNoUnknown; onChange: (value: YesNoUnknown) => void }) {
  return (
    <fieldset>
      <legend className="text-[10px] font-black uppercase tracking-[.1em] text-muted-foreground">{label}</legend>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {(["no", "yes", "unknown"] as const).map((option) => (
          <button key={option} type="button" onClick={() => onChange(option)} className={cn("min-h-10 rounded-xl border text-[10px] font-black capitalize transition", value === option ? option === "yes" ? "border-amber-200/20 bg-amber-200/[0.07] text-amber-50" : option === "no" ? "border-emerald-200/20 bg-emerald-200/[0.07] text-emerald-50" : "border-sky-200/20 bg-sky-200/[0.07] text-sky-50" : "border-white/[0.07] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.04]")}>{option}</button>
        ))}
      </div>
    </fieldset>
  );
}
