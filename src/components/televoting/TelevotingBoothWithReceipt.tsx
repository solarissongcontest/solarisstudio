import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { DelayedConfirmationState } from "@/components/DelayedConfirmationState";
import { GovernanceSnapshot, RulesApplyingHere } from "@/components/rules/GovernanceRules";
import {
  TelevotingBooth,
  type MergedTelevotingEntry,
} from "@/components/televoting/TelevotingBooth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markTelevotingRoundSubmitted } from "@/integrations/televoting/anti-abuse";
import {
  exportMergedTelevotingRecoveryCode,
  reconcileMergedTelevotingRecoveryCookie,
  recoverMergedTelevotingReceiptCode,
} from "@/integrations/televoting/vote.functions";
import {
  TELEVOTE_SUBMITTED_EVENT,
  type SubmissionReceiptDetail,
} from "@/lib/submission-receipts";

const receiptKey = (roundId: string) => `ssc_vote_receipt:${roundId}`;

function readStoredReceipt(roundId: string): SubmissionReceiptDetail | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(receiptKey(roundId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      governance?: SubmissionReceiptDetail["governance"];
    };
    return {
      id: roundId,
      kind: "televote",
      governance: parsed.governance ?? null,
    };
  } catch {
    return null;
  }
}

function persistRecoveredReceipt(
  roundId: string,
  receipt: { id: string; accepted_at?: string | null },
): SubmissionReceiptDetail {
  const governance = markTelevotingRoundSubmitted(roundId, {
    submissionId: receipt.id,
    acknowledgedAt: receipt.accepted_at ?? null,
  });
  try {
    localStorage.setItem(
      receiptKey(roundId),
      JSON.stringify({
        governance,
        recovered: true,
        submissionId: receipt.id,
        acceptedAt: receipt.accepted_at ?? null,
      }),
    );
  } catch {
    // The authoritative receipt still came from the server.
  }
  return { id: roundId, kind: "televote", governance };
}

function RecoveryCodePanel({ roundId }: { roundId: string }) {
  const exportRecoveryCode = useServerFn(exportMergedTelevotingRecoveryCode);
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reveal = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const value = await exportRecoveryCode({ data: { roundId } });
      if (!value) {
        setMessage("A portable recovery code is not available for this older receipt.");
        return;
      }
      setCode(value);
    } catch {
      setMessage("The recovery code could not be loaded. Your recorded vote is not affected.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Recovery code copied.");
    } catch {
      setMessage("Copy was blocked by the browser. Select the code manually.");
    }
  };

  return (
    <div className="glass p-4 text-left">
      <p className="text-xs font-bold">Cross-device receipt recovery</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        A recovery code can verify this accepted vote on another device. It is read-only: it cannot submit, edit or reveal your ballot. Keep it private anyway.
      </p>
      {code ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input value={code} readOnly aria-label="Televote recovery code" className="font-mono text-xs" />
          <Button type="button" variant="outline" onClick={copy}>Copy code</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="mt-3" disabled={loading} onClick={reveal}>
          {loading ? "Loading recovery code…" : "Show recovery code"}
        </Button>
      )}
      {message ? <p className="mt-2 text-[11px] text-muted-foreground">{message}</p> : null}
    </div>
  );
}

