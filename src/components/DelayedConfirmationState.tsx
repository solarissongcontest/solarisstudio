import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

const DEFAULT_SECONDS = 10;

export function DelayedConfirmationState({
  pendingTitle,
  pendingDescription,
  confirmedTitle,
  confirmedDescription,
  seconds = DEFAULT_SECONDS,
}: {
  pendingTitle: string;
  pendingDescription: string;
  confirmedTitle: string;
  confirmedDescription: string;
  seconds?: number;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const confirmed = remaining === 0;
  const progress = confirmed ? 100 : ((seconds - remaining) / seconds) * 100;

  return (
    <section
      className="glass-strong mx-auto max-w-2xl p-7 text-center sm:p-9"
      aria-live="polite"
      data-confirmation-stage={confirmed ? "confirmed" : "pending"}
    >
      <div
        className={`mx-auto grid size-12 place-items-center rounded-full border ${
          confirmed
            ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
            : "border-primary/25 bg-primary/10 text-primary"
        }`}
      >
        {confirmed ? (
          <CheckCircle2 className="size-6" />
        ) : (
          <LoaderCircle className="size-6 animate-spin" />
        )}
      </div>

      <p className="mt-4 text-[9px] font-black uppercase tracking-[0.18em] text-primary">
        {confirmed ? "Confirmed" : "Pending confirmation"}
      </p>
      <h2 className="mt-2 font-display text-2xl font-bold">
        {confirmed ? confirmedTitle : pendingTitle}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        {confirmed ? confirmedDescription : pendingDescription}
      </p>

      {!confirmed && (
        <div className="mx-auto mt-6 max-w-sm">
          <div className="flex items-center justify-between gap-3 text-[10px] font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-primary" /> Finalising receipt
            </span>
            <span className="numeric text-foreground">{remaining}s</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-strong">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Your submission is already stored. This short receipt step only confirms the final UI state.
          </p>
        </div>
      )}
    </section>
  );
}
