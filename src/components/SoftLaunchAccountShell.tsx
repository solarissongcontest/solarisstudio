import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";

/**
 * A narrow account experience for early access. In maintenance, the regular
 * navigation would link users into unfinished features and legacy writers.
 * The Worker independently enforces the HTTP allowlist.
 */
export function SoftLaunchAccountShell({ children }: { children: ReactNode }) {
  if (!GLOBAL_MAINTENANCE_MODE) return <AppShell>{children}</AppShell>;

  return (
    <div className="min-h-dvh bg-background text-foreground" data-soft-launch-account-shell="true">
      <header className="border-b border-border/70 bg-surface/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="text-sm font-black tracking-tight text-foreground">
            Solaris Studio
          </a>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Early access
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {children}
        <p className="mx-auto mt-8 max-w-md text-center text-xs leading-6 text-muted-foreground">
          Country accounts and secure existing Confirmation editing are available.
          Official Jury Voting and other contest features are not open yet.
        </p>
      </main>
    </div>
  );
}
