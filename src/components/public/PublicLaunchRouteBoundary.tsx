import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { usePublicLaunchAvailability } from "@/lib/public-launch-context";

export function PublicLaunchRouteBoundary({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const availability = usePublicLaunchAvailability();
  if (availability.allows(pathname)) return <>{children}</>;
  return (
    <AppShell>
      <section className="mx-auto max-w-xl px-4 py-10" aria-labelledby="public-launch-unavailable">
        <h1 id="public-launch-unavailable" className="text-2xl font-bold">
          {availability.checking ? "Checking availability" : "This experience is not available"}
        </h1>
        <p className="mt-3 text-muted-foreground" role="status">
          {availability.checking
            ? "Checking which experiences are available for your account."
            : "You can still follow the contest, check your responsibilities and explore published information."}
        </p>
        {availability.error ? (
          <button
            type="button"
            onClick={availability.retry}
            className="mt-4 min-h-11 rounded-xl border px-4 focus-visible:outline focus-visible:outline-2"
          >
            Retry availability
          </button>
        ) : null}
        <nav className="mt-6 flex flex-wrap gap-4" aria-label="Available Solaris destinations">
          <a href="/">Home</a>
          <a href="/explore">Explore</a>
          <a href="/participate">Participate</a>
          <a href="/results">Results</a>
          <a href="/me">Me</a>
        </nav>
      </section>
    </AppShell>
  );
}
