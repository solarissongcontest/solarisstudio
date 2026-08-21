export const CONFIRMATION_SUBMITTED_EVENT = "solaris:confirmation-submitted";
export const TELEVOTE_SUBMITTED_EVENT = "solaris:televote-submitted";

export type SubmissionReceiptDetail = {
  id: string;
};

export function dispatchSubmissionReceipt(eventName: string, id: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SubmissionReceiptDetail>(eventName, {
      detail: { id },
    }),
  );
}
