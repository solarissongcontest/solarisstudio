import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AdminSheet, AdminStatus } from "@/components/admin/AdminUI";
import { cn } from "@/lib/utils";

export type OrganizerConsequenceRiskTier = 2 | 3 | 4;

export type OrganizerConsequenceItem = {
  id?: string;
  label: string;
  detail?: string;
  tone?: "neutral" | "attention" | "danger";
};

export type OrganizerConsequenceConfirmation = {
  mode: "review" | "explicit" | "typed" | "reauth";
  phrase?: string;
  acknowledgementLabel?: string;
  reauthenticationRequired?: boolean;
};

export type OrganizerConsequencePreflight = {
  operation: string;
  riskTier: OrganizerConsequenceRiskTier;
  editionLabel: string;
  showLabel?: string | null;
  target?: string | null;
  affectedCount?: number | null;
  consequences: readonly OrganizerConsequenceItem[];
  publicEffect?: string | null;
  notifications?: string | null;
  reversibility: "reversible" | "conditionally_reversible" | "irreversible" | "unknown";
  blockers?: readonly OrganizerConsequenceItem[];
  warnings?: readonly OrganizerConsequenceItem[];
  expectedVersion?: string | number | null;
  confirmation: OrganizerConsequenceConfirmation;
};

export type OrganizerConsequenceSheetProps = {
  open: boolean;
  preflight: OrganizerConsequencePreflight;
  busy?: boolean;
  reauthenticationSatisfied?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onRequestReauthentication?: () => void | Promise<void>;
  footer?: ReactNode;
};

function riskLabel(tier: OrganizerConsequenceRiskTier) {
  if (tier === 4) return "Critical";
  if (tier === 3) return "High consequence";
  return "Operational";
}

