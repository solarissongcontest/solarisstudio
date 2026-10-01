import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
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
  const { connectivity } = useSolarisApp();
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
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Trust & Integrity</p>
        <h1 className="mt-3 text-2xl font-black">Sensitive content hidden</h1>
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
      </div>
    );
  }

  const unavailable = connectivity.status !== "online";

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <header className="sticky top-0 z-20 -mx-2 mb-5 border-b border-border/65 bg-background/94 px-2 pb-3 pt-1 backdrop-blur-xl">
        <div className="flex min-h-11 items-center gap-3">
          <Link
            to="/integrity"
            aria-label="Exit report"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-surface/55"
          >
            <X className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Report a concern · Step {step} of 5</p>
            <h1 className="truncate text-lg font-bold">{title}</h1>
          </div>
          {safetyContext ? (
            <button
              type="button"
              onClick={() => window.location.replace("/guide")}
              className="min-h-10 rounded-xl border border-border/70 px-3 text-xs font-bold"
            >
              Exit quickly
            </button>
          ) : null}
        </div>
        {unavailable ? (
          <div className="mt-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-3 py-2 text-xs leading-5 text-amber-50">
            Official submissions are currently unavailable. You can continue this session-only draft, but Solaris will block Submit until the service is healthy.
          </div>
        ) : null}
      </header>

      {children}

      {footer ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/92 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl">{footer}</div>
        </div>
      ) : null}
    </div>
  );
}
