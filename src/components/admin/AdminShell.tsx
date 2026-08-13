import type { ReactNode } from "react";

export function AdminShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background"><header className="border-b border-border p-4 font-display font-black">Solaris Control Room</header><main className="p-4">{children}</main></div>;
}
