import type { ReactNode } from "react";

import { MySolarisAnniversaryRecap } from "@/components/mysolaris/MySolarisAnniversaryRecap";
import { MySolarisProvider, useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { MySolarisWorkspaceNav } from "@/components/mysolaris/MySolarisWorkspaceNav";

export function MySolarisWorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <MySolarisProvider>
      <div className="solaris-mysolaris-workspace min-w-0 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[14.5rem_minmax(0,1fr)]">
        <MySolarisWorkspaceNav />
        <div className="min-w-0">
          <MySolarisAnniversaryRecap />
          <AccountStatus />
          {children}
        </div>
      </div>
    </MySolarisProvider>
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
