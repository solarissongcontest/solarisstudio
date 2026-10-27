import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { createAccountCacheIsolationHandler } from "@/lib/account-cache-isolation";
import { resetAppAttentionSummary } from "@/lib/app-attention";
import { beginLifecycleGeneration } from "@/lib/lifecycle-generation";

export function AccountCacheIsolation() {
  const client = useQueryClient();
  const authGenerationRef = useRef(0);
  useEffect(() => {
    // The public TerraOS teaser preview is fixture-only. In particular, a
    // same-origin iframe must not subscribe to the visitor's real auth state.
    if (window.location.pathname === "/terraos-teaser-preview") return;

    const lifecycle = beginLifecycleGeneration(authGenerationRef);
    const applySession = createAccountCacheIsolationHandler(
      client,
      (viewerId) => resetAppAttentionSummary(viewerId),
      lifecycle.isCurrent,
    );
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user);
    });
    return () => {
      lifecycle.deactivate();
      data.subscription.unsubscribe();
    };
  }, [client]);
  return null;
}
