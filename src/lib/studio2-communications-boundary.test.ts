import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  validateStudio2NoticeResponse,
} from "./studio2-communications";
import type { OperationalNotice } from "./official-communications";

function notice(overrides: Partial<OperationalNotice> = {}): OperationalNotice {
  return {
    id: "notice-1",
    editionId: "edition-22",
    noticeType: "official_notice",
    title: "Voting reminder",
    body: "Please submit your ballot before the deadline.",
    severity: "action_required",
    audience: "all_delegations",
    audienceGroup: null,
    countryIds: [],
    acknowledgementRequired: true,
    displaySurfaces: ["delegation_inbox"],
    state: "published",
    scheduledAt: null,
    sentAt: "2026-10-16T18:00:00Z",
    cancelledAt: null,
    archivedAt: null,
    supersededById: null,
    revision: 2,
    ...overrides,
  };
}

describe("Official Communications transport boundary", () => {
  it("accepts a valid response for the requested notice and edition", () => {
    expect(validateStudio2NoticeResponse(notice(), {
      noticeId: "notice-1",
      editionId: "edition-22",
    })).toMatchObject({ id: "notice-1", editionId: "edition-22", revision: 2 });
  });

  it("rejects a lifecycle response for a different notice", () => {
    expect(() => validateStudio2NoticeResponse(notice({ id: "notice-2" }), {
      noticeId: "notice-1",
    })).toThrow("different notice than the requested operation");
  });

  it("rejects a create/update response outside the requested edition", () => {
    expect(() => validateStudio2NoticeResponse(notice({ editionId: "edition-21" }), {
      editionId: "edition-22",
    })).toThrow("outside the requested edition scope");
  });

  it("reuses the canonical notice validator for server responses", () => {
    expect(() => validateStudio2NoticeResponse(notice({ revision: 0 }))).toThrow(
      "Notice revision must be a positive integer",
    );
    expect(() => validateStudio2NoticeResponse(notice({ title: "   " }))).toThrow(
      "Official notice title is required",
    );
  });

  it("keeps list and receipt payloads fail-closed instead of translating malformed data to empty state", () => {
    const source = readFileSync("src/lib/studio2-communications.ts", "utf8");
    expect(source).toContain("if (!Array.isArray(value)) throw new Error");
    expect(source).toContain("Official Communications returned duplicate notice rows.");
    expect(source).toContain("Official Communications returned duplicate recipient receipts.");
    expect(source).not.toContain("return Array.isArray(value) ? (value as T[]) : []");
  });

  it("binds mutating command responses to the notice they were asked to change", () => {
    const source = readFileSync("src/lib/studio2-communications.ts", "utf8");
    for (const command of [
      "studio2_update_notice_draft_v2",
      "studio2_schedule_notice",
      "studio2_publish_notice",
      "studio2_cancel_notice",
      "studio2_archive_communication",
      "studio2_restore_communication",
    ]) {
      expect(source).toContain(command);
    }
    expect(source).toContain("validateStudio2NoticeResponse(notice, { noticeId, editionId })");
    expect(source.match(/validateStudio2NoticeResponse\(notice, \{ noticeId \}\)/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
