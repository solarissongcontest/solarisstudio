import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Gavel,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  getReporterPreclearanceRulings,
  type IntegrityPreclearanceRuling,
  type PreclearanceOutcome,
} from "@/lib/integrity-preclearance";
import {
  getCurrentIntegrityUser,
  listProtectedIntegrityCases,
} from "@/lib/integrity-portal";
import { getRuleById } from "@/lib/ssc-rules-v4";

export const Route = createFileRoute("/integrity/preclearance")({
  head: () => ({
    meta: [
      { title: "My Private Rule Rulings — Solaris Song Contest" },
      {
        name: "description",
        content: "Review TSBC pre-clearance rulings issued on your protected private rule questions.",
      },
    ],
  }),
  component: ParticipantPreclearancePage,
});

function ParticipantPreclearancePage() {
  const userQuery = useQuery({ queryKey: ["integrity-user", "preclearance"], queryFn: getCurrentIntegrityUser });
  const casesQuery = useQuery({
    queryKey: ["integrity-protected-cases", "preclearance"],
    queryFn: listProtectedIntegrityCases,
    enabled: Boolean(userQuery.data),
  });
  const questions = useMemo(
    () => (casesQuery.data ?? []).filter((item) => item.case_kind === "rule_question"),
    [casesQuery.data],
  );
  const [selectedCase, setSelectedCase] = useState("");
  const caseId = selectedCase || questions[0]?.id || "";
  const rulingsQuery = useQuery({
    queryKey: ["integrity-reporter-preclearance", caseId],
    queryFn: () => getReporterPreclearanceRulings(caseId),
    enabled: Boolean(caseId && userQuery.data),
  });
  const selected = questions.find((item) => item.id === caseId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl pb-20">
        <Link to="/integrity" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] px-3 text-xs font-bold text-muted-foreground hover:bg-white/[0.04] hover:text-white">
          <ArrowLeft className="size-4" /> Trust & Integrity
        </Link>

        <section className="relative mt-4 overflow-hidden rounded-[2rem] border border-sky-200/14 bg-[#06152d] p-6 sm:p-8">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_84%_14%,rgba(77,177,255,.16),transparent_32%),radial-gradient(circle_at_10%_90%,rgba(133,93,255,.12),transparent_30%)]" />
          <div className="relative max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-200/70">PRIVATE RULE GUIDANCE</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.05em] text-white sm:text-5xl">My rule rulings</h1>
            <p className="mt-4 text-sm leading-7 text-slate-200/72">These are the dated TSBC answers issued on your protected private rule questions. They explain how the current rules apply to the facts you presented before you act.</p>
          </div>
        </section>

        {userQuery.isLoading ? <LoadingCard text="Checking sign-in…" /> : !userQuery.data ? <SignInCard /> : casesQuery.isLoading ? <LoadingCard text="Loading your private rule questions…" /> : !questions.length ? <EmptyCard /> : (
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]">
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="text-[9px] font-black uppercase tracking-[.15em] text-muted-foreground">Your private questions</p>
              <div className="mt-3 space-y-2">
                {questions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedCase(item.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${caseId === item.id ? "border-sky-200/22 bg-sky-200/[0.06]" : "border-white/[0.07] bg-black/10 hover:border-white/[0.12]"}`}
                  >
                    <p className="font-mono text-[9px] font-black text-sky-200">{item.public_code}</p>
                    <p className="mt-1 text-xs font-black text-white">{item.summary}</p>
                    <p className="mt-1 text-[9px] uppercase text-muted-foreground">{item.status.replaceAll("_", " ")}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-black text-sky-200">{selected?.public_code}</p>
                  <h2 className="mt-1 text-xl font-black">{selected?.summary}</h2>
                </div>
                <Link to="/integrity" className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground hover:text-white">Open case centre</Link>
              </div>

              <div className="mt-4 space-y-3">
                {rulingsQuery.isLoading ? <LoadingCard text="Loading rulings…" embedded /> : null}
                {(rulingsQuery.data ?? []).map((ruling) => <ParticipantRuling key={ruling.id} ruling={ruling} />)}
                {!rulingsQuery.isLoading && !(rulingsQuery.data ?? []).length ? (
                  <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center">
                    <CircleHelp className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-2 text-sm font-bold">No ruling yet</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">TSBC has not issued a formal pre-clearance ruling on this question yet. Continue using the protected case thread if more facts are needed.</p>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ParticipantRuling({ ruling }: { ruling: IntegrityPreclearanceRuling }) {
  return (
    <article className="rounded-[1.25rem] border border-violet-200/10 bg-violet-200/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[.08em] ${outcomeClass(ruling.outcome)}`}>
          {outcomeIcon(ruling.outcome)}{outcomeLabel(ruling.outcome)}
        </span>
        <span className="text-[9px] text-muted-foreground">{new Date(ruling.created_at).toLocaleString()}</span>
      </div>
      <h3 className="mt-3 text-base font-black">{ruling.summary}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{ruling.rationale}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {ruling.rule_ids.map((ruleId) => (
          <Link key={ruleId} to="/rules/$ruleId" params={{ ruleId }} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200/10 bg-sky-200/[0.045] px-2.5 py-1.5 text-[10px] font-bold text-sky-100">
            <BookOpen className="size-3" />Rule {ruleId} · {getRuleById(ruleId)?.title ?? "Current rule"}
          </Link>
        ))}
      </div>
      <p className="mt-4 text-[9px] leading-4 text-muted-foreground">This ruling answers the facts described in your private question. It does not silently rewrite the General Regulations. Any broader Official Interpretation is published separately in the public rules archive.</p>
    </article>
  );
}

