import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flag,
  History,
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

  const quick = useMemo(() => GOVERNANCE_QUICK_ANSWERS.slice(0, 4), []);
  const forYou = context ? FOR_YOU_COPY[context] : null;

  const submitSearch = () => {
    const q = query.trim();
    if (!q) return;
    void navigate({ to: "/rules/search", search: { q } });
  };

  return (
    <SolarisDepthPage tone="rules" className="pb-2" data-v3-rules-redesign="">
      <SolarisDepthSafeZone>
        <header className="border-b border-white/[0.08] pb-5" data-v3-rules-header="">
          <SolarisDepthEyebrow tone="primary">Official regulations</SolarisDepthEyebrow>
          <h1 className="mt-2 max-w-[18ch] text-[clamp(2rem,8vw,2.8rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
            General Regulations
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Find the rule that applies, get a direct answer, or browse the official rulebook.
          </p>
          <div
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
            data-v3-rulebook-release-meta=""
          >
            <span className="font-semibold text-foreground/75" aria-label={`Current rulebook version ${version}`}>
              General Regulations · v{version}
            </span>
            {effectiveDate ? <span>Effective {effectiveDate}</span> : null}
            <Link to="/rules/changes" className="font-semibold text-primary hover:underline">
              Previous versions
            </Link>
          </div>
        </header>

        <section className="mt-5 border-b border-white/[0.08] pb-5" data-v3-rules-search="">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <label className="flex min-h-12 items-center gap-3 border-b border-white/[0.12] py-1 focus-within:border-primary/55">
              <Search className="size-4.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="sr-only">Ask about a rule</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rules or ask a question…"
                className={isAppMode ? "min-h-10 min-w-0 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground/65" : "min-h-10 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/65"}
                enterKeyHint="search"
              />
              {!isAppMode ? (
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center px-2 text-xs font-bold text-primary"
                >
                  Search
                </button>
              ) : (
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
            </label>
          </form>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Rule search suggestions">
            <span className="shrink-0 text-muted-foreground">Try</span>
            {["friend voting", "artist eligibility", "deadline", "anonymous report"].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuery(example);
                  void navigate({ to: "/rules/search", search: { q: example } });
                }}
                className="inline-flex min-h-8 shrink-0 items-center font-semibold text-primary"
              >
                {example}
              </button>
            ))}
          </div>
        </section>

        <GovernanceStatusStrip context="rules" className="mt-3" />
      </SolarisDepthSafeZone>

      {forYou && context ? (
        <SolarisDepthSafeZone className="mt-7">
          <SolarisDepthEyebrow tone="primary">For you</SolarisDepthEyebrow>
          <Link
            to="/rules/applied"
            className="mt-2 flex min-h-16 items-center gap-3 border-y border-primary/20 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{forYou.title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {forYou.description}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </SolarisDepthSafeZone>
      ) : null}

      <SolarisDepthSafeZone className="mt-8" data-v3-rules-quick-answers="">
        <div className="mb-2 flex items-center justify-between gap-3">
          <SolarisDepthEyebrow>Quick answers</SolarisDepthEyebrow>
          <Link to="/rules/answers" className="inline-flex min-h-10 items-center text-xs font-bold text-primary">
            See all
          </Link>
        </div>
        <div className="divide-y divide-white/[0.075] border-y border-white/[0.08]">
          {quick.map((answer) => (
            <Link
              key={answer.id}
              to="/rules/answers"
              hash={answer.id}
              className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{answer.question}</span>
                <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {answer.explanation}
                </span>
              </span>
              <span className="shrink-0 text-[0.64rem] font-black uppercase tracking-[0.08em] text-primary">
                {answer.answer}
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </SolarisDepthSafeZone>

      <SolarisDepthSafeZone className="mt-8" data-v3-rules-browse="">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <SolarisDepthEyebrow>Browse</SolarisDepthEyebrow>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">Official rulebook</h2>
          </div>
          <span className="text-xs text-muted-foreground">21 chapters</span>
        </div>
        <div className="divide-y divide-white/[0.075] border-y border-white/[0.08]">
          <RuleDestination
            to="/rules/chapters"
            icon={BookOpen}
            title="All chapters"
            description="Browse the complete General Regulations."
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
        </div>
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
    <Link
      to={to as any}
      className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <span className="grid size-9 shrink-0 place-items-center text-primary" aria-hidden="true">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
