import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BookOpen,
  Bot,
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
  HeartHandshake,
  Landmark,
  Lightbulb,
  ListOrdered,
  LockKeyhole,
  Map,
  MonitorSmartphone,
  Music2,
  PanelsTopLeft,
  Radio,
  RefreshCcw,
  Scale,
  SearchCheck,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UsersRound,
  Vote,
  Wifi,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  QUICK_RULES,
  SSC_RULEBOOK,
  SSC_RULE_CHAPTERS,
  getRuleById,
  searchSscRules,
  type RuleTone,
  type SscRule,
  type SscRuleChapter,
} from "@/lib/ssc-rules-v4";
import { cn } from "@/lib/utils";
import { PublicSearchField } from "@/components/public/PublicSearchField";

type Mode = "map" | "journey" | "check" | "rulebook";

const ICONS: Record<string, LucideIcon> = {
  Globe2,
  BookOpen,
  Landmark,
  MonitorSmartphone,
  UsersRound,
  Music2,
  PanelsTopLeft,
  Trophy,
  ListOrdered,
  Vote,
  ShieldCheck,
  Clock3,
  Sparkles,
  HeartHandshake,
  RefreshCcw,
  SearchCheck,
  Scale,
  Gavel,
  CloudLightning,
  SlidersHorizontal,
  FileClock,
};

