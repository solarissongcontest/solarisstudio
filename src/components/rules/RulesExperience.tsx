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
  Gavel,
  Landmark,
  Lightbulb,
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
  sky: "from-sky-300/16 via-sky-300/5 to-transparent border-sky-300/16",
  violet: "from-violet-300/16 via-violet-300/5 to-transparent border-violet-300/16",
  emerald: "from-emerald-300/14 via-emerald-300/5 to-transparent border-emerald-300/16",
  amber: "from-amber-300/14 via-amber-300/5 to-transparent border-amber-300/16",
  rose: "from-rose-300/14 via-rose-300/5 to-transparent border-rose-300/16",
  cyan: "from-cyan-300/14 via-cyan-300/5 to-transparent border-cyan-300/16",
  indigo: "from-indigo-300/14 via-indigo-300/5 to-transparent border-indigo-300/16",
};

const MODE_ITEMS: Array<{ id: RulesMode; label: string; description: string }> = [
  { id: "overview", label: "Explore", description: "The visual overview" },
  { id: "journey", label: "Contest journey", description: "Rules in the order you need them" },
  { id: "check", label: "Can I…?", description: "Fast answers to common questions" },
  { id: "rulebook", label: "Rulebook", description: "All official regulations" },
];

const JOURNEY = [
  { step: "01", title: "Confirm", detail: "Join the edition and understand your delegation responsibilities.", rules: ["1.5", "1.6", "8.1"] },
  { step: "02", title: "Select", detail: "Choose an eligible song and artist for your fictional country.", rules: ["4.2", "4.4", "4.5", "4.6"] },
  { step: "03", title: "Submit", detail: "Verify the entry, video and artist history before the deadline.", rules: ["4.3", "4.10", "8.3"] },
  { step: "04", title: "Compete", detail: "Follow the format, running order and online presentation.", rules: ["5.1", "5.3", "10.1"] },
  { step: "05", title: "Vote", detail: "Vote independently through jury and televote systems.", rules: ["7.1", "7.3", "7.4", "7.5"] },
  { step: "06", title: "Verify", detail: "Understand friend-voting checks, declarations and evidence review.", rules: ["7.7", "7.8", "7.9", "7.10"] },
  { step: "07", title: "Results", detail: "See how results, tie-breaks and verification become official.", rules: ["5.4", "5.5", "5.7"] },
  { step: "08", title: "Host", detail: "The winner helps create the next fully online SSC edition.", rules: ["6.1", "6.2", "6.3"] },
] as const;

const QUICK_CHECKS = [
  { question: "Can I use an artist who competed in Eurovision?", answer: "No", tone: "no", rule: "4.5", explanation: "Artists who participated in the Eurovision Song Contest are not eligible under the current SSC rules." },
  { question: "Can I reuse an artist my country already sent?", answer: "Usually yes", tone: "depends", rule: "4.6", explanation: "The artist can return for the same country within the three-appearance limit, unless another eligibility rule blocks them." },
  { question: "Can another country use my previous artist?", answer: "With permission", tone: "depends", rule: "4.6", explanation: "The existing SSC artist-representation system allows this when the original delegation expressly grants permission." },
  { question: "Can I vote highly for a friend's song?", answer: "Yes", tone: "yes", rule: "7.7", explanation: "Friendship does not invalidate a vote when the score genuinely reflects your own musical preference." },
  { question: "Can we agree to give each other points?", answer: "No", tone: "no", rule: "7.5", explanation: "Reciprocal or coordinated voting arrangements are prohibited." },
  { question: "Does an automated friend-voting flag mean I cheated?", answer: "No", tone: "yes", rule: "7.8", explanation: "A statistical or automated flag is a signal for review, not proof of misconduct." },
  { question: "Can I criticise a TSBC decision?", answer: "Yes", tone: "yes", rule: "3.2", explanation: "Good-faith criticism of songs, rules and TSBC decisions is allowed." },
  { question: "Can I report a suspected rule break anonymously?", answer: "Yes", tone: "yes", rule: "14.8", explanation: "The Trust & Integrity system is designed to support protected and fully anonymous reporting." },
  { question: "Can I exploit a Solaris Studio bug if everyone could do it?", answer: "No", tone: "no", rule: "14.4", explanation: "Discovering a bug is fine. Knowingly using it for competitive advantage is not." },
] as const;

