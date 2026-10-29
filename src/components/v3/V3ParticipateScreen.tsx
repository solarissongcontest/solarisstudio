import type { V3BootstrapProjection } from "@/lib/v3-bootstrap";
import type { V3ActionProjection } from "@/lib/v3-experience";
import {
  projectV3Participate,
  type V3ParticipateFocusProjection,
} from "@/lib/v3-participate";
import { formatEventDateTime } from "@/lib/public-time";
import {
  V3ActionCard,
  V3Journey,
  V3JourneyStep,
  V3Progress,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3StatusTone,
} from "./V3Foundation";

export type V3TaskProgress = {
  current: number;
  total: number;
  label?: string;
};

export type V3ParticipateScreenProps = {
  bootstrap: V3BootstrapProjection;
  progressByActionId?: Readonly<Record<string, V3TaskProgress>>;
  delegationLabel?: string | null;
};

function toneForAction(action: V3ActionProjection) {
  if (action.sourceState === "problem") return "problem" as const;
  if (action.urgency === "immediate" || action.urgency === "high") return "urgent" as const;
  if (action.actionRequired) return "required" as const;
  if (action.completed) return "complete" as const;
  return "neutral" as const;
}

function statusToneForAction(action: V3ActionProjection): V3StatusTone {
  if (action.sourceState === "problem") return "danger";
  if (action.sourceState === "finished") return "neutral";
  if (action.completed) return "success";
  if (action.actionRequired) return "required";
  if (action.sourceState === "waiting") return "progress";
  return "neutral";
}

function formatActionTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatEventDateTime(parsed, { locale: "en-GB" });
}

function timingMeta(action: V3ActionProjection, delegationLabel?: string | null) {
  const deadline = action.deadline ? formatActionTime(action.deadline) : null;
  const opensAt = !deadline && action.opensAt ? formatActionTime(action.opensAt) : null;
  const timing = deadline ? `Closes ${deadline}` : opensAt ? `Opens ${opensAt}` : null;
  const values = [timing, delegationLabel ?? null].filter(Boolean) as string[];

  if (!values.length) return undefined;
  return (
    <>
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </>
  );
}

function ActionList({
  actions,
  progressByActionId,
  delegationLabel,
}: {
  actions: readonly V3ActionProjection[];
  progressByActionId: Readonly<Record<string, V3TaskProgress>>;
  delegationLabel?: string | null;
}) {
  return (
    <div className="v3-preview-grid">
      {actions.map((action) => {
        const progress = progressByActionId[action.id];
        return (
          <V3Surface key={action.id} level={action.actionRequired ? "raised" : "base"} className="p-3">
            <V3ActionCard
              title={action.title}
              description={action.description}
              tone={toneForAction(action)}
              to={action.route}
              meta={timingMeta(action, delegationLabel)}
            />
            {progress && progress.total > 0 ? (
              <div className="px-1 pb-1 pt-3">
                <V3Progress
                  value={(progress.current / progress.total) * 100}
                  label={progress.label ?? action.title}
                />
              </div>
            ) : null}
          </V3Surface>
        );
      })}
    </div>
  );
}

function focusPresentation(focus: V3ParticipateFocusProjection) {
  switch (focus.state) {
    case "actionable":
      return {
        label: "Action now",
        tone: "required" as V3StatusTone,
        explanation: "This is the highest-priority official responsibility Solaris can confirm you can act on now.",
      };
    case "blocked":
      return {
        label: "Blocked",
        tone: "danger" as V3StatusTone,
        explanation: "This responsibility needs resolution, but the official workflow does not currently give you an action. Solaris will not pretend otherwise.",
      };
    case "waiting":
      return {
        label: "Waiting",
        tone: "progress" as V3StatusTone,
        explanation: "Your participation is waiting on the official workflow or review state. No action is required until that state changes.",
      };
    case "upcoming":
      return {
        label: "Upcoming",
        tone: "progress" as V3StatusTone,
        explanation: "No action is required yet. This is the next official responsibility currently projected for your delegation.",
      };
    case "clear":
      return {
        label: "Caught up",
        tone: "success" as V3StatusTone,
        explanation: "Nothing in the official responsibility projection requires or anticipates an action from you right now.",
      };
  }
}

