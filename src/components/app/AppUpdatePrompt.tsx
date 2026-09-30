import { RefreshCw } from "lucide-react";

export function AppUpdatePrompt({ onUpdate }: { onUpdate: () => void }) {
  return (
    <aside
      className="solaris-app-update"
      aria-label="Solaris Studio update available"
      data-solaris-app-update
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">Solaris Studio update available</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ready to install. Solaris waits until critical participation work is clear before showing this.
        </p>
      </div>
      <button type="button" onClick={onUpdate} className="solaris-app-update-button">
        <RefreshCw className="size-4" aria-hidden="true" />
        Update
      </button>
    </aside>
  );
}
