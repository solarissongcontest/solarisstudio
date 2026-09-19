import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/beta-feedback")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/beta1-feedback", replace: true });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => null,
});
