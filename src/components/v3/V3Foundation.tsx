import { Link } from "@tanstack/react-router";
import type { HTMLAttributes, ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  Circle,
  LockKeyhole,
  Radio,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import "@/styles/v3-foundations.css";

export type V3StatusTone =
  | "required"
  | "progress"
  | "success"
  | "warning"
  | "danger"
  | "live"
  | "locked"
  | "neutral";

export type V3ActionTone = "required" | "urgent" | "problem" | "complete" | "neutral";
export type V3JourneyState = "complete" | "active" | "waiting" | "locked" | "problem";

export function V3FoundationShell({ children }: { children: ReactNode }) {
  return (
    <div data-solaris-v3 className="v3-foundation-shell">
      {children}
    </div>
  );
}

export function V3TopContext({
  edition,
  phase,
  actions,
}: {
  edition: string;
  phase?: string | null;
  actions?: ReactNode;
}) {
  return (
    <header className="v3-top-context">
      <div
        className="v3-top-context__edition"
        aria-label={`${edition}${phase ? `, ${phase}` : ""}`}
      >
        <span className="v3-top-context__dot" aria-hidden="true" />
        <span className="truncate">{edition}</span>
        {phase ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{phase}</span>
          </>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

export function V3Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("v3-screen", className)}>{children}</main>;
}

export function V3ScreenHeader({
  kicker,
  title,
  description,
  editorial = false,
}: {
  kicker?: string;
  title: string;
  description?: string;
  editorial?: boolean;
}) {
  return (
    <header className="v3-screen-header">
      {kicker ? <p className="v3-kicker">{kicker}</p> : null}
      <h1 className={cn("v3-display", editorial && "v3-display--editorial")}>{title}</h1>
      {description ? <p className="v3-lead">{description}</p> : null}
    </header>
  );
}

export function V3Section({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("v3-section", className)}>
      <div className="v3-section__header">
        <h2 className="v3-section__title">{title}</h2>
        {meta ? <div className="v3-section__meta">{meta}</div> : null}
      </div>
      {children}
    </section>
  );
}

type V3SurfaceProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children: ReactNode;
  level?: "base" | "raised" | "glass";
};

export function V3Surface({
  children,
  level = "base",
  className,
  ...props
}: V3SurfaceProps) {
  return (
    <div
      {...props}
      className={cn(
        "v3-surface",
        level === "raised" && "v3-surface--raised",
        level === "glass" && "v3-surface--glass",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function V3NowCard({
  eyebrow,
  title,
  count,
  children,
}: {
  eyebrow: string;
  title: string;
  count?: number | "✓";
  children?: ReactNode;
}) {
  return (
    <V3Surface level="raised" className="v3-now">
      <div className="v3-now__row">
        <div className="min-w-0">
          <p className="v3-now__eyebrow">{eyebrow}</p>
          <h2 className="v3-now__title">{title}</h2>
        </div>
        {count != null ? <span className="v3-now__count">{count}</span> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </V3Surface>
  );
}

function actionIcon(tone: V3ActionTone): LucideIcon {
  if (tone === "urgent" || tone === "problem") return AlertTriangle;
  if (tone === "complete") return Check;
  if (tone === "required") return Clock3;
  return Circle;
}

export function V3ActionCard({
  title,
  description,
  meta,
  tone = "neutral",
  icon,
  onClick,
  to,
  trailing = true,
}: {
  title: string;
  description: string;
  meta?: ReactNode;
  tone?: V3ActionTone;
  icon?: LucideIcon;
  onClick?: () => void;
  to?: string;
  trailing?: boolean;
}) {
  const Icon = icon ?? actionIcon(tone);
  const contents = (
    <>
      <span className="v3-action-card__icon" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <span className="v3-action-card__body">
        <span className="v3-action-card__title">{title}</span>
        <span className="v3-action-card__description">{description}</span>
        {meta ? <span className="v3-action-card__meta">{meta}</span> : null}
      </span>
      {trailing ? (
        <ChevronRight className="mt-2 size-4 shrink-0 text-white/35" aria-hidden="true" />
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link to={to as any} className="v3-action-card" data-tone={tone}>
        {contents}
      </Link>
    );
  }

  return (
    <button type="button" className="v3-action-card" data-tone={tone} onClick={onClick}>
      {contents}
    </button>
  );
}

export function V3StatusChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: V3StatusTone;
}) {
  return (
    <span className="v3-status-chip" data-tone={tone}>
      {children}
    </span>
  );
}

export function V3Progress({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[0.68rem] text-white/48">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(clamped)}%</span>
        </div>
      ) : null}
      <div
        className="v3-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={label ?? "Progress"}
      >
        <div className="v3-progress__fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function journeyIcon(state: V3JourneyState): LucideIcon {
  if (state === "complete") return Check;
  if (state === "problem") return AlertTriangle;
  if (state === "locked") return LockKeyhole;
  if (state === "active") return Radio;
  return Clock3;
}

export function V3JourneyStep({
  title,
  detail,
  state,
  trailing,
}: {
  title: string;
  detail?: string;
  state: V3JourneyState;
  trailing?: ReactNode;
}) {
  const Icon = journeyIcon(state);
  return (
    <div className="v3-journey-step" data-state={state}>
      <span className="v3-journey-step__marker" aria-hidden="true">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="v3-journey-step__title">{title}</span>
        {detail ? <span className="v3-journey-step__detail">{detail}</span> : null}
      </span>
      {trailing ? <span className="v3-journey-step__trailing">{trailing}</span> : null}
    </div>
  );
}

export function V3Journey({ children }: { children: ReactNode }) {
  return <div className="v3-journey">{children}</div>;
}
