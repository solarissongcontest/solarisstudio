export type V3DraftRevision = {
  draftId: string;
  revision: number;
  updatedAt: string;
  writerId: string;
};

export type V3DraftWriteAttempt = {
  draftId: string;
  baseRevision: number | null;
  writerId: string;
  at: string;
};

export type V3DraftWriteDecision =
  | {
      status: "accept";
      next: V3DraftRevision;
    }
  | {
      status: "conflict";
      current: V3DraftRevision;
      attemptedBaseRevision: number | null;
      changedOnAnotherWriter: boolean;
      message: string;
    }
  | {
      status: "invalid";
      message: string;
    };

function validRevision(value: number | null) {
  return value == null || (Number.isInteger(value) && value >= 0);
}

/**
 * Optimistic-concurrency guard for editable V3 drafts.
 *
 * The server should evaluate this contract transactionally (or enforce an
 * equivalent revision precondition) before accepting a write. It prevents a
 * stale phone/desktop tab from silently overwriting a newer draft revision.
 */
export function decideV3DraftWrite(
  current: V3DraftRevision | null,
  attempt: V3DraftWriteAttempt,
): V3DraftWriteDecision {
  if (!attempt.draftId.trim() || !attempt.writerId.trim() || !validRevision(attempt.baseRevision)) {
    return {
      status: "invalid",
      message: "Draft write metadata is invalid.",
    };
  }

  if (current && current.draftId !== attempt.draftId) {
    return {
      status: "invalid",
      message: "Draft identity does not match the canonical draft.",
    };
  }

  if (!current) {
    if (attempt.baseRevision != null && attempt.baseRevision !== 0) {
      return {
        status: "conflict",
        current: {
          draftId: attempt.draftId,
          revision: 0,
          updatedAt: attempt.at,
          writerId: "server",
        },
        attemptedBaseRevision: attempt.baseRevision,
        changedOnAnotherWriter: false,
        message: "This draft no longer has the revision your device expected. Reload before saving.",
      };
    }

    return {
      status: "accept",
      next: {
        draftId: attempt.draftId,
        revision: 1,
        updatedAt: attempt.at,
        writerId: attempt.writerId,
      },
    };
  }

  if (attempt.baseRevision !== current.revision) {
    return {
      status: "conflict",
      current,
      attemptedBaseRevision: attempt.baseRevision,
      changedOnAnotherWriter: current.writerId !== attempt.writerId,
      message:
        current.writerId !== attempt.writerId
          ? "This draft was changed on another device or session. Review the newer version before saving."
          : "This draft changed after your editor loaded it. Reload the newest revision before saving.",
    };
  }

  return {
    status: "accept",
    next: {
      draftId: current.draftId,
      revision: current.revision + 1,
      updatedAt: attempt.at,
      writerId: attempt.writerId,
    },
  };
}

export function v3DraftConflictUserMessage(decision: V3DraftWriteDecision) {
  if (decision.status !== "conflict") return null;
  return decision.changedOnAnotherWriter
    ? "This draft was changed on another device."
    : "A newer version of this draft exists.";
}
