import { Link } from "@tanstack/react-router";
import { CircleHelp, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { readIntegrityReportV5Draft } from "@/lib/integrity-report-v5";

export function IntegrityReportShell({
  step,
  title,
  children,
  footer,
}: {
  step: number;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [shielded, setShielded] = useState(false);
  const [safetyContext, setSafetyContext] = useState(false);

  useEffect(() => {
    setSafetyContext(["safety", "privacy"].includes(readIntegrityReportV5Draft().category));
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setShielded(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (shielded) {
    return (
      <SolarisDepthPage tone="integrity">
        <SolarisDepthSafeZone>
          <SolarisDepthSurface variant="task" className="mx-auto max-w-xl p-6 text-center">
            <SolarisDepthEyebrow tone="integrity">Trust & Integrity</SolarisDepthEyebrow>
            <h1 className="mt-3 text-2xl font-bold">Sensitive content hidden</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Solaris hid this report while the app was inactive so its contents are not left visible on return.
            </p>
            <button
              type="button"
              onClick={() => setShielded(false)}
              className="mt-5 min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              Reveal report
            </button>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    );
  }

  return (
    <SolarisDepthPage tone="integrity" className="solaris-depth-task">
      <SolarisDepthSafeZone>
        <SolarisDepthSurface variant="task">
          <header className="solaris-depth-task-header">
            <div className="flex min-h-10 items-center gap-3">
              <Link
                to="/integrity"
                aria-label="Exit report"
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025]"
              >
                <X className="size-4" />
              </Link>
              <div className="min-w-0 flex-1">
                <SolarisDepthEyebrow tone="integrity">Report a concern · Step {step} of 5</SolarisDepthEyebrow>
              </div>
              {safetyContext ? (
                <button
                  type="button"
                  onClick={() => window.location.replace("/guide")}
                  className="min-h-10 rounded-xl border border-white/[0.08] px-3 text-xs font-bold"
                >
                  Exit quickly
                </button>
              ) : (
                <Link
                  to="/integrity/process"
                  aria-label="Reporting help"
                  className="grid size-10 place-items-center rounded-xl border border-white/[0.08] text-muted-foreground"
                >
                  <CircleHelp className="size-4" />
                </Link>
              )}
            </div>
            <h1 className="mt-3 text-xl font-bold tracking-[-0.02em]">{title}</h1>
            <div className="solaris-depth-task-progress" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, step * 20))}%` }} />
            </div>
            <GovernanceStatusStrip context="report" className="mt-3" />
          </header>

          <div className="solaris-depth-task-body">
            {children}
          </div>
        </SolarisDepthSurface>
      </SolarisDepthSafeZone>

      {footer ? (
        <div className="solaris-depth-task-footer">
          <div>{footer}</div>
        </div>
      ) : null}
    </SolarisDepthPage>
  );
}
