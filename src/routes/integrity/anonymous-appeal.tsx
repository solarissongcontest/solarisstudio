import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Gavel, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { RulesApplyingHere } from "@/components/rules/GovernanceRules";
import { readAnonymousCasesFromDevice } from "@/lib/integrity";
import {
  getAnonymousIntegrityResolution,
  submitAnonymousIntegrityAppeal,
  type IntegrityResolutionSnapshot,
} from "@/lib/integrity-portal";

export const Route = createFileRoute("/integrity/anonymous-appeal")({
  head: () => ({
    meta: [
      { title: "Anonymous Integrity Appeal — Solaris" },
      {
        name: "description",
        content:
          "Recover an anonymous Integrity decision with its case code and recovery key, then submit an eligible appeal.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnonymousAppealPage,
});

function AnonymousAppealPage() {
  const [caseCode, setCaseCode] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [resolution, setResolution] = useState<IntegrityResolutionSnapshot | null>(null);
  const [selectedSanctionId, setSelectedSanctionId] = useState("");
  const [grounds, setGrounds] = useState("");
  const [savedCases, setSavedCases] = useState(readAnonymousCasesFromDevice());

  useEffect(() => {
    setSavedCases(readAnonymousCasesFromDevice());
  }, []);

  const load = useMutation({
    mutationFn: () => getAnonymousIntegrityResolution(caseCode, recoveryKey),
    onSuccess: (data) => {
      setResolution(data);
      const appealed = new Set(data.appeals.map((appeal) => appeal.sanction_id));
      setSelectedSanctionId(
        data.sanctions.find(
          (sanction) => sanction.status === "active" && !appealed.has(sanction.id),
        )?.id ?? "",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not open anonymous case"),
  });

  const appeal = useMutation({
    mutationFn: () =>
      submitAnonymousIntegrityAppeal(
        caseCode,
        recoveryKey,
        selectedSanctionId,
        grounds,
      ),
    onSuccess: async (result) => {
      toast.success(result.was_timely ? "Appeal submitted" : "Appeal recorded as late");
      setGrounds("");
      const refreshed = await getAnonymousIntegrityResolution(caseCode, recoveryKey);
      setResolution(refreshed);
      const appealed = new Set(
        refreshed.appeals.map((item) => item.sanction_id),
      );
      setSelectedSanctionId(
        refreshed.sanctions.find(
          (sanction) => sanction.status === "active" && !appealed.has(sanction.id),
        )?.id ?? "",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit appeal"),
  });

  const appealed = new Set(
    (resolution?.appeals ?? []).map((item) => item.sanction_id),
  );
  const selected =
    resolution?.sanctions.find((sanction) => sanction.id === selectedSanctionId) ??
    null;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <div className="flex items-center gap-2 text-emerald-200">
            <KeyRound className="size-4" />
            <p className="text-xs font-black uppercase tracking-[0.12em]">
              Trust & Integrity · Anonymous appeal
            </p>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            Recover the decision, then appeal
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The case code and recovery key authenticate this request. They do not attach a Solaris account to the anonymous case.
          </p>
        </header>

        <RulesApplyingHere
          context="integrity.appeal"
          title="Appeal rules"
          initiallyExpanded
          primaryLimit={2}
          className="mt-5"
        />

        <section className="mt-7" aria-labelledby="anonymous-recovery">
          <h2 id="anonymous-recovery" className="text-lg font-bold">Recover the case</h2>

          {savedCases.length ? (
            <div className="mt-3 border-y border-border/60">
              <p className="py-2 text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                Explicitly saved on this device
              </p>
              {savedCases.map((saved) => (
                <button
                  key={saved.caseCode}
                  type="button"
                  onClick={() => {
                    setCaseCode(saved.caseCode);
                    setRecoveryKey(saved.recoveryKey);
                    setResolution(null);
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/50 py-2 text-left"
                >
                  <span className="font-mono text-xs font-bold">{saved.caseCode}</span>
                  <span className="text-xs font-bold text-primary">Use</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-sm font-semibold">Case code</span>
              <input
                value={caseCode}
                onChange={(event) => {
                  setCaseCode(event.target.value);
                  setResolution(null);
                }}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm"
              />
            </label>
            <label>
              <span className="text-sm font-semibold">Recovery key</span>
              <input
                value={recoveryKey}
                onChange={(event) => {
                  setRecoveryKey(event.target.value);
                  setResolution(null);
                }}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={
              caseCode.trim().length < 5 ||
              recoveryKey.trim().length < 12 ||
              load.isPending
            }
            onClick={() => load.mutate()}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {load.isPending ? "Opening…" : "Open decision"}
          </button>

          <div className="mt-4 flex gap-2 border-l-2 border-amber-300/40 px-4 py-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-200" />
            <p className="text-xs leading-5 text-muted-foreground">
              Do not share the recovery key. It is the credential for returning to this fully anonymous case.
            </p>
          </div>
        </section>

        {resolution ? (
          <>
            <section className="mt-8" aria-labelledby="anonymous-decisions">
              <h2 id="anonymous-decisions" className="text-lg font-bold">Decisions</h2>
              {resolution.sanctions.length ? (
                <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
                  {resolution.sanctions.map((sanction) => {
                    const existing = resolution.appeals.find(
                      (item) => item.sanction_id === sanction.id,
                    );
                    const selectable = sanction.status === "active" && !existing;
                    const isSelected = selectedSanctionId === sanction.id;
                    return (
                      <button
                        key={sanction.id}
                        type="button"
                        disabled={!selectable}
                        aria-pressed={selectable ? isSelected : undefined}
                        onClick={() => setSelectedSanctionId(sanction.id)}
                        className={
                          "w-full py-4 text-left " +
                          (isSelected ? "bg-primary/[0.035]" : "")
                        }
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={
                              "mt-1 size-4 shrink-0 rounded-full border " +
                              (isSelected
                                ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]"
                                : "border-border")
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold">
                                Level {sanction.final_level} · {sanction.sanction_label}
                              </span>
                              {existing ? (
                                <span className="text-[11px] font-black uppercase tracking-[0.08em] text-primary">
                                  Appeal {existing.status.replaceAll("_", " ")}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                              {sanction.rationale}
                            </span>
                            <span className="mt-2 block text-xs text-muted-foreground">
                              Appeal deadline: {new Date(sanction.appeal_deadline).toLocaleString()}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 border-y border-border/60 py-5 text-sm text-muted-foreground">
                  No reporter-visible sanction has been recorded.
                </p>
              )}
            </section>

            <section className="mt-7 border-t border-border/65 pt-5" aria-labelledby="anonymous-appeal-form">
              <h2 id="anonymous-appeal-form" className="text-lg font-bold">Your appeal</h2>
              {selected && !appealed.has(selected.id) ? (
                <>
                  <div className="mt-3 border-l-2 border-amber-300/45 pl-4">
                    <p className="text-sm font-bold">
                      Level {selected.final_level} · {selected.sanction_label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Appeal deadline: {new Date(selected.appeal_deadline).toLocaleString()}
                    </p>
                  </div>

                  <label className="mt-5 block">
                    <span className="text-sm font-semibold">What should be reconsidered?</span>
                    <textarea
                      value={grounds}
                      onChange={(event) => setGrounds(event.target.value)}
                      rows={8}
                      placeholder="Explain why the decision, evidence assessment, rule application or sanction should be reconsidered."
                      className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm leading-6"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={grounds.trim().length < 20 || appeal.isPending}
                    onClick={() => appeal.mutate()}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
                  >
                    <Gavel className="size-4" />
                    {appeal.isPending ? "Submitting…" : "Submit anonymous appeal"}
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
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
