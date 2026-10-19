import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/hod-history.tsx"),
  "utf8",
);

describe("V3 Organizer HOD tenure review", () => {
  it("reviews the exact historical slots before tenure apply", () => {
    expect(route).toContain("data-v3-organizer-hod-tenure-review");
    expect(route).toContain("Review tenure");
    expect(route).toContain("Save reviewed tenure");
    expect(route).toContain("Current: {slot.personName ?? \"No HOD assignment\"}");
    expect(route).toContain("After: <strong className=\"text-foreground\">{pendingTenureReview.personName}</strong>");
    expect(route).toContain("confirmationText={pendingTenureReview?.countryCode}");
  });

  it("captures immutable person, country, edition, channel and note values", () => {
    expect(route).toContain("type PendingTenureReview = {");
    expect(route).toContain("personId: person.id");
    expect(route).toContain("countryId: country.id");
    expect(route).toContain("editionIds,");
    expect(route).toContain("channel,");
    expect(route).toContain("notes: notes.trim() || null");
    expect(route).toContain("personId: review.personId");
    expect(route).toContain("countryId: review.countryId");
    expect(route).toContain("editionIds: review.editionIds");
    expect(route).toContain("channel: review.channel");
    expect(route).toContain("notes: review.notes");
  });

  it("reloads exact assignment slots and fails closed when the reviewed baseline changed", () => {
    expect(route).toContain("const live = await getHistory()");
    expect(route).toContain("snapshotTenureSlots(");
    expect(route).toContain("tenureSlotFingerprint(liveSlots) !== review.baselineFingerprint");
    expect(route).toContain("HOD tenure history changed while this review was open. Nothing was saved.");
    expect(route).toContain("assignmentId: current?.id ?? null");
    expect(route).toContain("source: current?.source ?? null");
    expect(route).toContain("confidence: current?.confidence ?? null");
    expect(route).toContain("notes: current?.notes ?? null");
  });

  it("keeps the compatibility writer as the sole authority and states the remaining System boundary", () => {
    expect(route.match(/saveAssignmentsFn\(/g)?.length).toBe(1);
    expect(route).toContain("System #1071");
    expect(route).toContain("not an atomic CAS/idempotent V3 operation");
    expect(route).toContain("canonical authority and receipt contract");
  });

  it("marks replacement of a different controller as dangerous", () => {
    expect(route).toContain("slot.personId && slot.personId !== pendingTenureReview.personId");
  });
});
