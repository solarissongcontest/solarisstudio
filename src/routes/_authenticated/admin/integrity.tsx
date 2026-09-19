import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/integrity")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/integrity-investigations", replace: true });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => null,
});
