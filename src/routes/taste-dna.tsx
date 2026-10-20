import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/taste-dna")({
  component: TasteDnaRoute,
});

function TasteDnaRoute() {
  return <Outlet />;
}
