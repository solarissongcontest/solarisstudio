import type { ReactNode } from "react";
import { AdminContextProvider } from "./AdminContext";
import { AdminSelectors } from "./AdminSelectors";

export function AdminShell({ children }: { children: ReactNode }) {
  return <AdminContextProvider><div className="admin-control-room min-h-screen bg-background [&_.site-nav]:hidden [&_.mobile-quick-nav]:hidden [&_.app-background]:hidden [&_.app-main]:!max-w-none [&_.app-main]:!p-0"><header className="flex items-center gap-3 border-b border-border p-3"><span className="font-display font-black">Solaris Control Room</span><div className="ml-auto"><AdminSelectors /></div></header><main className="p-4">{children}</main></div></AdminContextProvider>;
}
