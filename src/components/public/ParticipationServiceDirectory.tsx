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
    group: "official",
    to: "/confirmations",
    title: "Confirmations",
    description: "Review your delegation's confirmation rounds and responses.",
    icon: ClipboardCheck,
  },
  {
    id: "entry",
    group: "official",
    to: "/my-solaris/entry",
    title: "Entry submission & media",
    description: "Manage your delegation's song, artist, media and review stages.",
    icon: FilePenLine,
  },
  {
    id: "jury",
    group: "official",
    to: "/jury-voting",
    title: "Jury voting",
    description: "Check your delegation's official jury ballots.",
    icon: ClipboardCheck,
  },
  {
    id: "televote",
    group: "optional",
    to: "/televoting",
    title: "Televoting",
    description: "See public voting rounds and their current availability.",
    icon: Vote,
  },
] as const;

type CoreService = (typeof CORE_SERVICES)[number];

export function ParticipationServiceDirectory() {
  const { allowsReleased } = usePublicLaunchAvailability();

  function serviceRow({ id, to, title, description, icon: Icon }: CoreService) {
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
  }

  return (
    <section className="mt-6" aria-labelledby="participate-services-title" data-participate-services>
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Services</p>
        <h2 id="participate-services-title" className="mt-1 text-lg font-semibold">
          Participation services
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Official delegation responsibilities and optional public voting are separate.
          Current editing rights are verified by the authorized Confirmation workflow above.
        </p>
      </div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Official delegation services
      </h3>
      <div className="divide-y divide-border/60 border-y border-border/60" data-participate-official-services>
        {CORE_SERVICES.filter((item) => item.group === "official").map(serviceRow)}
      </div>
      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Optional participation
      </h3>
      <div className="divide-y divide-border/60 border-y border-border/60" data-participate-optional-services>
        {CORE_SERVICES.filter((item) => item.group === "optional").map(serviceRow)}
      </div>
    </section>
  );
}
