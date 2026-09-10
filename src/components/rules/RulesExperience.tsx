import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CloudLightning,
  FileClock,
  Flag,
  Gavel,
  Globe2,
  Handshake,
  Landmark,
  Lightbulb,
  LockKeyhole,
  Map,
  Music2,
  PanelsTopLeft,
  RefreshCcw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UsersRound,
  Vote,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  QUICK_RULES,
  RULEBOOK_STATS,
  SSC_RULEBOOK,
  SSC_RULE_CHAPTERS,
  getRuleById,
  searchSscRules,
  type RuleTone,
  type SscRule,
  type SscRuleChapter,
} from "@/lib/ssc-rules";
import { cn } from "@/lib/utils";

type RulesMode = "overview" | "journey" | "check" | "rulebook";

type JourneyStage = {
  step: string;
  title: string;
  kicker: string;
  detail: string;
  icon: LucideIcon;
  rules: readonly string[];
};

const ICONS: Record<string, LucideIcon> = {
  Landmark,
  BookOpen,
  UsersRound,
  Music2,
  PanelsTopLeft,
  Trophy,
  Vote,
  Clock3,
  RefreshCcw,
  Sparkles,
  Scale,
  Gavel,
  CloudLightning,
  ShieldCheck,
  FileClock,
};

const TONE_META: Record<RuleTone, { label: string; icon: LucideIcon; className: string }> = {
  allowed: {
    label: "Allowed",
    icon: CheckCircle2,
    className: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  },
  prohibited: {
    label: "Not allowed",
    icon: XCircle,
    className: "border-rose-300/20 bg-rose-300/10 text-rose-100",
  },
  conditional: {
    label: "Depends",
    icon: AlertTriangle,
    className: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  },
  integrity: {
    label: "Integrity",
    icon: ShieldCheck,
    className: "border-violet-300/20 bg-violet-300/10 text-violet-100",
  },
  administrative: {
    label: "Official process",
    icon: Landmark,
    className: "border-sky-300/20 bg-sky-300/10 text-sky-100",
  },
  information: {
    label: "Information",
    icon: BookOpen,
    className: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
  },
};

const ACCENT_CLASSES: Record<SscRuleChapter["accent"], string> = {
  sky: "border-sky-300/18 from-sky-300/18 via-sky-300/[0.055] to-transparent",
  violet: "border-violet-300/18 from-violet-300/18 via-violet-300/[0.055] to-transparent",
  emerald: "border-emerald-300/18 from-emerald-300/18 via-emerald-300/[0.055] to-transparent",
  amber: "border-amber-300/18 from-amber-300/18 via-amber-300/[0.055] to-transparent",
  rose: "border-rose-300/18 from-rose-300/18 via-rose-300/[0.055] to-transparent",
  cyan: "border-cyan-300/18 from-cyan-300/18 via-cyan-300/[0.055] to-transparent",
  indigo: "border-indigo-300/18 from-indigo-300/18 via-indigo-300/[0.055] to-transparent",
};

const MODE_ITEMS: Array<{ id: RulesMode; label: string; eyebrow: string; icon: LucideIcon }> = [
  { id: "overview", label: "Rule map", eyebrow: "Explore visually", icon: Map },
  { id: "journey", label: "Contest journey", eyebrow: "Follow an edition", icon: Flag },
  { id: "check", label: "Can I…?", eyebrow: "Instant answers", icon: CheckCircle2 },
  { id: "rulebook", label: "Official rulebook", eyebrow: "Exact regulations", icon: BookOpen },
];

const JOURNEY: JourneyStage[] = [
  { step: "01", title: "Confirm", kicker: "ENTER", detail: "Secure participation, represent your country and know what your delegation is responsible for.", icon: Flag, rules: ["1.5", "1.6", "8.1"] },
  { step: "02", title: "Select", kicker: "CREATE", detail: "Find a song and artist that actually pass SSC eligibility before becoming emotionally attached to them.", icon: Music2, rules: ["4.2", "4.4", "4.5", "4.6"] },
  { step: "03", title: "Submit", kicker: "VERIFY", detail: "Submit the entry, video and required information before the official deadline.", icon: CheckCircle2, rules: ["4.3", "4.10", "8.3"] },
  { step: "04", title: "Compete", kicker: "SHOW", detail: "Your fictional delegation enters the online show, running order and official SSC presentation.", icon: Sparkles, rules: ["5.1", "5.3", "10.1"] },
  { step: "05", title: "Vote", kicker: "DECIDE", detail: "Jury and public votes must reflect independent preferences, not private arrangements.", icon: Vote, rules: ["7.1", "7.3", "7.4", "7.5"] },
  { step: "06", title: "Verify", kicker: "PROTECT", detail: "Integrity checks can flag unusual patterns, but a flag is evidence for review, not automatic guilt.", icon: ShieldCheck, rules: ["7.7", "7.8", "7.9", "7.10"] },
  { step: "07", title: "Results", kicker: "REVEAL", detail: "Scores are verified, ties are resolved and TSBC publishes the official result.", icon: Trophy, rules: ["5.4", "5.5", "5.7"] },
  { step: "08", title: "Host", kicker: "CONTINUE", detail: "The winner receives creative hosting rights for the next completely online SSC edition.", icon: Globe2, rules: ["6.1", "6.2", "6.3"] },
];