export function RulesExperience() {
  const [mode, setMode] = useState<RulesMode>("overview");
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchSscRules(query).slice(0, 24), [query]);
  const searching = query.trim().length > 0;

  return (
    <div className="pb-16">
      <RulesHero query={query} setQuery={setQuery} />

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2" role="tablist" aria-label="Ways to explore the rules">
          {MODE_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={mode === item.id}
              onClick={() => {
                setMode(item.id);
                setQuery("");
              }}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left transition sm:min-w-40",
                mode === item.id
                  ? "border-sky-200/25 bg-sky-200/[0.11] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.08)]"
                  : "border-white/[0.07] bg-white/[0.025] text-muted-foreground hover:border-white/[0.13] hover:bg-white/[0.045] hover:text-foreground",
              )}
            >
              <span className="block text-sm font-bold">{item.label}</span>
              <span className="mt-0.5 hidden text-[11px] sm:block">{item.description}</span>
            </button>
          ))}
        </div>
      </div>

      {searching ? (
        <SearchResults query={query} results={results} clear={() => setQuery("")} />
      ) : mode === "overview" ? (
        <Overview />
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
    <section className="relative overflow-hidden rounded-[2rem] border border-sky-200/15 bg-[linear-gradient(145deg,rgba(22,55,89,.93),rgba(5,19,42,.97))] p-5 shadow-[0_28px_80px_rgba(0,4,28,.24)] sm:p-8 lg:p-10">
      <div aria-hidden="true" className="absolute -right-28 -top-28 size-80 rounded-full bg-sky-300/10 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-28 left-1/4 size-72 rounded-full bg-violet-400/8 blur-3xl" />
      <div aria-hidden="true" className="absolute right-8 top-8 hidden text-[9rem] font-black leading-none text-white/[0.025] lg:block">SSC</div>

      <div className="relative max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-200/15 bg-sky-200/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[.16em] text-sky-100">Official regulations</span>
          <span className="text-xs text-muted-foreground">Version {SSC_RULEBOOK.version} · {RULEBOOK_STATS.chapters} chapters · {RULEBOOK_STATS.rules} rules</span>
        </div>
        <h1 className="max-w-3xl text-4xl font-black tracking-[-.05em] text-white sm:text-5xl lg:text-6xl">Know the rules without reading them like a court filing.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/80 sm:text-base">Explore SSC visually, search a situation, follow the Contest journey or open the exact official wording. The same rule links can be reused anywhere in Solaris Studio.</p>

        <div className="mt-7 max-w-3xl rounded-2xl border border-white/10 bg-[#07172f]/80 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.07)]">
          <label className="flex min-h-14 items-center gap-3 px-3">
            <Search className="size-5 shrink-0 text-sky-200" />
            <span className="sr-only">Search SSC rules</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rules or a situation, like ‘friend voting’, ‘Eurovision artist’ or ‘late vote’…"
              className="min-w-0 flex-1 border-0 !bg-transparent text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground/70 focus-visible:!shadow-none sm:text-base"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground" aria-label="Clear search">
                <X className="size-4" />
              </button>
            ) : null}
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <SearchChip label="Artist reuse" onClick={() => setQuery("artist reuse")} />
          <SearchChip label="Friend voting" onClick={() => setQuery("friend voting")} />
          <SearchChip label="Anonymous report" onClick={() => setQuery("anonymous report")} />
          <SearchChip label="Sanctions" onClick={() => setQuery("sanctions")} />
        </div>
      </div>
    </section>
  );
}

