import { Link } from "@tanstack/react-router";
import { Archive, ArrowLeft, CheckCircle2, MailOpen, ShieldCheck, Undo2 } from "lucide-react";

import type { NoticeAudience, NoticeEditionGroup } from "@/lib/official-communications";
import { noticeTypeLabel } from "@/lib/official-communications";
import type { Studio2NoticeInboxItem } from "@/lib/studio2-communications";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export type V3OfficialNoticeDetailProps = {
  item: Studio2NoticeInboxItem | null;
  state: "loading" | "ready" | "missing" | "error";
  busy?: boolean;
  mutationError?: unknown;
  onAcknowledge: () => void;
  onArchive: (archived: boolean) => void;
};

function formatTimestamp(value: string | null) {
  if (!value) return "Sent recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sent recently";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function audienceReason(audience: NoticeAudience, group: NoticeEditionGroup | null) {
  switch (audience) {
    case "all_delegations":
      return "TSBC sent this official notice to all delegations.";
    case "participating_countries":
      return "You are seeing this because your delegation is participating in the relevant edition.";
    case "specific_countries":
      return "You are seeing this because your delegation was explicitly included in the recipient list.";
    case "jurors":
      return "You are seeing this because the notice applies to the current jury audience.";
    case "hods":
      return "You are seeing this because the notice applies to Heads of Delegation.";
    case "organizers":
      return "You are seeing this because your authorized account is in the organizer audience.";
    case "edition_group":
      return group
        ? `You are seeing this because the notice applies to the ${group.replace(/_/g, " ")} group for this edition.`
        : "You are seeing this because the notice applies to one of your edition groups.";
    case "staff":
      return "You are seeing this because the notice applies to authorized staff.";
    case "press":
      return "You are seeing this because the notice applies to the authorized press audience.";
  }
}

function safeMutationMessage(error: unknown) {
  if (!error) return null;
  return "Solaris could not update this notice. Its current server state has not been replaced by a local success state.";
}

export function V3OfficialNoticeDetail({
  item,
  state,
  busy = false,
  mutationError,
  onAcknowledge,
  onArchive,
}: V3OfficialNoticeDetailProps) {
  if (state === "loading") {
    return (
      <V3Screen>
        <div data-v3-official-notice-detail="loading" role="status" aria-live="polite">
          <V3ScreenHeader kicker="Notifications" title="Opening official message" />
          <V3Surface>
            <p className="text-sm text-[var(--v3-text-secondary)]">
              Checking the current authorized notice state…
            </p>
          </V3Surface>
        </div>
      </V3Screen>
    );
  }

  if (state === "error") {
    return (
      <V3Screen>
        <div data-v3-official-notice-detail="error">
          <V3ScreenHeader kicker="Notifications" title="Official message unavailable" />
          <V3Surface>
            <div role="alert">
              <p className="text-sm font-semibold">Solaris could not load the current notice state.</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Required participation remains visible in Participate. This screen will not guess whether the message is still actionable.
              </p>
            </div>
            <BackToNotifications />
          </V3Surface>
        </div>
      </V3Screen>
    );
  }

  if (state === "missing" || !item) {
    return (
      <V3Screen>
        <div data-v3-official-notice-detail="stale">
          <V3ScreenHeader kicker="Notifications" title="This message is no longer available" />
          <V3Surface>
            <div className="flex items-start gap-3">
              <MailOpen className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">The deep link is stale for your current account or edition.</p>
                <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                  It may have been superseded, archived outside this view, or your access may have changed. Solaris will not reopen an old notice from cached browser state.
                </p>
              </div>
            </div>
            <BackToNotifications />
          </V3Surface>
        </div>
      </V3Screen>
    );
  }

  const notice = item.notice;
  const archived = item.inboxState === "archived";
  const acknowledged = item.inboxState === "acknowledged";
  const requiresAcknowledgement = notice.acknowledgementRequired && !acknowledged && !archived;
  const mutationMessage = safeMutationMessage(mutationError);

  return (
    <V3Screen>
      <div data-v3-official-notice-detail="ready">
        <V3ScreenHeader
          kicker="Official message"
          title={notice.title}
          description={`${noticeTypeLabel(notice.noticeType)} · ${formatTimestamp(notice.sentAt)}`}
        />

        <V3Section
          title="Message"
          meta={
            <V3StatusChip
              tone={
                requiresAcknowledgement
                  ? "required"
                  : acknowledged
                    ? "success"
                    : notice.severity === "critical"
                      ? "danger"
                      : "neutral"
              }
            >
              {requiresAcknowledgement
                ? "Acknowledgement required"
                : acknowledged
                  ? "Acknowledged"
                  : archived
                    ? "Archived"
                    : "Official"}
            </V3StatusChip>
          }
        >
          <V3Surface level={requiresAcknowledgement ? "raised" : "base"}>
            <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--v3-text-primary)]">
              {notice.body}
            </p>

            {notice.acknowledgementRequired ? (
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.03] p-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">
                    {acknowledged ? "Acknowledgement recorded" : "Acknowledgement required"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    {acknowledged
                      ? "The authoritative notice receipt records your acknowledgement."
                      : "Acknowledge only after you have read this message. Solaris waits for the server response before treating it as complete."}
                  </p>
                </div>
              </div>
            ) : null}

            {mutationMessage ? (
              <p className="mt-4 rounded-xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs leading-5" role="alert">
                {mutationMessage}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {requiresAcknowledgement ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onAcknowledge}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  {busy ? "Updating…" : "Acknowledge notice"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => onArchive(!archived)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.035] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {archived ? <Undo2 className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
                {archived ? "Restore to inbox" : "Archive"}
              </button>
            </div>
          </V3Surface>
        </V3Section>

        <V3Section title="Why am I seeing this?">
          <V3Surface>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Authorized recipient context</p>
                <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                  {audienceReason(notice.audience, notice.audienceGroup)}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--v3-text-tertiary)]">
                  Notification delivery is not workflow truth. If this notice refers to required participation, the authoritative task state remains in Participate.
                </p>
              </div>
            </div>
          </V3Surface>
        </V3Section>

        <BackToNotifications />
      </div>
    </V3Screen>
  );
}

function BackToNotifications() {
  return (
    <Link
      to="/notifications"
      search={{}}
      className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.035] px-4 text-sm font-semibold"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to notifications
    </Link>
  );
}
