import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/televoting/admin/sign-in")({
  beforeLoad: () => {
    // Televoting no longer owns a separate admin login. Keep this route only
    // as a compatibility target for old links and send it through Solaris
    // Studio authentication before returning to the unified Control Room.
    throw redirect({
      to: "/auth",
      search: { redirect: "/admin/operations" },
    });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => null,
});
