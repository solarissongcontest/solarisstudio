import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Flag,
  History,
  MessageCircleQuestion,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { RULE_CONTEXT_STORAGE_KEY } from "@/components/rules/RulesGovernanceContext";
import { GovernanceInlineReference } from "@/components/rules/GovernanceRules";
import {
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
      setContext(actionFromStoredPath(window.sessionStorage.getItem(RULE_CONTEXT_STORAGE_KEY)));
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
    <div className="pb-20">
      <header className="border-b border-border/65 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">General Regulations</span>
          <span>·</span>
          <span>v{version}</span>
          <span>·</span>
          <span>Current rulebook</span>
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Rules</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Find the rule that applies, get a quick answer, or browse the complete official regulations.
        </p>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-border/75 bg-surface/55 px-4 focus-within:border-primary/30">
            <Search className="size-4.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Ask about a rule</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask about a rule…"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/65"
            />
            <button
              type="submit"
              className="inline-flex min-h-9 items-center rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground"
            >
              Search
            </button>
          </label>
        </form>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Try:</span>
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
      </header>

      {forYou && context ? (
        <section className="mt-6" aria-labelledby="rules-for-you">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">For you</p>
          <Link
            to="/rules/applied"
            className="mt-2 flex min-h-20 items-center gap-3 rounded-2xl border border-primary/15 bg-primary/[0.055] p-4"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle2 className="size-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span id="rules-for-you" className="block text-sm font-semibold">{forYou.title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{forYou.description}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </section>
      ) : null}

      <section className="mt-7" aria-labelledby="quick-rules-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Quick answers</p>
            <h2 id="quick-rules-title" className="mt-1 text-xl font-bold">Common questions</h2>
          </div>
          <Link to="/rules/answers" className="text-xs font-bold text-primary">See all</Link>
        </div>
        <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
          {quick.map((answer) => (
            <Link
              key={answer.id}
              to="/rules/answers"
              hash={answer.id}
              className="flex min-h-14 items-center gap-3 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{answer.question}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{answer.explanation}</span>
              </span>
              <span className="shrink-0 text-xs font-black text-primary">{answer.answer}</span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-7" aria-labelledby="rules-browse-title">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Browse</p>
        <h2 id="rules-browse-title" className="mt-1 text-xl font-bold">Rulebook & guidance</h2>
        <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
          <RuleDestination
            to="/rules/chapters"
            icon={BookOpen}
            title="Browse the 21 chapters"
            description="Read the official rulebook by topic and chapter."
          />
          <RuleDestination
            to="/rules/participating"
            icon={Flag}
            title="Rules for participating"
            description="Follow the rules from confirmation through entry, voting and hosting."
          />
          <RuleDestination
            to="/rules/check"
            icon={ShieldCheck}
            title="Check a situation"
            description="Use deterministic rule checkers for common eligibility and process questions."
          />
          <RuleDestination
            to="/rules/interpretations"
            icon={MessageCircleQuestion}
            title="Official clarifications"
            description="Read published interpretations of ambiguous or recurring rule questions."
          />
          <RuleDestination
            to="/rules/changes"
            icon={History}
            title="Rule changes & history"
            description="See current and previous published rulebook versions."
          />
        </div>
      </section>

      <section className="mt-7 rounded-2xl border border-border/65 bg-background/30 p-4">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 size-4.5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">Rules are also shown inside Solaris tasks</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Confirmations, entry work, Jury Voting, Televoting and Trust & Integrity surface the exact rules that apply at the moment you need them.
            </p>
            <GovernanceInlineReference context="jury.vote" ruleIds={["9.2", "11.2"]} label="Example" />
          </div>
        </div>
      </section>
    </div>
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
    <Link to={to as any} className="flex min-h-16 items-center gap-3 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-surface/55 text-primary">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
