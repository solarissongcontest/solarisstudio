import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/confirmations/next-in-line")({
  beforeLoad: () => {
    throw redirect({ to: "/next-in-line" });
  },
  component: () => null,
});