const QUICK_CHECKS = [
  { question: "Use an artist who competed in Eurovision?", answer: "NO", tone: "no", rule: "4.5", explanation: "Artists who participated in the Eurovision Song Contest are not eligible under the current SSC rules." },
  { question: "Reuse an artist my country already sent?", answer: "USUALLY", tone: "depends", rule: "4.6", explanation: "They can return for the same country within the three-appearance limit unless another eligibility rule blocks them." },
  { question: "Let another country use my previous artist?", answer: "WITH PERMISSION", tone: "depends", rule: "4.6", explanation: "The current SSC representation rule allows it when the original delegation expressly grants permission." },
  { question: "Vote highly for a friend's song?", answer: "YES", tone: "yes", rule: "7.7", explanation: "Friendship does not invalidate a vote when the score genuinely reflects your own musical preference." },
  { question: "Agree to give each other points?", answer: "NO", tone: "no", rule: "7.5", explanation: "Reciprocal or coordinated voting arrangements are prohibited." },
  { question: "Treat an automated friend-voting flag as proof?", answer: "NO", tone: "yes", rule: "7.8", explanation: "An automated or statistical flag is a signal for human review, not proof of misconduct." },
  { question: "Criticise a TSBC decision?", answer: "YES", tone: "yes", rule: "3.2", explanation: "Good-faith criticism of songs, rules, results and TSBC decisions is allowed." },
  { question: "Report a suspected rule break anonymously?", answer: "YES", tone: "yes", rule: "14.8", explanation: "The Trust & Integrity system supports protected fully anonymous reporting." },
  { question: "Use a Solaris Studio bug for advantage?", answer: "NO", tone: "no", rule: "14.4", explanation: "Finding a bug is fine. Knowingly exploiting it for competitive advantage is not." },
] as const;

const RULE_ZONES = [
  {
    id: "foundation",
    number: "A",
    eyebrow: "THE CONTEST",
    title: "Foundation & community",
    description: "Who SSC is, who runs it, what its language means and how people are expected to behave.",
    icon: Landmark,
    chapters: [1, 2, 3],
    rail: "from-sky-300/70 to-indigo-300/70",
  },
  {
    id: "competition",
    number: "B",
    eyebrow: "THE ENTRY",
    title: "Entries, format & hosting",
    description: "Everything from choosing the song to appearing in the show and earning creative hosting rights.",
    icon: Music2,
    chapters: [4, 5, 6],
    rail: "from-fuchsia-300/60 to-amber-300/70",
  },
  {
    id: "integrity",
    number: "C",
    eyebrow: "THE VOTE",
    title: "Voting & integrity",
    description: "How scores are cast, checked and protected from coordination, manipulation and technical abuse.",
    icon: ShieldCheck,
    chapters: [7, 14],
    rail: "from-violet-300/70 to-emerald-300/70",
  },
  {
    id: "operations",
    number: "D",
    eyebrow: "THE SYSTEM",
    title: "Operations & enforcement",
    description: "Deadlines, withdrawals, media, sanctions, appeals, emergencies and the official administration of SSC.",
    icon: Gavel,
    chapters: [8, 9, 10, 11, 12, 13, 15],
    rail: "from-amber-300/70 to-rose-300/70",
  },
] as const;

export function RulesExperience() {
  const [mode, setMode] = useState<RulesMode>("overview");
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchSscRules(query).slice(0, 24), [query]);
  const searching = query.trim().length > 0;

  return (
    <div className="pb-20">
      <RulesHero query={query} setQuery={setQuery} />
      <ModeRail mode={mode} setMode={(next) => { setMode(next); setQuery(""); }} />

      {searching ? (
        <SearchResults query={query} results={results} clear={() => setQuery("")} />
      ) : mode === "overview" ? (
        <RuleMap />
      ) : mode === "journey" ? (
        <Journey />
      ) : mode === "check" ? (
        <CanICheck />
      ) : (
        <FullRulebook />
      )}
    </div>
  );
}