function SignInCard() {
  return (
    <div className="mt-5 rounded-[1.5rem] border border-sky-200/12 bg-sky-200/[0.035] p-7 text-center">
      <KeyRound className="mx-auto size-7 text-sky-200" />
      <h2 className="mt-3 text-xl font-black">Sign in to see your protected rulings</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Private rule questions use sealed or confidential protected cases tied to your Solaris account for recovery.</p>
      <Link to="/auth" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-sky-200 px-4 text-sm font-black text-slate-950">Sign in</Link>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="mt-5 rounded-[1.5rem] border border-dashed border-white/[0.09] p-8 text-center">
      <Gavel className="mx-auto size-7 text-muted-foreground" />
      <h2 className="mt-3 text-lg font-black">No private rule questions yet</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Use “Ask TSBC privately” in Trust & Integrity when you want a rule position before taking an action.</p>
      <Link to="/integrity" className="mt-4 inline-flex items-center gap-2 text-xs font-black text-sky-200"><ShieldCheck className="size-4" />Open Trust & Integrity</Link>
    </div>
  );
}

function LoadingCard({ text, embedded = false }: { text: string; embedded?: boolean }) {
  return <div className={`${embedded ? "" : "mt-5"} rounded-xl border border-white/[0.08] p-6 text-center`}><RefreshCw className="mx-auto size-5 animate-spin text-sky-200" /><p className="mt-2 text-xs text-muted-foreground">{text}</p></div>;
}

function outcomeLabel(outcome: PreclearanceOutcome) {
  if (outcome === "allowed") return "Allowed";
  if (outcome === "not_allowed") return "Not allowed";
  if (outcome === "needs_more_information") return "Needs more information";
  return "Guidance only";
}

function outcomeIcon(outcome: PreclearanceOutcome) {
  if (outcome === "allowed") return <CheckCircle2 className="size-3" />;
  if (outcome === "not_allowed") return <XCircle className="size-3" />;
  if (outcome === "needs_more_information") return <CircleHelp className="size-3" />;
  return <ShieldCheck className="size-3" />;
}

function outcomeClass(outcome: PreclearanceOutcome) {
  if (outcome === "allowed") return "border-emerald-200/15 bg-emerald-200/[0.05] text-emerald-100";
  if (outcome === "not_allowed") return "border-rose-200/15 bg-rose-200/[0.05] text-rose-100";
  if (outcome === "needs_more_information") return "border-amber-200/15 bg-amber-200/[0.05] text-amber-100";
  return "border-sky-200/15 bg-sky-200/[0.05] text-sky-100";
}
