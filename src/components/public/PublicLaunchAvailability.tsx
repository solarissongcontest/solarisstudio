import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useFanSession } from "@/lib/prediction-data";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import { PUBLIC_LAUNCH_FLAGS, type PublicLaunchFlags } from "@/lib/public-launch-availability";
import { PublicLaunchContext } from "@/lib/public-launch-context";

/** Shares four existing, caller-evaluated flags across all Public consumers.
 * No cohort lists, local tester override, new flag, polling or mutation API.
 * studio2-* uses the existing private account-cache eviction boundary.
 */
export function PublicLaunchAvailabilityProvider({
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
