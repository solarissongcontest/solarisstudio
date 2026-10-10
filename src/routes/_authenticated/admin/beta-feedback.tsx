import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/beta-feedback")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AdminBetaFeedbackRedirect,
});

function AdminBetaFeedbackRedirect() {
  return <Navigate to="/admin/beta1-feedback" replace />;
}
