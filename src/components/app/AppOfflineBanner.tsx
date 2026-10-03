import { AlertTriangle, WifiOff } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

import type { AppConnectivitySnapshot } from "@/lib/app-connectivity";
import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";

export function AppOfflineBanner({
  connectivity,
}: {
  connectivity: AppConnectivitySnapshot;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const screen = resolveSolarisAppScreen(pathname, searchStr);
  if (connectivity.status === "online") return null;

  // Governance pages own contextual inline service state through the Solaris
  // Depth System. Never float a global outage pill over Rules or Integrity.
  if (pathname.startsWith("/rules") || pathname.startsWith("/integrity")) return null;

  const restricted = connectivity.status === "service-restricted";
  const offline = connectivity.status === "offline";
  const Icon = offline ? WifiOff : AlertTriangle;

  const offlineMessage =
    screen.behavior.offline === "online-required"
      ? "You’re offline. This action needs a live Solaris connection. Local drafts stay on this device, but nothing is submitted until you reconnect."
      : screen.behavior.offline === "ready"
        ? "You’re offline. Saved Solaris content on this screen remains available; anything requiring fresh server data will resume after reconnecting."
        : "You’re offline. Solaris is showing the data already available on this device and will refresh it after you reconnect.";

  const message = offline
    ? offlineMessage
    : restricted
      ? screen.behavior.criticalTask
        ? "Solaris data service is temporarily unavailable. Keep this task paused until the service recovers; a failed request is never treated as a submission."
        : "Solaris data service is temporarily restricted. Published or cached content may still work while live data recovers."
      : screen.behavior.criticalTask
        ? "Solaris cannot reliably reach the app service. Keep this task paused until the connection recovers."
        : "Your device appears online, but Solaris cannot currently refresh live data reliably.";

  return (
    <div
      className="solaris-app-offline"
      role="status"
      aria-live="polite"
      data-solaris-app-connectivity={connectivity.status}
      data-solaris-app-banner-context="default"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
