import type { ReactNode } from "react";

import { MySolarisProvider } from "@/components/mysolaris/MySolarisContext";
import { MySolarisWorkspaceNav } from "@/components/mysolaris/MySolarisWorkspaceNav";

export function MySolarisWorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <MySolarisProvider>
      <div className="min-w-0 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[14.5rem_minmax(0,1fr)]">
        <MySolarisWorkspaceNav />
        <div className="min-w-0">{children}</div>
      </div>
    </MySolarisProvider>
  );
}
