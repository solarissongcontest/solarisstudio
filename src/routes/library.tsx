import { createFileRoute, redirect } from "@tanstack/react-router";

import { sanitizeRuleContextPath } from "@/lib/rule-context";

type LibrarySearch = {
  from?: string;
};

/**
 * Compatibility route for old Library bookmarks.
 *
 * The old Library combined two capabilities that have separate canonical V3
 * homes now:
 * - generic Solaris destination discovery -> Site Directory
 * - contextual rule / interpretation help -> Rules
 *
 * Keep the old URL working without preserving Library as a competing product
 * area. Only the historical allowlisted rule-context values may influence the
 * redirect target.
 */
export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    from: sanitizeRuleContextPath(search.from),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: search.from ? "/rules" : "/site-directory",
      replace: true,
    });
  },
});
