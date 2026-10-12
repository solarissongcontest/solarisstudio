import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ConfirmationForm,
  type ConfirmationFormProps,
} from "@/components/ConfirmationForm";
import { DelayedConfirmationState } from "@/components/DelayedConfirmationState";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { GovernanceSnapshot, RulesApplyingHere } from "@/components/rules/GovernanceRules";
import { Button } from "@/components/ui/button";
import {
  deleteCountryAccountConfirmationDraft,
  getCountryConfirmationAccess,
  loadCountryAccountConfirmationDraft,
  saveCountryAccountConfirmationDraft,
} from "@/lib/confirmation-country-account";
import {
  CONFIRMATION_DRAFT_SAVED_EVENT,
  clearLocalDraft,
  getBrowserSessionId,
  readLocalDraft,
  writeLocalDraft,
  type ConfirmationDraftSavedDetail,
  type LocalDraft,
} from "@/lib/session";
import {
  CONFIRMATION_SUBMITTED_EVENT,
  type SubmissionReceiptDetail,
} from "@/lib/submission-receipts";
import { emptyPayload, type ConfirmationPayload } from "@/lib/ssc";
import {
  lookupV3ConfirmationReceipt,
  reconcileV3Confirmation,
  type V3ConfirmationReceipt,
} from "@/lib/v3-confirmation.functions";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import {
  readStoredV3ConfirmationReceipt,
  writeStoredV3ConfirmationReceipt,
} from "@/lib/v3-confirmation-receipt-store";

type AccountDraftVersion = {
  payload: ConfirmationPayload;
  step: number;
  savedAt: string;
  revision: number;
};

type AccountDraftConflict = {
  device: LocalDraft<ConfirmationPayload>;
  account: AccountDraftVersion;
};

type DraftBridgeMode = "checking" | "inactive" | "active" | "degraded" | "conflict";
type ReceiptStage = "idle" | "checking" | "confirmed" | "unavailable";
type UncertainStage = "checking" | "still_uncertain" | "not_committed";

function normalizeAccountDraft(
  roundId: string,
  value: unknown,
  revision: number,
  updatedAt: string | null | undefined,
): AccountDraftVersion | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { payload?: unknown; step?: unknown };
  if (!candidate.payload || typeof candidate.payload !== "object") return null;

  const step =
    typeof candidate.step === "number" && Number.isFinite(candidate.step)
      ? Math.max(0, Math.floor(candidate.step))
      : 0;

  return {
    payload: {
      ...emptyPayload(roundId),
      ...(candidate.payload as Partial<ConfirmationPayload>),
      round_id: roundId,
    },
    step,
    savedAt: updatedAt || new Date(0).toISOString(),
    revision,
  };
}

function sameDraft(
  left: { payload: ConfirmationPayload; step: number },
  right: { payload: ConfirmationPayload; step: number },
) {
  return left.step === right.step && JSON.stringify(left.payload) === JSON.stringify(right.payload);
}

function ConfirmationFlowBoot() {
  return (
    <div
      className="surface p-6 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
      data-v3-confirmation-boot=""
    >
      Preparing the confirmation workflow…
    </div>
  );
}

