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
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const error = session.isError || flags.isError;
  const checking =
    !error && (session.isPending || session.isFetching || flags.isPending || flags.isFetching);
  const verified = enabled && !checking && !error && flags.data?.actor === actor;
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
