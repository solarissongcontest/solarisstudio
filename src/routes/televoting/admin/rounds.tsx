import { createFileRoute, Outlet } from "@tanstack/react-router";

// This route owns the shared nested location only. The rounds overview is
// rendered by rounds/index.tsx; the edition-verified entries editor lives
// beneath rounds/$id.tsx and must be reachable through both parent outlets.
export const Route = createFileRoute("/televoting/admin/rounds")({
  component: Outlet,
});
