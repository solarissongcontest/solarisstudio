import { useEffect, useState } from "react";

import { AppFirstRun, appFirstRunComplete } from "@/components/app/AppFirstRun";
import { AppInstallPrompt } from "@/components/app/AppInstallPrompt";
import { AppOfflineBanner } from "@/components/app/AppOfflineBanner";
import { AppUpdatePrompt } from "@/components/app/AppUpdatePrompt";
import type { AppConnectivitySnapshot } from "@/lib/app-connectivity";

export function AppOverlayManager({
  isAppMode,
  pathname,
  connectivity,
  updateAvailable,
  updateSafe,
  onUpdate,
}: {
  isAppMode: boolean;
  pathname: string;
  connectivity: AppConnectivitySnapshot;
  updateAvailable: boolean;
  updateSafe: boolean;
  onUpdate: () => void;
}) {
  const [firstRunComplete, setFirstRunComplete] = useState(true);

  useEffect(() => {
    setFirstRunComplete(!isAppMode || appFirstRunComplete());
  }, [isAppMode, pathname]);

  if (!isAppMode) {
    return <AppInstallPrompt isAppMode={false} />;
  }

  if (connectivity.status !== "online") {
    return <AppOfflineBanner connectivity={connectivity} />;
  }

  if (!firstRunComplete) {
    return (
      <AppFirstRun
        isAppMode
        pathname={pathname}
        onComplete={() => setFirstRunComplete(true)}
      />
    );
  }

  if (updateAvailable && updateSafe) {
    return <AppUpdatePrompt onUpdate={onUpdate} />;
  }

  return null;
}