const TONES: Record<RuleTone, { label: string; icon: LucideIcon; className: string }> = {
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

const ZONES = [
  {
    code: "01",
    title: "The contest & its people",
    eyebrow: "FOUNDATION",
    description: "What SSC is, who runs it, who participates and how the community is protected.",
    icon: Landmark,
    chapters: [1, 2, 3, 5, 14],
  },
  {
    code: "02",
    title: "From entry to winner",
    eyebrow: "COMPETITION",
    description:
      "Entry eligibility, show format and the creative hosting rights earned by the winner.",
    icon: Trophy,
    chapters: [6, 7, 8],
  },
  {
    code: "03",
    title: "How the result stays credible",
    eyebrow: "VOTING & TRUST",
    description:
      "Juries, televoting, anti-collusion, investigations, sanctions and appeals are separate systems on purpose.",
    icon: ShieldCheck,
    chapters: [9, 10, 11, 16, 17, 18],
  },
  {
    code: "04",
    title: "How an edition runs",
    eyebrow: "ONLINE OPERATIONS",
    description:
      "Solaris Studio, confirmations, deadlines, media, withdrawals, emergencies and edition-specific rules.",
    icon: Globe2,
    chapters: [4, 12, 13, 15, 19, 20, 21],
  },
] as const;

const JOURNEY = [
  {
    title: "Confirm",
    icon: Flag,
    detail: "Secure a place through the published confirmation process and trusted server order.",
    rules: ["4.6", "4.7", "20.1"],
  },
  {
    title: "Select",
    icon: Music2,
    detail: "Choose a song and artist that satisfy objective entry rules.",
    rules: ["6.2", "6.4", "6.5", "6.6"],
  },
  {
    title: "Submit",
    icon: CheckCircle2,
    detail: "Submit the entry and required media before the official deadline.",
    rules: ["6.3", "6.10", "12.3"],
  },
  {
    title: "Compete",
    icon: Sparkles,
    detail: "Enter the announced online show format and running order.",
    rules: ["7.1", "7.2", "13.1"],
  },
  {
    title: "Vote",
    icon: Vote,
    detail: "Jury and public votes are cast independently through official systems.",
    rules: ["9.1", "9.2", "10.1", "11.2"],
  },
  {
    title: "Verify",
    icon: ShieldCheck,
    detail: "Signals are reviewed by humans and evidence is assessed in context.",
    rules: ["11.5", "11.7", "16.1", "16.6"],
  },
  {
    title: "Results",
    icon: Trophy,
    detail: "Verified scores become the official result and determine the winner.",
    rules: ["7.3", "7.4", "7.6"],
  },
  {
    title: "Host",
    icon: Globe2,
    detail: "The winner receives creative online hosting rights for the next edition.",
    rules: ["8.1", "8.2", "8.3"],
  },
] as const;

const CHECKS = [
  {
    question: "Use an artist who competed in Eurovision?",
    answer: "NO",
    tone: "no",
    rule: "6.5",
    explanation: "Current SSC eligibility excludes artists who participated in Eurovision.",
  },
  {
    question: "Vote highly for a friend's song?",
    answer: "YES",
    tone: "yes",
    rule: "11.4",
    explanation:
      "Friendship is allowed when the score reflects your genuine independent preference.",
  },
  {
    question: "Agree to exchange high points?",
    answer: "NO",
    tone: "no",
    rule: "11.2",
    explanation: "Reciprocal or coordinated voting arrangements are prohibited.",
  },
  {
    question: "Treat a Friend Voting flag as proof?",
    answer: "NO",
    tone: "yes",
    rule: "11.5",
    explanation: "Automated analysis is a review signal, never an automatic finding.",
  },
  {
    question: "Use a bot to win a confirmation place?",
    answer: "NO",
    tone: "no",
    rule: "4.3",
    explanation: "Automation cannot be used to obtain unfair competitive rights.",
  },
  {
    question: "Punish a community issue by randomly removing song points?",
    answer: "NOT BY DEFAULT",
    tone: "depends",
    rule: "17.1",
    explanation: "The response should target the actual breach and be proportionate.",
  },
  {
    question: "Criticise TSBC or a rule?",
    answer: "YES",
    tone: "yes",
    rule: "14.2",
    explanation: "Good-faith criticism is expressly allowed.",
  },
  {
    question: "Report a concern anonymously?",
    answer: "YES",
    tone: "yes",
    rule: "16.3",
    explanation: "The integrity system supports protected anonymous reporting.",
  },
  {
    question: "Let edition rules silently override the General Regulations?",
    answer: "NO",
    tone: "no",
    rule: "20.2",
    explanation: "Edition rules control only the variables the General Regulations allow to vary.",
  },
] as const;

export function RulesExperience() {
  const [mode, setMode] = useState<Mode>("map");
  const [query, setQuery] = useState("");
  const [selectedChapter, setSelectedChapter] = useState(1);
  const results = useMemo(() => searchSscRules(query).slice(0, 24), [query]);

  const openChapter = (chapter: number) => {
    setSelectedChapter(chapter);
    setMode("rulebook");
    setQuery("");
  };

  return (
    <div className="pb-20">
      <Hero query={query} setQuery={setQuery} />
      <ModeRail
        mode={mode}
        setMode={(next) => {
          setMode(next);
          setQuery("");
        }}
      />
      {query.trim() ? (
        <SearchView query={query} results={results} />
      ) : mode === "map" ? (
        <RuleMap openChapter={openChapter} />
      ) : mode === "journey" ? (
        <Journey />
      ) : mode === "check" ? (
        <CanICheck />
      ) : (
        <Rulebook selectedChapter={selectedChapter} setSelectedChapter={setSelectedChapter} />
      )}
    </div>
  );
}

function Hero({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  return (
    <section className="rounded-[1.6rem] border border-sky-200/12 bg-[#06152d] p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-sky-200/14 bg-sky-200/[0.05] px-2.5 py-1 text-[9px] font-black uppercase tracking-[.16em] text-sky-100">
          Official rules
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[.13em] text-muted-foreground">
          v{SSC_RULEBOOK.version}
        </span>
      </div>
      <h1 className="mt-4 text-3xl font-black tracking-[-.04em] text-white sm:text-4xl">
        Rulebook
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200/70">
        Read or search the official SSC regulations.
      </p>
      <PublicSearchField
        value={query}
        onChange={setQuery}
        placeholder="Search rules"
        ariaLabel="Search SSC rules"
        className="mt-5 max-w-2xl"
      />
    </section>
  );
}

function ModeRail({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  const items: Array<[Mode, string, string, LucideIcon]> = [
    ["map", "Rule map", "EXPLORE", Map],
    ["journey", "Contest journey", "FOLLOW", Flag],
    ["check", "Can I…?", "DECIDE", CheckCircle2],
    ["rulebook", "Official rulebook", "READ", BookOpen],
  ];
  return (
    <nav
      className="sticky top-2 z-30 mt-5 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#07182f]/94 p-1.5 backdrop-blur-xl"
      aria-label="Rules views"
    >
      <div className="grid min-w-[42rem] grid-cols-4 gap-1">
        {items.map(([id, label, eyebrow, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl px-3 text-left transition",
              mode === id
                ? "bg-white/[0.09] text-white shadow-inner"
                : "text-muted-foreground hover:bg-white/[0.035] hover:text-white",
            )}
          >
            <span className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025]">
              <Icon className="size-4" />
            </span>
            <span>
              <span className="block text-[8px] font-black tracking-[.15em] opacity-60">
                {eyebrow}
              </span>
              <span className="block text-xs font-bold">{label}</span>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function RuleMap({ openChapter }: { openChapter: (chapter: number) => void }) {
  return (
    <div className="mt-10 space-y-12">
      <IdentityBoard openChapter={openChapter} />
      <EligibilityFlow />
      <OperationalLogic />
      <section>
        <SectionHeading
          eyebrow="RULE MAP"
          title="Four systems. Twenty-one chapters."
          description="The visual overview is grouped by what the rules control. The legal numbering stays precise underneath."
        />
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {ZONES.map((zone) => (
            <ZoneCard key={zone.code} zone={zone} openChapter={openChapter} />
          ))}
        </div>
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.4fr_.75fr]">
        <div>
          <SectionHeading eyebrow="HIGH TRAFFIC" title="Frequently used rules" />
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {QUICK_RULES.slice(0, 8).map((rule, index) => (
              <RuleCard key={rule.id} rule={rule} index={index} />
            ))}
          </div>
        </div>
        <aside className="relative overflow-hidden rounded-[1.8rem] border border-emerald-300/14 bg-emerald-300/[0.04] p-6 xl:mt-[4.3rem]">
          <ShieldCheck className="size-7 text-emerald-200" />
          <p className="mt-6 text-[9px] font-black uppercase tracking-[.2em] text-emerald-200/70">
            INTEGRITY PATH
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-[-.045em]">
            A concern is not a conviction.
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Reporting, investigation, findings, sanctions and appeals are separate stages. Automated
            signals require human review.
          </p>
          <div className="mt-5 space-y-2">
            {[
              "Report or signal",
              "Human review",
              "Finding",
              "Proportionate action",
              "Appeal where applicable",
            ].map((label, index) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5"
              >
                <span className="font-mono text-[10px] font-black text-emerald-200">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-xs font-semibold">{label}</span>
              </div>
            ))}
          </div>
          <Link
            to="/integrity"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-200 px-4 text-sm font-black text-emerald-950"
          >
            Open Integrity Centre <ArrowRight className="size-4" />
          </Link>
        </aside>
      </section>
    </div>
  );
}

function IdentityBoard({ openChapter }: { openChapter: (chapter: number) => void }) {
  const identity = [
    {
      icon: Wifi,
      kicker: "FORMAT",
      value: "100% online",
      detail: "No physical attendance, travel or venue is required to participate.",
    },
    {
      icon: Flag,
      kicker: "COUNTRIES",
      value: "Fictional",
      detail: "A Country is an SSC identity. The Participant behind it is a real person.",
    },
    {
      icon: Radio,
      kicker: "PRESENTATION",
      value: "Creative fiction",
      detail: "Hosting, stages and broadcasts describe the online contest presentation.",
    },
    {
      icon: LockKeyhole,
      kicker: "REAL-WORLD RIGHTS",
      value: "Stay external",
      detail: "Artists, songs, labels and platforms do not become SSC property or partners.",
    },
  ];
  return (
    <section>
      <SectionHeading
        eyebrow="START HERE"
        title="What Solaris Song Contest is"
        description="Start with the contest format and participant roles before opening individual regulations."
      />
      <div className="mt-6 grid overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#07182f] md:grid-cols-2 xl:grid-cols-4">
        {identity.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.value}
              className={cn(
                "relative min-h-56 p-6",
                index > 0 && "border-t border-white/[0.07] md:border-l",
                index > 1 && "md:border-t xl:border-t-0",
              )}
            >
              <span className="grid size-12 place-items-center rounded-2xl border border-sky-200/12 bg-sky-200/[0.06]">
                <Icon className="size-5 text-sky-100" />
              </span>
              <p className="mt-7 text-[9px] font-black uppercase tracking-[.2em] text-sky-200/55">
                {item.kicker}
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-[-.04em]">{item.value}</h3>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openChapter(1)}
          className="rounded-full border border-sky-200/12 bg-sky-200/[0.05] px-3 py-1.5 text-[10px] font-black text-sky-100"
        >
          READ CHAPTER 01
        </button>
        <button
          type="button"
          onClick={() => openChapter(2)}
          className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] font-black text-muted-foreground hover:text-white"
        >
          OPEN DEFINITIONS
        </button>
      </div>
    </section>
  );
}

function EligibilityFlow() {
  const gates = [
    {
      step: "01",
      title: "Song available",
      detail: "Official studio recording on Spotify and suitable presentation media.",
      rule: "6.2",
    },
    {
      step: "02",
      title: "Popularity check",
      detail:
        "Under 25M Spotify monthly listeners and under 20M official-video views at the official check time.",
      rule: "6.4",
    },
    {
      step: "03",
      title: "Contest-history check",
      detail: "Eurovision and relevant National Selection restrictions are applied.",
      rule: "6.5",
    },
    {
      step: "04",
      title: "Reuse check",
      detail: "SSC artist reuse and previous-winner restrictions are checked as contest mechanics.",
      rule: "6.6",
    },
    {
      step: "05",
      title: "Verified entry",
      detail:
        "TSBC records the eligibility reference time. Later popularity growth does not retroactively invalidate acceptance.",
      rule: "6.10",
    },
  ];
  return (
    <section>
      <SectionHeading
        eyebrow="ENTRY ELIGIBILITY"
        title="One entry. Five checks."
        description="Follow the order used to check whether an entry is eligible."
      />
      <div className="mt-6 grid gap-3 lg:grid-cols-5">
        {gates.map((gate, index) => (
          <div key={gate.step} className="relative">
            <Link
              to="/rules/$ruleId"
              params={{ ruleId: gate.rule }}
              className="group block h-full min-h-56 rounded-[1.6rem] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(17,49,82,.82),rgba(5,18,39,.95))] p-5 transition hover:-translate-y-1 hover:border-sky-200/20"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-3xl font-black text-white/[0.14]">{gate.step}</span>
                <span className="grid size-8 place-items-center rounded-full border border-emerald-300/15 bg-emerald-300/[0.06]">
                  <Check className="size-3.5 text-emerald-200" />
                </span>
              </div>
              <h3 className="mt-7 text-lg font-black tracking-[-.025em]">{gate.title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{gate.detail}</p>
              <p className="mt-5 font-mono text-[10px] font-black text-sky-200">RULE {gate.rule}</p>
            </Link>
            {index < gates.length - 1 ? (
              <ArrowRight
                aria-hidden="true"
                className="absolute -right-[1.05rem] top-1/2 z-10 hidden size-5 -translate-y-1/2 text-sky-200/35 lg:block"
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function OperationalLogic() {
  const columns = [
    {
      icon: Clock3,
      label: "CONFIRMATIONS",
      title: "Server time wins",
      body: "Published opening time → valid submission → trusted server receipt order.",
      footer: "A phone countdown is not the legal clock.",
      rule: "4.6",
    },
    {
      icon: Bot,
      label: "FRIEND VOTING",
      title: "Flag ≠ guilt",
      body: "Pattern signal → human review → evidence in context → finding.",
      footer: "Friendship itself remains allowed.",
      rule: "11.5",
    },
    {
      icon: Scale,
      label: "SANCTIONS",
      title: "Fix the actual breach",
      body: "Invalid vote → correct the vote. Ineligible entry → address the entry. Harassment → address the person.",
      footer: "Random point deductions are not the default.",
      rule: "17.1",
    },
    {
      icon: Trophy,
      label: "HOSTING",
      title: "Creative, not physical",
      body: "Winner → creative hosting rights → theme, artwork, fictional stage and presentation.",
      footer: "TSBC keeps operational authority.",
      rule: "8.1",
    },
  ];
  return (
    <section>
      <SectionHeading
        eyebrow="THE LOGIC OF THE RULES"
        title="Four rules people should understand in ten seconds"
      />
      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        {columns.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to="/rules/$ruleId"
              params={{ ruleId: item.rule }}
              className="group rounded-[1.7rem] border border-white/[0.08] bg-[#081a35]/84 p-5 transition hover:border-sky-200/18"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-2xl border border-white/[0.08] bg-black/10">
                  <Icon className="size-5 text-sky-100" />
                </span>
                <span className="font-mono text-[10px] font-black text-sky-200">{item.rule}</span>
              </div>
              <p className="mt-6 text-[9px] font-black uppercase tracking-[.17em] text-muted-foreground">
                {item.label}
              </p>
              <h3 className="mt-2 text-xl font-black tracking-[-.035em]">{item.title}</h3>
              <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/10 p-3 text-xs font-semibold leading-5 text-slate-200/85">
                {item.body}
              </div>
              <p className="mt-4 text-[11px] leading-5 text-muted-foreground">{item.footer}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ZoneCard({
  zone,
  openChapter,
}: {
  zone: (typeof ZONES)[number];
  openChapter: (chapter: number) => void;
}) {
  const ZoneIcon = zone.icon;
  return (
    <article className="relative overflow-hidden rounded-[1.9rem] border border-white/[0.08] bg-[#081a35]/84 p-5 sm:p-6">
      <span
        aria-hidden="true"
        className="absolute -right-2 -top-8 font-mono text-[7rem] font-black text-white/[0.025]"
      >
        {zone.code}
      </span>
      <div className="relative flex gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.035]">
          <ZoneIcon className="size-5 text-sky-100" />
        </span>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.2em] text-sky-200/60">
            {zone.eyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-[-.04em]">{zone.title}</h2>
        </div>
      </div>
      <p className="relative mt-4 text-sm leading-6 text-muted-foreground">{zone.description}</p>
      <div className="relative mt-5 space-y-2">
        {zone.chapters.map((number) => {
          const chapter = SSC_RULE_CHAPTERS.find((item) => item.number === number);
          if (!chapter) return null;
          const ChapterIcon = ICONS[chapter.icon] ?? BookOpen;
          return (
            <button
              key={number}
              type="button"
              onClick={() => openChapter(number)}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-3 text-left transition hover:border-sky-200/16 hover:bg-sky-200/[0.04]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-[#0c2345]">
                <ChapterIcon className="size-4 text-sky-100" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[8px] font-black uppercase tracking-[.14em] text-muted-foreground">
                  CHAPTER {String(number).padStart(2, "0")}
                </span>
                <span className="mt-0.5 block truncate text-sm font-bold">{chapter.title}</span>
              </span>
              <span className="text-[9px] text-muted-foreground">{chapter.rules.length}</span>
              <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>
    </article>
  );
}

function Journey() {
  const [active, setActive] = useState(0);
  const stage = JOURNEY[active];
  const ActiveIcon = stage.icon;
  return (
    <section className="mt-10">
      <SectionHeading
        eyebrow="CONTEST JOURNEY"
        title="One edition, from confirmation to hosting"
        description="Select a stage to see the relevant regulations."
      />
      <div className="mt-6 overflow-x-auto pb-2">
        <div className="relative flex min-w-[58rem] rounded-2xl border border-white/[0.07] bg-[#07182f] p-2">
          <div className="absolute left-8 right-8 top-[1.85rem] h-px bg-white/[0.09]" />
          {JOURNEY.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => setActive(index)}
                className="relative z-10 flex flex-1 flex-col items-center py-1.5"
              >
                <span
                  className={cn(
                    "grid size-11 place-items-center rounded-2xl border bg-[#0b2241] transition",
                    active === index
                      ? "scale-110 border-sky-200/25 text-sky-100 shadow-[0_0_0_5px_#07182f]"
                      : "border-white/[0.08] text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span
                  className={cn(
                    "mt-2 text-[10px] font-black uppercase tracking-[.11em]",
                    active === index ? "text-white" : "text-muted-foreground",
                  )}
                >
                  {item.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-4 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
        <div className="relative overflow-hidden rounded-[1.9rem] border border-sky-300/14 bg-[linear-gradient(145deg,rgba(24,59,94,.55),rgba(5,18,39,.94))] p-7">
          <span className="grid size-14 place-items-center rounded-2xl border border-sky-200/16 bg-sky-200/[0.07] text-sky-100">
            <ActiveIcon className="size-6" />
          </span>
          <p className="mt-6 text-[9px] font-black uppercase tracking-[.2em] text-sky-200/60">
            CURRENT STAGE
          </p>
          <h2 className="mt-2 text-4xl font-black tracking-[-.05em]">{stage.title}</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">{stage.detail}</p>
          <div className="mt-7 flex justify-center">
            <ArrowDown className="size-5 text-sky-200/35" />
          </div>
        </div>
        <div className="rounded-[1.9rem] border border-white/[0.08] bg-[#081a35]/78 p-5">
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-muted-foreground">
            RULES ACTIVE HERE
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {stage.rules.map((id, index) => {
              const rule = getRuleById(id);
              return rule ? <RuleCard key={id} rule={rule} index={index} /> : null;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function CanICheck() {
  return (
    <section className="mt-10">
      <SectionHeading
        eyebrow="FAST DECISIONS"
        title="Can I…?"
        description="The useful answer first, the legal text one click behind it."
      />
      <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {CHECKS.map((item, index) => {
          const yes = item.tone === "yes";
          const no = item.tone === "no";
          const className = yes
            ? "border-emerald-300/16 bg-emerald-300/[0.04]"
            : no
              ? "border-rose-300/16 bg-rose-300/[0.04]"
              : "border-amber-300/16 bg-amber-300/[0.04]";
          const textClass = yes ? "text-emerald-200" : no ? "text-rose-200" : "text-amber-200";
          return (
            <article
              key={item.question}
              className={cn("relative overflow-hidden rounded-[1.65rem] border p-5", className)}
            >
              <span
                aria-hidden="true"
                className="absolute right-3 top-1 font-mono text-5xl font-black text-white/[0.025]"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-muted-foreground">
                CAN I…
              </p>
              <h3 className="mt-2 min-h-12 text-base font-black leading-6">{item.question}</h3>
              <div className={cn("mt-5 text-3xl font-black tracking-[-.045em]", textClass)}>
                {item.answer}
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.explanation}</p>
              <Link
                to="/rules/$ruleId"
                params={{ ruleId: item.rule }}
                className="mt-5 flex min-h-10 items-center justify-between rounded-xl border border-white/[0.07] bg-black/10 px-3 text-[11px] font-bold"
              >
                <span>
                  <span className="mr-2 font-mono text-sky-200">{item.rule}</span>
                  {getRuleById(item.rule)?.title}
                </span>
                <ChevronRight className="size-3.5" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SearchView({
  query,
  results,
}: {
  query: string;
  results: ReturnType<typeof searchSscRules>;
}) {
  return (
    <section className="mt-10">
      <SectionHeading
        eyebrow="RULEBOOK SEARCH"
        title={
          results.length ? `${results.length} matches for “${query}”` : `No match for “${query}”`
        }
        description={
          results.length
            ? "Search checks official wording, summaries, examples and participant-friendly terms."
            : "Try a broader phrase such as confirmation, friend voting, Eurovision, deadline or sanctions."
        }
      />
      {results.length ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {results.map((rule, index) => (
            <RuleCard key={rule.id} rule={rule} index={index} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Rulebook({
  selectedChapter,
  setSelectedChapter,
}: {
  selectedChapter: number;
  setSelectedChapter: (number: number) => void;
}) {
  const chapter =
    SSC_RULE_CHAPTERS.find((item) => item.number === selectedChapter) ?? SSC_RULE_CHAPTERS[0];
  return (
    <section className="mt-10">
      <SectionHeading
        eyebrow="OFFICIAL RULEBOOK"
        title="The complete General Regulations"
        description="The visual layers explain. This layer governs."
      />
      <div className="mt-6 grid gap-5 xl:grid-cols-[19rem_1fr]">
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-[#07182f]">
            <div className="border-b border-white/[0.07] px-4 py-3 text-[9px] font-black uppercase tracking-[.17em] text-muted-foreground">
              21-CHAPTER INDEX
            </div>
            <div className="max-h-[68vh] overflow-y-auto p-1.5">
              {SSC_RULE_CHAPTERS.map((item) => {
                const Icon = ICONS[item.icon] ?? BookOpen;
                const active = item.number === selectedChapter;
                return (
                  <button
                    key={item.number}
                    type="button"
                    onClick={() => setSelectedChapter(item.number)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                      active
                        ? "bg-sky-200/[0.09] text-white"
                        : "text-muted-foreground hover:bg-white/[0.035] hover:text-white",
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.06]">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[8px] font-black uppercase tracking-[.12em] opacity-55">
                        CH {String(item.number).padStart(2, "0")}
                      </span>
                      <span className="block truncate text-[11px] font-bold">
                        {item.shortTitle}
                      </span>
                    </span>
                    <span className="text-[9px] opacity-45">{item.rules.length}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
        <ChapterSection chapter={chapter} />
      </div>
    </section>
  );
}

function ChapterSection({ chapter }: { chapter: SscRuleChapter }) {
  const Icon = ICONS[chapter.icon] ?? BookOpen;
  return (
    <article className="min-w-0">
      <header className="relative overflow-hidden rounded-[1.9rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(18,44,75,.78),rgba(6,20,42,.95))] p-6 sm:p-8">
        <span
          aria-hidden="true"
          className="absolute -right-3 -top-12 font-mono text-[11rem] font-black leading-none text-white/[0.025]"
        >
          {String(chapter.number).padStart(2, "0")}
        </span>
        <div className="relative flex gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/[0.09] bg-white/[0.045]">
            <Icon className="size-6 text-sky-100" />
          </span>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.2em] text-muted-foreground">
              OFFICIAL CHAPTER {String(chapter.number).padStart(2, "0")}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">
              {chapter.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {chapter.description}
            </p>
          </div>
        </div>
        <div className="relative mt-6 grid gap-2 md:grid-cols-2">
          {chapter.atAGlance.map((item) => (
            <div
              key={item}
              className="flex gap-2.5 rounded-xl border border-white/[0.065] bg-black/10 px-3 py-3 text-xs leading-5 text-slate-200/86"
            >
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-sky-200" />
              {item}
            </div>
          ))}
        </div>
      </header>
      <div className="mt-4 space-y-2.5">
        {chapter.rules.map((rule) => (
          <ExpandableRule key={rule.id} rule={rule} />
        ))}
      </div>
    </article>
  );
}

function RuleCard({ rule, index }: { rule: SscRule; index: number }) {
  const tone = TONES[rule.tone];
  const ToneIcon = tone.icon;
  return (
    <Link
      to="/rules/$ruleId"
      params={{ ruleId: rule.id }}
      className="group relative overflow-hidden rounded-[1.45rem] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,43,74,.75),rgba(5,18,39,.93))] p-4 transition hover:-translate-y-0.5 hover:border-sky-200/20"
    >
      <span
        aria-hidden="true"
        className="absolute -right-1 -top-5 text-7xl font-black text-white/[0.025]"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="relative flex items-start justify-between gap-3">
        <span className="font-mono text-xs font-black text-sky-200">{rule.id}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[.08em]",
            tone.className,
          )}
        >
          <ToneIcon className="size-2.5" />
          {tone.label}
        </span>
      </div>
      <h3 className="relative mt-4 text-base font-black tracking-[-.02em]">{rule.title}</h3>
      <p className="relative mt-1.5 text-xs leading-5 text-muted-foreground">{rule.summary}</p>
      <div className="relative mt-4 flex items-center gap-1 text-[11px] font-bold text-sky-200">
        Open regulation <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function ExpandableRule({ rule }: { rule: SscRule }) {
  const [open, setOpen] = useState(false);
  const tone = TONES[rule.tone];
  const ToneIcon = tone.icon;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.4rem] border transition",
        open ? "border-sky-200/14 bg-[#0a1d39]" : "border-white/[0.075] bg-[#081a35]/78",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[3.2rem_1fr_auto] items-start gap-3 p-4 text-left sm:p-5"
      >
        <span className="grid min-h-9 place-items-center rounded-xl border border-white/[0.07] bg-black/10 font-mono text-[11px] font-black text-sky-200">
          {rule.id}
        </span>
        <span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-black">{rule.title}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase",
                tone.className,
              )}
            >
              <ToneIcon className="size-2.5" />
              {tone.label}
            </span>
          </span>
          <span className="mt-1.5 block text-xs leading-5 text-muted-foreground sm:text-sm">
            {rule.summary}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-2 size-4 text-muted-foreground transition",
            open && "rotate-180 text-sky-200",
          )}
        />
      </button>
      {open ? (
        <div className="border-t border-white/[0.06] px-4 pb-5 pt-5 sm:px-5">
          <RuleContent rule={rule} />
          <Link
            to="/rules/$ruleId"
            params={{ ruleId: rule.id }}
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-200/15 bg-sky-200/[0.07] px-3 text-xs font-black text-sky-100"
          >
            Permanent rule page <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function RuleDetail({
  rule,
}: {
  rule: SscRule & { chapterNumber?: number; chapterTitle?: string; chapterSlug?: string };
}) {
  const tone = TONES[rule.tone];
  const ToneIcon = tone.icon;
  return (
    <div className="pb-20">
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/rules" className="hover:text-white">
          Rules
        </Link>
        <ChevronRight className="size-3" />
        <span>{rule.chapterTitle ?? "Official Rulebook"}</span>
        <ChevronRight className="size-3" />
        <span className="text-white">{rule.id}</span>
      </div>
      <section className="relative overflow-hidden rounded-[2rem] border border-sky-200/15 bg-[#06162f] p-6 sm:p-8 lg:p-10">
        <span
          aria-hidden="true"
          className="absolute -right-4 -top-8 font-mono text-[11rem] font-black text-white/[0.025]"
        >
          {rule.id}
        </span>
        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-black text-sky-200">SSC RULE {rule.id}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase",
                tone.className,
              )}
            >
              <ToneIcon className="size-3" />
              {tone.label}
            </span>
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-[-.055em] sm:text-5xl lg:text-6xl">
            {rule.title}
          </h1>
          <div className="mt-6 max-w-2xl border-l-2 border-sky-200/35 pl-4">
            <p className="text-[9px] font-black uppercase tracking-[.2em] text-sky-200/70">
              AT A GLANCE
            </p>
            <p className="mt-2 text-lg font-semibold leading-7 text-slate-100">{rule.summary}</p>
          </div>
        </div>
      </section>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_19rem]">
        <div className="rounded-[1.7rem] border border-white/[0.08] bg-[#081a35]/82 p-5 sm:p-7">
          <RuleContent rule={rule} />
        </div>
        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">
              RELATED REGULATIONS
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {(rule.relatedRules ?? []).map((id) => {
                const related = getRuleById(id);
                return related ? (
                  <Link
                    key={id}
                    to="/rules/$ruleId"
                    params={{ ruleId: related.id }}
                    className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/10 px-3 py-2 text-xs"
                  >
                    <span>
                      <span className="mr-2 font-mono text-sky-200">{related.id}</span>
                      {related.title}
                    </span>
                    <ChevronRight className="size-3.5" />
                  </Link>
                ) : null;
              })}
            </div>
          </div>
          {rule.chapterNumber === 11 || rule.chapterNumber === 16 || rule.chapterNumber === 17 ? (
            <Link
              to="/integrity"
              className="block rounded-[1.4rem] border border-emerald-300/14 bg-emerald-300/[0.045] p-4"
            >
              <ShieldCheck className="size-5 text-emerald-200" />
              <p className="mt-3 text-sm font-black">Trust & Integrity</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Report a concern or continue a protected case.
              </p>
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function RuleContent({ rule }: { rule: SscRule }) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {rule.body.map((paragraph) => (
          <p key={paragraph} className="text-sm leading-7 text-slate-200/85">
            {paragraph}
          </p>
        ))}
      </div>
      {rule.important ? (
        <div className="flex gap-3 rounded-2xl border border-amber-300/14 bg-amber-300/[0.05] p-4">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-200" />
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-amber-200">
              THE IMPORTANT PART
            </p>
            <p className="mt-1.5 text-sm leading-6 text-slate-200/90">{rule.important}</p>
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          rule.allowed?.length && rule.prohibited?.length
            ? "grid gap-3 md:grid-cols-2"
            : "space-y-3",
        )}
      >
        {rule.allowed?.length ? (
          <List
            title="ALLOWED"
            icon={Check}
            items={rule.allowed}
            className="border-emerald-300/14 bg-emerald-300/[0.04]"
          />
        ) : null}
        {rule.prohibited?.length ? (
          <List
            title="NOT ALLOWED"
            icon={X}
            items={rule.prohibited}
            className="border-rose-300/14 bg-rose-300/[0.04]"
          />
        ) : null}
      </div>
      {rule.bullets?.length ? (
        <List
          title="OFFICIAL POINTS"
          icon={ChevronRight}
          items={rule.bullets}
          className="border-sky-300/12 bg-sky-300/[0.035]"
        />
      ) : null}
      {rule.examples?.length ? (
        <div>
          <p className="mb-3 text-[9px] font-black uppercase tracking-[.18em] text-muted-foreground">
            EXAMPLES
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {rule.examples.map((example) => (
              <div
                key={example.title}
                className="rounded-2xl border border-white/[0.08] bg-black/10 p-4"
              >
                <p className="text-[9px] font-black uppercase tracking-[.12em] text-sky-200">
                  {example.outcome.replace("-", " ")}
                </p>
                <p className="mt-2 text-sm font-black">{example.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{example.detail}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function List({
  title,
  icon: Icon,
  items,
  className,
}: {
  title: string;
  icon: LucideIcon;
  items: string[];
  className: string;
}) {
  return (
    <div className={cn("rounded-2xl border p-4", className)}>
      <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">
        {title}
      </p>
      <div className="mt-3 space-y-2.5">
        {items.map((item) => (
          <div key={item} className="flex gap-2.5 text-sm leading-5 text-slate-200/88">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-sky-200" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[.22em] text-sky-200/65">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
