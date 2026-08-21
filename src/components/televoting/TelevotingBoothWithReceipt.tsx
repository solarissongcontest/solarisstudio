import { useEffect, useRef, useState } from "react";

import { DelayedConfirmationState } from "@/components/DelayedConfirmationState";
import {
  TelevotingBooth,
  type MergedTelevotingEntry,
} from "@/components/televoting/TelevotingBooth";
import {
  TELEVOTE_SUBMITTED_EVENT,
  type SubmissionReceiptDetail,
} from "@/lib/submission-receipts";

const receiptKey = (roundId: string) => `ssc_vote_receipt:${roundId}`;

function hasReceipt(roundId: string) {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(receiptKey(roundId)));
  } catch {
    return false;
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
  const startedWithReceipt = useRef(hasReceipt(roundId));
  const [newReceiptDetected, setNewReceiptDetected] = useState(false);

  useEffect(() => {
    if (startedWithReceipt.current) return;

    const onSubmitted = (event: Event) => {
      const detail = (event as CustomEvent<SubmissionReceiptDetail>).detail;
      if (detail?.id === roundId) setNewReceiptDetected(true);
    };

    window.addEventListener(TELEVOTE_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(TELEVOTE_SUBMITTED_EVENT, onSubmitted);
  }, [roundId]);

  if (newReceiptDetected) {
    return (
      <DelayedConfirmationState
        pendingTitle="Your vote is being confirmed"
        pendingDescription={`Your ballot for ${roundName} has been stored. Solaris is finalising the receipt before showing the confirmed state.`}
        confirmedTitle="Vote confirmed"
        confirmedDescription={`Your ballot for ${roundName} is recorded. Duplicate protection and the automatic integrity checks are complete.`}
      />
    );
  }

  return (
    <TelevotingBooth
      roundId={roundId}
      roundName={roundName}
      editionName={editionName}
      entries={entries}
      selfVotingMode={selfVotingMode}
    />
  );
}
