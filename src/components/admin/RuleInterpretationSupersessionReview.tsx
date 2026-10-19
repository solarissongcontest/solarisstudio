import { AdminConfirmSheet } from "@/components/admin/AdminUI";

export function RuleInterpretationSupersessionReview({
  open,
  onClose,
  onConfirm,
  busy,
  currentCode,
  currentTitle,
  replacementCode,
  replacementTitle,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
  currentCode: string;
  currentTitle: string;
  replacementCode: string;
  replacementTitle: string;
}) {
  return (
    <AdminConfirmSheet
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Supersede ${currentCode} with ${replacementCode}?`}
      description={
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground" data-v3-organizer-interpretation-supersession-review>
          <p>
            This changes which published Official Interpretation is current. The older ruling remains in the public historical record, but readers will be directed to the replacement as the governing interpretation.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200/12 bg-amber-200/[0.035] p-3">
              <p className="text-[9px] font-black uppercase tracking-[.1em] text-amber-100/70">Becomes historical</p>
              <p className="mt-2 font-mono text-[10px] font-black text-amber-100">{currentCode}</p>
              <p className="mt-1 font-black text-foreground">{currentTitle}</p>
            </div>
            <div className="rounded-xl border border-emerald-200/12 bg-emerald-200/[0.035] p-3">
              <p className="text-[9px] font-black uppercase tracking-[.1em] text-emerald-100/70">Becomes replacement</p>
              <p className="mt-2 font-mono text-[10px] font-black text-emerald-100">{replacementCode}</p>
              <p className="mt-1 font-black text-foreground">{replacementTitle}</p>
            </div>
          </div>
          <p>
            The current legacy supersession RPC applies immediately after confirmation. Canonical snapshot-bound preflight, stale-state protection, idempotency and receipt evidence remain tracked in System #956.
          </p>
        </div>
      }
      confirmLabel="Supersede interpretation"
      confirmationText={replacementCode}
      confirmationHint={`Type ${replacementCode} to confirm the replacement`}
      busy={busy}
      danger
    />
  );
}
