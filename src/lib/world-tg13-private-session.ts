import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useFanSession } from "@/lib/prediction-data";

/** TG13 records are not public: the account identity, not just the route,
 * is part of every cache key. A cached result for A must never show for B. */
export type Tg13ObservedActor = { userId: string | null; epoch: number };
export type Tg13PrivateActor = {
  ready: boolean;
  userId: string | null;
  epoch: number;
};

export function resolveTg13PrivateActor(
  observed: Tg13ObservedActor | null,
  canonicalUserId: string | null,
  sessionFetching: boolean,
): Tg13PrivateActor {
  const ready = observed !== null
    && !sessionFetching
    && observed.userId === canonicalUserId;
  return {
    ready,
    userId: ready ? canonicalUserId : null,
    epoch: observed?.epoch ?? -1,
  };
}

export function isTg13PrivateQuery(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "world"
    && (queryKey[1] === "mediation" || queryKey[1] === "ethics");
}

/** The root AccountCacheIsolation publishes the canonical fan-session.
 * Local subscription masks the view immediately on account changes, before
 * its fan-session revalidation is allowed to reveal any private rows. */
export function useTg13PrivateActor(): Tg13PrivateActor {
  const session = useFanSession();
  const client = useQueryClient();
  const [observed, setObserved] = useState<Tg13ObservedActor | null>(null);

  useEffect(() => {
    let live = true;
    let epoch = 0;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!live) return;
      if (![
        "INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT",
        "TOKEN_REFRESHED", "USER_UPDATED",
      ].includes(event)) return;

      // Cancel/remove while observers still belong to the old account.
      // Never await inside Supabase's auth callback.
      const filter = {
        predicate: (query: { queryKey: readonly unknown[] }) =>
          isTg13PrivateQuery(query.queryKey),
      };
      void client.cancelQueries(filter);
      client.removeQueries(filter);
      setObserved({ userId: next?.user?.id ?? null, epoch: ++epoch });
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  return resolveTg13PrivateActor(
    observed, session.data?.id ?? null,
    session.isLoading || session.isFetching || session.isError,
  );
}
