import { AdminConfirmSheet } from "@/components/admin/AdminUI";

export function IntegritySanctionDecisionReview({
  open,
  onClose,
  onConfirm,
  busy,
  caseCode,
  findingSummary,
  typicalLevel,
  finalLevel,
  finalLabel,
  targetType,
  targetReference,
  aggravatingFactors,
  mitigatingFactors,
  rationale,
  visibleToReporter,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
  caseCode: string;
  findingSummary: string;
  typicalLevel: number | null;
  finalLevel: number;
  finalLabel: string | undefined;
  targetType: string;
  targetReference: string | null;
  aggravatingFactors: string[];
  mitigatingFactors: string[];
  rationale: string;
  visibleToReporter: boolean;
}) {
  return (
    <AdminConfirmSheet
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Record Level ${finalLevel} sanction for ${caseCode}?`}
      description={
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground" data-v3-organizer-sanction-review>
          <p>This creates an official sanction record and moves the case to action_taken. Review the exact decision before applying it.</p>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <p className="font-semibold text-foreground">Confirmed finding</p>
            <p className="mt-1 text-slate-200/85">{findingSummary}</p>
            <p className="mt-3 text-sm font-black text-rose-100">Level {finalLevel} · {finalLabel ?? "Sanction"}</p>
            <p className="mt-1">Typical starting level: {typicalLevel ?? "not specified"}</p>
            <p className="mt-1">Target: {targetType}{targetReference ? ` · ${targetReference}` : ""}</p>
            <p className="mt-3"><span className="font-semibold text-foreground">Aggravating:</span> {aggravatingFactors.length ? aggravatingFactors.join(" · ") : "None recorded"}</p>
            <p className="mt-1"><span className="font-semibold text-foreground">Mitigating:</span> {mitigatingFactors.length ? mitigatingFactors.join(" · ") : "None recorded"}</p>
            <p className="mt-3 whitespace-pre-wrap"><span className="font-semibold text-foreground">Decision rationale:</span> {rationale}</p>
          </div>
          <p>{visibleToReporter ? "The sanction event and decision are marked reporter-visible." : "This sanction is not marked reporter-visible."}</p>
          <p>The current legacy authority applies immediately after confirmation. Canonical preflight, stale-state protection, idempotency and receipt evidence remain tracked in System #960.</p>
        </div>
      }
      confirmLabel={`Record Level ${finalLevel} sanction`}
      busy={busy}
      danger={finalLevel >= 8}
    />
  );
}

export function IntegrityAppealDecisionReview({
  open,
  onClose,
  onConfirm,
  busy,
  currentLevel,
  currentLabel,
  grounds,
  outcome,
  replacementLevel,
  replacementLabel,
  aggravatingFactors,
  mitigatingFactors,
  rationale,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
  currentLevel: number | null;
  currentLabel: string | null;
  grounds: string;
  outcome: string;
  replacementLevel: number | null;
  replacementLabel: string | null | undefined;
  aggravatingFactors: string[];
  mitigatingFactors: string[];
  rationale: string;
}) {
  const humanOutcome = outcome.replaceAll("_", " ");
  return (
    <AdminConfirmSheet
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Record appeal outcome: ${humanOutcome}?`}
      description={
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground" data-v3-organizer-appeal-decision-review>
          <p>This finalizes the fresh-review appeal decision. Only the assigned reviewer may apply it.</p>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <p className="font-semibold text-foreground">Appealed sanction</p>
            <p className="mt-1 text-slate-200/85">{currentLevel ? `Level ${currentLevel} · ${currentLabel ?? "Sanction"}` : "Sanction record unavailable"}</p>
            <p className="mt-3"><span className="font-semibold text-foreground">Appeal grounds:</span> {grounds}</p>
            <p className="mt-3 text-sm font-black capitalize text-amber-100">Outcome: {humanOutcome}</p>
            {replacementLevel ? <p className="mt-1">Replacement: Level {replacementLevel} · {replacementLabel ?? "Sanction"}</p> : null}
            {replacementLevel ? <p className="mt-3"><span className="font-semibold text-foreground">Aggravating:</span> {aggravatingFactors.length ? aggravatingFactors.join(" · ") : "None recorded"}</p> : null}
            {replacementLevel ? <p className="mt-1"><span className="font-semibold text-foreground">Mitigating:</span> {mitigatingFactors.length ? mitigatingFactors.join(" · ") : "None recorded"}</p> : null}
            <p className="mt-3 whitespace-pre-wrap"><span className="font-semibold text-foreground">Fresh-review rationale:</span> {rationale}</p>
          </div>
          <p>{outcome === "overturned" ? "The current sanction will be marked overturned." : replacementLevel ? "The current sanction will be marked modified on appeal and a replacement sanction will be created." : "The appeal record will be finalized with this outcome."}</p>
          <p>The current legacy authority applies immediately after confirmation. Canonical preflight, stale-state protection, idempotency and receipt evidence remain tracked in System #960.</p>
        </div>
      }
      confirmLabel="Record appeal decision"
      busy={busy}
      danger={outcome === "increased"}
    />
  );
}