function SearchChip({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-muted-foreground transition hover:border-sky-200/20 hover:bg-sky-200/[0.07] hover:text-sky-50">{label}</button>;
}

function Overview() {
  return (
    <div className="mt-8 space-y-10">
      <section>
        <SectionHeading eyebrow="Explore" title="Start with what you're trying to do" description="The official chapter structure stays underneath, but these cards get you to the useful bit first." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SSC_RULE_CHAPTERS.slice(0, 8).map((chapter) => <ChapterCard key={chapter.number} chapter={chapter} />)}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_.75fr]">
        <div>
          <SectionHeading eyebrow="Most used" title="Rules people actually look for" description="Fast access to eligibility, voting, deadlines, sanctions and online integrity." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {QUICK_RULES.slice(0, 8).map((rule) => <CompactRule key={rule.id} rule={rule} />)}
          </div>
        </div>

        <aside className="relative overflow-hidden rounded-[1.7rem] border border-emerald-300/15 bg-[linear-gradient(150deg,rgba(20,74,70,.28),rgba(6,22,43,.95))] p-5 sm:p-6">
          <div aria-hidden="true" className="absolute -right-16 -top-12 size-48 rounded-full bg-emerald-300/10 blur-3xl" />
          <ShieldCheck className="relative size-8 text-emerald-200" />
          <p className="relative mt-5 text-xs font-bold uppercase tracking-[.16em] text-emerald-200/80">Trust & Integrity</p>
          <h2 className="relative mt-2 text-2xl font-black tracking-[-.035em]">Know something went wrong?</h2>
          <p className="relative mt-3 text-sm leading-6 text-muted-foreground">Report a possible rule break, ask TSBC privately or continue an anonymous two-way case without revealing your Solaris account identity.</p>
          <Link to="/integrity" className="relative mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-200 px-4 text-sm font-bold text-emerald-950 transition hover:bg-emerald-100">
            Open Integrity Centre <ArrowRight className="size-4" />
          </Link>
        </aside>
      </section>

      <section>
        <SectionHeading eyebrow="Official structure" title="All chapters" description="The complete Rulebook, still organised properly for anyone who enjoys numbered regulations more than is medically advisable." />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SSC_RULE_CHAPTERS.map((chapter) => <ChapterCard key={`all-${chapter.number}`} chapter={chapter} compact />)}
        </div>
      </section>
    </div>
  );
}

function ChapterCard({ chapter, compact = false }: { chapter: SscRuleChapter; compact?: boolean }) {
  const Icon = ICONS[chapter.icon] ?? BookOpen;
  return (
    <a
      href={`#chapter-${chapter.number}`}
      className={cn(
        "group relative overflow-hidden rounded-[1.55rem] border bg-gradient-to-br p-5 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_18px_44px_rgba(0,4,24,.18)]",
        ACCENT_CLASSES[chapter.accent],
        compact ? "min-h-36" : "min-h-44",
      )}
    >
      <span aria-hidden="true" className="absolute -right-2 -top-5 text-[5.5rem] font-black leading-none text-white/[0.035]">{String(chapter.number).padStart(2, "0")}</span>
      <span className="grid size-10 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.045] text-sky-100">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">Chapter {chapter.number}</p>
      <h3 className="mt-1 text-lg font-black tracking-[-.03em]">{chapter.title}</h3>
      {!compact ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{chapter.description}</p> : null}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{chapter.rules.length} {chapter.rules.length === 1 ? "rule" : "rules"}</span>
        <ChevronRight className="size-4 transition group-hover:translate-x-1" />
      </div>
    </a>
  );
}