function RulesHero({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  return (
    <section className="relative isolate overflow-hidden rounded-[2.2rem] border border-sky-200/15 bg-[#06162f] shadow-[0_32px_90px_rgba(0,3,24,.35)]">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(77,172,255,.18),transparent_27%),radial-gradient(circle_at_22%_92%,rgba(142,90,255,.13),transparent_30%),linear-gradient(135deg,rgba(255,255,255,.025),transparent_42%)]" />
      <div aria-hidden="true" className="absolute inset-y-0 right-[10%] hidden w-px bg-gradient-to-b from-transparent via-white/10 to-transparent lg:block" />
      <div aria-hidden="true" className="absolute right-[4%] top-1/2 hidden -translate-y-1/2 lg:block">
        <div className="relative size-64 rounded-full border border-white/[0.055]">
          <div className="absolute inset-7 rounded-full border border-sky-200/[0.08]" />
          <div className="absolute inset-16 rounded-full border border-violet-200/[0.08]" />
          <div className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200/40 shadow-[0_0_30px_rgba(125,211,252,.5)]" />
          <span className="absolute -left-4 top-12 font-mono text-[10px] tracking-[.25em] text-sky-100/40">GOVERN</span>
          <span className="absolute -right-5 bottom-16 font-mono text-[10px] tracking-[.25em] text-violet-100/40">VERIFY</span>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[.25em] text-emerald-100/40">COMPETE</span>
        </div>
      </div>

      <div className="relative grid min-h-[31rem] lg:grid-cols-[1fr_21rem]">
        <div className="flex flex-col justify-center p-5 sm:p-8 lg:p-10 xl:p-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/15 bg-sky-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-sky-100">
              <Landmark className="size-3.5" /> TSBC Official Regulations
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Version {SSC_RULEBOOK.version}</span>
          </div>

          <div className="mt-7 max-w-4xl">
            <p className="text-[11px] font-black uppercase tracking-[.28em] text-sky-200/60">SOLARIS SONG CONTEST</p>
            <h1 className="mt-3 max-w-3xl text-5xl font-black tracking-[-.065em] text-white sm:text-6xl lg:text-7xl">The rules, mapped.</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200/72 sm:text-base">Not a PDF graveyard. Explore the Contest as a system: what you can do, what happens next, what gets checked, and the exact regulation behind every answer.</p>
          </div>

          <div className="mt-8 max-w-3xl rounded-[1.25rem] border border-white/[0.09] bg-black/20 p-2 backdrop-blur-sm">
            <label className="flex min-h-14 items-center gap-3 px-3">
              <Search className="size-5 shrink-0 text-sky-200" />
              <span className="sr-only">Search SSC rules</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ask the Rulebook: friend voting, artist reuse, late vote, anonymous report…"
                className="min-w-0 flex-1 border-0 !bg-transparent text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground/65 focus-visible:!shadow-none sm:text-base"
              />
              {query ? <button type="button" onClick={() => setQuery("")} className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-white/[0.06] hover:text-white" aria-label="Clear search"><X className="size-4" /></button> : null}
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["Artist eligibility", "artist eligibility"],
              ["Friend voting", "friend voting"],
              ["Deadlines", "deadline"],
              ["Sanctions", "sanctions"],
            ].map(([label, search]) => <button key={label} type="button" onClick={() => setQuery(search)} className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-sky-200/20 hover:text-sky-100">{label}</button>)}
          </div>
        </div>

        <div className="relative hidden items-end border-l border-white/[0.055] p-8 lg:flex">
          <div className="w-full space-y-3">
            <HeroStat value={String(RULEBOOK_STATS.chapters)} label="official chapters" />
            <HeroStat value={String(RULEBOOK_STATS.rules)} label="individual rules" />
            <HeroStat value="100%" label="online contest" />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t border-white/[0.08] py-4">
      <p className="text-3xl font-black tracking-[-.05em] text-white">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">{label}</p>
    </div>
  );
}

