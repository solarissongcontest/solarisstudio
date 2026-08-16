import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/confirmations/admin/sign-in")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/operations" });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => null,
});
