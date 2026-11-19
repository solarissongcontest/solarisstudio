import { Link } from "@tanstack/react-router";
import { ClipboardCheck, FilePenLine, LockKeyhole, Vote } from "lucide-react";

import { usePublicLaunchAvailability } from "@/lib/public-launch-context";

/**
 * Service discovery is not workflow availability. Keep official destinations
 * findable even when a round is closed or its status cannot be fetched, but
 * never turn an unreleased route into a link.
 *
 * Round status, account eligibility, and mutations remain server-authoritative
 * in the destination workflow.
 */
const CORE_SERVICES = [
  {
    id: "confirmation",
    to: "/confirmations",
    title: "Confirmations",
    description: "Review your delegation's confirmation rounds and responses.",
    icon: ClipboardCheck,
  },
  {
    id: "entry",
    to: "/my-solaris/entry",
    title: "Entry submission",
    description: "View or continue your delegation's contest entry.",
    icon: FilePenLine,
  },
  {
    id: "jury",
    to: "/jury-voting",
    title: "Jury voting",
    description: "Check your delegation's official jury ballots.",
    icon: ClipboardCheck,
  },
  {
    id: "televote",
    to: "/televoting",
    title: "Televoting",
    description: "See public voting rounds and their current availability.",
    icon: Vote,
  },
] as const;

export function ParticipationServiceDirectory() {
  const { allowsReleased } = usePublicLaunchAvailability();

  return (
    <section className="mt-6" aria-labelledby="participate-services-title" data-participate-services>
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Services</p>
        <h2 id="participate-services-title" className="mt-1 text-lg font-semibold">
          Participation services
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Find official services here. Whether a round is open or you are eligible is checked inside each service.
        </p>
      </div>
      <div className="divide-y divide-border/60 border-y border-border/60">
        {CORE_SERVICES.map(({ id, to, title, description, icon: Icon }) => {
          const released = allowsReleased(to);
          const contents = (
            <>
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {released
                    ? description
                    : id === "confirmation"
                      ? "Existing confirmations may still be editable through your authorized Confirmation access or edit link. The general Confirmations page is restricted."
                      : "Not available in the current public release."}
                </span>
              </span>
              {released ? (
                <span className="shrink-0 text-xs font-semibold text-primary">View</span>
              ) : id === "confirmation" ? (
                <span className="max-w-24 shrink-0 text-right text-[11px] font-medium leading-4 text-muted-foreground">
                  Edit via existing access
                </span>
              ) : (
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not released" />
              )}
            </>
          );
          const classes = "flex min-h-16 items-start gap-3 px-1 py-3";
          return released ? (
            <Link
              key={id}
              to={to as any}
              className={`${classes} rounded-lg hover:bg-surface/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
            >
              {contents}
            </Link>
          ) : (
            <div key={id} className={`${classes} opacity-70`} data-service-unreleased={id}>
              {contents}
            </div>
          );
        })}
      </div>
    </section>
  );
}