function LegacyConfirmationFlow(props: ConfirmationFormProps) {
  const [receipt, setReceipt] = useState<SubmissionReceiptDetail | null>(null);

  useEffect(() => {
    const onSubmitted = (event: Event) => {
      const detail = (event as CustomEvent<SubmissionReceiptDetail>).detail;
      if (detail?.id === props.round.id) setReceipt(detail);
    };

    window.addEventListener(CONFIRMATION_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(CONFIRMATION_SUBMITTED_EVENT, onSubmitted);
  }, [props.round.id]);

  if (receipt) {
    const editing = Boolean(props.editToken || props.prefill);
    return (
      <div className="space-y-4">
        <DelayedConfirmationState
          pendingTitle={editing ? "Your changes are being confirmed" : "Your confirmation is being confirmed"}
          pendingDescription={
            editing
              ? "Your updated response has been stored. Solaris is finalising the receipt before showing the confirmed state."
              : "Your response has been stored. Solaris is finalising the receipt before showing the confirmed state."
          }
          confirmedTitle={editing ? "Changes confirmed" : "Confirmation confirmed"}
          confirmedDescription={
            editing
              ? "Your saved confirmation now includes the changes you submitted."
              : `Your confirmation response is recorded${receipt.submissionId ? ` · receipt ${receipt.submissionId.slice(0, 8)}` : ""} and available through the normal recovery or country-account tools.`
          }
        />
        <GovernanceSnapshot context="confirmation.submit" label="Rules shown for this confirmation" snapshot={receipt.governance} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RulesApplyingHere
        context="confirmation.submit"
        title="Before you confirm"
        primaryLimit={2}
      />
      <ConfirmationForm {...props} />
    </div>
  );
}

function V3ConfirmationFlow(props: ConfirmationFormProps) {
  const roundId = props.round.id;
  const editing = Boolean(props.editToken || props.prefill);
  const lookupAuthoritativeReceipt = useServerFn(lookupV3ConfirmationReceipt);
  const reconcileAuthoritativeOperation = useServerFn(reconcileV3Confirmation);

  const [receipt, setReceipt] = useState<SubmissionReceiptDetail | null>(null);
  const [authoritativeReceipt, setAuthoritativeReceipt] = useState<V3ConfirmationReceipt | null>(null);
  const [receiptStage, setReceiptStage] = useState<ReceiptStage>("idle");
  const [uncertainOperationId, setUncertainOperationId] = useState<string | null>(null);
  const [uncertainStage, setUncertainStage] = useState<UncertainStage | null>(null);
  const [bridgeMode, setBridgeMode] = useState<DraftBridgeMode>(
    editing ? "inactive" : "checking",
  );
  const [bridgeConflict, setBridgeConflict] = useState<AccountDraftConflict | null>(null);
  const [bridgeMessage, setBridgeMessage] = useState<string | null>(null);
  const accountRevision = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);

  const activateBridge = useCallback((revision: number) => {
    accountRevision.current = revision;
    setBridgeConflict(null);
    setBridgeMessage(null);
    setBridgeMode("active");
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Edit-token flows intentionally open the current canonical submission.
    // An older stored receipt for the same round must never hide the edit form.
    if (editing) return;
    const stored = readStoredV3ConfirmationReceipt(roundId);
    if (!stored) return;
    setReceipt({
      id: roundId,
      kind: "confirmation",
      submissionId: stored.submissionId,
      acknowledgedAt: stored.receipt.serverAcceptedAt,
    });
    setAuthoritativeReceipt(stored.receipt);
    setReceiptStage("confirmed");
  }, [editing, roundId]);

  useEffect(() => {
    if (editing) {
      setBridgeMode("inactive");
      return;
    }

    let cancelled = false;
    setBridgeMode("checking");
    setBridgeMessage(null);

    void (async () => {
      try {
        const access = await getCountryConfirmationAccess();
        if (cancelled) return;
        if (!access.authenticated || !access.country) {
          setBridgeMode("inactive");
          return;
        }

        const [accountDraft, deviceDraft] = await Promise.all([
          loadCountryAccountConfirmationDraft(roundId),
          Promise.resolve(readLocalDraft<ConfirmationPayload>(roundId)),
        ]);
        if (cancelled) return;

        const normalizedAccount = accountDraft.found
          ? normalizeAccountDraft(
              roundId,
              accountDraft.payload,
              accountDraft.revision,
              accountDraft.updated_at,
            )
          : null;

        if (normalizedAccount && deviceDraft) {
          const normalizedDevice: LocalDraft<ConfirmationPayload> = {
            ...deviceDraft,
            payload: {
              ...emptyPayload(roundId),
              ...deviceDraft.payload,
              round_id: roundId,
            },
          };

          if (!sameDraft(normalizedDevice, normalizedAccount)) {
            accountRevision.current = normalizedAccount.revision;
            setBridgeConflict({ device: normalizedDevice, account: normalizedAccount });
            setBridgeMode("conflict");
            return;
          }
        }

        if (normalizedAccount) {
          if (!deviceDraft) {
            writeLocalDraft(roundId, normalizedAccount.payload, normalizedAccount.step);
          }
          activateBridge(normalizedAccount.revision);
          return;
        }

        if (deviceDraft) {
          const seeded = await saveCountryAccountConfirmationDraft({
            roundId,
            payload: {
              payload: {
                ...emptyPayload(roundId),
                ...deviceDraft.payload,
                round_id: roundId,
              },
              step: deviceDraft.step,
            },
            expectedRevision: 0,
          });
          if (cancelled) return;

          if (seeded.conflict) {
            const latest = normalizeAccountDraft(
              roundId,
              seeded.payload,
              seeded.revision,
              seeded.updated_at,
            );
            if (latest) {
              accountRevision.current = latest.revision;
              setBridgeConflict({ device: deviceDraft, account: latest });
              setBridgeMode("conflict");
              return;
            }
          }

          if (seeded.ok) {
            activateBridge(seeded.revision);
            return;
          }
        }

        activateBridge(0);
      } catch (error) {
        if (cancelled) return;
        console.error("[V3 Confirmations] Country-account draft bridge unavailable", error);
        setBridgeMessage(
          "Cross-device draft sync is temporarily unavailable. This device will still keep your local draft.",
        );
        setBridgeMode("degraded");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activateBridge, editing, roundId]);

  useEffect(() => {
    if (bridgeMode !== "active") return;

    const onDraftSaved = (event: Event) => {
      const detail = (event as CustomEvent<ConfirmationDraftSavedDetail<ConfirmationPayload>>).detail;
      if (!detail || detail.roundId !== roundId) return;

      saveQueue.current = saveQueue.current.then(async () => {
        if (!mounted.current) return;
        const expectedRevision = accountRevision.current;
        try {
          const result = await saveCountryAccountConfirmationDraft({
            roundId,
            payload: {
              payload: {
                ...emptyPayload(roundId),
                ...detail.payload,
                round_id: roundId,
              },
              step: detail.step,
            },
            expectedRevision,
          });
          if (!mounted.current) return;

          if (result.ok) {
            accountRevision.current = result.revision;
            return;
          }

          if (result.conflict) {
            const latest = normalizeAccountDraft(
              roundId,
              result.payload,
              result.revision,
              result.updated_at,
            );
            const local = readLocalDraft<ConfirmationPayload>(roundId);
            if (latest && local) {
              accountRevision.current = latest.revision;
              setBridgeConflict({ device: local, account: latest });
              setBridgeMode("conflict");
              setBridgeMessage(
                "This draft changed on another device. Choose which copy to continue with before Solaris syncs anything else.",
              );
            }
          }
        } catch (error) {
          if (!mounted.current) return;
          console.error("[V3 Confirmations] Country-account draft save failed", error);
          setBridgeMessage(
            "Cross-device draft sync paused. Your edits are still saved on this device.",
          );
          setBridgeMode("degraded");
        }
      });
    };

    window.addEventListener(CONFIRMATION_DRAFT_SAVED_EVENT, onDraftSaved);
    return () => window.removeEventListener(CONFIRMATION_DRAFT_SAVED_EVENT, onDraftSaved);
  }, [bridgeMode, roundId]);

  const storeConfirmedReceipt = useCallback((input: {
    submissionId: string;
    receipt: V3ConfirmationReceipt;
  }) => {
    const detail: SubmissionReceiptDetail = {
      id: roundId,
      kind: "confirmation",
      submissionId: input.submissionId,
      acknowledgedAt: input.receipt.serverAcceptedAt,
    };
    setUncertainOperationId(null);
    setUncertainStage(null);
    setReceipt(detail);
    setAuthoritativeReceipt(input.receipt);
    setReceiptStage("confirmed");
    writeStoredV3ConfirmationReceipt({
      roundId,
      submissionId: input.submissionId,
      receipt: input.receipt,
    });
  }, [roundId]);

  const reconcileUncertainSubmission = useCallback(async (operationId: string) => {
    setUncertainOperationId(operationId);
    setUncertainStage("checking");
    const sessionId = getBrowserSessionId();
    if (!sessionId) {
      setUncertainStage("still_uncertain");
      return;
    }

    try {
      const reconciled = await reconcileAuthoritativeOperation({
        data: {
          idempotency_key: operationId,
          browser_session_id: sessionId,
        },
      });
      if (!mounted.current) return;

      if (!reconciled.found) {
        // The V3 mutation and receipt are atomic. A reachable ledger with no
        // operation is positive evidence that this operation did not commit.
        setUncertainStage("not_committed");
        return;
      }

      const result = reconciled.result;
      if (result.ok && result.submission_id && result.receipt) {
        storeConfirmedReceipt({
          submissionId: result.submission_id,
          receipt: result.receipt,
        });
        clearLocalDraft(roundId);
        if (!editing && (bridgeMode === "active" || bridgeMode === "degraded")) {
          void deleteCountryAccountConfirmationDraft(roundId).catch((error) => {
            console.error("[V3 Confirmations] Could not clear reconciled account draft", error);
          });
        }
        return;
      }

      setUncertainStage("not_committed");
    } catch (error) {
      if (!mounted.current) return;
      console.error("[V3 Confirmations] Submission reconciliation is still unavailable", error);
      setUncertainStage("still_uncertain");
    }
  }, [bridgeMode, editing, reconcileAuthoritativeOperation, roundId, storeConfirmedReceipt]);

  const handleSubmissionUncertain = useCallback((operationId?: string) => {
    if (!operationId) {
      setUncertainOperationId("unknown");
      setUncertainStage("still_uncertain");
      return;
    }
    void reconcileUncertainSubmission(operationId);
  }, [reconcileUncertainSubmission]);

  useEffect(() => {
    const onSubmitted = (event: Event) => {
      const detail = (event as CustomEvent<SubmissionReceiptDetail>).detail;
      if (detail?.id !== roundId) return;
      setReceipt(detail);
      setAuthoritativeReceipt(null);
      setReceiptStage("checking");

      const sessionId = getBrowserSessionId();
      if (!detail.submissionId || !sessionId) {
        setReceiptStage("unavailable");
      } else {
        void lookupAuthoritativeReceipt({
          data: {
            round_id: roundId,
            browser_session_id: sessionId,
            submission_id: detail.submissionId,
          },
        })
          .then((result) => {
            if (!mounted.current) return;
            if (!result.found) {
              setReceiptStage("unavailable");
              return;
            }
            storeConfirmedReceipt({
              submissionId: detail.submissionId!,
              receipt: result.receipt,
            });
          })
          .catch((error) => {
            if (!mounted.current) return;
            console.error("[V3 Confirmations] Authoritative receipt lookup failed", error);
            setReceiptStage("unavailable");
          });
      }

      if (!editing && (bridgeMode === "active" || bridgeMode === "degraded")) {
        void deleteCountryAccountConfirmationDraft(roundId).catch((error) => {
          console.error("[V3 Confirmations] Could not clear submitted account draft", error);
        });
      }
    };

    window.addEventListener(CONFIRMATION_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(CONFIRMATION_SUBMITTED_EVENT, onSubmitted);
  }, [bridgeMode, editing, lookupAuthoritativeReceipt, roundId, storeConfirmedReceipt]);

  const chooseAccountDraft = useCallback(() => {
    if (!bridgeConflict) return;
    writeLocalDraft(roundId, bridgeConflict.account.payload, bridgeConflict.account.step);
    activateBridge(bridgeConflict.account.revision);
  }, [activateBridge, bridgeConflict, roundId]);

  const chooseDeviceDraft = useCallback(async () => {
    if (!bridgeConflict) return;
    setBridgeMessage(null);
    try {
      const result = await saveCountryAccountConfirmationDraft({
        roundId,
        payload: {
          payload: {
            ...emptyPayload(roundId),
            ...bridgeConflict.device.payload,
            round_id: roundId,
          },
          step: bridgeConflict.device.step,
        },
        expectedRevision: bridgeConflict.account.revision,
      });

      if (result.ok) {
        activateBridge(result.revision);
        return;
      }

      if (result.conflict) {
        const latest = normalizeAccountDraft(
          roundId,
          result.payload,
          result.revision,
          result.updated_at,
        );
        if (latest) {
          accountRevision.current = latest.revision;
          setBridgeConflict((current) =>
            current ? { ...current, account: latest } : current,
          );
          setBridgeMessage(
            "The account draft changed again while you were choosing. Review the newest account copy before continuing.",
          );
        }
      }
    } catch (error) {
      console.error("[V3 Confirmations] Could not resolve account draft conflict", error);
      setBridgeMessage(
        "Solaris could not update the account draft. Your device copy is still safe locally.",
      );
    }
  }, [activateBridge, bridgeConflict, roundId]);

  if (uncertainOperationId && uncertainStage) {
    const checking = uncertainStage === "checking";
    const noCommit = uncertainStage === "not_committed";
    return (
      <div className="space-y-4" data-v3-confirmation-reconciliation="">
        <V3ConfirmationTaskHeader props={props} />
        <section className="glass-strong mx-auto max-w-2xl p-7 text-center sm:p-9" aria-live="polite">
          <div className="mx-auto grid size-12 place-items-center rounded-full border border-amber-300/25 bg-amber-300/10 text-amber-100">
            {checking ? <LoaderCircle className="size-6 animate-spin" /> : <ShieldCheck className="size-6" />}
          </div>
          <p className="mt-4 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200">
            {checking ? "Checking submission status" : noCommit ? "No commit found" : "Status still uncertain"}
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold">
            {checking
              ? "Checking whether your confirmation was accepted…"
              : noCommit
                ? "No submission was committed"
                : "Solaris still cannot verify the final status"}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {checking
              ? "Do not submit again. Solaris is checking the exact protected operation against the authoritative receipt ledger."
              : noCommit
                ? "The authoritative ledger is reachable and contains no record for this operation, so it is safe to return to the form and submit again."
                : "Keep this screen open or check again after the connection recovers. Solaris will not tell you the submission failed while its authoritative status cannot be proven."}
          </p>
          <p className="mx-auto mt-4 max-w-lg break-all font-mono text-[10px] text-muted-foreground">
            Operation {uncertainOperationId}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {!checking && uncertainOperationId !== "unknown" ? (
              <Button
                type="button"
                onClick={() => void reconcileUncertainSubmission(uncertainOperationId)}
              >
                <RefreshCw className="size-4" /> Check status again
              </Button>
            ) : null}
            {noCommit ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setUncertainOperationId(null);
                  setUncertainStage(null);
                }}
              >
                Return to form
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  if (receipt) {
    const confirmed = receiptStage === "confirmed" && authoritativeReceipt;
    const checking = receiptStage === "checking";
    return (
      <div className="space-y-4" data-v3-confirmation-receipt="">
        <section
          className="glass-strong mx-auto max-w-2xl p-7 text-center sm:p-9"
          aria-live="polite"
          data-confirmation-stage={confirmed ? "confirmed" : checking ? "checking" : "accepted"}
        >
          <div
            className={`mx-auto grid size-12 place-items-center rounded-full border ${
              confirmed
                ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                : "border-primary/25 bg-primary/10 text-primary"
            }`}
          >
            {checking ? (
              <LoaderCircle className="size-6 animate-spin" />
            ) : confirmed ? (
              <CheckCircle2 className="size-6" />
            ) : (
              <ShieldCheck className="size-6" />
            )}
          </div>

          <p className="mt-4 text-[9px] font-black uppercase tracking-[0.18em] text-primary">
            {checking ? "Checking submission status" : confirmed ? "Authoritative receipt" : "Submission accepted"}
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold">
            {checking
              ? "Checking your confirmation receipt…"
              : confirmed
                ? editing
                  ? "Changes confirmed"
                  : "Confirmation confirmed"
                : "Your confirmation was accepted"}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {checking
              ? "Solaris is reconciling the accepted submission against the server receipt ledger. Do not submit it again while this check is running."
              : confirmed
                ? "The server receipt ledger confirms this exact submission. You can safely leave this page."
                : "The submission call was accepted, but this device could not retrieve the V3 receipt metadata. Do not create a second submission just to obtain another receipt."}
          </p>

          {confirmed ? (
            <dl className="mx-auto mt-6 max-w-lg space-y-2 rounded-xl border border-border bg-secondary/30 p-4 text-left text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Receipt</dt>
                <dd className="font-mono text-right">{authoritativeReceipt.receiptId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Accepted by server</dt>
                <dd className="text-right">{new Date(authoritativeReceipt.serverAcceptedAt).toLocaleString()}</dd>
              </div>
              {receipt.submissionId ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Submission</dt>
                  <dd className="font-mono text-right">{receipt.submissionId}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Authority</dt>
                <dd className="text-right">Authoritative server receipt</dd>
              </div>
            </dl>
          ) : null}
        </section>
        <GovernanceSnapshot context="confirmation.submit" label="Rules shown for this confirmation" snapshot={receipt.governance} />
      </div>
    );
  }

  if (bridgeMode === "checking") {
    return (
      <div className="space-y-4" data-v3-confirmation-task="">
        <V3ConfirmationTaskHeader props={props} />
        <ConfirmationFlowBoot />
      </div>
    );
  }

  if (bridgeMode === "conflict" && bridgeConflict) {
    return (
      <div className="space-y-4" data-v3-confirmation-task="">
        <V3ConfirmationTaskHeader props={props} />
        <div className="surface space-y-4 p-6" role="alert">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">Draft changed elsewhere</p>
            <h2 className="mt-2 text-xl font-semibold">Choose which confirmation draft to continue</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Solaris found different drafts on this device and your signed-in country account. Nothing will be overwritten until you choose.
            </p>
            {bridgeMessage ? <p className="mt-3 text-sm text-amber-200">{bridgeMessage}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="text-sm font-semibold">This device</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Saved {new Date(bridgeConflict.device.savedAt).toLocaleString()}
              </p>
              <Button type="button" className="mt-4 w-full" onClick={() => void chooseDeviceDraft()}>
                Keep this device draft
              </Button>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <p className="text-sm font-semibold">Country account</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Saved {new Date(bridgeConflict.account.savedAt).toLocaleString()}
              </p>
              <Button type="button" variant="outline" className="mt-4 w-full" onClick={chooseAccountDraft}>
                Use account draft
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-v3-confirmation-task="">
      <V3ConfirmationTaskHeader props={props} />
      {bridgeMode === "active" ? (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-xs text-muted-foreground" role="status">
          Signed-in draft sync is active. Your unfinished confirmation can continue on another device.
        </div>
      ) : bridgeMode === "degraded" && bridgeMessage ? (
        <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.08] px-4 py-3 text-xs text-amber-100" role="status">
          {bridgeMessage}
        </div>
      ) : null}
      <RulesApplyingHere
        context="confirmation.submit"
        title="Before you confirm"
        primaryLimit={2}
      />
      <ConfirmationForm
        {...props}
        onSubmissionUncertain={handleSubmissionUncertain}
      />
    </div>
  );
}

function V3ConfirmationTaskHeader({ props }: { props: ConfirmationFormProps }) {
  const editing = Boolean(props.editToken || props.prefill);
  return (
    <section className="rounded-2xl border border-border bg-surface/80 p-5 sm:p-6" aria-label="Confirmation task">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
            Required responsibility
          </p>
          <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">
            {editing ? "Update confirmation" : "Complete confirmation"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {props.round.edition_name} · {props.round.name}. Review every step before the final server-authoritative submit.
          </p>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
          Confirmation
        </span>
      </div>
    </section>
  );
}

export function ConfirmationFormWithReceipt(props: ConfirmationFormProps) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved) return <ConfirmationFlowBoot />;
  if (!isAppMode) return <LegacyConfirmationFlow {...props} />;
  if (rollout.isLoading) return <ConfirmationFlowBoot />;
  if (rollout.isError || rollout.data?.confirmationEnabled !== true) {
    return <LegacyConfirmationFlow {...props} />;
  }

  return <V3ConfirmationFlow {...props} />;
}
