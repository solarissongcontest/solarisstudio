import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/action-center")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/operations", replace: true });
  },
  component: () => null,
});
