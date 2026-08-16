import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/televoting/admin/friend-voting")({
  beforeLoad: () => {
    throw redirect({ to: "/televoting/admin/intelligence" });
  },
  component: () => null,
});
