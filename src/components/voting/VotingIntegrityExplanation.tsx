import type { ReactNode } from "react";
import type { IntegrityIntervention } from "@/integrations/televoting/integrity-policy";
import { voterIntegrityReasons } from "@/integrations/televoting/voter-integrity-copy";
import { cn } from "@/lib/utils";

/** Generic reasons only. Never show private Jury evidence or detector thresholds. */
export function VotingIntegrityReasonList({ categories }: { categories?: string[] }) {
  const reasons = voterIntegrityReasons(categories);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5" data-voter-integrity-reasons>
      <h3 className="text-base font-semibold">Why did I get this warning?</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        These patterns can happen naturally. A warning alone doesn't mean someone broke the rules.
      </p>
      {reasons.length ? (
        <ul className="mt-3 space-y-3">
          {reasons.map((reason) => (
            <li key={reason.title}>
              <p className="text-sm font-semibold">{reason.title}</p>
              <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{reason.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Solaris noticed an unusual combination of voting patterns.
        </p>
      )}
    </section>
  );
}

/** Keep exact signed language accessible without changing the saved v2 audit text. */
export function VotingDeclarationCheckbox({
  checked,
  onChange,
  shortText,
  fullText,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  shortText: ReactNode;
  fullText: string;
}) {
  return (
    <div className={cn("rounded-xl border p-3 text-sm", checked ? "border-emerald-300/25 bg-emerald-300/[0.05]" : "border-border bg-surface")}>
      <label className="flex cursor-pointer items-start gap-3 leading-6">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 shrink-0"
        />
        <span>{shortText}</span>
      </label>
      <details className="ml-6 mt-2 text-xs leading-5 text-muted-foreground">
        <summary className="cursor-pointer underline-offset-2 hover:underline">Read the full statement</summary>
        <p className="mt-2">{fullText}</p>
      </details>
    </div>
  );
}

/** Visual severity follows the actual required action, not the raw risk score. */
export function voterIntegrityBannerClass(intervention?: IntegrityIntervention) {
  if (intervention === "provisional_review") return "border-red-300/30 bg-red-300/10 text-red-100";
  if (intervention === "enhanced_declaration") return "border-orange-300/30 bg-orange-300/10 text-orange-100";
  if (intervention === "declaration") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (intervention === "review") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-sky-300/20 bg-sky-300/10 text-sky-100";
}
