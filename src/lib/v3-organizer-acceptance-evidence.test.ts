import { describe, expect, it } from "vitest";

import {
  isOrganizerAcceptanceSubmissionId,
  organizerAcceptanceEvidenceMatches,
  organizerAcceptanceEvidenceMatchesEdition,
  type OrganizerAcceptanceEvidencePayload,
} from "./v3-organizer-acceptance-evidence";

const payload: OrganizerAcceptanceEvidencePayload = {
  id: "11111111-1111-4111-8111-111111111111",
  tester_name: "Arthur",
  device: "Laptop",
  browser: "Safari",
  familiarity: "Daily",
  answers: {
    organizerEditionId: "edition-22",
    nested: { z: 2, a: 1 },
  },
  bug_reports: [{ id: "bug-1", page: "Control" }],
  screenshot_paths: ["admin/111/bug-1.png"],
  form_version: 7,
};

describe("Organizer acceptance evidence replay model", () => {
  it("recognizes only UUID-shaped stable submission identities", () => {
    expect(isOrganizerAcceptanceSubmissionId(payload.id)).toBe(true);
    expect(isOrganizerAcceptanceSubmissionId("true")).toBe(false);
    expect(isOrganizerAcceptanceSubmissionId("edition-22")).toBe(false);
    expect(isOrganizerAcceptanceSubmissionId(null)).toBe(false);
  });

  it("accepts the same semantic evidence regardless of JSON object key order", () => {
    expect(
      organizerAcceptanceEvidenceMatches(
        {
          ...payload,
          answers: {
            nested: { a: 1, z: 2 },
            organizerEditionId: "edition-22",
          },
        },
        payload,
      ),
    ).toBe(true);
  });

  it("rejects an existing row if reviewed evidence changed under the same id", () => {
    expect(
      organizerAcceptanceEvidenceMatches(
        { ...payload, tester_name: "Someone else" },
        payload,
      ),
    ).toBe(false);

    const answers = payload.answers as Record<string, unknown>;
    expect(
      organizerAcceptanceEvidenceMatches(
        { ...payload, answers: { ...answers, overallNow: 4 } },
        payload,
      ),
    ).toBe(false);
    expect(
      organizerAcceptanceEvidenceMatches(
        { ...payload, screenshot_paths: [] },
        payload,
      ),
    ).toBe(false);
  });

  it("verifies a local submitted marker against exact server edition evidence", () => {
    expect(
      organizerAcceptanceEvidenceMatchesEdition(
        { id: payload.id, answers: payload.answers },
        { submissionId: payload.id, editionId: "edition-22" },
      ),
    ).toBe(true);
    expect(
      organizerAcceptanceEvidenceMatchesEdition(
        { id: payload.id, answers: payload.answers },
        { submissionId: payload.id, editionId: "edition-23" },
      ),
    ).toBe(false);
  });
});
