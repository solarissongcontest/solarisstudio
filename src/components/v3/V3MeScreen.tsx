import { Clock3, Heart, Settings2, ShieldCheck, UserRound } from "lucide-react";

import type { V3MeProjection } from "@/lib/v3-me";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export type V3MeScreenProps = {
  projection: V3MeProjection;
};

function countLabel(count: number | null, singular: string, plural = `${singular}s`) {
  if (count === null) return "Count unavailable";
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Identity-first Me composition.
 *
 * The projection owns no task/workflow truth and this screen does not infer
 * Organizer or delegation access from role labels. Receipt authority remains
 * external; only already-projected evidence counts are presented here.
 */
export function V3MeScreen({ projection }: V3MeScreenProps) {
  const identityMeta = [projection.identity.delegationName, projection.identity.displayRole]
    .filter(Boolean)
    .join(" · ");

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Me"
        title={projection.identity.displayName}
        description="Your Solaris identity, delegation history, activity and preferences."
      />

      <V3Section title="Identity">
        <V3Surface level="raised" className="p-5">
          <div className="flex items-center gap-4">
            {projection.identity.delegationFlagUrl ? (
              <img
                src={projection.identity.delegationFlagUrl}
                alt=""
                className="h-12 w-[4.5rem] shrink-0 rounded-lg object-cover"
                loading="lazy"
              />
            ) : (
              <span
                className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-white/55"
                aria-hidden="true"
              >
                <UserRound className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-lg font-bold tracking-[-0.03em]">
                {projection.identity.displayName}
              </p>
              {identityMeta ? (
                <p className="mt-1 text-xs leading-5 text-white/52">{identityMeta}</p>
              ) : null}
            </div>
          </div>
        </V3Surface>
      </V3Section>

      <V3Section title="Current">
        {projection.current ? (
          <V3ActionCard
            title={projection.current.editionName}
            description={projection.current.roleLabel ?? "Current edition membership"}
            tone="neutral"
            to={projection.current.href}
          />
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">Current participation is not confirmed here</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Open Participate to check your current edition.
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section
        title="History"
        meta={projection.history.length ? countLabel(projection.history.length, "edition") : undefined}
      >
        {projection.history.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {projection.history.slice(0, 4).map((item) => (
              <V3ActionCard
                key={`${item.editionId}:${item.href}`}
                title={item.editionName}
                description={item.roleLabel ?? "Recorded delegation history"}
                tone="neutral"
                to={item.href}
                meta={
                  item.completed ? <V3StatusChip tone="success">Complete</V3StatusChip> : undefined
                }
              />
            ))}
          </div>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">{projection.historyAvailable === false ? "Delegation history is unavailable" : "No recorded delegation editions"}</p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section title="Activity" meta="Evidence-aware">
        <V3Surface level="raised" className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="v3-surface p-4">
              <span className="block text-2xl font-bold tabular-nums tracking-[-0.04em]">
                {projection.activity.verifiedReceiptCount ?? "—"}
              </span>
              <span className="mt-1 block text-xs leading-5 text-white/48">
                Delegation V3 receipts
              </span>
            </div>
            <div className="v3-surface p-4">
              <span className="block text-2xl font-bold tabular-nums tracking-[-0.04em]">
                {projection.activity.awaitingAuthoritativeReceiptCount ?? "—"}
              </span>
              <span className="mt-1 block text-xs leading-5 text-white/48">
                {projection.activity.awaitingAuthoritativeReceiptCount === null ? "Pending count unavailable" : "Awaiting authority"}
              </span>
            </div>
          </div>
          <div className="mt-3">
            <V3ActionCard
              title="Open activity"
              description="View activity for your current delegation; receipt counts come from the server"
              icon={ShieldCheck}
              tone="neutral"
              to={projection.activity.href}
            />
          </div>
        </V3Surface>
      </V3Section>

      <V3Section title="Following">
        <V3ActionCard
          title="Following"
          description={projection.following.followedCountryCount === null || projection.following.followedContentCount === null ? "Following counts are unavailable" : `${countLabel(projection.following.followedCountryCount, "country", "countries")} · ${countLabel(projection.following.followedContentCount, "item")}`}
          icon={Heart}
          tone="neutral"
          to={projection.following.href}
        />
      </V3Section>

      {projection.delegation.length ? (
        <V3Section title="Delegation" meta={<V3StatusChip>Authorized</V3StatusChip>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {projection.delegation.map((link) => (
              <V3ActionCard
                key={link.key}
                title={link.label}
                description="Open this delegation workspace"
                tone="neutral"
                to={link.href}
              />
            ))}
          </div>
        </V3Section>
      ) : null}

      <V3Section title="Preferences">
        <div className="grid gap-3 sm:grid-cols-2">
          {projection.preferences.map((link) => (
            <V3ActionCard
              key={link.key}
              title={link.label}
              description="Open this Solaris preference"
              icon={Settings2}
              tone="neutral"
              to={link.href}
            />
          ))}
        </div>
      </V3Section>

      <V3Section title="Account">
        <div className="grid gap-3 sm:grid-cols-2">
          {projection.account.map((link) => (
            <V3ActionCard
              key={link.key}
              title={link.label}
              description="Open account settings"
              tone="neutral"
              to={link.href}
            />
          ))}
        </div>
      </V3Section>

      {projection.organizerAction ? (
        <V3Section title="Organizer" meta={<V3StatusChip>Authorized</V3StatusChip>}>
          <V3ActionCard
            title={projection.organizerAction.label}
            description="Enter the separate Organizer operating mode"
            icon={Clock3}
            tone="neutral"
            to={projection.organizerAction.href}
          />
        </V3Section>
      ) : null}
    </V3Screen>
  );
}