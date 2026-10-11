import type { V3BootstrapProjection } from "@/lib/v3-bootstrap";
import type { V3ActionProjection } from "@/lib/v3-experience";
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

function timingMeta(action: V3ActionProjection, delegationLabel?: string | null) {
  const values = [
    action.deadline ? "Deadline set" : action.opensAt ? "Scheduled" : null,
    delegationLabel ?? null,
  ].filter(Boolean) as string[];

  if (!values.length) return undefined;
  return (
    <>
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </>
  );
}

function activeRequiredActions(bootstrap: V3BootstrapProjection) {
  return bootstrap.actions.filter(
    (action) => action.deliveryClass === "required" && action.actionRequired && !action.completed,
  );
}

function optionalActions(bootstrap: V3BootstrapProjection) {
  return bootstrap.actions.filter(
    (action) => action.deliveryClass === "optional" && !action.completed,
  );
}

/**
 * V3 Participate composition.
 *
 * Responsibilities come from Journey and active work comes from Actions. The
 * component receives optional progress enrichment separately because existing
 * SolarisTask does not yet carry a generic progress payload. V3 must not invent
 * fake progress in its canonical projection merely to make the mock-up prettier.
 */
export function V3ParticipateScreen({
  bootstrap,
  progressByActionId = {},
  delegationLabel,
}: V3ParticipateScreenProps) {
  const required = activeRequiredActions(bootstrap);
  const optional = optionalActions(bootstrap);
  const completed = bootstrap.journey.filter((step) => step.state === "complete").length;

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
          bootstrap.journey.length
            ? `${completed} of ${bootstrap.journey.length} complete`
            : "No current responsibilities"
        }
      >
        {bootstrap.journey.length ? (
          <V3Journey>
            {bootstrap.journey.map((step) => {
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
        title="Needs attention"
        meta={
          required.length ? (
            <V3StatusChip tone="required">
              {required.length} required
            </V3StatusChip>
          ) : (
            <V3StatusChip tone="success">Clear</V3StatusChip>
          )
        }
      >
        {required.length ? (
          <div className="v3-preview-grid">
            {required.map((action) => {
              const progress = progressByActionId[action.id];
              return (
                <V3Surface key={action.id} level="raised" className="p-3">
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
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">Nothing requires action</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris will surface the next official responsibility when it becomes actionable.
            </p>
          </V3Surface>
        )}
      </V3Section>

      {optional.length ? (
        <V3Section title="Optional now" meta={<V3StatusChip>Optional</V3StatusChip>}>
          <div className="v3-preview-grid">
            {optional.map((action) => (
              <V3ActionCard
                key={action.id}
                title={action.title}
                description={action.description}
                tone="neutral"
                to={action.route}
              />
            ))}
          </div>
        </V3Section>
      ) : null}

      {bootstrap.attention.remainingCount > 0 ? (
        <V3Surface className="mt-6 p-4">
          <p className="text-sm font-semibold">
            {bootstrap.attention.remainingCount} more item
            {bootstrap.attention.remainingCount === 1 ? "" : "s"} need attention
          </p>
          <p className="mt-1 text-xs leading-5 text-white/48">
            Home stays intentionally limited. Participate is the complete operational view.
          </p>
        </V3Surface>
      ) : null}
    </V3Screen>
  );
}
