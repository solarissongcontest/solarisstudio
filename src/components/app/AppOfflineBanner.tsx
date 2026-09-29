import { WifiOff } from "lucide-react";

import { useSolarisApp } from "@/components/app/AppRuntime";

export function AppOfflineBanner() {
  const { isOnline } = useSolarisApp();
  if (isOnline) return null;

  return (
    <div
      className="solaris-app-offline"
      role="status"
      aria-live="polite"
      data-solaris-app-offline
    >
      <WifiOff className="size-4" aria-hidden="true" />
      <span>You’re offline. Saved public content may still be available.</span>
    </div>
  );
}
