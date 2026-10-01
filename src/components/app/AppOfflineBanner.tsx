import { AlertTriangle, WifiOff } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

import type { AppConnectivitySnapshot } from "@/lib/app-connectivity";

export function AppOfflineBanner({
  connectivity,
}: {
  connectivity: AppConnectivitySnapshot;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (connectivity.status === "online") return null;

  // Governance pages own contextual inline service state through the Solaris
  // Depth System. Never float a global outage pill over Rules or Integrity.
  if (pathname.startsWith("/rules") || pathname.startsWith("/integrity")) return null;

  const rulesReadOnly = false;
  const restricted = connectivity.status === "service-restricted";
  const offline = connectivity.status === "offline";
  const Icon = offline ? WifiOff : AlertTriangle;

  const message = rulesReadOnly
    ? offline
      ? "Offline · cached official Rules remain available."
      : restricted
        ? "Data limited · Published or cached Rules remain available."
        : "Connection degraded · cached Rules remain available."
    : offline
      ? "You’re offline. Solaris is read-only: local drafts stay on this device, and official submissions are disabled until you reconnect."
      : restricted
        ? "Solaris data service is temporarily restricted. Published or cached content may still work, but official saves and submissions can fail."
        : "Your device appears online, but Solaris cannot currently reach its app service reliably. Keep critical submissions paused until the connection recovers.";

  return (
    <div
      className="solaris-app-offline"
      role="status"
      aria-live="polite"
      data-solaris-app-connectivity={connectivity.status}
      data-solaris-app-banner-context={rulesReadOnly ? "reading" : "default"}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
