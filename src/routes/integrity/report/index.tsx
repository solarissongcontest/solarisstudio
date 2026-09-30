import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/integrity/report/")({
  beforeLoad: () => {
    throw redirect({ to: "/integrity/report/category", replace: true });
  },
  component: () => null,
});
