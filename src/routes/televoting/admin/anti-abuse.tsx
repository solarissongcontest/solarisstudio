import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/televoting/admin/anti-abuse")({
  beforeLoad: () => {
    throw redirect({ to: "/televoting/admin/intelligence" });
  },
  component: () => null,
});
