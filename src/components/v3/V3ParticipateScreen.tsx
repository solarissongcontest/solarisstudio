import type { V3BootstrapProjection } from "@/lib/v3-bootstrap";
import type { V3ActionProjection } from "@/lib/v3-experience";
import { projectV3Participate } from "@/lib/v3-participate";
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

function votingStateLabel(action: V3ActionProjection) {
  if (action.completed) return action.kind === "jury" ? "Submitted" : "Finished";
  if (action.sourceState === "problem") return "Needs attention";
  if (action.sourceState === "available") return "Open";
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
    <V3Surface
      level={action.actionRequired ? "raised" : "base"}
      className="p-3"
    >
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
 * V3 Participate composition.
 *
 * The screen consumes the same bootstrap as Home. The shared Participate
 * projection groups canonical Actions into required, blocked, upcoming,
 * waiting, optional and completed buckets while Journey remains the
 * evidence-backed responsibility timeline. No network call or second workflow
 * state is introduced here.
 */
export function V3ParticipateScreen({
  bootstrap,
  progressByActionId = {},
  delegationLabel,
}: V3ParticipateScreenProps) {
  const participate = projectV3Participate(bootstrap);

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker={bootstrap.context.editionLabel ?? "Participate"}
        title="Your participation"
        description="Official responsibilities first, optional participation second. Solaris keeps the whole journey visible without making every activity look mandatory."
      />

      <V3Section
        title="Your responsibilities"
        meta={
          participate.journeyTotalCount
            ? `${participate.journeyCompleteCount} of ${participate.journeyTotalCount} complete`
            : "No current responsibilities"
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
            <p className="text-sm font-semibold">No official responsibilities right now</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris will add a journey step only when the underlying workflow provides real evidence for it.
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section
        title="Voting"
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

      <V3Section
        title="Needs attention"
        meta={
          participate.needsAttention.length ? (
            <V3StatusChip tone="required">
              {participate.needsAttention.length} required
            </V3StatusChip>
          ) : (
            <V3StatusChip tone="success">Clear</V3StatusChip>
          )
        }
      >
        {participate.needsAttention.length ? (
          <ActionList
            actions={participate.needsAttention}
            progressByActionId={progressByActionId}
            delegationLabel={delegationLabel}
          />
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">Nothing requires action</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris will surface the next official responsibility when it becomes actionable.
            </p>
          </V3Surface>
        )}
      </V3Section>

      {participate.blocked.length ? (
        <V3Section title="Blocked" meta={<V3StatusChip tone="danger">No action available</V3StatusChip>}>
          <V3Surface className="mb-3 p-4">
            <p className="text-sm font-semibold">Something needs resolution, but you cannot act yet</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris will move this back to Needs attention when the authoritative workflow gives you an action, such as reopened Entry editing.
            </p>
          </V3Surface>
          <ActionList
            actions={participate.blocked}
            progressByActionId={progressByActionId}
            delegationLabel={delegationLabel}
          />
        </V3Section>
      ) : null}

      {participate.next.length ? (
        <V3Section title="Next" meta={<V3StatusChip tone="progress">Upcoming</V3StatusChip>}>
          <ActionList
            actions={participate.next}
            progressByActionId={progressByActionId}
            delegationLabel={delegationLabel}
          />
        </V3Section>
      ) : null}

      {participate.waiting.length ? (
        <V3Section title="Waiting" meta={<V3StatusChip tone="progress">No action yet</V3StatusChip>}>
          <ActionList
            actions={participate.waiting}
            progressByActionId={progressByActionId}
            delegationLabel={delegationLabel}
          />
        </V3Section>
      ) : null}

      {participate.optionalNow.length ? (
        <V3Section title="Optional now" meta={<V3StatusChip>Optional</V3StatusChip>}>
          <ActionList
            actions={participate.optionalNow}
            progressByActionId={progressByActionId}
            delegationLabel={delegationLabel}
          />
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
