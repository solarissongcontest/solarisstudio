import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { recordPermissionShadow } from "@/lib/permission-engine-admin";
import { capabilityForOrganizerPath } from "@/lib/permission-route-map";
import { useAdminContext } from "./AdminContext";

export function AdminPermissionShadowProbe() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const capability = capabilityForOrganizerPath(pathname);

  useQuery({
    queryKey: ["permission-engine-shadow", capability, editionId, pathname],
    queryFn: async () => {
      if (!capability) return false;
      await recordPermissionShadow({
        capability,
        editionId: editionId || null,
        action: "organizer.route.view",
        route: pathname,
      });
      return true;
    },
    enabled: Boolean(capability),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  return null;
}