function ModeRail({ mode, setMode }: { mode: RulesMode; setMode: (mode: RulesMode) => void }) {
  return (
    <nav className="sticky top-2 z-30 mt-5 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#07182f]/92 p-1.5 shadow-[0_12px_35px_rgba(0,4,24,.22)] backdrop-blur-xl" aria-label="Rules views">
      <div className="grid min-w-[42rem] grid-cols-4 gap-1.5">
        {MODE_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          return (
            <button key={item.id} type="button" onClick={() => setMode(item.id)} className={cn("group flex min-h-14 items-center gap-3 rounded-xl px-3 text-left transition", active ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" : "text-muted-foreground hover:bg-white/[0.035] hover:text-white")}> 
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", active ? "border-sky-200/20 bg-sky-200/[0.08] text-sky-100" : "border-white/[0.06] bg-white/[0.025]")}><Icon className="size-4" /></span>
              <span><span className="block text-[9px] font-black uppercase tracking-[.14em] opacity-60">{item.eyebrow}</span><span className="mt-0.5 block text-xs font-bold">{item.label}</span></span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function RuleMap() {
  return (
    <div className="mt-9 space-y-12">
      <section>
        <SectionHeading eyebrow="Rule map" title="Four systems. One contest." description="Instead of making you start at Rule 1.1 and crawl downward like a bureaucratic caterpillar, the Rule Map groups the regulations by what they actually control." />
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {RULE_ZONES.map((zone) => <RuleZone key={zone.id} zone={zone} />)}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_.75fr]">
        <div>
          <SectionHeading eyebrow="High traffic" title="Rules people actually need" description="The regulations most likely to decide whether your entry, vote or last-minute panic survives contact with TSBC." />
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {QUICK_RULES.slice(0, 8).map((rule, index) => <SpotlightRule key={rule.id} rule={rule} index={index} />)}
          </div>
        </div>

        <aside className="relative overflow-hidden rounded-[1.8rem] border border-emerald-300/15 bg-[#071d31] p-6 xl:mt-[5.3rem]">
          <div aria-hidden="true" className="absolute right-[-3rem] top-[-2rem] size-40 rounded-full border border-emerald-200/[0.08]" />
          <div aria-hidden="true" className="absolute right-2 top-7 size-24 rounded-full border border-emerald-200/[0.07]" />
          <ShieldCheck className="relative size-8 text-emerald-200" />
          <p className="relative mt-6 text-[10px] font-black uppercase tracking-[.2em] text-emerald-200/70">TRUST & INTEGRITY</p>
          <h2 className="relative mt-2 text-3xl font-black tracking-[-.045em]">Rules have an enforcement path.</h2>
          <p className="relative mt-3 text-sm leading-6 text-muted-foreground">A suspected breach can become a protected case, a review, a finding and, where justified, a sanction. Those are separate stages on purpose.</p>
          <div className="relative mt-6 space-y-2">
            {[
              ["01", "Report or signal"],
              ["02", "Human review"],
              ["03", "Finding"],
              ["04", "Action / closure"],
            ].map(([number, label]) => <div key={number} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5"><span className="font-mono text-[10px] font-black text-emerald-200">{number}</span><span className="text-xs font-semibold">{label}</span></div>)}
          </div>
          <Link to="/integrity" className="relative mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-200 px-4 text-sm font-black text-emerald-950 transition hover:bg-emerald-100">Open Integrity Centre <ArrowRight className="size-4" /></Link>
        </aside>
      </section>
    </div>
  );
}

function RuleZone({ zone }: { zone: (typeof RULE_ZONES)[number] }) {
  const ZoneIcon = zone.icon;
  const chapters = zone.chapters.map((number) => SSC_RULE_CHAPTERS.find((chapter) => chapter.number === number)).filter(Boolean) as SscRuleChapter[];
  return (
    <article className="group relative overflow-hidden rounded-[1.9rem] border border-white/[0.08] bg-[#081a35]/84 p-5 sm:p-6">
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", zone.rail)} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.035]"><ZoneIcon className="size-5 text-sky-100" /></span>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.2em] text-muted-foreground">{zone.eyebrow}</p>
            <h3 className="mt-1 text-2xl font-black tracking-[-.04em]">{zone.title}</h3>
          </div>
        </div>
        <span className="font-mono text-5xl font-black text-white/[0.035]">{zone.number}</span>
      </div>
      <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{zone.description}</p>

      <div className="relative mt-6">
        <div className="absolute bottom-5 left-[1.12rem] top-5 w-px bg-white/[0.08]" />
        <div className="space-y-2">
          {chapters.map((chapter) => {
            const Icon = ICONS[chapter.icon] ?? BookOpen;
            return (
              <a key={chapter.number} href={`#chapter-${chapter.number}`} className="relative flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-3 transition hover:border-white/[0.12] hover:bg-white/[0.035]">
                <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-[#0c2345]"><Icon className="size-4 text-sky-100" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[.13em] text-muted-foreground">CHAPTER {String(chapter.number).padStart(2, "0")}</span><span className="mt-0.5 block truncate text-sm font-bold">{chapter.title}</span></span>
                <span className="text-[10px] text-muted-foreground">{chapter.rules.length} rules</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </a>
            );
          })}
        </div>
      </div>
    </article>
  );
}

function SpotlightRule({ rule, index }: { rule: SscRule; index: number }) {
  const tone = TONE_META[rule.tone];
  const ToneIcon = tone.icon;
  return (
    <Link to="/rules/$ruleId" params={{ ruleId: rule.id }} className="group relative overflow-hidden rounded-[1.45rem] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,43,74,.75),rgba(5,18,39,.93))] p-4 transition hover:-translate-y-0.5 hover:border-sky-200/20">
      <span aria-hidden="true" className="absolute -right-1 -top-5 text-7xl font-black text-white/[0.025]">{String(index + 1).padStart(2, "0")}</span>
      <div className="relative flex items-start justify-between gap-3">
        <span className="font-mono text-xs font-black text-sky-200">{rule.id}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[.08em]", tone.className)}><ToneIcon className="size-2.5" />{tone.label}</span>
      </div>
      <h3 className="relative mt-4 text-base font-black tracking-[-.02em]">{rule.title}</h3>
      <p className="relative mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{rule.summary}</p>
      <div className="relative mt-4 flex items-center gap-1 text-[11px] font-bold text-sky-200">Open regulation <ArrowRight className="size-3.5 transition group-hover:translate-x-1" /></div>
    </Link>
  );
}

function SearchResults({ query, results, clear }: { query: string; results: ReturnType<typeof searchSscRules>; clear: () => void }) {
  return (
    <section className="mt-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading eyebrow="Rulebook search" title={results.length ? `${results.length} matches for “${query}”` : `No match for “${query}”`} description={results.length ? "Search checks rule titles, explanations, official wording, examples and participant-friendly terms." : "Try a simpler situation such as artist, vote trading, deadline, Eurovision, anonymous or sanctions."} />
        <button type="button" onClick={clear} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-white">Clear search</button>
      </div>
      {results.length ? <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{results.map((rule, index) => <SpotlightRule key={rule.id} rule={rule} index={index} />)}</div> : <div className="mt-6 rounded-[1.8rem] border border-dashed border-white/10 bg-white/[0.02] p-10 text-center"><Search className="mx-auto size-8 text-muted-foreground" /><p className="mt-4 font-black">No regulation found</p><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">This is either a terminology problem or you have discovered a spectacularly specific loophole. Try broader wording first.</p></div>}
    </section>
  );
}

function Journey() {
  const [active, setActive] = useState(0);
  const stage = JOURNEY[active];
  const StageIcon = stage.icon;
  return (
    <section className="mt-9">
      <SectionHeading eyebrow="Contest journey" title="Follow one SSC edition from entry to victory" description="The regulations change meaning depending on where you are in the Contest. This view puts them in chronological order." />

      <div className="mt-6 overflow-x-auto pb-2">
        <div className="relative flex min-w-[58rem] items-center gap-0 rounded-2xl border border-white/[0.07] bg-[#07182f] p-2">
          <div className="absolute left-8 right-8 top-1/2 h-px bg-gradient-to-r from-sky-300/20 via-violet-300/25 to-amber-300/20" />
          {JOURNEY.map((item, index) => {
            const Icon = item.icon;
            const selected = index === active;
            return (
              <button key={item.step} type="button" onClick={() => setActive(index)} className="relative z-10 flex flex-1 flex-col items-center px-1 py-2 text-center">
                <span className={cn("grid size-11 place-items-center rounded-2xl border transition", selected ? "scale-110 border-sky-200/25 bg-sky-200/[0.12] text-sky-100 shadow-[0_0_0_5px_rgba(7,24,47,.95)]" : "border-white/[0.08] bg-[#0b2241] text-muted-foreground hover:text-white")}><Icon className="size-4.5" /></span>
                <span className={cn("mt-2 text-[10px] font-black uppercase tracking-[.12em]", selected ? "text-white" : "text-muted-foreground")}>{item.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[.78fr_1.22fr]">
        <article className="relative overflow-hidden rounded-[1.9rem] border border-sky-300/14 bg-[linear-gradient(145deg,rgba(24,59,94,.55),rgba(5,18,39,.94))] p-6 sm:p-7">
          <span aria-hidden="true" className="absolute -right-4 -top-10 font-mono text-[9rem] font-black text-white/[0.025]">{stage.step}</span>
          <div className="relative">
            <span className="grid size-14 place-items-center rounded-2xl border border-sky-200/16 bg-sky-200/[0.07] text-sky-100"><StageIcon className="size-6" /></span>
            <p className="mt-6 text-[10px] font-black uppercase tracking-[.24em] text-sky-200/65">{stage.kicker} · STAGE {stage.step}</p>
            <h2 className="mt-2 text-4xl font-black tracking-[-.05em]">{stage.title}</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{stage.detail}</p>
          </div>
        </article>

        <div className="rounded-[1.9rem] border border-white/[0.08] bg-[#081a35]/78 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-muted-foreground">RULES ACTIVE AT THIS STAGE</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {stage.rules.map((id, index) => {
              const rule = getRuleById(id);
              return rule ? <SpotlightRule key={id} rule={rule} index={index} /> : null;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function CanICheck() {
  return (
    <section className="mt-9">
      <SectionHeading eyebrow="Fast decision board" title="Can I…?" description="The short answer should be visible before your eyeballs have time to regret opening a rulebook." />
      <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {QUICK_CHECKS.map((item, index) => {
          const rule = getRuleById(item.rule);
          const yes = item.tone === "yes";
          const no = item.tone === "no";
          const style = yes ? "border-emerald-300/16 bg-emerald-300/[0.04]" : no ? "border-rose-300/16 bg-rose-300/[0.04]" : "border-amber-300/16 bg-amber-300/[0.04]";
          const text = yes ? "text-emerald-200" : no ? "text-rose-200" : "text-amber-200";
          return (
            <article key={item.question} className={cn("relative overflow-hidden rounded-[1.65rem] border p-5", style)}>
              <span aria-hidden="true" className="absolute right-3 top-1 font-mono text-5xl font-black text-white/[0.025]">{String(index + 1).padStart(2, "0")}</span>
              <p className="relative text-[10px] font-black uppercase tracking-[.18em] text-muted-foreground">CAN I…</p>
              <h3 className="relative mt-2 min-h-12 text-base font-black leading-6">{item.question}</h3>
              <div className={cn("relative mt-5 text-3xl font-black tracking-[-.045em]", text)}>{item.answer}</div>
              <p className="relative mt-3 text-xs leading-5 text-muted-foreground">{item.explanation}</p>
              {rule ? <Link to="/rules/$ruleId" params={{ ruleId: rule.id }} className="relative mt-5 flex min-h-10 items-center justify-between rounded-xl border border-white/[0.07] bg-black/10 px-3 text-[11px] font-bold"><span><span className="mr-2 font-mono text-sky-200">{rule.id}</span>{rule.title}</span><ChevronRight className="size-3.5" /></Link> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FullRulebook() {
  const [selectedChapter, setSelectedChapter] = useState(SSC_RULE_CHAPTERS[0]?.number ?? 1);
  const activeChapter = SSC_RULE_CHAPTERS.find((chapter) => chapter.number === selectedChapter) ?? SSC_RULE_CHAPTERS[0];
  return (
    <section className="mt-9">
      <SectionHeading eyebrow="Official rulebook" title="The complete regulations" description="This is the formal layer. Summaries help you navigate; the actual regulation text remains authoritative." />

      <div className="mt-6 grid gap-5 xl:grid-cols-[18rem_1fr]">
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-[#07182f]">
            <div className="border-b border-white/[0.07] px-4 py-3"><p className="text-[9px] font-black uppercase tracking-[.17em] text-muted-foreground">CHAPTER INDEX</p></div>
            <div className="max-h-[67vh] overflow-y-auto p-1.5">
              {SSC_RULE_CHAPTERS.map((chapter) => {
                const Icon = ICONS[chapter.icon] ?? BookOpen;
                const active = chapter.number === selectedChapter;
                return <button key={chapter.number} type="button" onClick={() => setSelectedChapter(chapter.number)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition", active ? "bg-sky-200/[0.09] text-white" : "text-muted-foreground hover:bg-white/[0.035] hover:text-white")}><span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border", active ? "border-sky-200/18 bg-sky-200/[0.07]" : "border-white/[0.06]")}><Icon className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="block text-[8px] font-black uppercase tracking-[.12em] opacity-55">CH {String(chapter.number).padStart(2, "0")}</span><span className="block truncate text-[11px] font-bold">{chapter.shortTitle}</span></span><span className="text-[9px] opacity-45">{chapter.rules.length}</span></button>;
              })}
            </div>
          </div>
        </aside>

        {activeChapter ? <ChapterSection chapter={activeChapter} /> : null}
      </div>
    </section>
  );
}

function ChapterSection({ chapter }: { chapter: SscRuleChapter }) {
  const Icon = ICONS[chapter.icon] ?? BookOpen;
  return (
    <article id={`chapter-${chapter.number}`} className="scroll-mt-28 min-w-0">
      <header className={cn("relative overflow-hidden rounded-[1.9rem] border bg-gradient-to-br p-6 sm:p-8", ACCENT_CLASSES[chapter.accent])}>
        <span aria-hidden="true" className="absolute -right-3 -top-12 font-mono text-[11rem] font-black leading-none text-white/[0.025]">{String(chapter.number).padStart(2, "0")}</span>
        <div className="relative flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/[0.09] bg-white/[0.045]"><Icon className="size-6 text-sky-100" /></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-muted-foreground">OFFICIAL CHAPTER {String(chapter.number).padStart(2, "0")}</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">{chapter.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{chapter.description}</p>
          </div>
        </div>
        <div className="relative mt-6 grid gap-2 md:grid-cols-2">
          {chapter.atAGlance.map((item) => <div key={item} className="flex gap-2.5 rounded-xl border border-white/[0.065] bg-black/10 px-3 py-3 text-xs leading-5 text-slate-200/86"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-sky-200" />{item}</div>)}
        </div>
      </header>

      <div className="mt-4 space-y-2.5">
        {chapter.rules.map((rule) => <ExpandableRule key={rule.id} rule={rule} />)}
      </div>
    </article>
  );
}

function ExpandableRule({ rule }: { rule: SscRule }) {
  const [open, setOpen] = useState(false);
  const tone = TONE_META[rule.tone];
  const ToneIcon = tone.icon;
  return (
    <div className={cn("overflow-hidden rounded-[1.4rem] border transition", open ? "border-sky-200/14 bg-[#0a1d39]" : "border-white/[0.075] bg-[#081a35]/78")}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="grid w-full grid-cols-[3.2rem_1fr_auto] items-start gap-3 p-4 text-left sm:p-5">
        <span className="grid min-h-9 place-items-center rounded-xl border border-white/[0.07] bg-black/10 font-mono text-[11px] font-black text-sky-200">{rule.id}</span>
        <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-black tracking-[-.015em]">{rule.title}</span><span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[.08em]", tone.className)}><ToneIcon className="size-2.5" />{tone.label}</span></span><span className="mt-1.5 block text-xs leading-5 text-muted-foreground sm:text-sm">{rule.summary}</span></span>
        <ChevronDown className={cn("mt-2 size-4 text-muted-foreground transition", open && "rotate-180 text-sky-200")} />
      </button>
      {open ? <div className="border-t border-white/[0.06] px-4 pb-5 pt-5 sm:px-5"><RuleContent rule={rule} /><div className="mt-5 flex flex-wrap gap-2"><Link to="/rules/$ruleId" params={{ ruleId: rule.id }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-200/15 bg-sky-200/[0.07] px-3 text-xs font-black text-sky-100">Permanent rule page <ArrowRight className="size-3.5" /></Link>{(rule.relatedRules ?? []).map((id) => { const related = getRuleById(id); return related ? <RuleChip key={id} rule={related} /> : null; })}</div></div> : null}
    </div>
  );
}

export function RuleDetail({ rule }: { rule: SscRule & { chapterNumber?: number; chapterTitle?: string; chapterSlug?: string } }) {
  const tone = TONE_META[rule.tone];
  const ToneIcon = tone.icon;
  return (
    <div className="pb-20">
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Link to="/rules" className="hover:text-white">Rules</Link><ChevronRight className="size-3" /><span>{rule.chapterTitle ?? "Official Rulebook"}</span><ChevronRight className="size-3" /><span className="text-white">{rule.id}</span></div>

      <section className="relative isolate overflow-hidden rounded-[2rem] border border-sky-200/15 bg-[#06162f] p-6 sm:p-8 lg:p-10">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_20%,rgba(82,178,255,.16),transparent_30%),linear-gradient(145deg,rgba(255,255,255,.025),transparent_50%)]" />
        <span aria-hidden="true" className="absolute -right-4 -top-8 font-mono text-[11rem] font-black text-white/[0.025]">{rule.id}</span>
        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-black text-sky-200">SSC RULE {rule.id}</span><span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[.09em]", tone.className)}><ToneIcon className="size-3" />{tone.label}</span></div>
          <h1 className="mt-5 text-4xl font-black tracking-[-.055em] sm:text-5xl lg:text-6xl">{rule.title}</h1>
          <div className="mt-6 max-w-2xl border-l-2 border-sky-200/35 pl-4"><p className="text-[9px] font-black uppercase tracking-[.2em] text-sky-200/70">AT A GLANCE</p><p className="mt-2 text-lg font-semibold leading-7 text-slate-100">{rule.summary}</p></div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_19rem]">
        <main className="rounded-[1.7rem] border border-white/[0.08] bg-[#081a35]/82 p-5 sm:p-7"><RuleContent rule={rule} large /></main>
        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">RELATED REGULATIONS</p><div className="mt-3 flex flex-col gap-2">{(rule.relatedRules ?? []).length ? (rule.relatedRules ?? []).map((id) => { const related = getRuleById(id); return related ? <RuleChip key={id} rule={related} wide /> : null; }) : <p className="text-xs text-muted-foreground">No direct related rules.</p>}</div></div>
          {rule.id.startsWith("14.") || rule.id.startsWith("7.") ? <Link to="/integrity" className="block rounded-[1.4rem] border border-emerald-300/14 bg-emerald-300/[0.045] p-4 transition hover:bg-emerald-300/[0.07]"><ShieldCheck className="size-5 text-emerald-200" /><p className="mt-3 text-sm font-black">Trust & Integrity</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Report a concern or continue a protected case.</p></Link> : null}
        </aside>
      </div>
    </div>
  );
}

function RuleContent({ rule, large = false }: { rule: SscRule; large?: boolean }) {
  return (
    <div className={cn("space-y-5", large && "space-y-6")}>
      <div className="space-y-3">{rule.body.map((paragraph) => <p key={paragraph} className={cn("leading-7 text-slate-200/85", large ? "text-[15px]" : "text-sm")}>{paragraph}</p>)}</div>
      {rule.important ? <div className="flex gap-3 rounded-2xl border border-amber-300/14 bg-amber-300/[0.05] p-4"><Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-200" /><div><p className="text-[9px] font-black uppercase tracking-[.16em] text-amber-200">THE IMPORTANT PART</p><p className="mt-1.5 text-sm leading-6 text-slate-200/90">{rule.important}</p></div></div> : null}
      <div className={cn((rule.allowed?.length && rule.prohibited?.length) ? "grid gap-3 md:grid-cols-2" : "space-y-3")}>
        {rule.allowed?.length ? <RuleList title="ALLOWED" icon={Check} items={rule.allowed} className="border-emerald-300/14 bg-emerald-300/[0.04]" iconClass="text-emerald-200" /> : null}
        {rule.prohibited?.length ? <RuleList title="NOT ALLOWED" icon={X} items={rule.prohibited} className="border-rose-300/14 bg-rose-300/[0.04]" iconClass="text-rose-200" /> : null}
      </div>
      {rule.bullets?.length ? <RuleList title="OFFICIAL POINTS" icon={ChevronRight} items={rule.bullets} className="border-sky-300/12 bg-sky-300/[0.035]" iconClass="text-sky-200" /> : null}
      {rule.examples?.length ? <div><p className="mb-3 text-[9px] font-black uppercase tracking-[.18em] text-muted-foreground">EXAMPLES</p><div className="grid gap-3 sm:grid-cols-2">{rule.examples.map((example) => <ExampleCard key={example.title} example={example} />)}</div><p className="mt-3 text-[10px] leading-5 text-muted-foreground">Examples explain ordinary application. The official wording and facts of a real case still control.</p></div> : null}
    </div>
  );
}

function RuleList({ title, icon: Icon, items, className, iconClass }: { title: string; icon: LucideIcon; items: string[]; className: string; iconClass: string }) {
  return <div className={cn("rounded-2xl border p-4", className)}><p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">{title}</p><div className="mt-3 space-y-2.5">{items.map((item) => <div key={item} className="flex gap-2.5 text-sm leading-5 text-slate-200/88"><Icon className={cn("mt-0.5 size-3.5 shrink-0", iconClass)} />{item}</div>)}</div></div>;
}

function ExampleCard({ example }: { example: NonNullable<SscRule["examples"]>[number] }) {
  const config = example.outcome === "allowed" ? { label: "ALLOWED", icon: Check, className: "border-emerald-300/14 bg-emerald-300/[0.04] text-emerald-200" } : example.outcome === "not-allowed" ? { label: "NOT ALLOWED", icon: X, className: "border-rose-300/14 bg-rose-300/[0.04] text-rose-200" } : example.outcome === "depends" ? { label: "DEPENDS", icon: AlertTriangle, className: "border-amber-300/14 bg-amber-300/[0.04] text-amber-200" } : { label: "EXAMPLE", icon: BookOpen, className: "border-sky-300/14 bg-sky-300/[0.04] text-sky-200" };
  const Icon = config.icon;
  return <div className={cn("rounded-2xl border p-4", config.className)}><p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[.13em]"><Icon className="size-3" />{config.label}</p><p className="mt-2 text-sm font-black text-foreground">{example.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{example.detail}</p></div>;
}

function RuleChip({ rule, wide = false }: { rule: SscRule; wide?: boolean }) {
  return <Link to="/rules/$ruleId" params={{ ruleId: rule.id }} className={cn("inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 text-[10px] font-semibold text-muted-foreground transition hover:border-sky-200/18 hover:bg-sky-200/[0.06] hover:text-sky-50", wide && "w-full justify-between px-3")}><span><span className="mr-1.5 font-mono font-black text-sky-200">{rule.id}</span>{rule.title}</span>{wide ? <ChevronRight className="size-3.5 shrink-0" /> : null}</Link>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-sky-200/65">{eyebrow}</p><h2 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">{title}</h2>{description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}</div>;
}
