import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/action-centre")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/tasks", search: { filter: "all" }, replace: true });
  },
  component: () => null,
});
