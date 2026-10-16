import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileEdit,
  RefreshCw,
  XCircle,
} from "lucide-react";

import {
  deriveV3EntryLifecycle,
  inferV3EntryCorrectionSection,
  type V3EntryLifecycleState,
  type V3EntryProjection,
} from "@/lib/v3-entry";
import { cn } from "@/lib/utils";
import { V3Surface } from "./V3Foundation";

type Presentation = {
  label: string;
  title: string;
  description: string;
  icon: typeof Clock3;
  className: string;
};

const PRESENTATION: Record<V3EntryLifecycleState, Presentation> = {
  "not-submitted": {
    label: "Not submitted",
    title: "No current Entry submission",
    description:
      "Start or continue the canonical submission below. Draft saves are never presented as a final submission.",
    icon: FileEdit,
    className: "text-[var(--v3-text-secondary)]",
  },
  "awaiting-review": {
    label: "Submitted",
    title: "Waiting for organizer review",
    description:
      "Solaris has canonical submission evidence, but there is no accepted review for the current version yet.",
    icon: Clock3,
    className: "text-amber-200",
  },
  "changes-required": {
    label: "Action required",
    title: "Changes required",
    description:
      "The organizer declined the current version. Correct the affected Entry content and resubmit the same canonical response.",
    icon: AlertTriangle,
    className: "text-[var(--v3-danger)]",
  },
  accepted: {
    label: "Accepted",
    title: "Current version accepted",
    description:
      "Organizer review matches the current immutable Entry version. Later edits create a new version that must be reviewed again.",
    icon: CheckCircle2,
    className: "text-emerald-300",
  },
  "review-stale": {
    label: "New revision",
    title: "Current version needs review",
    description:
      "A previous version has review evidence, but the current immutable version is newer. Solaris will not reuse an older acceptance.",
    icon: RefreshCw,
    className: "text-amber-200",
  },
  removed: {
    label: "Action required",
    title: "Entry removed from the submission",
    description:
      "Organizer evidence marks at least one current candidate as removed. Review the reason before editing or resubmitting.",
    icon: XCircle,
    className: "text-[var(--v3-danger)]",
  },
};

function sectionLabel(value: ReturnType<typeof inferV3EntryCorrectionSection>) {
  if (!value) return null;
  if (value === "song") return "Song";
  if (value === "artist") return "Artist";
  if (value === "credits") return "Credits";
  if (value === "metadata") return "Metadata";
  if (value === "media") return "Media";
  return "Review";
}

export function V3EntryLifecyclePanel({ projection }: { projection: V3EntryProjection }) {
  if (projection.state !== "ready") return null;

  const lifecycle = projection.lifecycle ?? deriveV3EntryLifecycle(projection.confirmation);
  const presentation = PRESENTATION[lifecycle.state];
  const correctionSection =
    lifecycle.state === "changes-required"
      ? inferV3EntryCorrectionSection(lifecycle.issue)
      : null;
  const correctionSectionLabel = sectionLabel(correctionSection);
  const Icon = presentation.icon;

  return (
    <div
      className="relative z-10 mx-auto w-full max-w-3xl px-4 pt-5"
      data-v3-entry-lifecycle={lifecycle.state}
      aria-live={lifecycle.state === "changes-required" || lifecycle.state === "removed" ? "assertive" : "polite"}
    >
      <V3Surface
        level={lifecycle.state === "changes-required" || lifecycle.state === "removed" ? "raised" : "base"}
        className="p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-current/25",
              presentation.className,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[10px] font-black uppercase tracking-[0.16em]", presentation.className)}>
              {presentation.label}
            </p>
            <h2 className="mt-1 text-base font-semibold">{presentation.title}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--v3-text-secondary)]">
              {presentation.description}
            </p>
            {lifecycle.issue ? (
              <div
                className="mt-3 rounded-xl border border-[var(--v3-danger)]/25 bg-[var(--v3-danger)]/5 p-3"
                data-v3-entry-correction-reason=""
              >
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--v3-danger)]">
                  Organizer reason
                </p>
                <p className="mt-1 text-sm leading-6">{lifecycle.issue}</p>
                {correctionSectionLabel ? (
                  <p
                    className="mt-2 text-xs font-semibold text-[var(--v3-text-secondary)]"
                    data-v3-entry-correction-section={correctionSection ?? undefined}
                  >
                    Suggested editor section: {correctionSectionLabel}
                  </p>
                ) : null}
              </div>
            ) : null}
            {lifecycle.affectedCandidateIds.length > 1 ? (
              <p className="mt-2 text-xs text-[var(--v3-text-tertiary)]">
                {lifecycle.affectedCandidateIds.length} candidates are affected.
              </p>
            ) : null}
          </div>
        </div>
      </V3Surface>
    </div>
  );
}
