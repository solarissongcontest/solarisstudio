import { ChevronRight, MoreHorizontal, X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 border-b border-white/[0.07] pb-4 sm:mb-6 sm:pb-5">
      {eyebrow ? <p className="admin-section-label">{eyebrow}</p> : null}
      <div className="mt-1 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="admin-page-title text-[2.45rem] leading-[.92] sm:text-5xl">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function AdminCard({
  children,
  className,
  strong = false,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return <section className={cn("admin-card p-4 sm:p-5", strong && "admin-card-strong", className)}>{children}</section>;
}

export function AdminCardHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="admin-section-label">{eyebrow}</p> : null}
        <h2 className="mt-1 text-base font-bold tracking-[-.02em] text-foreground sm:text-lg">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AdminStatus({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "ready" | "attention" | "blocked" | "info" | "neutral";
}) {
  return <span className="admin-status" data-tone={tone}>{children}</span>;
}

export function AdminProgress({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="admin-progress-track" aria-label={`${Math.round(safe)}% complete`}>
      <div className="admin-progress-fill" style={{ width: `${safe}%` }} />
    </div>
  );
}

export function AdminListLink({
  icon: Icon,
  title,
  description,
  meta,
  onClick,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  meta?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="admin-list-row w-full text-left">
      {Icon ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-muted-foreground">
          <Icon className="size-4" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
        {description ? <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">{description}</span> : null}
      </span>
      {meta ? <span className="shrink-0">{meta}</span> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

export function AdminSheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <button type="button" aria-label="Close panel" className="admin-sheet-backdrop" onClick={onClose} />
      <aside className="admin-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="admin-sheet-handle" />
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/[0.07] bg-[#081326]/95 px-4 py-4 backdrop-blur-xl sm:px-5">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="admin-action-quiet size-10 !p-0" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </aside>
    </>
  );
}

export function AdminMoreMenu({
  label = "More actions",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="admin-action-secondary !min-h-10 !px-3" aria-label={label}>
        <MoreHorizontal className="size-4" />
      </button>
      <AdminSheet open={open} onClose={() => setOpen(false)} title={label}>
        <div onClick={() => setOpen(false)}>{children}</div>
      </AdminSheet>
    </>
  );
}
