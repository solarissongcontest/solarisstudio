import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/control-room-v2")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/control-room", replace: true });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => null,
});
