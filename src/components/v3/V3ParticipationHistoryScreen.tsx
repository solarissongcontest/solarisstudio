import { Flag, History, ShieldCheck, UserRound } from "lucide-react";

import { formatEventDateTime } from "@/lib/public-time";
import type {
  V3ParticipationHistoryItem,
  V3ParticipationHistoryRole,
} from "@/lib/v3-participation-history";
import { useV3ParticipationHistory } from "@/lib/v3-participation-history-runtime";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

function roleLabel(role: V3ParticipationHistoryRole) {
  switch (role) {
    case "hod": return "Head of Delegation";
    case "participant": return "Participant";
    case "juror": return "Juror";
    case "other": return "Participation role";
  }
}

function roleIcon(role: V3ParticipationHistoryRole) {
  if (role === "hod") return ShieldCheck;
  if (role === "juror") return UserRound;
  return Flag;
}

function editionLabel(item: V3ParticipationHistoryItem) {
  return item.editionNumber != null ? `SSC ${item.editionNumber}` : item.editionName;
}

function periodLabel(item: V3ParticipationHistoryItem) {
  if (item.startedAt && item.endedAt) {
    return `${formatEventDateTime(item.startedAt)} – ${formatEventDateTime(item.endedAt)}`;
  }
  if (item.startedAt) return `From ${formatEventDateTime(item.startedAt)}`;
  if (item.endedAt) return `Until ${formatEventDateTime(item.endedAt)}`;
  return null;
}

function HistoryItem({ item }: { item: V3ParticipationHistoryItem }) {
  const Icon = roleIcon(item.role);
  const period = periodLabel(item);
  return (
    <V3Surface level="raised" className="p-4">
      <article data-v3-participation-history-item={item.id} data-v3-history-state={item.state}>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-[var(--v3-text-secondary)]">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--v3-text-tertiary)]">{editionLabel(item)}</p>
                <h2 className="mt-1 text-sm font-semibold">
                  {item.countryName ?? "Solaris participation"}
                </h2>
              </div>
              {item.state === "current" ? <V3StatusChip tone="success">Current</V3StatusChip> : null}
              {item.state === "historical" ? <V3StatusChip tone="neutral">Historical</V3StatusChip> : null}
              {item.state === "superseded" ? <V3StatusChip tone="locked">Superseded</V3StatusChip> : null}
              {item.state === "unavailable" ? <V3StatusChip tone="neutral">Unavailable</V3StatusChip> : null}
            </div>
            <p className="mt-2 text-xs font-semibold text-[var(--v3-text-secondary)]">
              {roleLabel(item.role)}
            </p>
            {period ? (
              <p className="mt-1 text-[11px] leading-5 text-[var(--v3-text-tertiary)]">{period}</p>
            ) : null}
            {item.state === "superseded" ? (
              <p className="mt-2 text-xs leading-5 text-[var(--v3-text-secondary)]">
                This attribution has been replaced by newer canonical history and is retained for reconciliation.
              </p>
            ) : null}
            {item.state === "unavailable" ? (
              <p className="mt-2 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Some historical display detail is no longer available. Solaris keeps the safe participation record without exposing stale or restricted data.
              </p>
            ) : null}
          </div>
        </div>
      </article>
    </V3Surface>
  );
}

export function V3ParticipationHistoryScreen() {
  const history = useV3ParticipationHistory(true);

  return (
    <V3Screen className="pb-8">
      <div data-v3-participation-history-root="">
        <V3ScreenHeader
          kicker="Me"
          title="History"
          description="Your past Solaris participation across editions, countries and roles, derived from canonical delegation history rather than the country you happen to control today."
        />

        <V3Section title="Participation history" meta="Private to your account">
          {history.isLoading ? (
            <V3Surface>
              <p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">
                Loading your participation history…
              </p>
            </V3Surface>
          ) : history.isError ? (
            <V3Surface>
              <p role="alert" className="text-sm font-semibold">Your participation history could not be loaded.</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Solaris will not infer historical countries or roles from your current delegation, browser state, or editable HOD preferences.
              </p>
            </V3Surface>
          ) : history.data?.schemaReady === false ? (
            <V3Surface>
              <div data-v3-participation-history-state="unavailable">
                <p className="text-sm font-semibold">Personal history is not available yet</p>
                <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                  The recipient-scoped System history projection is not available. Current-country HOD settings are kept separate because they cannot prove your full past participation.
                </p>
              </div>
            </V3Surface>
          ) : history.data?.items.length ? (
            <div className="grid gap-3">
              {history.data.items.map((item) => <HistoryItem key={item.id} item={item} />)}
            </div>
          ) : (
            <V3Surface>
              <div data-v3-participation-history-state="empty" className="flex items-start gap-3">
                <History className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">No participation history yet</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    Past edition, country and role relationships will appear here when canonical history exists for your account.
                  </p>
                </div>
              </div>
            </V3Surface>
          )}
        </V3Section>
      </div>
    </V3Screen>
  );
}
