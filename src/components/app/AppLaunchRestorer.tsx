import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { supabase } from "@/integrations/supabase/client";
import {
  appEntryHref,
  getAppLaunchDestination,
  markAppNavigationRestore,
} from "@/lib/app-navigation";

export function AppLaunchRestorer() {
  const { isAppMode } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !isAppMode || pathname !== "/") return;

    const launch = new URLSearchParams(searchStr).get("launch");
    if (launch !== "app") return;

    handled.current = true;
    let alive = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const target = getAppLaunchDestination(Boolean(data.user));
      markAppNavigationRestore(target);
      void navigate({
        to: appEntryHref(target) as any,
        replace: true,
      });
    });

    return () => {
      alive = false;
    };
  }, [isAppMode, navigate, pathname, searchStr]);

  return null;
}
