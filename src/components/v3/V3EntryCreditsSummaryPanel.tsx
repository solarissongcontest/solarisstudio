import type { EntryCreditRole } from "@/lib/ssc";
import { v3EntryCreditSummaryRows } from "@/lib/v3-entry-credits-summary";
import type { V3EntryProjection } from "@/lib/v3-entry";
import { V3Surface } from "./V3Foundation";

const ROLE_LABELS: Record<EntryCreditRole, string> = {
  composer: "Composer",
  lyricist: "Lyricist",
  songwriter: "Songwriter",
  producer: "Producer",
  arranger: "Arranger",
  other: "Other",
};

export function V3EntryCreditsSummaryPanel({ projection }: { projection: V3EntryProjection }) {
  const rows = v3EntryCreditSummaryRows(projection);
  if (!rows.length) return null;

  return (
    <div
      className="relative z-10 mx-auto w-full max-w-3xl px-4 pt-3"
      data-v3-entry-credits-summary="canonical-projection"
    >
      <V3Surface className="p-4 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--v3-text-tertiary)]">
          Entry Credits
        </p>
        <h2 className="mt-1 text-base font-semibold">Current structured Credits</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--v3-text-tertiary)]">
          These Credits come from the current caller-scoped Entry projection. Draft values are not substituted here.
        </p>

        <div className="mt-3 grid gap-3">
          {rows.map((row) => (
            <section
              key={row.id}
              className="rounded-xl border border-[var(--v3-border-subtle)] p-3"
              data-v3-entry-credit-row={row.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{row.label}</h3>
                {row.selected ? (
                  <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                    Selected
                  </span>
                ) : null}
              </div>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {row.credits.map((credit, index) => (
                  <div key={`${credit.role}:${credit.name}:${index}`}>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--v3-text-tertiary)]">
                      {ROLE_LABELS[credit.role]}
                    </dt>
                    <dd className="mt-0.5 text-sm text-[var(--v3-text-secondary)]">
                      {credit.name}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </V3Surface>
    </div>
  );
}
