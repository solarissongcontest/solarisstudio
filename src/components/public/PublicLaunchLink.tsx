import { createLink } from "@tanstack/react-router";
import { forwardRef, type ComponentProps } from "react";
import { usePublicLaunchAvailability } from "@/lib/public-launch-context";

/** Keep TanStack's typed params/search, history and link semantics. Only the
 * resolved public destination's visibility changes; domain authorization does not.
 */
const LaunchAnchor = forwardRef<HTMLAnchorElement, ComponentProps<"a">>(function LaunchAnchor(
  { href, ...props },
  ref,
) {
  const { allows } = usePublicLaunchAvailability();
  if (href?.startsWith("/") && !allows(href)) return null;
  return <a {...props} href={href} ref={ref} />;
});
export const PublicLaunchLink = createLink(LaunchAnchor);
