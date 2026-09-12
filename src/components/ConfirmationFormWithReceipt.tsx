import { useEffect, useState } from "react";

import {
  ConfirmationForm,
  type ConfirmationFormProps,
} from "@/components/ConfirmationForm";
import { DelayedConfirmationState } from "@/components/DelayedConfirmationState";
import { RuleDecisionStrip } from "@/components/rules/RuleDecisionStrip";
import {
  CONFIRMATION_SUBMITTED_EVENT,
  type SubmissionReceiptDetail,
} from "@/lib/submission-receipts";

export function ConfirmationFormWithReceipt(props: ConfirmationFormProps) {
  const [receiptDetected, setReceiptDetected] = useState(false);

  useEffect(() => {
    const onSubmitted = (event: Event) => {
      const detail = (event as CustomEvent<SubmissionReceiptDetail>).detail;
      if (detail?.id === props.round.id) setReceiptDetected(true);
    };

    window.addEventListener(CONFIRMATION_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(CONFIRMATION_SUBMITTED_EVENT, onSubmitted);
  }, [props.round.id]);

  if (receiptDetected) {
    const editing = Boolean(props.editToken || props.prefill);
    return (
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
            : "Your confirmation response is recorded and available through the normal recovery or country-account tools."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <RuleDecisionStrip
        title="Confirmation fairness & submission rules"
        description="Before claiming or editing a place, check the rules on published opening times, server receipt order, automation, duplicate confirmations and which information may be completed later."
        ruleIds={["4.3", "4.4", "4.6", "4.7", "20.1"]}
      />
      <ConfirmationForm {...props} />
    </div>
  );
}
