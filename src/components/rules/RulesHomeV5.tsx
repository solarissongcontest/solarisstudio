import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flag,
  History,
  Map,
  MessageCircleQuestion,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import {
  GOVERNANCE_ACTION_STORAGE_KEY,
  RULE_CONTEXT_STORAGE_KEY,
} from "@/components/rules/RulesGovernanceContext";
import {
  GOVERNANCE_ACTION_KEYS,
  GOVERNANCE_QUICK_ANSWERS,
  type GovernanceActionKey,
} from "@/lib/governance-v5";
import { getRuleContext } from "@/lib/rule-context";
import { ROLEPLAY_QUICK_ANSWERS } from "@/lib/ssc-rules/roleplay";

function actionFromStoredPath(path: string | null): GovernanceActionKey | null {
  if (!path) return null;
  const context = getRuleContext(path);
  if (!context) return null;
  if (context.key === "confirmations") return "confirmation.submit";
  if (context.key === "jury") return "jury.vote";
  if (context.key === "televoting") return "televote.vote";
  if (context.key === "entries") return "entry.submit";
  if (context.key === "integrity") return "integrity.report";
  if (context.key === "hosting-media") return "hosting.accept";
  return null;
}

const FOR_YOU_COPY: Partial<Record<GovernanceActionKey, { title: string; description: string }>> = {
  "confirmation.submit": {
    title: "Confirmation rules",
    description: "Opening time, trusted server order and fair access.",
  },
  "entry.submit": {
    title: "Rules for your entry task",
    description: "Eligibility, verification and submission deadlines.",
  },
  "jury.vote": {
    title: "Jury voting rules",
    description: "Independent judgement, coordination and integrity review.",
  },
  "televote.vote": {
    title: "Televoting rules",
    description: "Official voting, genuine preference and anti-coordination.",
  },
  "integrity.report": {
    title: "Trust & Integrity rules",
    description: "Reporting, privacy and fair investigation.",
  },
  "hosting.accept": {
    title: "Hosting rules",
    description: "Creative hosting rights and TSBC operational authority.",
  },
};

function formatEffectiveDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function RulesHomeV5({
  version,
  effectiveFrom,
}: {
  version: string;
  effectiveFrom?: string | null;
}) {
  const { isAppMode } = useSolarisApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [context, setContext] = useState<GovernanceActionKey | null>(null);
  const effectiveDate = formatEffectiveDate(effectiveFrom);

  useEffect(() => {
    try {
      const storedAction = window.sessionStorage.getItem(GOVERNANCE_ACTION_STORAGE_KEY);
      if (
        storedAction &&
        GOVERNANCE_ACTION_KEYS.includes(storedAction as GovernanceActionKey)
      ) {
        setContext(storedAction as GovernanceActionKey);
        return;
      }
      setContext(
        actionFromStoredPath(
          window.sessionStorage.getItem(RULE_CONTEXT_STORAGE_KEY),
        ),
      );
    } catch {
      setContext(null);
    }
  }, []);

  const quick = useMemo(
    () => [ROLEPLAY_QUICK_ANSWERS[1], GOVERNANCE_QUICK_ANSWERS[0], ROLEPLAY_QUICK_ANSWERS[2], GOVERNANCE_QUICK_ANSWERS[2]],
    [],
  );
  const forYou = context ? FOR_YOU_COPY[context] : null;

  const submitSearch = () => {
    const q = query.trim();
    if (!q) return;
    void navigate({ to: "/rules/search", search: { q } });
  };

  return (
    <SolarisDepthPage tone="rules" className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <SolarisDepthSafeZone>
        <header className="pb-2">
          {!isAppMode ? <SolarisDepthEyebrow tone="primary">Rules</SolarisDepthEyebrow> : null}
          <div className={isAppMode ? "flex flex-wrap items-baseline gap-x-2 gap-y-1" : "mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1"}>
            <h1 className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Official regulations</h1>
            <span className="text-xs text-muted-foreground">General Regulations · v{version}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Find the rule that applies, get a direct answer, or browse the visual rulebook.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground" data-v3-rulebook-release-meta="">
            <span aria-label={`Current rulebook version ${version}`}>Current version · v{version}</span>
            {effectiveDate ? <span>Effective {effectiveDate}</span> : null}
            <Link to="/rules/changes" className="font-semibold text-primary hover:underline">
              Previous versions
            </Link>
          </div>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
          className="mt-4"
        >
          <label className="flex min-h-14 items-center gap-3 rounded-[1.35rem] border border-sky-200/15 bg-[linear-gradient(180deg,rgba(255,255,255,.045),transparent_45%),rgba(5,19,41,.92)] px-4 shadow-[0_14px_38px_rgba(0,5,22,.2)] transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
            <Search className="size-4.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Ask about a rule</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rules or ask a question…"
              className={isAppMode ? "min-h-10 min-w-0 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground/65" : "min-h-10 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/65"}
              enterKeyHint="search"
            />
            <button
              type="submit"
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground"
              aria-label={isAppMode ? "Search rules" : undefined}
            >
              {isAppMode ? <Search className="size-4" aria-hidden="true" /> : "Search"}
            </button>
          </label>
        </form>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>Try</span>
          {["annex a hodless country", "friend voting", "artist eligibility", "deadline"].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuery(example);
                void navigate({ to: "/rules/search", search: { q: example } });
              }}
              className="inline-flex min-h-8 items-center font-semibold text-primary"
            >
              {example}
            </button>
          ))}
        </div>

        <GovernanceStatusStrip context="rules" className="mt-3" />
      </SolarisDepthSafeZone>

      {forYou && context ? (
        <SolarisDepthSafeZone className="mt-6">
          <SolarisDepthEyebrow tone="primary">For you</SolarisDepthEyebrow>
          <Link to="/rules/applied" className="mt-2 block">
            <SolarisDepthSurface variant="action" className="flex items-center gap-3 transition hover:border-primary/20">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <CheckCircle2 className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{forYou.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {forYou.description}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </SolarisDepthSurface>
          </Link>
        </SolarisDepthSafeZone>
      ) : null}

      <SolarisDepthSafeZone className="mt-7">
        <Link to="/rules/chapters/$chapter" params={{ chapter: "roleplay-worldbuilding" }} className="block">
          <div className="group overflow-hidden rounded-[1.45rem] border border-indigo-300/15 bg-[radial-gradient(circle_at_88%_0%,rgba(129,140,248,.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,.035),transparent_40%),rgba(7,18,42,.78)] p-4 transition hover:border-indigo-300/25 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <span className="grid size-11 place-items-center rounded-2xl border border-indigo-300/15 bg-indigo-300/[0.08] text-indigo-100">
                <Map className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-200/75">New chapter · 22</span>
                  <span className="rounded-full border border-indigo-300/15 bg-indigo-300/[0.06] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-indigo-100">Worldbuilding</span>
                </span>
                <span className="mt-1 block text-base font-bold">Roleplay & Worldbuilding</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Wars, invasions, protected countries, the six-Edition Dormant rule, annexation, elimination and the canonical map.
                </span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-indigo-200" />
            </div>
          </div>
        </Link>
      </SolarisDepthSafeZone>

      <SolarisDepthSafeZone className="mt-7">
        <div className="mb-2 flex items-center justify-between gap-3">
          <SolarisDepthEyebrow>Quick answers</SolarisDepthEyebrow>
          <Link to="/rules/answers" className="text-xs font-bold text-primary">
            See all
          </Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {quick.map((answer) => (
            <Link
              key={answer.id}
              to="/rules/answers"
              hash={answer.id}
              className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition hover:border-primary/20 hover:bg-white/[0.04]"
            >
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5">{answer.question}</span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {answer.explanation}
                  </span>
                </span>
                <span className="solaris-depth-verdict shrink-0">{answer.answer}</span>
              </div>
            </Link>
          ))}
        </div>
      </SolarisDepthSafeZone>

      <SolarisDepthSafeZone className="mt-7">
        <SolarisDepthEyebrow>Rulebook</SolarisDepthEyebrow>
        <SolarisDepthSurface variant="reading" className="mt-2 !py-1">
          <RuleDestination
            to="/rules/chapters"
            icon={BookOpen}
            title="22 chapters"
            description="Browse the complete General Regulations by subject."
          />
          <RuleDestination
            to="/rules/chapters/roleplay-worldbuilding"
            icon={Map}
            title="Roleplay & worldbuilding"
            description="Countries, conflicts, Dormancy, borders and the canonical map."
          />
          <RuleDestination
            to="/rules/participating"
            icon={Flag}
            title="Rules for participating"
            description="Confirmation, entry, voting, results and hosting."
          />
          <RuleDestination
            to="/rules/check"
            icon={ShieldCheck}
            title="Check a situation"
            description="Use controlled eligibility and process checkers."
          />
          <RuleDestination
            to="/rules/interpretations"
            icon={MessageCircleQuestion}
            title="Official clarifications"
            description="Published interpretations of recurring questions."
          />
          <RuleDestination
            to="/rules/changes"
            icon={History}
            title="Changes & history"
            description="Current and previous rulebook versions."
          />
        </SolarisDepthSurface>
      </SolarisDepthSafeZone>
    </SolarisDepthPage>
  );
}

function RuleDestination({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <Link to={to as any} className="solaris-depth-row group rounded-xl px-1 transition hover:bg-white/[0.035]">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold group-hover:text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
