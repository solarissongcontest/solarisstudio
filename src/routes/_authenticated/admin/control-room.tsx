import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/control-room")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/control-room-v2", replace: true });
  },
  component: () => null,
});
