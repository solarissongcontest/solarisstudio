import { Navigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisAnniversaryRecap } from "@/components/mysolaris/MySolarisAnniversaryRecap";
import { MySolarisProvider, useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { MySolarisWorkspaceNav } from "@/components/mysolaris/MySolarisWorkspaceNav";
import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export function MySolarisWorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <MySolarisProvider>
      <MySolarisWorkspaceContent>{children}</MySolarisWorkspaceContent>
    </MySolarisProvider>
  );
}

function countryInspectionTarget(search: unknown) {
  if (!search || typeof search !== "object" || !("country" in search)) return null;
  const country = (search as { country?: unknown }).country;
  return typeof country === "string" && country.trim() ? country.trim() : null;
}

function MySolarisWorkspaceContent({ children }: { children: ReactNode }) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const workspace = useMySolaris();
  const location = useRouterState({ select: (state) => state.location });
  const votingOverview = location.pathname === "/my-solaris/voting";
  const entryWorkspace = location.pathname === "/my-solaris/entry";
  const countryInspection = countryInspectionTarget(location.search);
  const preserveLegacyEntryInspection = Boolean(
    entryWorkspace &&
      countryInspection &&
      (workspace.isLoading || workspace.permissions.isOrganizer),
  );
  const focusedTask =
    isAppMode &&
    !preserveLegacyEntryInspection &&
    resolveSolarisAppScreen(location.pathname).behavior.criticalTask;
  const organizerInspection = Boolean(
    votingOverview &&
      countryInspection &&
      workspace.countryAccount?.access.isOrganizer === true,
  );
  const rollout = useV3RolloutProbe(
    platformResolved && isAppMode && votingOverview && !organizerInspection,
  );

  if (
    votingOverview &&
    isAppMode &&
    !organizerInspection &&
    (!platformResolved || rollout.isLoading)
  ) {
    return (
      <main className="min-w-0 px-4 py-10" data-v3-voting-overview-cutover="resolving">
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          Opening your current voting responsibilities…
        </p>
      </main>
    );
  }

  if (
    votingOverview &&
    isAppMode &&
    !organizerInspection &&
    !rollout.isError &&
    rollout.data?.enabled === true &&
    Boolean(rollout.data.userId)
  ) {
    return <Navigate to="/participate" replace />;
  }

  // Participant critical work keeps MySolarisProvider authority but must not
  // inherit the generic MySolaris sidebar, recap or account-status chrome.
  // A requested Entry inspection keeps that legacy workspace only while
  // authority is resolving or when Organizer access is actually verified.
  if (focusedTask) return <>{children}</>;

  return (
    <div className="solaris-mysolaris-workspace min-w-0 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[14.5rem_minmax(0,1fr)]">
      <MySolarisWorkspaceNav />
      <div className="min-w-0">
        <MySolarisAnniversaryRecap />
        <AccountStatus />
        {children}
      </div>
    </div>
  );
}

function AccountStatus() {
  const { countryAccount } = useMySolaris();
  if (countryAccount?.access.countryStatus !== "suspended") return null;
  return (
    <div role="status" className="mb-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">
      <p className="font-semibold">Country account suspended</p>
      <p className="mt-1">{countryAccount.access.suspensionReason || "Contact an Organizer to restore participation access."}</p>
    </div>
  );
}