export function TelevotingBoothWithReceipt({
  roundId,
  roundName,
  editionName,
  entries,
  selfVotingMode,
}: {
  roundId: string;
  roundName: string;
  editionName?: string | null;
  entries: MergedTelevotingEntry[];
  selfVotingMode?: string | null;
}) {
  const startedWithReceipt = useRef(readStoredReceipt(roundId));
  const recoverCookieReceipt = useServerFn(reconcileMergedTelevotingRecoveryCookie);
  const recoverReceiptCode = useServerFn(recoverMergedTelevotingReceiptCode);
  const [newReceipt, setNewReceipt] = useState<SubmissionReceiptDetail | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(Boolean(startedWithReceipt.current));
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveringCode, setRecoveringCode] = useState(false);

  useEffect(() => {
    if (startedWithReceipt.current) return;
    let active = true;
    void recoverCookieReceipt({ data: { roundId } })
      .then((receipt) => {
        if (!active || !receipt) return;
        setNewReceipt(persistRecoveredReceipt(roundId, receipt));
      })
      .catch(() => {
        // Absence or temporary recovery failure is not evidence that a ballot
        // exists. The normal booth remains available after the check.
      })
      .finally(() => {
        if (active) setRecoveryChecked(true);
      });
    return () => {
      active = false;
    };
  }, [recoverCookieReceipt, roundId]);

  useEffect(() => {
    if (startedWithReceipt.current) return;

    const onSubmitted = (event: Event) => {
      const detail = (event as CustomEvent<SubmissionReceiptDetail>).detail;
      if (detail?.id === roundId) setNewReceipt(detail);
    };

    window.addEventListener(TELEVOTE_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(TELEVOTE_SUBMITTED_EVENT, onSubmitted);
  }, [roundId]);

  const recoverPortableCode = async () => {
    const normalized = recoveryCode.trim();
    if (!normalized) {
      setRecoveryMessage("Enter the recovery code from the other device.");
      return;
    }
    setRecoveringCode(true);
    setRecoveryMessage(null);
    try {
      const receipt = await recoverReceiptCode({
        data: { roundId, recoveryCode: normalized },
      });
      if (!receipt) {
        setRecoveryMessage("That code does not prove an accepted vote for this round.");
        return;
      }
      setNewReceipt(persistRecoveredReceipt(roundId, receipt));
      setRecoveryMessage(null);
    } catch (caught) {
      setRecoveryMessage(caught instanceof Error ? caught.message : "The recovery code could not be verified.");
    } finally {
      setRecoveringCode(false);
    }
  };

  if (newReceipt) {
    return (
      <div className="space-y-4">
        <DelayedConfirmationState
          pendingTitle="Your vote is being confirmed"
          pendingDescription={`Your ballot for ${roundName} has been stored. Solaris is finalising the receipt before showing the confirmed state.`}
          confirmedTitle="Vote confirmed"
          confirmedDescription={`Your ballot for ${roundName} is recorded. Duplicate protection and the automatic integrity checks are complete.`}
        />
        <GovernanceSnapshot
          context="televote.vote"
          label="Rules shown for this televote"
          snapshot={newReceipt.governance}
        />
        <RecoveryCodePanel roundId={roundId} />
      </div>
    );
  }

  if (!recoveryChecked) {
    return (
      <div className="glass-strong p-6 text-center">
        <p className="font-medium">Checking for an existing vote receipt…</p>
        <p className="mt-2 text-xs text-muted-foreground">Solaris is checking the server before opening a fresh ballot.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {startedWithReceipt.current ? null : (
        <RulesApplyingHere
          context="televote.vote"
          title="Before you vote"
          primaryLimit={3}
        />
      )}
      {!startedWithReceipt.current ? (
        <details className="glass p-4">
          <summary className="cursor-pointer text-xs font-bold">Recover a vote from another device</summary>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            Paste the read-only recovery code shown on the device that recorded the vote. A matching code only restores the authoritative receipt; it never submits a new ballot.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value)}
              placeholder="Recovery code"
              autoComplete="off"
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" disabled={recoveringCode} onClick={recoverPortableCode}>
              {recoveringCode ? "Verifying…" : "Recover receipt"}
            </Button>
          </div>
          {recoveryMessage ? <p className="mt-2 text-[11px] text-muted-foreground">{recoveryMessage}</p> : null}
        </details>
      ) : null}
      <TelevotingBooth
        roundId={roundId}
        roundName={roundName}
        editionName={editionName}
        entries={entries}
        selfVotingMode={selfVotingMode}
      />
      {startedWithReceipt.current?.governance ? (
        <GovernanceSnapshot
          context="televote.vote"
          label="Rules captured for this recorded televote"
          snapshot={startedWithReceipt.current.governance}
        />
      ) : null}
      {startedWithReceipt.current ? <RecoveryCodePanel roundId={roundId} /> : null}
    </div>
  );
}
