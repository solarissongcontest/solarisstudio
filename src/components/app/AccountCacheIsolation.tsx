import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { clearPrivateAccountQueries } from "@/lib/account-cache-isolation";
import { writeAppAttentionSummary } from "@/lib/app-attention";

export function AccountCacheIsolation() {
  const client = useQueryClient();
  useEffect(() => {
    let previousUserId: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;
      if (previousUserId !== nextUserId) {
        previousUserId = nextUserId;
        clearPrivateAccountQueries(client);
        writeAppAttentionSummary({ participate: 0, me: 0, osBadge: 0 });
      }
      // Set synchronously: every account-scoped observer switches namespaces
      // before it can render or request private state for the new session.
      client.setQueryData(["fan-session"], session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  return null;
}
