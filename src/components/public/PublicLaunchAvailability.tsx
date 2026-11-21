import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useFanSession } from "@/lib/prediction-data";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import { LIMITED_PUBLIC_LAUNCH, PUBLIC_LAUNCH_FLAGS, type PublicLaunchFlags } from "@/lib/public-launch-availability";
import { PublicLaunchContext } from "@/lib/public-launch-context";
import { hasSolarisOrganizerAccess } from "@/integrations/supabase/access";
import { supabase } from "@/integrations/supabase/client";

/** Shares four existing, caller-evaluated flags across all Public consumers.
 * No cohort lists, local tester override, new flag, polling or mutation API.
 * studio2-* uses the existing private account-cache eviction boundary.
 */
export function FlagDrivenPublicLaunchAvailabilityProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const session = useFanSession();
  const actor = session.data?.id ?? null;
  const flags = useQuery({
    queryKey: ["studio2-public-launch", actor, session.dataUpdatedAt],
    enabled: enabled && session.isSuccess && !session.isFetching,
    queryFn: async () => {
      const decisions = await Promise.all(
        PUBLIC_LAUNCH_FLAGS.map(
          async (flag) => [flag, await isStudio2FeatureEnabled(flag)] as const,
        ),
      );
      return { actor, flags: Object.fromEntries(decisions) as PublicLaunchFlags };
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    // React Query may change query keys after a same-user session refresh.
    // Reuse only that actor's last confirmed decision during revalidation.
    // Account changes, first loads, errors and revoked decisions still deny.
    placeholderData: (previous) => (previous?.actor === actor ? previous : undefined),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const error = session.isError || flags.isError;
  const sameActorVerified = flags.isSuccess && flags.data?.actor === actor;
  // Never unmount an authorized form for a same-actor background recheck.
  // An unknown/new actor still fails closed; a revoked or failed answer
  // immediately clears the decision when the request settles.
  const checking =
    !error &&
    (session.isPending ||
      flags.isPending ||
      ((session.isFetching || flags.isFetching) && !sameActorVerified));
  const verified = enabled && !checking && !error && sameActorVerified;
  return (
    <PublicLaunchContext.Provider
      value={{
        active: true,
        flags: verified ? flags.data!.flags : {},
        checking,
        error,
        retry: () => {
          void session.refetch();
        },
      }}
    >
      {children}
    </PublicLaunchContext.Provider>
  );
}

/** Limited public launch remains closed by default. Only a live, verified
 * global Organizer role can reveal additional UI; RLS and publication rules
 * retain independent authority. SSR never starts an account lookup. */
function LimitedPublicLaunchAvailabilityProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setActor(data.session?.user.id ?? null);
    }).catch(() => { if (alive) setActor(null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setActor(session?.user.id ?? null);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  const organizer = useQuery({
    queryKey: ["admin-page-preview-access", actor],
    enabled: actor !== null,
    queryFn: () => hasSolarisOrganizerAccess(actor!),
    retry: false,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const adminPreview = Boolean(actor) && organizer.isSuccess &&
    !organizer.isFetching && organizer.data === true;
  return (
    <PublicLaunchContext.Provider value={{
      active: true, flags: {}, adminPreview,
      checking: Boolean(actor) && (organizer.isPending || organizer.isFetching),
      error: Boolean(actor) && organizer.isError,
      retry: () => { void organizer.refetch(); },
    }}>
      {children}
    </PublicLaunchContext.Provider>
  );
}

export function PublicLaunchAvailabilityProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  if (LIMITED_PUBLIC_LAUNCH) {
    return <LimitedPublicLaunchAvailabilityProvider>{children}</LimitedPublicLaunchAvailabilityProvider>;
  }
  return <FlagDrivenPublicLaunchAvailabilityProvider enabled={enabled}>{children}</FlagDrivenPublicLaunchAvailabilityProvider>;
}
