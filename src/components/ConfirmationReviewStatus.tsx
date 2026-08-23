import { CheckCircle2, Clock3, Trophy, XCircle } from "lucide-react";

export type ConfirmationReviewEntry = {
  id?: string | null;
  artist?: string | null;
  song_title?: string | null;
  review_status?: string | null;
  review_reason?: string | null;
  reviewed_at?: string | null;
  removed?: boolean | null;
  position?: number | null;
};

export type ConfirmationReviewNationalFinal = {
  id?: string | null;
  nf_name?: string | null;
  winning_entry_id?: string | null;
  entries?: ConfirmationReviewEntry[] | null;
};

export function ConfirmationReviewStatus({
  selectionMethod,
  internalEntry,
  nationalFinal,
  compact = false,
}: {
  selectionMethod?: string | null;
  internalEntry?: ConfirmationReviewEntry | null;
  nationalFinal?: ConfirmationReviewNationalFinal | null;
  compact?: boolean;
}) {
  if (selectionMethod === "internal") {
    if (!internalEntry) return null;
    const status = normalizeReviewStatus(internalEntry.review_status);

    return (
      <section className={reviewPanelClass(status, compact)} aria-label="Entry review status">
        <div className="flex items-start gap-3">
          <ReviewIcon status={status} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">Entry review</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{reviewHeading(status, "entry")}</p>
              <ReviewBadge status={status} />
            </div>
            <p className="mt-1 text-xs leading-relaxed opacity-75">
              {[internalEntry.artist, internalEntry.song_title].filter(Boolean).join(" — ") || "Submitted entry"}
            </p>
            {status === "declined" && internalEntry.review_reason ? (
              <p className="mt-2 rounded-lg border border-current/15 bg-black/10 px-3 py-2 text-xs leading-relaxed">
                <span className="font-semibold">Reason:</span> {internalEntry.review_reason}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (selectionMethod !== "national_final" || !nationalFinal) return null;

  const entries = (nationalFinal.entries ?? [])
    .filter((entry) => !entry.removed && normalizeReviewStatus(entry.review_status) !== "removed")
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  if (!entries.length) return null;

  const statuses = entries.map((entry) => normalizeReviewStatus(entry.review_status));
  const pendingCount = statuses.filter((status) => status === "pending").length;
  const declinedCount = statuses.filter((status) => status === "declined").length;
  const acceptedCount = statuses.filter((status) => status === "accepted").length;
  const overall = pendingCount ? "pending" : declinedCount ? "declined" : "accepted";

  return (
    <section className={reviewPanelClass(overall, compact)} aria-label="National Final song review status">
      <div className="flex items-start gap-3">
        <ReviewIcon status={overall} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">
            {nationalFinal.nf_name || "National Final"} review
          </p>
          <p className="mt-1 text-sm font-semibold">
            {pendingCount
              ? `${pendingCount} ${pendingCount === 1 ? "song is" : "songs are"} waiting for review`
              : declinedCount
                ? `${declinedCount} ${declinedCount === 1 ? "song was" : "songs were"} not accepted`
                : `All ${acceptedCount} ${acceptedCount === 1 ? "song is" : "songs are"} accepted`}
          </p>

          <div className="mt-3 space-y-2">
            {entries.map((entry, index) => {
              const status = normalizeReviewStatus(entry.review_status);
              const winner = Boolean(entry.id && nationalFinal.winning_entry_id === entry.id);
              return (
                <div
                  key={entry.id ?? `${entry.artist ?? "entry"}-${entry.song_title ?? index}`}
                  className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-current/10 bg-black/10 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {[entry.artist, entry.song_title].filter(Boolean).join(" — ") || `Song ${index + 1}`}
                    </p>
                    {status === "declined" && entry.review_reason ? (
                      <p className="mt-1 text-[11px] leading-relaxed opacity-75">{entry.review_reason}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {winner ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-current/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em]">
                        <Trophy className="size-3" /> Winner
                      </span>
                    ) : null}
                    <ReviewBadge status={status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function normalizeReviewStatus(status?: string | null) {
  const value = status?.trim().toLowerCase();
  if (value === "accepted") return "accepted" as const;
  if (value === "declined" || value === "rejected") return "declined" as const;
  if (value === "removed") return "removed" as const;
  return "pending" as const;
}

type ReviewStatus = ReturnType<typeof normalizeReviewStatus>;

function reviewPanelClass(status: ReviewStatus, compact: boolean) {
  const size = compact ? "p-3" : "p-4";
  if (status === "accepted") {
    return `rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.09] text-emerald-100 ${size}`;
  }
  if (status === "declined") {
    return `rounded-2xl border border-amber-300/35 bg-amber-300/[0.10] text-amber-100 ${size}`;
  }
  if (status === "removed") {
    return `rounded-2xl border border-white/10 bg-white/[0.035] text-white/65 ${size}`;
  }
  return `rounded-2xl border border-rose-300/30 bg-rose-300/[0.085] text-rose-100 ${size}`;
}

function ReviewIcon({ status }: { status: ReviewStatus }) {
  const className = "mt-0.5 size-5 shrink-0";
  if (status === "accepted") return <CheckCircle2 className={className} />;
  if (status === "declined" || status === "removed") return <XCircle className={className} />;
  return <Clock3 className={className} />;
}

function ReviewBadge({ status }: { status: ReviewStatus }) {
  const label =
    status === "accepted"
      ? "Accepted"
      : status === "declined"
        ? "Not accepted"
        : status === "removed"
          ? "Removed"
          : "Waiting for review";

  return (
    <span className="inline-flex rounded-full border border-current/20 bg-black/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em]">
      {label}
    </span>
  );
}

function reviewHeading(status: ReviewStatus, noun: string) {
  if (status === "accepted") return `Your ${noun} was accepted`;
  if (status === "declined") return `Your ${noun} was not accepted`;
  if (status === "removed") return `Your ${noun} was removed`;
  return `Your ${noun} is waiting for review`;
}
