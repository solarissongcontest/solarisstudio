import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/edition-theme/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} Design & Broadcast — Solaris Organizer` },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/design/$slug",
      params: { slug: params.slug },
      replace: true,
    });
  },
  component: () => null,
});
