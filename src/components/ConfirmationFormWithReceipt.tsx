import { useCallback, useEffect, useRef, useState } from "react";

import {
  ConfirmationForm,
  type ConfirmationFormProps,
} from "@/components/ConfirmationForm";
import { DelayedConfirmationState } from "@/components/DelayedConfirmationState";
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

export function ConfirmationFormWithReceipt(props: ConfirmationFormProps) {
  const [receipt, setReceipt] = useState<SubmissionReceiptDetail | null>(null);
  const [bridgeMode, setBridgeMode] = useState<DraftBridgeMode>(
    props.editToken || props.prefill ? "inactive" : "checking",
  );
  const [bridgeConflict, setBridgeConflict] = useState<AccountDraftConflict | null>(null);
  const [bridgeMessage, setBridgeMessage] = useState<string | null>(null);
  const accountRevision = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);

  const roundId = props.round.id;
  const editing = Boolean(props.editToken || props.prefill);

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

  useEffect(() => {
    const onSubmitted = (event: Event) => {
      const detail = (event as CustomEvent<SubmissionReceiptDetail>).detail;
      if (detail?.id !== roundId) return;
      setReceipt(detail);

      // The official submission is now authoritative. A stale draft must not
      // survive and reappear on another device after a successful submit.
      if (!editing && (bridgeMode === "active" || bridgeMode === "degraded")) {
        void deleteCountryAccountConfirmationDraft(roundId).catch((error) => {
          console.error("[V3 Confirmations] Could not clear submitted account draft", error);
        });
      }
    };

    window.addEventListener(CONFIRMATION_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(CONFIRMATION_SUBMITTED_EVENT, onSubmitted);
  }, [bridgeMode, editing, roundId]);

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

  if (receipt) {
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

  if (bridgeMode === "checking") {
    return (
      <div className="surface p-6 text-sm text-muted-foreground" role="status" aria-live="polite">
        Preparing your saved confirmation draft…
      </div>
    );
  }

  if (bridgeMode === "conflict" && bridgeConflict) {
    return (
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
    );
  }

  return (
    <div className="space-y-4">
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
      <ConfirmationForm {...props} />
    </div>
  );
}
