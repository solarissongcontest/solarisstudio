import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Clock3,
  Heart,
  Settings2,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import type { V3MeProjection } from "@/lib/v3-me";
import { V3Screen, V3Section, V3StatusChip } from "./V3Foundation";

export type V3MeScreenProps = {
  projection: V3MeProjection;
};

function countLabel(count: number | null, singular: string, plural = `${singular}s`) {
  if (count === null) return "Count unavailable";
  return `${count} ${count === 1 ? singular : plural}`;
}

function MeRow({
  to,
  title,
  description,
  icon: Icon,
  trailing,
}: {
  to: string;
  title: string;
  description: string;
  icon?: LucideIcon;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      to={to as any}
      className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {Icon ? (
        <span className="grid size-9 shrink-0 place-items-center text-[var(--v3-accent-strong)]" aria-hidden="true">
          <Icon className="size-[18px]" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-white/45">{description}</span>
      </span>
      {trailing}
      <ChevronRight className="size-4 shrink-0 text-white/24" aria-hidden="true" />
    </Link>
  );
}

export function V3MeScreen({ projection }: V3MeScreenProps) {
  const identityMeta = [projection.identity.delegationName, projection.identity.displayRole]
    .filter(Boolean)
    .join(" · ");

  return (
    <V3Screen>
      <header className="flex items-center gap-4 border-b border-white/[0.08] pb-5" data-v3-me-identity="">
        {projection.identity.delegationFlagUrl ? (
          <img
            src={projection.identity.delegationFlagUrl}
            alt=""
            className="h-12 w-[4.5rem] shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/[0.045] text-white/52" aria-hidden="true">
            <UserRound className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="v3-kicker">Me</p>
          <h1 className="mt-1 truncate text-[clamp(1.8rem,7vw,2.5rem)] font-semibold leading-none tracking-[-0.05em]">
            {projection.identity.displayName}
          </h1>
          {identityMeta ? <p className="mt-2 truncate text-xs text-white/48">{identityMeta}</p> : null}
        </div>
      </header>

      <V3Section title="Current">
        {projection.current ? (
          <div className="border-y border-white/[0.07]">
            <MeRow
              to={projection.current.href}
              title={projection.current.editionName}
              description={projection.current.roleLabel ?? "Current edition membership"}
            />
          </div>
        ) : (
          <p className="border-y border-white/[0.07] py-4 text-sm leading-6 text-white/48">
            Current participation is not confirmed here. Open Participate to check your current edition.
          </p>
        )}
      </V3Section>

      <V3Section title="History" meta={projection.history.length ? countLabel(projection.history.length, "edition") : undefined}>
        {projection.history.length ? (
          <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
            {projection.history.slice(0, 4).map((item) => (
              <MeRow
                key={`${item.editionId}:${item.href}`}
                to={item.href}
                title={item.editionName}
                description={item.roleLabel ?? "Recorded delegation history"}
                trailing={item.completed ? <V3StatusChip tone="success">Complete</V3StatusChip> : undefined}
              />
            ))}
          </div>
        ) : (
          <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">
            {projection.historyAvailable === false ? "Delegation history is unavailable" : "No recorded delegation editions"}
          </p>
        )}
      </V3Section>

      <V3Section title="Activity" meta="Evidence-aware">
        <dl className="grid grid-cols-2 border-y border-white/[0.07] divide-x divide-white/[0.07]" data-v3-me-activity-metrics="">
          <div className="py-3 pr-4">
            <dd className="text-xl font-bold tabular-nums tracking-[-0.035em]">{projection.activity.verifiedReceiptCount ?? "—"}</dd>
            <dt className="mt-1 text-xs leading-5 text-white/43">Delegation V3 receipts</dt>
          </div>
          <div className="py-3 pl-4">
            <dd className="text-xl font-bold tabular-nums tracking-[-0.035em]">{projection.activity.awaitingAuthoritativeReceiptCount ?? "—"}</dd>
            <dt className="mt-1 text-xs leading-5 text-white/43">
              {projection.activity.awaitingAuthoritativeReceiptCount === null ? "Pending count unavailable" : "Awaiting authority"}
            </dt>
          </div>
        </dl>
        <div className="border-b border-white/[0.07]">
          <MeRow
            to={projection.activity.href}
            title="Open activity"
            description="View current delegation activity and server-backed receipt evidence"
            icon={ShieldCheck}
          />
        </div>
      </V3Section>

      <V3Section title="Following">
        <div className="border-y border-white/[0.07]">
          <MeRow
            to={projection.following.href}
            title="Following"
            description={projection.following.followedCountryCount === null || projection.following.followedContentCount === null ? "Following counts are unavailable" : `${countLabel(projection.following.followedCountryCount, "country", "countries")} · ${countLabel(projection.following.followedContentCount, "item")}`}
            icon={Heart}
          />
        </div>
      </V3Section>

      <V3Section title="Preferences">
        <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
          {projection.preferences.map((link) => (
            <MeRow key={link.key} to={link.href} title={link.label} description="Solaris preference" icon={Settings2} />
          ))}
        </div>
      </V3Section>

      <V3Section title="Account">
        <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
          {projection.account.map((link) => (
            <MeRow key={link.key} to={link.href} title={link.label} description="Account and security" />
          ))}
        </div>
      </V3Section>

      {projection.organizerAction ? (
        <V3Section title="Organizer" meta={<V3StatusChip>Authorized</V3StatusChip>}>
          <div className="border-y border-white/[0.07]">
            <MeRow
              to={projection.organizerAction.href}
              title={projection.organizerAction.label}
              description="Enter the separate Organizer operating mode"
              icon={Clock3}
            />
          </div>
        </V3Section>
      ) : null}
    </V3Screen>
  );
}