function CompactRule({ rule }: { rule: SscRule & { chapterNumber?: number; chapterTitle?: string; chapterSlug?: string } }) {
  const tone = TONE_META[rule.tone];
  const ToneIcon = tone.icon;
  return (
    <Link to="/rules/$ruleId" params={{ ruleId: rule.id }} className="group rounded-[1.35rem] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(20,44,74,.74),rgba(5,18,40,.9))] p-4 transition hover:border-sky-200/20 hover:bg-sky-200/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-xs font-bold text-sky-200">{rule.id}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold", tone.className)}><ToneIcon className="size-3" />{tone.label}</span>
      </div>
      <h3 className="mt-3 font-bold tracking-[-.02em]">{rule.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{rule.summary}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-200">Read rule <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

function SearchResults({ query, results, clear }: { query: string; results: ReturnType<typeof searchSscRules>; clear: () => void }) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading eyebrow="Search results" title={results.length ? `${results.length} matches for “${query}”` : `Nothing matched “${query}”`} description={results.length ? "Results include titles, summaries, official wording, examples and common synonyms." : "Try a simpler phrase such as artist, friend voting, deadline, anonymous, Eurovision or sanctions."} />
        <button type="button" onClick={clear} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">Clear search</button>
      </div>
      {results.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {results.map((rule) => <CompactRule key={rule.id} rule={rule} />)}
        </div>
      ) : (
        <div className="mt-5 rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <Search className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-3 font-bold">No matching rule found</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">The grilled-cheese-sandwich precedent has not yet made it into SSC law. Try one of the actual Contest topics instead.</p>
        </div>
      )}
    </section>
  );
}

