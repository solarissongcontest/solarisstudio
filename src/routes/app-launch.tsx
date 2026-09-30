import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  appEntryHref,
  getAppLaunchRestoreCandidate,
  markAppNavigationRestore,
} from "@/lib/app-navigation";

export const Route = createFileRoute("/app-launch")({
  head: () => ({
    meta: [
      { title: "Opening Solaris Studio…" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AppLaunchPage,
});

function AppLaunchPage() {
  const navigate = useNavigate();
  const { isAppMode } = useSolarisApp();

  useEffect(() => {
    const target = isAppMode ? getAppLaunchRestoreCandidate() : null;

    if (target) {
      markAppNavigationRestore(target);
      void navigate({
        to: appEntryHref(target) as any,
        replace: true,
      });
      return;
    }

    void navigate({ to: "/", replace: true });
  }, [isAppMode, navigate]);

  return (
    <main
      id="main-content"
      className="solaris-app-launch-screen"
      aria-busy="true"
      aria-live="polite"
    >
      <img
        src="/icon-192.png?v=img2340-20260929"
        alt=""
        className="solaris-app-launch-icon"
      />
      <p className="solaris-app-launch-eyebrow">Solaris Studio</p>
      <h1>Opening your app…</h1>
      <div className="solaris-app-launch-progress" aria-hidden="true" />
    </main>
  );
}
