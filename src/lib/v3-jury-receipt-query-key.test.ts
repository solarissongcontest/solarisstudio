import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { juryReceiptQueryKey, type JuryReceiptScope } from "./v3-jury-receipt-query-key";

const original: JuryReceiptScope = {
  actorId: "actor-a",
  countryId: "country-a",
  editionId: "edition-a",
  showId: "show-a",
};

describe("official Jury receipt account isolation", () => {
  it("produces a stable cache key for the same fully scoped receipt", () => {
    expect(juryReceiptQueryKey(original)).toEqual([
      "v3-jury-receipt",
      "actor-a",
      "country-a",
      "edition-a",
      "show-a",
    ]);
    expect(juryReceiptQueryKey(original)).toEqual(juryReceiptQueryKey({ ...original }));
  });

  it.each(["actorId", "countryId", "editionId", "showId"] as const)(
    "does not reuse a private receipt after %s changes",
    (field) => {
      expect(juryReceiptQueryKey({ ...original, [field]: "different" })).not.toEqual(
        juryReceiptQueryKey(original),
      );
    },
  );

  it("rejects anonymous or incomplete receipt scope", () => {
    expect(() => juryReceiptQueryKey({ ...original, actorId: "anonymous" })).toThrow();
    expect(() => juryReceiptQueryKey({ ...original, countryId: " " })).toThrow();
    expect(() => juryReceiptQueryKey({ ...original, editionId: "" })).toThrow();
    expect(() => juryReceiptQueryKey({ ...original, showId: "" })).toThrow();
  });

  it("binds the protected view to verified account and edition scope", () => {
    const page = readFileSync("src/routes/jury-voting.tsx", "utf8");
    expect(page).toContain('name: "robots", content: "noindex, nofollow"');
    expect(page).toContain('userId !== "anonymous"');
    expect(page).toContain("actorId={userId}");
    expect(page).toContain("countryId={context.country.id}");
    expect(page).toContain(
      "queryKey: juryReceiptQueryKey({ actorId, countryId, editionId: round.edition_id, showId: round.show_id })",
    );
    expect(page).toContain("gcTime: 0");
    expect(page).not.toContain('queryKey: ["v3-jury-receipt", round.show_id]');
    // Server receipt lookup remains authoritative; never restore browser-only evidence.
    expect(page).toContain("lookupReceipt({ data: { showId: round.show_id } })");
  });
});