function PrimaryResponsibility({
  focus,
  progressByActionId,
  delegationLabel,
  hasJourney,
}: {
  focus: V3ParticipateFocusProjection;
  progressByActionId: Readonly<Record<string, V3TaskProgress>>;
  delegationLabel?: string | null;
  hasJourney: boolean;
}) {
  const presentation = focusPresentation(focus);
  const action = focus.action;

  if (!action) {
    return (
      <V3Surface level="raised" className="p-5 sm:p-6">
        <div data-v3-participate-focus="clear" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-semibold">{hasJourney ? "You're caught up" : "No official responsibility right now"}</p>
            <V3StatusChip tone={presentation.tone}>{presentation.label}</V3StatusChip>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">{presentation.explanation}</p>
        </div>
      </V3Surface>
    );
  }

  const progress = progressByActionId[action.id];
  return (
    <V3Surface level="raised" className="p-4 sm:p-5">
      <div data-v3-participate-focus={focus.state} aria-live="polite">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/48">Next meaningful responsibility</p>
          <V3StatusChip tone={presentation.tone}>{presentation.label}</V3StatusChip>
        </div>
        <V3ActionCard
          title={action.title}
          description={action.description}
          tone={toneForAction(action)}
          to={action.route}
          meta={timingMeta(action, delegationLabel)}
        />
        {progress && progress.total > 0 ? (
          <div className="px-1 pt-3">
            <V3Progress
              value={(progress.current / progress.total) * 100}
              label={progress.label ?? action.title}
            />
          </div>
        ) : null}
        <p className="px-1 pt-3 text-xs leading-5 text-white/44">{presentation.explanation}</p>
      </div>
    </V3Surface>
  );
}

function withoutFocus(
  actions: readonly V3ActionProjection[],
  focus: V3ParticipateFocusProjection,
) {
  if (!focus.action) return actions;
  return actions.filter((action) => action.id !== focus.action?.id);
}

function ResponsibilityLane({
  label,
  state,
  actions,
  progressByActionId,
  delegationLabel,
}: {
  label: string;
  state: "attention" | "blocked" | "waiting" | "upcoming";
  actions: readonly V3ActionProjection[];
  progressByActionId: Readonly<Record<string, V3TaskProgress>>;
  delegationLabel?: string | null;
}) {
  if (!actions.length) return null;

  const chip =
    state === "attention" ? (
      <V3StatusChip tone="required">{actions.length} required</V3StatusChip>
    ) : state === "blocked" ? (
      <V3StatusChip tone="danger">No action available</V3StatusChip>
    ) : (
      <V3StatusChip tone="progress">{state === "waiting" ? "No action yet" : "Upcoming"}</V3StatusChip>
    );

  return (
    <div className="border-t border-white/[0.07] pt-4 first:border-t-0 first:pt-0" data-v3-participate-lane={state}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        {chip}
      </div>
      {state === "blocked" ? (
        <p className="mb-3 text-xs leading-5 text-white/46">
          The official workflow reports a problem, but it has not opened a participant action yet.
        </p>
      ) : null}
      <ActionList
        actions={actions}
        progressByActionId={progressByActionId}
        delegationLabel={delegationLabel}
      />
    </div>
  );
}

function votingStateLabel(action: V3ActionProjection) {
  if (action.sourceState === "finished") return "Closed";
  if (action.sourceState === "problem") return "Closed · unresolved";
  if (action.completed) return action.kind === "jury" ? "Submitted" : "Finished";
  if (action.sourceState === "needs_attention") return "Open · action required";
  if (action.sourceState === "available") return "Open";
  if (action.sourceState === "upcoming") return "Upcoming";
  if (action.sourceState === "waiting") return action.opensAt ? "Upcoming" : "Waiting";
  return "Current";
}

function VotingOverviewCard({
  label,
  action,
  optional,
  delegationLabel,
}: {
  label: string;
  action: V3ActionProjection | null;
  optional: boolean;
  delegationLabel?: string | null;
}) {
  if (!action) {
    return (
      <V3Surface className="p-4">
        <div data-v3-voting-overview-state="absent">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Solaris has no canonical {optional ? "public voting" : "jury responsibility"} action for this account and edition right now.
              </p>
            </div>
            <V3StatusChip>{optional ? "Optional" : "Official"}</V3StatusChip>
          </div>
        </div>
      </V3Surface>
    );
  }

  return (
    <V3Surface level={action.actionRequired ? "raised" : "base"} className="p-3">
      <div data-v3-voting-overview-state={action.sourceState}>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/48">{label}</p>
          <V3StatusChip tone={statusToneForAction(action)}>{votingStateLabel(action)}</V3StatusChip>
        </div>
        <V3ActionCard
          title={action.title}
          description={action.description}
          tone={toneForAction(action)}
          to={action.route}
          meta={timingMeta(action, delegationLabel)}
        />
        <p className="px-1 pb-1 pt-2 text-[11px] leading-5 text-white/38">
          {optional
            ? "Public voting stays optional even when it is time-sensitive."
            : "Jury status comes from the official delegation voting projection and outranks optional fan participation when action is required."}
        </p>
      </div>
    </V3Surface>
  );
}

/**
 * V3 Participate composition. The screen consumes the same bootstrap as Home,
 * gives one official responsibility visual priority, and keeps optional fan
 * participation subordinate. No network call or second workflow state is
 * introduced here.
 */
