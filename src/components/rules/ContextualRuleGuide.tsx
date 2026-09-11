import { Link, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Gavel,
  Info,
  Scale,
  ShieldCheck,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getRuleById, type RuleTone, type SscRule } from "@/lib/ssc-rules-v4";
import { cn } from "@/lib/utils";

const RULE_EVENT = "solaris:open-rule";

export type RuleContext = {
  title: string;
  intro: string;
  ruleIds: string[];
  icon: LucideIcon;
};

const TONE: Record<RuleTone, { label: string; icon: LucideIcon; className: string }> = {
  allowed: { label: "Allowed", icon: CheckCircle2, className: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" },
  prohibited: { label: "Not allowed", icon: XCircle, className: "border-rose-300/20 bg-rose-300/10 text-rose-100" },
  conditional: { label: "Depends", icon: AlertTriangle, className: "border-amber-300/20 bg-amber-300/10 text-amber-100" },
  integrity: { label: "Integrity", icon: ShieldCheck, className: "border-violet-300/20 bg-violet-300/10 text-violet-100" },
  administrative: { label: "Official process", icon: Gavel, className: "border-sky-300/20 bg-sky-300/10 text-sky-100" },
  information: { label: "Information", icon: Info, className: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100" },
};

export function routeContext(pathname: string): RuleContext | null {
  if (pathname.startsWith("/confirmations")) {
    return {
      title: "Confirmation rules",
      intro: "The rules that decide opening time, server order, automation and what information must be supplied immediately.",
      ruleIds: ["4.3", "4.4", "4.6", "4.7", "12.1", "12.2", "20.1"],
      icon: BookOpen,
    };
  }
  if (pathname.startsWith("/televoting")) {
    return {
      title: "Televoting rules",
      intro: "Official-system voting, duplicate or invalid votes, independence and integrity review.",
      ruleIds: ["10.1", "11.1", "11.2", "11.4", "11.5", "11.7"],
      icon: ShieldCheck,
    };
  }
  if (pathname.startsWith("/admin/friend-voting") || pathname.startsWith("/admin/jury-integrity")) {
    return {
      title: "Voting-integrity rules",
      intro: "Friendships are allowed. Coordination is not. Statistical and automated signals only decide what deserves human review.",
      ruleIds: ["11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "16.5", "16.6"],
      icon: ShieldCheck,
    };
  }
  if (pathname.startsWith("/jury-voting") || pathname.startsWith("/admin/jury")) {
    return {
      title: "Jury rules",
      intro: "How jury rankings stay independent and how integrity concerns are reviewed without treating a flag as guilt.",
      ruleIds: ["9.1", "9.2", "11.2", "11.4", "11.5", "11.7"],
      icon: Scale,
    };
  }
  if (pathname.startsWith("/admin/integrity")) {
    return {
      title: "Investigation rules",
      intro: "Protected reporting, evidence handling, findings, sanctions and conflicts of interest for organizer review.",
      ruleIds: ["16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "17.1", "17.7", "18.3"],
      icon: ShieldCheck,
    };
  }
  if (pathname.startsWith("/participate") || pathname.startsWith("/admin/entries") || pathname.startsWith("/admin/participant-status")) {
    return {
      title: "Entry rules",
      intro: "Song and artist eligibility, objective popularity checks, reuse history and official verification.",
      ruleIds: ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.10"],
      icon: BookOpen,
    };
  }
  if (pathname.startsWith("/admin/design") || pathname.startsWith("/admin/edition-theme")) {
    return {
      title: "Hosting & media rules",
      intro: "Creative hosting rights, TSBC operational authority, third-party rights, branding and AI-assisted production.",
      ruleIds: ["8.1", "8.2", "8.4", "13.1", "13.2", "13.3", "13.5"],
      icon: BookOpen,
    };
  }
  return null;
}

export function openRuleDrawer(ruleId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RULE_EVENT, { detail: { ruleId } }));
}

export function RuleChip({ ruleId, label, className }: { ruleId: string; label?: string; className?: string }) {
  const rule = getRuleById(ruleId);
  if (!rule) return null;
  return (
    <button
      type="button"
      onClick={() => openRuleDrawer(rule.id)}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-sky-200/12 bg-sky-200/[0.055] px-2.5 text-[10px] font-bold text-sky-100 transition hover:border-sky-200/25 hover:bg-sky-200/[0.1]",
        className,
      )}
    >
      <BookOpen className="size-3" />
      {label ?? `Rule ${rule.id}`}
    </button>
  );
}

