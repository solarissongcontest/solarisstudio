import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Gavel } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { RulesApplyingHere } from "@/components/rules/GovernanceRules";
import {
  getProtectedIntegrityResolution,
  submitProtectedIntegrityAppeal,
  type IntegritySanctionRecord,
} from "@/lib/integrity-portal";

export const Route = createFileRoute("/integrity/appeal/$caseId")({
  head: () => ({
    meta: [
      { title: "Appeal Integrity Decision — Solaris" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Review an eligible Integrity decision and submit an appeal for fresh review.",
      },
    ],
  }),
  component: ProtectedAppealPage,
});

function ProtectedAppealPage() {
  const { caseId } = Route.useParams();
  const queryClient = useQueryClient();
  const resolution = useQuery({
    queryKey: ["reporter-integrity-resolution", caseId],
    queryFn: () => getProtectedIntegrityResolution(caseId),
    retry: 1,
  });
  const [selectedSanctionId, setSelectedSanctionId] = useState("");
  const [grounds, setGrounds] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      submitProtectedIntegrityAppeal(caseId, selectedSanctionId, grounds),
    onSuccess: async (result) => {
      setGrounds("");
      await queryClient.invalidateQueries({
        queryKey: ["reporter-integrity-resolution", caseId],
      });
      toast.success(result.was_timely ? "Appeal submitted" : "Appeal recorded as late");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit appeal"),
  });

  if (resolution.isLoading) {
    return (
      <AppShell>
        <p className="mx-auto max-w-3xl py-12 text-sm text-muted-foreground">
          Loading the decision…
        </p>
      </AppShell>
    );
  }

  if (resolution.isError) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12">
          <div className="border-l-2 border-rose-300/45 px-4 py-2">
            <AlertTriangle className="size-5 text-rose-200" />
            <h1 className="mt-3 text-2xl font-black">This protected case is not available</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sign in with the Solaris account that owns the sealed or confidential case.
            </p>
            <Link to="/integrity/cases" className="mt-3 inline-flex text-sm font-bold text-primary">
              My cases
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const data = resolution.data;
  const appealBySanction = new Map(
    (data?.appeals ?? []).map((appeal) => [appeal.sanction_id, appeal]),
  );
  const appealable = (data?.sanctions ?? []).filter(
    (sanction) =>
      sanction.status === "active" && !appealBySanction.has(sanction.id),
  );
  const selected =
    appealable.find((sanction) => sanction.id === selectedSanctionId) ??
    appealable[0] ??
    null;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <div className="flex items-center gap-2 text-amber-200">
            <Gavel className="size-4" />
            <p className="text-xs font-black uppercase tracking-[0.12em]">
              Trust & Integrity · Appeal
            </p>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            Review the decision before appealing
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose the decision you want reviewed and explain what you believe was wrong with the finding, evidence assessment, rule application or sanction.
          </p>
        </header>

        <RulesApplyingHere
          context="integrity.appeal"
          initiallyExpanded
          primaryLimit={2}
          className="mt-5"
        />

        <section className="mt-7" aria-labelledby="appeal-decisions">
          <h2 id="appeal-decisions" className="text-lg font-bold">Your decisions</h2>
          {(data?.sanctions ?? []).length ? (
            <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
              {(data?.sanctions ?? []).map((sanction) => (
                <DecisionRow
                  key={sanction.id}
                  sanction={sanction}
                  appeal={appealBySanction.get(sanction.id)}
                  selected={selected?.id === sanction.id}
                  onSelect={() => {
                    if (
                      sanction.status === "active" &&
                      !appealBySanction.has(sanction.id)
                    ) {
                      setSelectedSanctionId(sanction.id);
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 border-y border-border/60 py-5 text-sm text-muted-foreground">
              No reporter-visible sanction has been recorded for this case.
            </p>
          )}
        </section>

        <section className="mt-7 border-t border-border/65 pt-5" aria-labelledby="appeal-form">
          <h2 id="appeal-form" className="text-lg font-bold">Your appeal</h2>
          {selected ? (
            <>
              <div className="mt-3 border-l-2 border-amber-300/45 pl-4">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-amber-200">
                  Selected decision
                </p>
                <p className="mt-1 text-sm font-bold">
                  Level {selected.final_level} · {selected.sanction_label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Appeal deadline: {new Date(selected.appeal_deadline).toLocaleString()}
                </p>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-semibold">What should be reconsidered?</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Focus on the decision, evidence, rule application or sanction level. You can also explain the outcome you believe is appropriate.
                </span>
                <textarea
                  value={grounds}
                  onChange={(event) => setGrounds(event.target.value)}
                  rows={8}
                  placeholder="Explain the grounds for your appeal."
                  className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm leading-6"
                />
              </label>

              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                The original decision remains in the audit history. If the appeal changes the outcome, the revised decision is linked to it rather than silently replacing it.
              </p>

              <button
                type="button"
                disabled={grounds.trim().length < 20 || mutation.isPending}
                onClick={() => mutation.mutate()}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
              >
                <Gavel className="size-4" />
                {mutation.isPending ? "Submitting…" : "Submit appeal"}
              </button>
            </>
          ) : (
            <div className="mt-3 border-l-2 border-emerald-300/40 px-4 py-2">
              <CheckCircle2 className="size-5 text-emerald-200" />
              <p className="mt-2 text-sm font-semibold">No new appeal is available</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                There may be no active sanction, or every active sanction already has an appeal.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function DecisionRow({
  sanction,
  appeal,
  selected,
  onSelect,
}: {
  sanction: IntegritySanctionRecord;
  appeal?: {
    status: string;
    was_timely: boolean;
    decision_rationale: string | null;
  };
  selected: boolean;
  onSelect: () => void;
}) {
  const appealable = sanction.status === "active" && !appeal;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!appealable}
      aria-pressed={appealable ? selected : undefined}
      className={
        "w-full py-4 text-left " +
        (appealable ? "cursor-pointer" : "cursor-default") +
        (selected ? " bg-primary/[0.035]" : "")
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            "mt-1 size-4 shrink-0 rounded-full border " +
            (selected
              ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]"
              : "border-border")
          }
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">
              Level {sanction.final_level} · {sanction.sanction_label}
            </span>
            {appeal ? (
              <span className="text-[11px] font-black uppercase tracking-[0.08em] text-primary">
                Appeal {appeal.status.replaceAll("_", " ")}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-sm leading-6 text-muted-foreground">
            {sanction.rationale}
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">
            Appeal deadline: {new Date(sanction.appeal_deadline).toLocaleString()}
          </span>
          {appeal?.decision_rationale ? (
            <span className="mt-3 block border-l-2 border-emerald-300/35 pl-3 text-xs leading-5 text-muted-foreground">
              Appeal decision: {appeal.decision_rationale}
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
}
