import { ClipboardCheck, ListChecks, MailOpen } from "lucide-react";

import { Link } from "@tanstack/react-router";

import { Panel } from "@/components/AppShell";
import { NAV_TARGETS } from "@/lib/navigation-targets";

/**
 * Native MySolaris entry points for edition operations.
 *
 * This deliberately stays in the route tree instead of being appended by a
 * layout portal. Disabled rollout flags still get a visible destination so a
 * user can understand what the capability is and why it is unavailable.
 */
export function MySolarisOperationsPanel() {
  return (
    <Panel
      title="Edition tasks"
      description="Confirmation, entry readiness and official notices for your delegation live together here."
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <Link
          to={NAV_TARGETS.mySolarisTasks}
          className="flex min-h-16 items-center gap-3 rounded-xl border border-border/70 bg-surface/65 px-3 text-left transition hover:border-primary/25 hover:bg-surface-strong"
        >
          <ListChecks className="size-4 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-semibold">Tasks</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              Deadlines and blockers
            </span>
          </span>
        </Link>
        <Link
          to={NAV_TARGETS.mySolarisEntry}
          search={{ view: "readiness" }}
          className="flex min-h-16 items-center gap-3 rounded-xl border border-border/70 bg-surface/65 px-3 text-left transition hover:border-primary/25 hover:bg-surface-strong"
        >
          <ClipboardCheck className="size-4 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-semibold">Entry readiness</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              Eligibility and workflow
            </span>
          </span>
        </Link>
        <Link
          to={NAV_TARGETS.mySolarisNotices}
          className="flex min-h-16 items-center gap-3 rounded-xl border border-border/70 bg-surface/65 px-3 text-left transition hover:border-primary/25 hover:bg-surface-strong"
        >
          <MailOpen className="size-4 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-semibold">Notices</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              Official communications
            </span>
          </span>
        </Link>
      </div>
    </Panel>
  );
}
