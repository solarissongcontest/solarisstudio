import { createFileRoute } from "@tanstack/react-router";

import {
  MySolarisNoticesPage,
  parseMySolarisNoticesSearch,
} from "@/features/my-solaris/notices/MySolarisNoticesPage";

export const Route = createFileRoute("/_authenticated/my-solaris/notices")({
  validateSearch: parseMySolarisNoticesSearch,
  head: () => ({
    meta: [{ title: "MySolaris notices — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  component: MySolarisNoticesPage,
});
