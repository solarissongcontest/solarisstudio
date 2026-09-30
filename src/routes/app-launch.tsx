import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { supabase } from "@/integrations/supabase/client";
import {
  appEntryHref,
  appTabForPath,
  getAppLaunchDestination,
  markAppNavigationRestore,
} from "@/lib/app-navigation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

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
    let alive = true;

    if (!isAppMode) {
      void navigate({ to: "/", replace: true });
      return () => {
        alive = false;
      };
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const target = getAppLaunchDestination(Boolean(data.user));
      trackPublicUxEvent("app_cold_launch_restored", {
        target: appEntryHref(target),
        metadata: {
          area: appTabForPath(target.pathname) ?? "app",
          source: "cold_launch",
        },
      });
      markAppNavigationRestore(target);
      void navigate({
        to: appEntryHref(target) as any,
        replace: true,
      });
    });

    return () => {
      alive = false;
    };
  }, [isAppMode, navigate]);

  return (
    <main
      id="main-content"
      className="grid min-h-[100svh] place-items-center bg-background px-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <div>
        <img
          src="/icon-192.png?v=img2340-20260929"
          alt=""
          className="mx-auto size-20 rounded-[1.35rem]"
        />
        <p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-primary">
          Solaris Studio
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-.03em]">Opening your app…</h1>
        <div
          className="mx-auto mt-5 h-1 w-28 overflow-hidden rounded-full bg-white/10"
          aria-hidden="true"
        >
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
    </main>
  );
}