function reversibilityLabel(value: OrganizerConsequencePreflight["reversibility"]) {
  switch (value) {
    case "reversible":
      return "Reversible";
    case "conditionally_reversible":
      return "Conditionally reversible";
    case "irreversible":
      return "Irreversible";
    case "unknown":
      return "Reversibility not confirmed";
  }
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-white/[0.055] py-2.5 last:border-b-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

function ConsequenceList({
  title,
  items,
  blocker = false,
}: {
  title: string;
  items: readonly OrganizerConsequenceItem[];
  blocker?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="flex items-center gap-2">
        {blocker ? <ShieldAlert className="size-4 text-rose-200" /> : <Info className="size-4 text-muted-foreground" />}
        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-foreground">{title}</h3>
      </div>
      <ul className="mt-3 space-y-2.5">
        {items.map((item, index) => (
          <li key={item.id ?? `${item.label}:${index}`} className="flex items-start gap-2.5 text-xs leading-relaxed">
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 size-1.5 shrink-0 rounded-full bg-white/35",
                item.tone === "attention" && "bg-amber-200/80",
                (item.tone === "danger" || blocker) && "bg-rose-200/80",
              )}
            />
            <span className="min-w-0">
              <span className="font-semibold text-foreground">{item.label}</span>
              {item.detail ? <span className="mt-0.5 block text-muted-foreground">{item.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OrganizerConsequenceSheet({
  open,
  preflight,
  busy = false,
  reauthenticationSatisfied = false,
  onClose,
  onConfirm,
  onRequestReauthentication,
  footer,
}: OrganizerConsequenceSheetProps) {
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setAcknowledged(false);
    }
  }, [open]);

  const blockers = preflight.blockers ?? [];
  const warnings = preflight.warnings ?? [];
  const scope = [preflight.editionLabel, preflight.showLabel].filter(Boolean).join(" · ");
  const requiresAck = preflight.confirmation.mode === "explicit";
  const requiresTyped = preflight.confirmation.mode === "typed";
  const requiresReauth =
    preflight.confirmation.mode === "reauth" || preflight.confirmation.reauthenticationRequired === true;
  const requiredPhrase = preflight.confirmation.phrase ?? "CONFIRM";

  const confirmationSatisfied = useMemo(() => {
    if (requiresTyped && typed.trim() !== requiredPhrase) return false;
    if (requiresAck && !acknowledged) return false;
    if (requiresReauth && !reauthenticationSatisfied) return false;
    return true;
  }, [acknowledged, reauthenticationSatisfied, requiredPhrase, requiresAck, requiresReauth, requiresTyped, typed]);

  const blocked = blockers.length > 0;
  const confirmDisabled = busy || blocked || !confirmationSatisfied;

  return (
    <AdminSheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={preflight.operation}
      description={scope}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Review before applying</p>
            <p className="mt-0.5 text-sm font-bold text-foreground">{riskLabel(preflight.riskTier)} operation</p>
          </div>
          <AdminStatus tone={preflight.riskTier >= 3 ? "blocked" : "attention"}>Tier {preflight.riskTier}</AdminStatus>
        </div>

        <dl className="rounded-xl border border-white/[0.08] bg-white/[0.018] px-3.5">
          <DetailRow label="Edition" value={preflight.editionLabel} />
          {preflight.showLabel ? <DetailRow label="Show" value={preflight.showLabel} /> : null}
          {preflight.target ? <DetailRow label="Target" value={preflight.target} /> : null}
          {preflight.affectedCount != null ? <DetailRow label="Affected" value={preflight.affectedCount} /> : null}
          <DetailRow label="Reversibility" value={reversibilityLabel(preflight.reversibility)} />
          {preflight.expectedVersion != null ? <DetailRow label="Expected version" value={String(preflight.expectedVersion)} /> : null}
          {preflight.publicEffect ? <DetailRow label="Public effect" value={preflight.publicEffect} /> : null}
          {preflight.notifications ? <DetailRow label="Notifications" value={preflight.notifications} /> : null}
        </dl>

        <ConsequenceList title="Consequences" items={preflight.consequences} />
        <ConsequenceList title="Warnings" items={warnings} />
        <ConsequenceList title="Blocked" items={blockers} blocker />

        {blocked ? (
          <div role="alert" className="rounded-xl border border-rose-200/15 bg-rose-200/[0.045] p-3 text-xs leading-relaxed text-muted-foreground">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-200" />
              <span>This operation cannot be applied while authoritative preflight blockers remain.</span>
            </div>
          </div>
        ) : null}

        {requiresAck ? (
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-amber-200/12 bg-amber-200/[0.025] p-3 text-xs leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
              checked={acknowledged}
              disabled={busy}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>{preflight.confirmation.acknowledgementLabel ?? "I reviewed the consequences and want to continue."}</span>
          </label>
        ) : null}

        {requiresTyped ? (
          <label className="block">
            <span className="text-xs font-semibold text-foreground">Type {requiredPhrase} to confirm</span>
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={busy}
              autoComplete="off"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30 disabled:opacity-50"
            />
          </label>
        ) : null}

        {requiresReauth ? (
          <div className="rounded-xl border border-rose-200/12 bg-rose-200/[0.025] p-3">
            <div className="flex items-start gap-2.5">
              {reauthenticationSatisfied ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-200" />
              ) : (
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-200" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">
                  {reauthenticationSatisfied ? "Identity re-verified" : "Reauthentication required"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {reauthenticationSatisfied
                    ? "This review may continue with the reauthenticated session."
                    : "The parent workflow must reauthenticate the organizer before commit. This sheet does not bypass or simulate reauthentication."}
                </p>
                {!reauthenticationSatisfied && onRequestReauthentication ? (
                  <button
                    type="button"
                    className="admin-action-secondary mt-3"
                    disabled={busy}
                    onClick={() => void onRequestReauthentication()}
                  >
                    Reauthenticate
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {footer}

        <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-white/[0.07] bg-[#081326]/95 px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:-mb-5 sm:px-5">
          <button type="button" className="admin-action-secondary flex-1" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={cn("flex-1", preflight.riskTier >= 3 ? "admin-action-danger" : "admin-action-primary")}
            disabled={confirmDisabled}
            onClick={() => void onConfirm()}
          >
            {busy ? "Applying…" : "Apply operation"}
          </button>
        </div>
      </div>
    </AdminSheet>
  );
}
