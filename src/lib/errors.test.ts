import { describe, expect, it } from "vitest";
import { describeSupabaseError } from "./errors";

describe("describeSupabaseError", () => {
  it("never leaks the raw constraint name to the organizer", () => {
    const msg = describeSupabaseError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "editions_slug_key"',
    });
    expect(msg).not.toMatch(/constraint|editions_slug_key|duplicate key/i);
    expect(msg).toMatch(/URL name already exists/);
  });

  it("explains a repeated point value inside one ballot", () => {
    expect(
      describeSupabaseError({ message: "jury_votes_show_voter_points_key", code: "23505" }),
    ).toMatch(/already awarded that point value/);
  });

  it("explains a repeated recipient inside one ballot", () => {
    expect(
      describeSupabaseError({ message: "jury_votes_show_voter_recipient_key", code: "23505" }),
    ).toMatch(/already scored that country/);
  });

  it("explains a ballot saved without a jury", () => {
    expect(describeSupabaseError({ message: "jury_votes_voter_identity_check" })).toMatch(
      /no jury attached/,
    );
  });

  it("falls back to the generic message for each Postgres class", () => {
    expect(describeSupabaseError({ code: "23503", message: "x" })).toMatch(/still referenced/);
    expect(describeSupabaseError({ code: "42501", message: "x" })).toMatch(/permission/);
    expect(describeSupabaseError({ code: "P0002", message: "x" })).toMatch(/no longer exists/);
  });

  it("reassures the organizer that entries survive a network failure", () => {
    expect(describeSupabaseError({ message: "Failed to fetch" })).toMatch(/still here/);
  });

  it("reassures the organizer that entries survive an expired session", () => {
    expect(describeSupabaseError({ message: "JWT expired" })).toMatch(/session expired/i);
  });

  it("uses the caller's fallback for unknown failures", () => {
    expect(describeSupabaseError({ message: "boom" }, "Could not save the show.")).toBe(
      "Could not save the show.",
    );
    expect(describeSupabaseError(null, "Could not save the show.")).toBe("Could not save the show.");
  });
});