export function ContextualRuleGuide() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const context = useMemo(() => routeContext(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ ruleId?: string }>).detail;
      const rule = detail?.ruleId ? getRuleById(detail.ruleId) : null;
      if (rule) setSelectedRuleId(rule.id);
      setOpen(true);
    };
    window.addEventListener(RULE_EVENT, listener);
    return () => window.removeEventListener(RULE_EVENT, listener);
  }, []);

  useEffect(() => {
    setOpen(false);
    setSelectedRuleId(null);
  }, [pathname]);

  if (!context || pathname.startsWith("/rules")) return null;
  const rules = context.ruleIds.map(getRuleById).filter(Boolean) as SscRule[];
  const selected = selectedRuleId ? getRuleById(selectedRuleId) : null;
  const Icon = context.icon;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[5.6rem] left-3 z-[78] inline-flex min-h-11 items-center gap-2 rounded-2xl border border-sky-200/15 bg-[#07182f]/95 px-3.5 text-xs font-bold text-sky-50 shadow-2xl backdrop-blur-xl transition hover:border-sky-200/30 hover:bg-[#0a2242] lg:bottom-5 lg:left-5"
        aria-label={`Open ${context.title}`}
      >
        <Icon className="size-4 text-sky-200" />
        <span className="hidden sm:inline">Rules for this page</span>
        <span className="sm:hidden">Rules</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={selected ? `Rule ${selected.id}` : context.title}>
          <button type="button" aria-label="Close rules drawer" className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-[31rem] flex-col border-l border-white/[0.09] bg-[#061429] shadow-[-24px_0_80px_rgba(0,0,0,.45)]">
            <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-sky-200/65">SSC RULES · CONTEXT HELP</p>
                <h2 className="mt-2 text-xl font-black tracking-[-.03em] text-white">{selected ? `Rule ${selected.id}` : context.title}</h2>
                {!selected ? <p className="mt-2 text-xs leading-5 text-slate-300/70">{context.intro}</p> : null}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-muted-foreground hover:bg-white/[0.05] hover:text-white"><X className="size-4" /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {selected ? (
                <RuleDetail rule={selected} onBack={() => setSelectedRuleId(null)} onOpenRule={setSelectedRuleId} />
              ) : (
                <div className="space-y-2">
                  {rules.map((rule) => {
                    const tone = TONE[rule.tone];
                    const ToneIcon = tone.icon;
                    return (
                      <button key={rule.id} type="button" onClick={() => setSelectedRuleId(rule.id)} className="group w-full rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:border-sky-200/18 hover:bg-sky-200/[0.04]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-black text-sky-200">{rule.id}</span><span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[.08em]", tone.className)}><ToneIcon className="size-2.5" />{tone.label}</span></div>
                            <p className="mt-2 text-sm font-black text-white">{rule.title}</p>
                            <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{rule.summary}</p>
                          </div>
                          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-white" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="border-t border-white/[0.08] p-4">
              <Link to="/rules" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/14 bg-sky-200/[0.06] text-xs font-bold text-sky-100 hover:bg-sky-200/[0.1]" onClick={() => setOpen(false)}>
                <BookOpen className="size-4" /> Open full Rules Hub <ExternalLink className="size-3.5" />
              </Link>
            </footer>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function RuleDetail({ rule, onBack, onOpenRule }: { rule: SscRule; onBack: () => void; onOpenRule: (id: string) => void }) {
  const tone = TONE[rule.tone];
  const ToneIcon = tone.icon;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = `${window.location.origin}/rules/${rule.id}`;
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 text-[10px] font-bold text-sky-200 hover:text-white">← Back to page rules</button>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[.08em]", tone.className)}><ToneIcon className="size-3" />{tone.label}</span>
        <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1 text-[9px] font-bold text-muted-foreground hover:text-white"><Copy className="size-3" />{copied ? "Copied" : "Copy link"}</button>
      </div>
      <h3 className="mt-4 text-2xl font-black tracking-[-.035em] text-white">{rule.title}</h3>
      <p className="mt-3 rounded-2xl border border-sky-200/12 bg-sky-200/[0.05] p-4 text-sm font-semibold leading-6 text-sky-50">{rule.summary}</p>

      <section className="mt-5">
        <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">Official wording</p>
        <div className="mt-2 space-y-3 text-xs leading-6 text-slate-200/80">{rule.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      </section>

      {rule.important ? <div className="mt-5 rounded-2xl border border-amber-200/15 bg-amber-200/[0.055] p-4"><p className="text-[9px] font-black uppercase tracking-[.14em] text-amber-100">Important</p><p className="mt-2 text-xs leading-5 text-amber-50/80">{rule.important}</p></div> : null}

      {rule.allowed?.length ? <ListBlock title="Allowed" icon={CheckCircle2} items={rule.allowed} className="text-emerald-100" /> : null}
      {rule.prohibited?.length ? <ListBlock title="Not allowed" icon={XCircle} items={rule.prohibited} className="text-rose-100" /> : null}

      {rule.examples?.length ? <section className="mt-5"><p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">Examples · explanatory, not separate rules</p><div className="mt-2 space-y-2">{rule.examples.map((example) => <div key={`${example.title}-${example.detail}`} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-xs font-bold text-white">{example.title}</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{example.detail}</p></div>)}</div></section> : null}

      {rule.relatedRules?.length ? <section className="mt-5"><p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">Related rules</p><div className="mt-2 flex flex-wrap gap-2">{rule.relatedRules.map((id) => <button key={id} type="button" onClick={() => onOpenRule(getRuleById(id)?.id ?? id)} className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] font-bold text-sky-200 hover:border-sky-200/20 hover:bg-sky-200/[0.05]">Rule {getRuleById(id)?.id ?? id}</button>)}</div></section> : null}

      <Link to="/rules/$ruleId" params={{ ruleId: rule.id }} className="mt-6 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-300/12 text-xs font-black text-sky-100 hover:bg-sky-300/18">Open permanent rule page <ExternalLink className="size-3.5" /></Link>
    </div>
  );
}

function ListBlock({ title, icon: Icon, items, className }: { title: string; icon: LucideIcon; items: string[]; className: string }) {
  return <section className="mt-5"><p className={cn("flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[.16em]", className)}><Icon className="size-3" />{title}</p><ul className="mt-2 space-y-2">{items.map((item) => <li key={item} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[11px] leading-5 text-slate-200/80">{item}</li>)}</ul></section>;
}
