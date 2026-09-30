import { WifiOff } from "lucide-react";

export function AppOfflineBanner({ isOnline }: { isOnline: boolean }) {
  if (isOnline) return null;

  return (
    <div
      className="solaris-app-offline"
      role="status"
      aria-live="polite"
      data-solaris-app-offline
    >
      <WifiOff className="size-4" aria-hidden="true" />
      <span>You’re offline. Solaris is read-only: local drafts stay on this device, and official submissions are disabled until you reconnect.</span>
    </div>
  );
}
