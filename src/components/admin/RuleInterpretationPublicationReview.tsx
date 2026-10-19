import { AdminConfirmSheet } from "@/components/admin/AdminUI";
import { getRuleById } from "@/lib/ssc-rules-v4";

export function RuleInterpretationPublicationReview({
  open,
  onClose,
  onConfirm,
  busy,
  code,
  title,
  question,
  interpretation,
  rationale,
  ruleIds,
  effectiveFrom,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  busy: boolean;
  code: string;
  title: string;
  question: string;
  interpretation: string;
  rationale: string;
  ruleIds: string[];
  effectiveFrom: string | null;
}) {
  return (
    <AdminConfirmSheet
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Publish ${code} as an immutable Official Interpretation?`}
      description={
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground" data-v3-organizer-interpretation-publication-review>
          <p>
            Publishing makes this exact interpretation part of the public rules record. It becomes immutable and can only be replaced later through a published superseding interpretation.
          </p>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <p className="font-mono text-[10px] font-black text-violet-200">{code}</p>
            <p className="mt-2 text-sm font-black text-foreground">{title}</p>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Public question</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-200/85">{question}</p>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Official interpretation</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-200/85">{interpretation}</p>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Public reasoning</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-200/85">{rationale}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
            <p className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Current rules cited</p>
            <div className="mt-2 space-y-1">
              {ruleIds.map((ruleId) => (
                <p key={ruleId} className="text-[10px] text-slate-200/80">
                  Rule {ruleId} · {getRuleById(ruleId)?.title ?? "Unknown current rule"}
                </p>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-slate-200/80">
              Effective from: {effectiveFrom ? new Date(effectiveFrom).toLocaleString() : "publication time"}
            </p>
          </div>
          <p>
            The current legacy publish RPC applies immediately after confirmation. Canonical snapshot-bound preflight, stale-state protection, idempotency and receipt evidence remain tracked in System #956.
          </p>
        </div>
      }
      confirmLabel="Publish immutable interpretation"
      busy={busy}
      confirmDisabled={!ruleIds.length}
    />
  );
}
