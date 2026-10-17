import {
  CheckCircle2,
  CircleDot,
} from "lucide-react";

import {
  deriveV3EntryLifecycle,
  deriveV3EntryResubmissionDiff,
  type V3EntryProjection,
  type V3EntryRevisionFieldDiff,
} from "@/lib/v3-entry";
import { V3Surface } from "./V3Foundation";

function valueLabel(value: string | null) {
  return value?.trim() || "Not supplied";
}

function DiffField({ field }: { field: V3EntryRevisionFieldDiff }) {
  const Icon = field.changed ? CircleDot : CheckCircle2;
  return (
    <li
      className="rounded-xl border border-[var(--v3-border-subtle)] p-3"
      data-v3-entry-diff-field={field.field}
      data-v3-entry-diff-changed={field.changed ? "true" : "false"}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={field.changed ? "mt-0.5 size-4 shrink-0 text-amber-200" : "mt-0.5 size-4 shrink-0 text-emerald-300"}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{field.label}</p>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--v3-text-tertiary)]">
              {field.changed ? "Changed" : "Unchanged"}
            </span>
          </div>
          {field.changed ? (
            <dl className="mt-2 grid gap-1 text-xs leading-5 sm:grid-cols-2">
              <div>
                <dt className="text-[var(--v3-text-tertiary)]">Previous</dt>
                <dd className="break-words text-[var(--v3-text-secondary)]">{valueLabel(field.previousValue)}</dd>
              </div>
              <div>
                <dt className="text-[var(--v3-text-tertiary)]">Current</dt>
                <dd className="break-words">{valueLabel(field.currentValue)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-1 break-words text-xs text-[var(--v3-text-secondary)]">
              {valueLabel(field.currentValue)}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Participant-facing resubmission comparison derived only from immutable
 * server Entry versions. Artist, Song and structured Credits are all canonical
 * version content; fields that still lack immutable projection evidence are
 * deliberately not reconstructed from browser or draft state.
 */
export function V3EntryResubmissionPanel({ projection }: { projection: V3EntryProjection }) {
  if (projection.state !== "ready") return null;
  const lifecycle = projection.lifecycle ?? deriveV3EntryLifecycle(projection.confirmation);
  if (lifecycle.state !== "changes-required" && lifecycle.state !== "review-stale") return null;

  const diff = deriveV3EntryResubmissionDiff(projection.versionHistory);
  if (!diff) return null;
  const changed = diff.fields.filter((field) => field.changed);
  const unchanged = diff.fields.filter((field) => !field.changed);

  return (
    <div
      className="relative z-10 mx-auto w-full max-w-3xl px-4 pt-3"
      data-v3-entry-resubmission-diff="server-version-history"
    >
      <V3Surface className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--v3-text-tertiary)]">
              Review changes
            </p>
            <h2 className="mt-1 text-base font-semibold">
              Revision {diff.previousRevision} → {diff.currentRevision}
            </h2>
          </div>
          <span className="rounded-full border border-[var(--v3-border)] px-2.5 py-1 text-xs font-semibold text-[var(--v3-text-secondary)]">
            {changed.length} changed · {unchanged.length} unchanged
          </span>
        </div>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[...changed, ...unchanged].map((field) => (
            <DiffField key={field.field} field={field} />
          ))}
        </ul>

        <p className="mt-3 text-xs leading-5 text-[var(--v3-text-tertiary)]">
          This comparison uses immutable server Entry versions for Artist, Song and Credits. Other submission fields stay in the canonical Confirmation editor and are not guessed here.
        </p>
      </V3Surface>
    </div>
  );
}