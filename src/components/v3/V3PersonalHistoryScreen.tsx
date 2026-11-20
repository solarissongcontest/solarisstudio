import { History, ShieldCheck, UserRoundCheck } from "lucide-react";

import { useV3PersonalHistory } from "@/lib/v3-personal-history-runtime";
import type {
  V3PersonalHistoryItem,
  V3PersonalHistoryRole,
  V3PersonalHistoryState,
} from "@/lib/v3-personal-history";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

function roleLabel(role: V3PersonalHistoryRole) {
  if (role === "hod") return "Head of Delegation";
  if (role === "juror") return "Jury member";
  return "Participant";
}

function stateLabel(state: V3PersonalHistoryState) {
  if (state === "current") return "Current";
  if (state === "superseded") return "Superseded";
  return "Historical";
}

function stateTone(state: V3PersonalHistoryState) {
  if (state === "current") return "success" as const;
  if (state === "superseded") return "warning" as const;
  return "neutral" as const;
}

function editionLabel(item: V3PersonalHistoryItem) {
  return item.editionNumber != null ? `SSC ${item.editionNumber}` : item.editionName;
}

function HistoryRow({ item }: { item: V3PersonalHistoryItem }) {
  const Icon = item.role === "juror" ? UserRoundCheck : ShieldCheck;
  return (
    <V3Surface className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-[var(--v3-text-secondary)]">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{editionLabel(item)} · {item.countryName}</p>
            <V3StatusChip tone={stateTone(item.state)}>{stateLabel(item.state)}</V3StatusChip>
          </div>
          <p className="mt-1 text-xs text-[var(--v3-text-secondary)]">{roleLabel(item.role)}</p>
          {item.endedAt ? (
            <p className="mt-2 text-[11px] text-[var(--v3-text-tertiary)]">Relationship ended {new Date(item.endedAt).toLocaleDateString()}</p>
          ) : null}
        </div>
      </div>
    </V3Surface>
  );
}

export function V3PersonalHistoryScreen() {
  const history = useV3PersonalHistory(true);

  return (
    <V3Screen className="pb-8">
      <V3ScreenHeader
        kicker="Me"
        title="Participation history"
        description="Your edition-scoped Solaris roles, using only relationships the system can prove for this account."
      />

      <V3Section title="Your Solaris history">
        {history.isLoading ? (
          <V3Surface>
            <p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">Loading your participation history…</p>
          </V3Surface>
        ) : history.isError ? (
          <V3Surface>
            <p role="alert" className="text-sm font-semibold">Participation history could not be loaded.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">Solaris will not replace missing personal history with your current country or public archive activity.</p>
          </V3Surface>
        ) : !history.data?.schemaReady ? (
          <V3Surface level="raised" className="p-4">
            <div className="flex items-start gap-3">
              <History className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Personal history is not available yet</p>
                <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">The caller-scoped History contract is not available on this System version, so Solaris is failing closed instead of guessing.</p>
              </div>
            </div>
          </V3Surface>
        ) : history.data.items.length === 0 ? (
          <V3Surface level="raised" className="p-4">
            <p className="text-sm font-semibold">No verified participation history yet</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">No edition-scoped HOD or jury relationship is currently proven for this account.</p>
          </V3Surface>
        ) : (
          <div className="grid gap-2" data-v3-personal-history-list="">
            {history.data.items.map((item) => <HistoryRow key={item.id} item={item} />)}
          </div>
        )}
      </V3Section>
    </V3Screen>
  );
}
