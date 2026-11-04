import { CheckCircle2, FileCheck2, Gamepad2, History, ReceiptText, Vote } from "lucide-react";

import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { formatEventDateTime } from "@/lib/public-time";
import type {
  V3ParticipantActivityItem,
  V3ParticipantActivityKind,
} from "@/lib/v3-participant-activity";
import { useV3ParticipantActivity } from "@/lib/v3-participant-activity-runtime";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

function kindLabel(kind: V3ParticipantActivityKind) {
  switch (kind) {
    case "submission": return "Submission";
    case "receipt": return "Receipt";
    case "jury_participation": return "Jury";
    case "televote_participation": return "Televote";
    case "prediction": return "Prediction";
    case "fantasy": return "Fantasy";
    case "other": return "Activity";
  }
}

function kindIcon(kind: V3ParticipantActivityKind) {
  switch (kind) {
    case "submission": return FileCheck2;
    case "receipt": return ReceiptText;
    case "jury_participation":
    case "televote_participation": return Vote;
    case "prediction":
    case "fantasy": return Gamepad2;
    case "other": return History;
  }
}

function ActivityItem({ item }: { item: V3ParticipantActivityItem }) {
  const Icon = kindIcon(item.kind);
  const unavailable = item.reconciliationState === "unavailable";
  const superseded = item.reconciliationState === "superseded";
  const body = (
    <V3Surface level="raised" className="p-4">
      <article data-v3-activity-item={item.id} data-v3-activity-state={item.reconciliationState}>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-[var(--v3-text-secondary)]">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--v3-text-tertiary)]">
                  {item.editionLabel ?? kindLabel(item.kind)}
                </p>
                <h2 className="mt-1 text-sm font-semibold">{item.title}</h2>
              </div>
              {superseded ? <V3StatusChip tone="locked">Superseded</V3StatusChip> : null}
              {unavailable ? <V3StatusChip tone="neutral">Unavailable</V3StatusChip> : null}
              {!superseded && !unavailable ? <V3StatusChip tone="success">Recorded</V3StatusChip> : null}
            </div>
            {item.description ? (
              <p className="mt-2 text-xs leading-5 text-[var(--v3-text-secondary)]">{item.description}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--v3-text-tertiary)]">
              <span>{formatEventDateTime(item.occurredAt)}</span>
              <span>{kindLabel(item.kind)}</span>
              {item.receiptId ? <span>Receipt recorded</span> : null}
            </div>
          </div>
        </div>
      </article>
    </V3Surface>
  );

  if (!item.route || unavailable) return body;
  return (
    <a href={item.route} className="block">
      {body}
    </a>
  );
}

export function V3ParticipantActivityScreen({ viewerId }: { viewerId: string }) {
  const authenticatedUser = useAuthenticatedUser();
  const ownsIdentity = viewerId === authenticatedUser.id;
  const activity = useV3ParticipantActivity(ownsIdentity ? viewerId : null, ownsIdentity);

  // Never render cached private activity when the verified session changes.
  // Even a disabled query can retain old data, so this is a render boundary.
  if (!ownsIdentity) {
    return (
      <V3Screen>
        <V3Surface>
          <p role="status" className="text-sm text-[var(--v3-text-secondary)]">
            Your account changed. Reopen Activity to verify the current session.
          </p>
        </V3Surface>
      </V3Screen>
    );
  }

  return (
    <V3Screen className="pb-8">
      <div data-v3-participant-activity-root="">
        <V3ScreenHeader
          kicker="Me"
          title="Activity"
          description="Your canonical Solaris actions and receipts. Public content updates and notification delivery are not treated as activity truth."
        />

        <V3Section title="Your activity" meta="Private to your account">
          {activity.isLoading ? (
            <V3Surface>
              <p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">
                Loading your activity…
              </p>
            </V3Surface>
          ) : activity.isError && !activity.data?.items.length ? (
            <V3Surface>
              <p role="alert" className="text-sm font-semibold">Your activity could not be loaded.</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Solaris will not reconstruct private activity from browser history, notifications, or public content events.
              </p>
            </V3Surface>
          ) : activity.data?.schemaReady === false ? (
            <V3Surface>
              <div data-v3-participant-activity-state="unavailable">
                <p className="text-sm font-semibold">Activity history is not available yet</p>
                <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                  The private recipient activity projection is not available on the current System contract. No substitute feed is shown because that could misrepresent your participation history.
                </p>
              </div>
            </V3Surface>
          ) : activity.data?.items.length ? (
            <div className="grid gap-3">
              {activity.data.items.map((item) => <ActivityItem key={item.id} item={item} />)}
            </div>
          ) : (
            <V3Surface>
              <div data-v3-participant-activity-state="empty" className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">No recorded activity yet</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    Canonical submissions, receipts, eligible voting participation and useful game activity will appear here when they exist.
                  </p>
                </div>
              </div>
            </V3Surface>
          )}
          {activity.data?.schemaReady && activity.data.items.length > 0 && activity.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                data-v3-activity-load-more=""
                className="min-h-11 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-2 text-sm font-semibold text-[var(--v3-text-primary)] transition hover:bg-white/[0.10] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
                onClick={() => void activity.fetchNextPage()}
                disabled={activity.isFetchingNextPage}
              >
                {activity.isFetchingNextPage ? "Loading earlier activity…" : "Load earlier activity"}
              </button>
            </div>
          ) : null}
          {activity.isFetchNextPageError ? (
            <p role="alert" className="mt-3 text-sm text-[var(--v3-text-secondary)]">
              Earlier activity could not be loaded. Your existing history is unchanged; try again.
            </p>
          ) : null}
        </V3Section>
      </div>
    </V3Screen>
  );
}