export function V3ParticipateScreen({
  bootstrap,
  progressByActionId = {},
  delegationLabel,
}: V3ParticipateScreenProps) {
  const participate = projectV3Participate(bootstrap);
  const remainingAttention = withoutFocus(participate.needsAttention, participate.focus);
  const remainingBlocked = withoutFocus(participate.blocked, participate.focus);
  const remainingWaiting = withoutFocus(participate.waiting, participate.focus);
  const remainingNext = withoutFocus(participate.next, participate.focus);
  const secondaryCount =
    remainingAttention.length + remainingBlocked.length + remainingWaiting.length + remainingNext.length;

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker={bootstrap.context.editionLabel ?? "Participate"}
        title="Your participation"
        description="One official responsibility at a time. Everything else stays visible without competing for your attention."
      />

      <V3Section title="Current responsibility">
        <PrimaryResponsibility
          focus={participate.focus}
          progressByActionId={progressByActionId}
          delegationLabel={delegationLabel}
          hasJourney={participate.journeyTotalCount > 0}
        />
      </V3Section>

      {secondaryCount ? (
        <V3Section title="Other responsibilities" meta={`${secondaryCount} more`}>
          <V3Surface className="space-y-5 p-4 sm:p-5">
            <ResponsibilityLane
              label="Also needs attention"
              state="attention"
              actions={remainingAttention}
              progressByActionId={progressByActionId}
              delegationLabel={delegationLabel}
            />
            <ResponsibilityLane
              label="Blocked"
              state="blocked"
              actions={remainingBlocked}
              progressByActionId={progressByActionId}
              delegationLabel={delegationLabel}
            />
            <ResponsibilityLane
              label="Waiting"
              state="waiting"
              actions={remainingWaiting}
              progressByActionId={progressByActionId}
              delegationLabel={delegationLabel}
            />
            <ResponsibilityLane
              label="Upcoming"
              state="upcoming"
              actions={remainingNext}
              progressByActionId={progressByActionId}
              delegationLabel={delegationLabel}
            />
          </V3Surface>
        </V3Section>
      ) : null}

      <V3Section
        title="Responsibility journey"
        meta={
          participate.journeyTotalCount
            ? `${participate.journeyCompleteCount} of ${participate.journeyTotalCount} complete`
            : "No current journey"
        }
      >
        {participate.journeyTotalCount ? (
          <V3Journey>
            {participate.journey.map((step) => {
              const progress = progressByActionId[step.id];
              return (
                <V3JourneyStep
                  key={step.id}
                  title={step.title}
                  detail={step.detail}
                  state={step.state}
                  trailing={
                    progress
                      ? `${progress.current} / ${progress.total}`
                      : step.state === "complete"
                        ? "Done"
                        : step.actionRequired
                          ? "Action"
                          : undefined
                  }
                />
              );
            })}
          </V3Journey>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">No official responsibility journey right now</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris adds journey steps only when the underlying workflow provides real evidence for them.
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section
        title="Voting overview"
        meta={participate.voting.currentCount ? `${participate.voting.currentCount} current` : "No current voting actions"}
      >
        <div className="grid gap-3 sm:grid-cols-2" data-v3-voting-overview="canonical-actions">
          <VotingOverviewCard
            label="Jury"
            action={participate.voting.jury}
            optional={false}
            delegationLabel={delegationLabel}
          />
          <VotingOverviewCard
            label="Public televote"
            action={participate.voting.televote}
            optional
            delegationLabel={delegationLabel}
          />
        </div>
      </V3Section>

      {participate.optionalNow.length ? (
        <V3Section title="Optional participation" meta={<V3StatusChip>Optional</V3StatusChip>}>
          <ActionList
            actions={participate.optionalNow}
            progressByActionId={progressByActionId}
            delegationLabel={delegationLabel}
          />
        </V3Section>
      ) : null}

      {participate.closed.length ? (
        <V3Section title="Closed" meta={`${participate.closed.length} ended`}>
          <V3Surface className="p-2" data-v3-participate-closed="">
            <details>
              <summary className="min-h-11 cursor-pointer list-none rounded-xl px-3 py-3 text-sm font-semibold text-white/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45">
                View closed opportunities
              </summary>
              <p className="px-3 pb-2 text-xs leading-5 text-white/46">
                These windows ended without being recorded as completed responsibilities. Closed does not mean completed.
              </p>
              <div className="v3-preview-grid px-1 pb-1 pt-1">
                {participate.closed.slice(0, 8).map((action) => (
                  <V3ActionCard
                    key={action.id}
                    title={action.title}
                    description={action.description}
                    tone="neutral"
                    to={action.route}
                    trailing={false}
                  />
                ))}
              </div>
            </details>
          </V3Surface>
        </V3Section>
      ) : null}

      {participate.completed.length ? (
        <V3Section title="Completed" meta={`${participate.completed.length} recorded`}>
          <V3Surface className="p-2">
            <details>
              <summary className="min-h-11 cursor-pointer list-none rounded-xl px-3 py-3 text-sm font-semibold text-white/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45">
                View completed activity
              </summary>
              <div className="v3-preview-grid px-1 pb-1 pt-1">
                {participate.completed.slice(0, 8).map((action) => (
                  <V3ActionCard
                    key={action.id}
                    title={action.title}
                    description={action.description}
                    tone="complete"
                    to={action.route}
                    trailing={false}
                  />
                ))}
              </div>
            </details>
          </V3Surface>
        </V3Section>
      ) : null}
    </V3Screen>
  );
}
