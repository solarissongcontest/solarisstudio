import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isJuryWindowReviewScopeCurrent,
  resolveJuryWindowReadState,
  selectJuryWindowShow,
} from "./jury-window-control-state";

const editionId = "edition-22";
const showId = "grand-final";
const scope = { editionId, showId };
const closed = { edition_id: editionId, show_id: showId, status: "closed" as const };
const open = { ...closed, status: "open" as const };

describe("Organizer jury-window authoritative read", () => {
  it("never presents a failed read as a closed window", () => {
    expect(
      resolveJuryWindowReadState({
        ...scope,
        rows: [],
        isLoading: false,
        hasError: true,
      }),
    ).toBe("unavailable");
  });

  it("distinguishes loading from a successful empty (closed) response", () => {
    expect(
      resolveJuryWindowReadState({
        ...scope,
        rows: undefined,
        isLoading: true,
        hasError: false,
      }),
    ).toBe("checking");
    expect(
      resolveJuryWindowReadState({
        ...scope,
        rows: [],
        isLoading: false,
        hasError: false,
      }),
    ).toBe("closed");
    expect(
      resolveJuryWindowReadState({
        ...scope,
        rows: undefined,
        isLoading: false,
        hasError: false,
      }),
    ).toBe("unavailable");
  });

  it("uses the selected show while retaining other valid edition windows", () => {
    expect(
      resolveJuryWindowReadState({
        ...scope,
        rows: [{ ...open, show_id: "semi-final" }, closed],
        isLoading: false,
        hasError: false,
      }),
    ).toBe("closed");
    expect(
      resolveJuryWindowReadState({
        ...scope,
        rows: [open],
        isLoading: false,
        hasError: false,
      }),
    ).toBe("open");
  });

  it("fails closed on cross-edition, duplicated or malformed window data", () => {
    for (const rows of [
      [{ ...open, edition_id: "other-edition" }],
      [open, closed],
      [{ ...closed, status: "unknown" as "closed" }],
    ]) {
      expect(
        resolveJuryWindowReadState({
          ...scope,
          rows,
          isLoading: false,
          hasError: false,
        }),
      ).toBe("unavailable");
    }
  });
});

describe("Organizer jury-window review scope", () => {
  it("accepts only the exact reviewed edition and show", () => {
    expect(isJuryWindowReviewScopeCurrent(scope, scope)).toBe(true);
    expect(isJuryWindowReviewScopeCurrent(scope, { ...scope, showId: "semi-final" })).toBe(false);
    expect(isJuryWindowReviewScopeCurrent(scope, { ...scope, editionId: "edition-23" })).toBe(false);
    expect(isJuryWindowReviewScopeCurrent(scope, { ...scope, showId: null })).toBe(false);
    expect(isJuryWindowReviewScopeCurrent(null, scope)).toBe(false);
  });
});

describe("Organizer jury-window show selector", () => {
  const shows = [{ id: "semi-final" }, { id: "grand-final" }];

  it("uses the first show only when no show was explicitly selected", () => {
    expect(selectJuryWindowShow(shows, undefined)).toBe(shows[0]);
    expect(selectJuryWindowShow(shows, null)).toBe(shows[0]);
    expect(selectJuryWindowShow(shows, "")).toBe(shows[0]);
    expect(selectJuryWindowShow([], undefined)).toBeNull();
  });

  it("never silently changes the show selected by an explicit deep link", () => {
    expect(selectJuryWindowShow(shows, "grand-final")).toBe(shows[1]);
    expect(selectJuryWindowShow(shows, "missing-show")).toBeNull();
    expect(selectJuryWindowShow([], "grand-final")).toBeNull();
  });
});

describe("production Organizer jury control wiring", () => {
  it("does not expose an action or confirm a review without a healthy scoped read", () => {
    const control = readFileSync(
      resolve(process.cwd(), "src/components/admin/JuryVotingWindowControl.tsx"),
      "utf8",
    );
    expect(control).toContain("resolveJuryWindowReadState({");
    expect(control).toContain("hasError: isError || isRefetchError");
    expect(control).toContain("!windowReady");
    expect(control).toContain("open={Boolean(currentPendingChange)}");
    expect(control).toContain("isJuryWindowReviewScopeCurrent(pending.preview");
    expect(control).toContain("Retry status check");
    expect(control).toContain("selectJuryWindowShow(orderedShows, requestedShowId)");
    expect(control).toContain("No voting-window operation is available for this link.");
  });
});
