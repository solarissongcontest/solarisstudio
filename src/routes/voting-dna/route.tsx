import { createFileRoute, Outlet } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/voting-dna")({ component: VotingDnaLayout });

function VotingDnaLayout() {
  return <V3LegacyRouteAdapter phaseLabel="Voting DNA"><Outlet /></V3LegacyRouteAdapter>;
}
