import { useEffect, useRef, useState } from "react";

import { DelayedConfirmationState } from "@/components/DelayedConfirmationState";
import { GovernanceSnapshot, RulesApplyingHere } from "@/components/rules/GovernanceRules";
import {
  TelevotingBooth,
  type MergedTelevotingEntry,
} from "@/components/televoting/TelevotingBooth";
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
  const [newReceipt, setNewReceipt] = useState<SubmissionReceiptDetail | null>(null);

  useEffect(() => {
    if (startedWithReceipt.current) return;

    const onSubmitted = (event: Event) => {
      const detail = (event as CustomEvent<SubmissionReceiptDetail>).detail;
      if (detail?.id === roundId) setNewReceipt(detail);
    };

    window.addEventListener(TELEVOTE_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(TELEVOTE_SUBMITTED_EVENT, onSubmitted);
  }, [roundId]);

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
    </div>
  );
}
