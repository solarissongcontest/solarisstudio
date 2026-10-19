import { AdminConfirmSheet } from "@/components/admin/AdminUI";

type FindingReviewProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
  caseCode: string;
  outcome: string;
  summary: string;
  rationale: string;
  ruleIds: string[];
  visibleToReporter: boolean;
};

export function IntegrityFindingReview({
  open,
  onClose,
  onConfirm,
  busy,
  caseCode,
  outcome,
  summary,
  rationale,
  ruleIds,
  visibleToReporter,
}: FindingReviewProps) {
  return (
    <AdminConfirmSheet
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Record formal finding for ${caseCode}?`}
      description={
        <div
          className="space-y-3 text-xs leading-relaxed text-muted-foreground"
          data-v3-organizer-integrity-finding-review
        >
          <p>
            This creates an official finding in the Integrity case. Review the exact outcome, rule basis and reporter visibility before applying it.
          </p>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <p className="font-semibold text-foreground">Case {caseCode}</p>
            <p className="mt-2 text-sm font-black capitalize text-violet-100">
              Outcome: {outcome.replaceAll("_", " ")}
            </p>
            <p className="mt-3">
              <span className="font-semibold text-foreground">Rules:</span>{" "}
              {ruleIds.length ? ruleIds.join(" · ") : "No linked rules selected"}
            </p>
            <p className="mt-3 whitespace-pre-wrap">
              <span className="font-semibold text-foreground">Finding summary:</span> {summary}
            </p>
            <p className="mt-3 whitespace-pre-wrap">
              <span className="font-semibold text-foreground">Reasoning:</span> {rationale}
            </p>
          </div>
          <p>
            {visibleToReporter
              ? "This finding is marked reporter-visible."
              : "This finding remains internal and is not marked reporter-visible."}
          </p>
          <p>
            The existing Integrity RPC remains the mutation authority after confirmation. System #1102 is still required for canonical expected-version/CAS, stable idempotency, operation receipts and uncertain-outcome recovery.
          </p>
        </div>
      }
      confirmLabel="Record formal finding"
      confirmationText={caseCode}
      confirmationHint={`Type ${caseCode} to confirm this official finding`}
      busy={busy}
      danger={outcome === "violation"}
    />
  );
}

type PrecedentReviewProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
  caseCode: string;
  title: string;
  summary: string;
  rationale: string;
  ruleIds: string[];
};

export function IntegrityPrecedentPublicationReview({
  open,
  onClose,
  onConfirm,
  busy,
  caseCode,
  title,
  summary,
  rationale,
  ruleIds,
}: PrecedentReviewProps) {
  return (
    <AdminConfirmSheet
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Publish anonymised precedent from ${caseCode}?`}
      description={
        <div
          className="space-y-3 text-xs leading-relaxed text-muted-foreground"
          data-v3-organizer-integrity-precedent-review
        >
          <p>
            This publishes reusable Integrity reasoning to the public decisions surface. The publication must not expose private evidence, usernames or details that could identify a protected source.
          </p>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <p className="font-semibold text-foreground">Source case {caseCode}</p>
            <p className="mt-2 text-sm font-black text-amber-100">{title}</p>
            <p className="mt-3">
              <span className="font-semibold text-foreground">Rules:</span>{" "}
              {ruleIds.length ? ruleIds.join(" · ") : "No rules derived from current findings"}
            </p>
            <p className="mt-3 whitespace-pre-wrap">
              <span className="font-semibold text-foreground">Public summary:</span> {summary}
            </p>
            <p className="mt-3 whitespace-pre-wrap">
              <span className="font-semibold text-foreground">Public reasoning:</span> {rationale}
            </p>
          </div>
          <p>
            Publication is public-facing. If the case basis changes while this review is open, Solaris will reject this preview and require a fresh review.
          </p>
          <p>
            The existing publication RPC remains the mutation authority after confirmation. System #1102 is still required for canonical expected-version/CAS, stable idempotency, operation receipts and uncertain-outcome recovery.
          </p>
        </div>
      }
      confirmLabel="Publish anonymised precedent"
      confirmationText={caseCode}
      confirmationHint={`Type ${caseCode} to confirm public publication`}
      busy={busy}
      danger
    />
  );
}
