import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/televoting/admin/accounts")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/operations" });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => null,
});
