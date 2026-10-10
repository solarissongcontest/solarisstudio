import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { createAccountCacheIsolationHandler } from "@/lib/account-cache-isolation";
import { writeAppAttentionSummary } from "@/lib/app-attention";
import { beginLifecycleGeneration } from "@/lib/lifecycle-generation";

export function AccountCacheIsolation() {
  const client = useQueryClient();
  const authGenerationRef = useRef(0);
  useEffect(() => {
    const lifecycle = beginLifecycleGeneration(authGenerationRef);
    const applySession = createAccountCacheIsolationHandler(
      client,
      () => writeAppAttentionSummary({ participate: 0, me: 0, osBadge: 0 }),
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
