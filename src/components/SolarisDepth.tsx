import { AlertTriangle, Info, WifiOff, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { cn } from "@/lib/utils";

export type SolarisDepthTone = "rules" | "integrity" | "neutral";
export type SolarisDepthSurfaceVariant = "reading" | "action" | "task" | "quiet";

export function SolarisDepthPage({
  tone = "neutral",
  children,
  className,
}: {
  tone?: SolarisDepthTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("solaris-depth-page", className)}
      data-solaris-depth-tone={tone}
    >
      {children}
    </div>
  );
}

export function SolarisDepthSafeZone({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("solaris-depth-safe-zone", className)}>{children}</div>;
}

export function GovernanceDepthLayout({
  tone,
  context,
  children,
  className,
}: {
  tone: Extract<SolarisDepthTone, "rules" | "integrity">;
  context: "rules" | "integrity" | "report";
  children: ReactNode;
  className?: string;
}) {
  return (
    <SolarisDepthPage tone={tone}>
      <GovernanceStatusStrip context={context} />
      <SolarisDepthSafeZone className={className}>{children}</SolarisDepthSafeZone>
    </SolarisDepthPage>
  );
}

export function SolarisDepthSurface({
  variant = "reading",
  children,
  className,
  ...props
}: {
  variant?: SolarisDepthSurfaceVariant;
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("solaris-depth-surface", className)}
      data-solaris-depth-surface={variant}
      {...props}
    >
      {children}
    </div>
  );
}

export function SolarisDepthEyebrow({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "integrity" | "urgent";
}) {
  return (
    <p className="solaris-depth-eyebrow" data-tone={tone}>
      {children}
    </p>
  );
}

export function GovernanceStatusStrip({
  context,
  className,
}: {
  context: "rules" | "integrity" | "report";
  className?: string;
}) {
  const { connectivity } = useSolarisApp();
  if (connectivity.status === "online") return null;

  const offline = connectivity.status === "offline";
  const Icon: LucideIcon = offline ? WifiOff : context === "report" ? AlertTriangle : Info;

  const text =
    context === "rules"
      ? offline
        ? "Offline · Cached Rules remain available"
        : "Data limited · Rules remain available"
      : context === "report"
        ? offline
          ? "Draft only · Reconnect before submitting"
          : "Draft only · Submission unavailable"
        : offline
          ? "Offline · Case actions may be unavailable"
          : "Data limited · Case actions may be unavailable";

  return (
    <div
      className={cn("solaris-depth-status-strip", className)}
      data-status={connectivity.status}
      role="status"
      aria-live="polite"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
