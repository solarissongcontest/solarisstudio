import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  XCircle,
} from "lucide-react";

import type { V3EntryMediaPipelineState, V3EntryMediaPipelineView } from "@/lib/v3-entry-media";
import { cn } from "@/lib/utils";
import { V3Surface } from "./V3Foundation";

type Presentation = {
  label: string;
  icon: typeof Clock3;
  className: string;
};

const PRESENTATION: Record<V3EntryMediaPipelineState, Presentation> = {
  queued: { label: "Queued", icon: Clock3, className: "text-[var(--v3-text-secondary)]" },
  uploading: { label: "Uploading", icon: UploadCloud, className: "text-sky-300" },
  processing: { label: "Processing", icon: LoaderCircle, className: "text-sky-300" },
  validating: { label: "Validating", icon: RefreshCw, className: "text-amber-200" },
  accepted: { label: "Accepted", icon: CheckCircle2, className: "text-emerald-300" },
  failed: { label: "Upload failed", icon: XCircle, className: "text-[var(--v3-danger)]" },
  quarantined: { label: "Quarantined", icon: ShieldAlert, className: "text-[var(--v3-danger)]" },
  replacement_required: {
    label: "Replacement required",
    icon: AlertTriangle,
    className: "text-[var(--v3-danger)]",
  },
};

export function V3EntryMediaPipelineStatus({
  title,
  view,
  onRetry,
}: {
  title: string;
  view: V3EntryMediaPipelineView;
  onRetry?: () => void;
}) {
  const presentation = PRESENTATION[view.state];
  const Icon = presentation.icon;
  const actionable = view.retryable && Boolean(onRetry);

  return (
    <V3Surface
      level={view.state === "quarantined" || view.state === "replacement_required" ? "raised" : "base"}
      className="p-4"
    >
      <div
        className="flex min-w-0 items-start gap-3"
        data-v3-entry-media-state={view.state}
        data-v3-entry-media-source={view.source}
        aria-live={view.state === "failed" || view.state === "quarantined" || view.state === "replacement_required" ? "assertive" : "polite"}
      >
        <span
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-current/25",
            presentation.className,
          )}
        >
          <Icon className={cn("size-4", view.state === "processing" && "animate-spin")} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className={cn("text-[10px] font-black uppercase tracking-[0.16em]", presentation.className)}>
                {presentation.label}
              </p>
              <h3 className="mt-1 truncate text-sm font-semibold">{title}</h3>
            </div>
            {view.progressPercent !== null ? (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--v3-text-secondary)]">
                {view.progressPercent}%
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm leading-6 text-[var(--v3-text-secondary)]">{view.detail}</p>

          {view.progressPercent !== null ? (
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-label={`${title} upload progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={view.progressPercent}
            >
              <div
                className="h-full rounded-full bg-current transition-[width] duration-150"
                style={{ width: `${view.progressPercent}%` }}
              />
            </div>
          ) : null}

          {actionable ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 min-h-10 rounded-xl border border-white/10 px-3 text-xs font-semibold"
            >
              Retry safely
            </button>
          ) : null}
        </div>
      </div>
    </V3Surface>
  );
}
