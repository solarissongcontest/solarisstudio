import { useEffect, useState } from "react";

import {
  ConfirmationForm,
  type ConfirmationFormProps,
} from "@/components/ConfirmationForm";
import { DelayedConfirmationState } from "@/components/DelayedConfirmationState";
import { GovernanceSnapshot, RulesApplyingHere } from "@/components/rules/GovernanceRules";
import {
  CONFIRMATION_SUBMITTED_EVENT,
  type SubmissionReceiptDetail,
} from "@/lib/submission-receipts";

export function ConfirmationFormWithReceipt(props: ConfirmationFormProps) {
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
