import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/friend-voting")({
  head: () => ({
    meta: [
      { title: "Friend-voting intelligence — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/televoting/admin/intelligence", replace: true });
  },
  component: () => null,
});
