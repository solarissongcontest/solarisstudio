import type { ReactNode } from "react";

export function AdminShell({ children }: { children: ReactNode }) {
  return <div className="admin-control-room min-h-screen bg-background [&_.site-nav]:hidden [&_.mobile-quick-nav]:hidden [&_.app-background]:hidden [&_.app-main]:!max-w-none [&_.app-main]:!p-0"><header className="border-b border-border p-4 font-display font-black">Solaris Control Room</header><main className="p-4">{children}</main></div>;
}
