export const CONFIRMATION_SUBMITTED_EVENT = "solaris:confirmation-submitted";
export const TELEVOTE_SUBMITTED_EVENT = "solaris:televote-submitted";

export type SubmissionReceiptDetail = {
  id: string;
  kind?: "confirmation" | "televote" | "jury";
  submissionId?: string | null;
  acknowledgedAt?: string | null;
};

export function dispatchSubmissionReceipt(
  eventName: string,
  id: string,
  detail: Omit<SubmissionReceiptDetail, "id"> = {},
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SubmissionReceiptDetail>(eventName, {
      detail: { id, ...detail },
    }),
  );
}
