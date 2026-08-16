import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/televoting/admin/televote")({
  beforeLoad: () => {
    throw redirect({ to: "/televoting/admin/results" });
  },
  component: () => null,
});
