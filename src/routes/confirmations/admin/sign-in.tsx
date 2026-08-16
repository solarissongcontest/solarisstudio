import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/confirmations/admin/sign-in")({
  beforeLoad: () => {
    // Confirmations no longer owns an admin identity. Any legacy link or
    // stale page that still points here must re-enter through the one Solaris
    // Studio authentication flow instead of bouncing around the Control Room.
    throw redirect({
      to: "/auth",
      search: { redirect: "/admin/operations" },
    });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => null,
});
