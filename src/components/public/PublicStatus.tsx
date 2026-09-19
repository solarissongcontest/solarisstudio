import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  Eye,
  LockKeyhole,
  Radio,
  XCircle,
} from "lucide-react";

import {
  publicStatusDefinition,
  type PublicStatusKey,
} from "@/lib/public-status";
import { cn } from "@/lib/utils";

const ICONS = {
  current: Circle,
  upcoming: Clock3,
  open: CheckCircle2,
  full: LockKeyhole,
  live: Radio,
  under_review: Eye,
  needs_attention: AlertTriangle,
  changes_required: XCircle,
  pending: Clock3,
  closed: LockKeyhole,
  published: CheckCircle2,
  final: CheckCircle2,
  completed: CheckCircle2,
  delayed: AlertTriangle,
  unavailable: XCircle,
  not_published: Clock3,
} satisfies Record<PublicStatusKey, typeof Circle>;

export function PublicStatus({
  status,
  label,
  className,
}: {
  status: PublicStatusKey;
  label?: string;
  className?: string;
}) {
  const definition = publicStatusDefinition(status);
  const Icon = ICONS[status];

  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]",
        definition.tone === "neutral" &&
          "border-border bg-surface text-muted-foreground",
        definition.tone === "info" &&
          "border-sky-300/25 bg-sky-300/10 text-sky-100",
        definition.tone === "success" &&
          "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        definition.tone === "warning" &&
          "border-amber-300/25 bg-amber-300/10 text-amber-100",
        definition.tone === "danger" &&
          "border-destructive/30 bg-destructive/10 text-red-100",
        definition.tone === "live" &&
          "border-rose-300/30 bg-rose-300/10 text-rose-100",
        className,
      )}
      data-public-status={status}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label ?? definition.label}
    </span>
  );
}
