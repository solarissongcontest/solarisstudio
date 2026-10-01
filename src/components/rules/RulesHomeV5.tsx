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

export function RulesHomeV5({ version }: { version: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [context, setContext] = useState<GovernanceActionKey | null>(null);

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
    <SolarisDepthPage tone="rules">
      <SolarisDepthSafeZone>
        <header className="pb-2">
          <SolarisDepthEyebrow tone="primary">Rules</SolarisDepthEyebrow>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="text-2xl font-bold tracking-[-0.025em]">Official regulations</h1>
            <span className="text-xs text-muted-foreground">General Regulations · v{version}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Find the rule that applies, get a direct answer, or browse the official rulebook.
          </p>
        </header>

        <SolarisDepthSurface variant="action" className="mt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-3 focus-within:border-primary/35">
              <Search className="size-4.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="sr-only">Ask about a rule</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rules or ask a question…"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/65"
              />
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"
              >
                Search
              </button>
            </label>
          </form>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>Try</span>
            {["friend voting", "artist eligibility", "deadline", "anonymous report"].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuery(example);
                  void navigate({ to: "/rules/search", search: { q: example } });
                }}
                className="font-semibold text-primary"
              >
                {example}
              </button>
            ))}
          </div>
        </SolarisDepthSurface>

        <GovernanceStatusStrip context="rules" className="mt-3" />
      </SolarisDepthSafeZone>

      {forYou && context ? (
        <SolarisDepthSafeZone className="mt-6">
          <SolarisDepthEyebrow tone="primary">For you</SolarisDepthEyebrow>
          <Link to="/rules/applied" className="mt-2 block">
            <SolarisDepthSurface variant="action" className="flex items-center gap-3">
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
        <div className="mb-2 flex items-center justify-between gap-3">
          <SolarisDepthEyebrow>Quick answers</SolarisDepthEyebrow>
          <Link to="/rules/answers" className="text-xs font-bold text-primary">
            See all
          </Link>
        </div>
        <SolarisDepthSurface variant="reading" className="!py-1">
          {quick.map((answer) => (
            <Link
              key={answer.id}
              to="/rules/answers"
              hash={answer.id}
              className="solaris-depth-row"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{answer.question}</span>
                <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {answer.explanation}
                </span>
              </span>
              <span className="solaris-depth-verdict">{answer.answer}</span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </SolarisDepthSurface>
      </SolarisDepthSafeZone>

      <SolarisDepthSafeZone className="mt-7">
        <SolarisDepthEyebrow>Rulebook</SolarisDepthEyebrow>
        <SolarisDepthSurface variant="reading" className="mt-2 !py-1">
          <RuleDestination
            to="/rules/chapters"
            icon={BookOpen}
            title="21 chapters"
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
    <Link to={to as any} className="solaris-depth-row">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