function Journey() {
  return (
    <section className="mt-8">
      <SectionHeading eyebrow="Contest journey" title="The rules in the order SSC happens" description="A practical route from confirmation to hosting, rather than expecting a new HoD to memorise fifteen chapters on arrival." />
      <div className="relative mt-6 space-y-3 before:absolute before:bottom-8 before:left-[1.42rem] before:top-8 before:w-px before:bg-gradient-to-b before:from-sky-300/40 before:via-violet-300/25 before:to-amber-300/30 sm:before:left-[2rem]">
        {JOURNEY.map((stage) => (
          <article key={stage.step} className="relative grid grid-cols-[3rem_1fr] gap-3 sm:grid-cols-[4rem_1fr] sm:gap-4">
            <div className="relative z-10 grid size-12 place-items-center rounded-2xl border border-sky-200/15 bg-[#0a2244] font-mono text-xs font-black text-sky-100 sm:size-16">{stage.step}</div>
            <div className="rounded-[1.45rem] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(18,42,71,.77),rgba(5,18,39,.92))] p-4 sm:p-5">
              <h3 className="text-lg font-black">{stage.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{stage.detail}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {stage.rules.map((id) => {
                  const rule = getRuleById(id);
                  return rule ? <RuleChip key={id} rule={rule} /> : null;
                })}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CanICheck() {
  return (
    <section className="mt-8">
      <SectionHeading eyebrow="Fast rule check" title="Can I…?" description="Short answers first. Open the attached rule when you need the full wording or examples." />
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {QUICK_CHECKS.map((item) => {
          const rule = getRuleById(item.rule);
          const yes = item.tone === "yes";
          const no = item.tone === "no";
          return (
            <article key={item.question} className="overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(18,42,71,.78),rgba(5,18,39,.93))]">
              <div className="flex items-start gap-4 p-5">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl border", yes ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : no ? "border-rose-300/20 bg-rose-300/10 text-rose-200" : "border-amber-300/20 bg-amber-300/10 text-amber-200")}>
                  {yes ? <Check className="size-5" /> : no ? <X className="size-5" /> : <AlertTriangle className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold leading-6">{item.question}</h3>
                  <p className={cn("mt-2 text-sm font-black", yes ? "text-emerald-200" : no ? "text-rose-200" : "text-amber-200")}>{item.answer}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.explanation}</p>
                  {rule ? <div className="mt-4"><RuleChip rule={rule} /></div> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FullRulebook() {
  return (
    <section className="mt-8">
      <SectionHeading eyebrow="Official rulebook" title="Complete regulations" description="Every chapter is shown below with a visual summary first and detailed official wording on demand." />
      <div className="mt-6 space-y-8">
        {SSC_RULE_CHAPTERS.map((chapter) => <ChapterSection key={chapter.number} chapter={chapter} />)}
      </div>
    </section>
  );
}

function ChapterSection({ chapter }: { chapter: SscRuleChapter }) {
  const Icon = ICONS[chapter.icon] ?? BookOpen;
  return (
    <article id={`chapter-${chapter.number}`} className="scroll-mt-24">
      <div className={cn("relative overflow-hidden rounded-[1.7rem] border bg-gradient-to-br p-5 sm:p-7", ACCENT_CLASSES[chapter.accent])}>
        <span aria-hidden="true" className="absolute -right-2 -top-8 text-[8rem] font-black leading-none text-white/[0.025]">{String(chapter.number).padStart(2, "0")}</span>
        <div className="relative flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/[0.09] bg-white/[0.045] text-sky-100"><Icon className="size-6" /></span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">Chapter {chapter.number}</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-.04em] sm:text-3xl">{chapter.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{chapter.description}</p>
          </div>
        </div>
        <div className="relative mt-5 grid gap-2 sm:grid-cols-2">
          {chapter.atAGlance.map((item) => <div key={item} className="flex gap-2 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5 text-xs leading-5 text-slate-200/85"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-sky-200" />{item}</div>)}
        </div>
      </div>

      <div className="mt-3 space-y-2">
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
    <div className="rounded-[1.35rem] border border-white/[0.075] bg-[#081a35]/78 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left sm:p-5">
        <span className="mt-0.5 shrink-0 font-mono text-xs font-black text-sky-200">{rule.id}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{rule.title}</span>
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.08em]", tone.className)}><ToneIcon className="size-2.5" />{tone.label}</span>
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground sm:text-sm">{rule.summary}</span>
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t border-white/[0.06] px-4 pb-5 pt-4 sm:px-5">
          <RuleContent rule={rule} />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link to="/rules/$ruleId" params={{ ruleId: rule.id }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-200/15 bg-sky-200/[0.07] px-3 text-xs font-bold text-sky-100 transition hover:bg-sky-200/[0.11]">Open standalone rule <ArrowRight className="size-3.5" /></Link>
            {(rule.relatedRules ?? []).map((id) => {
              const related = getRuleById(id);
              return related ? <RuleChip key={id} rule={related} /> : null;
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RuleDetail({ rule }: { rule: SscRule & { chapterNumber?: number; chapterTitle?: string; chapterSlug?: string } }) {
  const tone = TONE_META[rule.tone];
  const ToneIcon = tone.icon;
  return (
    <div className="pb-16">
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/rules" className="hover:text-foreground">Rules</Link>
        <ChevronRight className="size-3" />
        <span>{rule.chapterTitle ?? "Official Rulebook"}</span>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{rule.id}</span>
      </div>

      <section className="relative overflow-hidden rounded-[2rem] border border-sky-200/15 bg-[linear-gradient(145deg,rgba(22,55,89,.93),rgba(5,19,42,.97))] p-5 sm:p-8 lg:p-10">
        <div aria-hidden="true" className="absolute -right-20 -top-20 size-64 rounded-full bg-sky-300/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-black text-sky-200">RULE {rule.id}</span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em]", tone.className)}><ToneIcon className="size-3" />{tone.label}</span>
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-[-.05em] sm:text-5xl">{rule.title}</h1>
          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-200">In one sentence</p>
            <p className="mt-2 text-base font-semibold leading-7 text-slate-100 sm:text-lg">{rule.summary}</p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <main className="rounded-[1.6rem] border border-white/[0.08] bg-[#081a35]/82 p-5 sm:p-7">
          <RuleContent rule={rule} large />
        </main>
        <aside className="space-y-3">
          <div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-muted-foreground">Related rules</p>
            <div className="mt-3 flex flex-col gap-2">
              {(rule.relatedRules ?? []).length ? (rule.relatedRules ?? []).map((id) => {
                const related = getRuleById(id);
                return related ? <RuleChip key={id} rule={related} wide /> : null;
              }) : <p className="text-xs text-muted-foreground">No direct related rules.</p>}
            </div>
          </div>
          {rule.id.startsWith("14.") || rule.id.startsWith("7.") ? (
            <Link to="/integrity" className="block rounded-[1.4rem] border border-emerald-300/14 bg-emerald-300/[0.055] p-4 transition hover:bg-emerald-300/[0.08]">
              <ShieldCheck className="size-5 text-emerald-200" />
              <p className="mt-3 text-sm font-bold">Trust & Integrity</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Report a concern or learn how integrity cases work.</p>
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function RuleContent({ rule, large = false }: { rule: SscRule; large?: boolean }) {
  return (
    <div className={cn("space-y-5", large && "space-y-6")}> 
      <div className="space-y-3">
        {rule.body.map((paragraph) => <p key={paragraph} className={cn("leading-7 text-slate-200/85", large ? "text-[15px]" : "text-sm")}>{paragraph}</p>)}
      </div>

      {rule.important ? (
        <div className="flex gap-3 rounded-2xl border border-amber-300/14 bg-amber-300/[0.055] p-4">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-200" />
          <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-amber-200">The important part</p><p className="mt-1.5 text-sm leading-6 text-slate-200/90">{rule.important}</p></div>
        </div>
      ) : null}

      {rule.allowed?.length ? <RuleList title="Allowed" icon={Check} items={rule.allowed} className="border-emerald-300/14 bg-emerald-300/[0.045]" iconClass="text-emerald-200" /> : null}
      {rule.prohibited?.length ? <RuleList title="Not allowed" icon={X} items={rule.prohibited} className="border-rose-300/14 bg-rose-300/[0.045]" iconClass="text-rose-200" /> : null}
      {rule.bullets?.length ? <RuleList title="Official points" icon={ChevronRight} items={rule.bullets} className="border-sky-300/12 bg-sky-300/[0.035]" iconClass="text-sky-200" /> : null}

      {rule.examples?.length ? (
        <div>
          <p className="mb-3 text-[10px] font-black uppercase tracking-[.16em] text-muted-foreground">Examples</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {rule.examples.map((example) => <ExampleCard key={example.title} example={example} />)}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Examples explain how the rule normally works. The official wording and circumstances of a real case still control.</p>
        </div>
      ) : null}
    </div>
  );
}

function RuleList({ title, icon: Icon, items, className, iconClass }: { title: string; icon: LucideIcon; items: string[]; className: string; iconClass: string }) {
  return (
    <div className={cn("rounded-2xl border p-4", className)}>
      <p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">{title}</p>
      <div className="mt-3 space-y-2.5">
        {items.map((item) => <div key={item} className="flex gap-2.5 text-sm leading-5 text-slate-200/88"><Icon className={cn("mt-0.5 size-3.5 shrink-0", iconClass)} />{item}</div>)}
      </div>
    </div>
  );
}

function ExampleCard({ example }: { example: NonNullable<SscRule["examples"]>[number] }) {
  const config = example.outcome === "allowed"
    ? { label: "Allowed", icon: Check, className: "border-emerald-300/14 bg-emerald-300/[0.045] text-emerald-200" }
    : example.outcome === "not-allowed"
      ? { label: "Not allowed", icon: X, className: "border-rose-300/14 bg-rose-300/[0.045] text-rose-200" }
      : example.outcome === "depends"
        ? { label: "Depends", icon: AlertTriangle, className: "border-amber-300/14 bg-amber-300/[0.045] text-amber-200" }
        : { label: "Example", icon: BookOpen, className: "border-sky-300/14 bg-sky-300/[0.045] text-sky-200" };
  const Icon = config.icon;
  return (
    <div className={cn("rounded-2xl border p-4", config.className)}>
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.13em]"><Icon className="size-3" />{config.label}</p>
      <p className="mt-2 text-sm font-bold text-foreground">{example.title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{example.detail}</p>
    </div>
  );
}

function RuleChip({ rule, wide = false }: { rule: SscRule; wide?: boolean }) {
  return (
    <Link to="/rules/$ruleId" params={{ ruleId: rule.id }} className={cn("inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-2.5 text-[11px] font-semibold text-muted-foreground transition hover:border-sky-200/18 hover:bg-sky-200/[0.06] hover:text-sky-50", wide && "w-full justify-between px-3")}>
      <span><span className="mr-1.5 font-mono font-black text-sky-200">{rule.id}</span>{rule.title}</span>
      {wide ? <ChevronRight className="size-3.5 shrink-0" /> : null}
    </Link>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-200/75">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black tracking-[-.04em] sm:text-3xl">{title}</h2>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
  );
}
