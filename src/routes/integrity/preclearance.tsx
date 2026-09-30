import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, CircleHelp, MessageCircleQuestion } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { RulesApplyingHere } from "@/components/rules/GovernanceRules";
import {
  getReporterPreclearanceRulings,
  type PreclearanceOutcome,
} from "@/lib/integrity-preclearance";
import {
  createProtectedIntegrityCase,
  getCurrentIntegrityUser,
  listProtectedIntegrityCases,
} from "@/lib/integrity-portal";
import { getRuleById } from "@/lib/ssc-rules-v4";

export const Route = createFileRoute("/integrity/preclearance")({
  validateSearch: (search: Record<string, unknown>) => ({
    rule: typeof search.rule === "string" ? search.rule : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Private Rule Guidance — Solaris Song Contest" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Ask TSBC privately how an SSC rule applies before acting, and review official private rulings.",
      },
    ],
  }),
  component: ParticipantPreclearancePage,
});

function ParticipantPreclearancePage() {
  const { rule } = Route.useSearch();
  const queryClient = useQueryClient();
  const userQuery = useQuery({
    queryKey: ["integrity-user", "preclearance-v5"],
    queryFn: getCurrentIntegrityUser,
  });
  const casesQuery = useQuery({
    queryKey: ["integrity-protected-cases", "preclearance-v5"],
    queryFn: listProtectedIntegrityCases,
    enabled: Boolean(userQuery.data),
  });
  const questions = useMemo(
    () => (casesQuery.data ?? []).filter((item) => item.case_kind === "rule_question"),
    [casesQuery.data],
  );
  const [selectedCase, setSelectedCase] = useState("");
  const [plan, setPlan] = useState("");
  const [uncertainty, setUncertainty] = useState("");
  const [selectedRule, setSelectedRule] = useState(rule ?? "");
  const caseId = selectedCase || questions[0]?.id || "";

  const rulings = useQuery({
    queryKey: ["integrity-reporter-preclearance", caseId],
    queryFn: () => getReporterPreclearanceRulings(caseId),
    enabled: Boolean(caseId && userQuery.data),
  });

  const askMutation = useMutation({
    mutationFn: () =>
      createProtectedIntegrityCase({
        identityMode: "sealed",
        caseKind: "rule_question",
        category: "other",
        summary: plan.trim().slice(0, 180),
        details: [
          plan.trim(),
          uncertainty.trim() ? `Question: ${uncertainty.trim()}` : "",
          selectedRule ? `Related rule: ${selectedRule}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
    onSuccess: async (result) => {
      setPlan("");
      setUncertainty("");
      setSelectedRule(rule ?? "");
      setSelectedCase(result.case_id);
      await queryClient.invalidateQueries({
        queryKey: ["integrity-protected-cases", "preclearance-v5"],
      });
      toast.success("Private rule question sent");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send private rule question"),
  });

  const valid = plan.trim().length >= 20 && plan.trim().length <= 8000 && Boolean(userQuery.data);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-sky-200">
            Private Rule Guidance
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">
            Ask before acting
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Describe what you plan to do and what is unclear. TSBC can answer privately and cite the exact current rules that apply to the circumstances you described.
          </p>
        </header>

        <section className="mt-6" aria-labelledby="new-rule-question">
          <h2 id="new-rule-question" className="text-lg font-bold">
            New private question
          </h2>
          {!userQuery.isLoading && !userQuery.data ? (
            <div className="mt-3 border-l-2 border-sky-300/40 px-4 py-2">
              <p className="text-sm font-semibold">Sign in to ask privately</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Private guidance uses your account for recovery. If you need to report a concern without an account link, use the anonymous reporting flow instead.
              </p>
              <Link to="/auth" className="mt-2 inline-flex min-h-10 items-center text-xs font-bold text-primary">
                Sign in
              </Link>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold">What are you planning to do?</span>
                <textarea
                  value={plan}
                  onChange={(event) => setPlan(event.target.value)}
                  rows={4}
                  maxLength={8000}
                  className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm leading-6"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">What are you unsure about?</span>
                <span className="mt-1 block text-xs text-muted-foreground">Optional</span>
                <textarea
                  value={uncertainty}
                  onChange={(event) => setUncertainty(event.target.value)}
                  rows={3}
                  maxLength={3500}
                  className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm leading-6"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Related rule</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Optional · enter an exact rule ID if you already know it
                </span>
                <input
                  value={selectedRule}
                  onChange={(event) => setSelectedRule(event.target.value)}
                  placeholder="e.g. 6.4"
                  className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm"
                />
                {selectedRule && getRuleById(selectedRule) ? (
                  <Link
                    to="/rules/$ruleId"
                    params={{ ruleId: selectedRule }}
                    className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-primary"
                  >
                    {getRuleById(selectedRule)?.title} <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </label>
              <button
                type="button"
                disabled={!valid || askMutation.isPending}
                onClick={() => askMutation.mutate()}
                className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
              >
                {askMutation.isPending ? "Sending…" : "Send private question"}
              </button>
            </div>
          )}
        </section>

        <RulesApplyingHere
          context="integrity.guidance"
          initiallyExpanded
          primaryLimit={2}
          className="mt-6"
        />

        <section className="mt-8" aria-labelledby="my-private-rulings">
          <div className="border-b border-border/65 pb-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
              Your private guidance
            </p>
            <h2 id="my-private-rulings" className="mt-1 text-xl font-bold">
              My rule rulings
            </h2>
          </div>

          {userQuery.isLoading || casesQuery.isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">Loading private guidance…</p>
          ) : !userQuery.data ? (
            <p className="py-6 text-sm text-muted-foreground">Sign in to see private rulings.</p>
          ) : !questions.length ? (
            <div className="py-7 text-center">
              <CircleHelp className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">No private rule questions yet</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <nav className="divide-y divide-border/60 border-y border-border/60" aria-label="Private rule questions">
                {questions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedCase(item.id)}
                    className={`w-full py-3 text-left ${caseId === item.id ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    <span className="block font-mono text-[11px] font-bold text-primary">{item.public_code}</span>
                    <span className="mt-1 block text-sm font-semibold">{item.summary}</span>
                  </button>
                ))}
              </nav>

              <div>
                {rulings.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading rulings…</p>
                ) : rulings.data?.length ? (
                  <div className="space-y-5">
                    {rulings.data.map((ruling) => (
                      <article key={ruling.id} className="border-l-2 border-sky-300/35 pl-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <MessageCircleQuestion className="size-4 text-sky-200" />
                          <span className="text-xs font-black uppercase tracking-[0.1em] text-sky-200">
                            {outcomeLabel(ruling.outcome)}
                          </span>
                        </div>
                        <h3 className="mt-2 text-base font-bold">{ruling.summary}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{ruling.rationale}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {ruling.rule_ids.map((ruleId) => (
                            <Link
                              key={ruleId}
                              to="/rules/$ruleId"
                              params={{ ruleId }}
                              className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 font-mono text-xs font-bold text-primary"
                            >
                              Rule {ruleId}
                            </Link>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="border-l-2 border-border px-4 py-2">
                    <p className="text-sm font-semibold">No ruling yet</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      TSBC has not issued formal private guidance on this question yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function outcomeLabel(outcome: PreclearanceOutcome) {
  if (outcome === "allowed") return "Allowed";
  if (outcome === "not_allowed") return "Not allowed";
  if (outcome === "needs_more_information") return "Needs more information";
  return "Guidance";
}
