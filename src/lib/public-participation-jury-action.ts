import type { JurySummary } from "./public-participation-jury-summary";
import type { ParticipationAction } from "./participation-state";
import { resolveScheduleState } from "./solaris-schedule";

/** Presentation only: an open server response is necessary, but a cached
 * response must never advertise a ballot outside its recorded window.
 * Browser time can suppress a CTA; it cannot grant eligibility or open a round.
 */
export function publicParticipationJuryAction(
  jury: JurySummary | undefined,
  now: number,
): ParticipationAction {
  const action: ParticipationAction = {
    id: "jury",
    status: "unavailable",
    title: "Jury voting",
    description:
      jury?.restriction === "account_suspended"
        ? "Your country account is suspended. Contact the Organizer before attempting jury voting."
        : jury?.restriction === "country_account_required"
          ? "This account does not have an assigned country delegation."
          : jury?.signedIn
            ? "No jury ballot currently needs your delegation. Open Jury voting to check the latest status."
            : "Country account required. Sign in to check official jury voting; friend-voting integrity checks apply before submission.",
    to: "/jury-voting",
    priority: 20,
  };
  if (!jury?.signedIn || jury.restriction) return action;

  if (jury.openRound) {
    const round = jury.openRound;
    const state = resolveScheduleState(
      { status: "open", opensAt: round.opensAt, closesAt: round.closesAt },
      now,
    );
    if (state !== "closed") {
      const upcoming = state === "upcoming" || state === "opening-soon";
      return {
        ...action,
        status: upcoming ? "upcoming" : "available",
        title: upcoming ? "Jury voting opens soon" : "Jury voting is open",
        description: upcoming
          ? `Your delegation’s ballot for ${round.name} is scheduled.`
          : `Submit your official ballot for ${round.name}. Friend-voting integrity checks apply before submission.`,
        opensAt: round.opensAt,
        closesAt: round.closesAt,
      };
    }
  }
  if (jury.completedOpenRound) {
    return {
      ...action,
      status: "complete",
      title: "Jury ballot submitted",
      description: `Your ballot for ${jury.completedOpenRound.name} is already submitted.`,
    };
  }
  return action;
}
