import { createFileRoute } from "@tanstack/react-router";

import { ActionCenterPage } from "./action-center";

export const Route = createFileRoute("/_authenticated/admin/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActionCenterPage,
});
