import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  effectiveOrganizerEntryReviewStatus,
  inspectOrganizerEntrySource,
  safeOrganizerEntrySourceUrl,
} from "./v3-organizer-entry-source-inspection";

const valid = {
  artist: "  Artist  ",
  song_title: "Song",
  song_url: "https://media.example.test/song.mp3?token=opaque",
  current_version_id: "version-2",
  reviewed_version_id: "version-2",
  review_status: "accepted",
};

describe("Organizer Entry source inspection", () => {
  it("preserves ordinary and signed HTTP(S) source URLs without fetching", () => {
    expect(safeOrganizerEntrySourceUrl(valid.song_url)).toBe(valid.song_url);
    expect(safeOrganizerEntrySourceUrl("http://media.example.test/source")).toBe(
      "http://media.example.test/source",
    );
  });

  it("rejects javascript, data, blob, file, malformed, relative, and credentialed URLs", () => {
    for (const value of [
      "javascript:alert(1)", "data:text/html,hello", "blob:https://example.test/a",
      "file:///etc/passwd", "not a link", "/uploads/song.mp3", "//example.test/a",
      "https://name:secret@example.test/song.mp3", "https://media.example.test/\n@attacker.test/a",
    ]) {
      expect(safeOrganizerEntrySourceUrl(value)).toBeNull();
    }
  });

  it("rejects leading and trailing URL controls before trimming", () => {
    expect(safeOrganizerEntrySourceUrl("\nhttps://media.example.test/a.mp3")).toBeNull();
    expect(safeOrganizerEntrySourceUrl("https://media.example.test/a.mp3\r")).toBeNull();
  });

  it("reports submitted artist, title, and source as present without claiming media eligibility", () => {
    const inspection = inspectOrganizerEntrySource(valid);
    expect(inspection.songUrl).toBe(valid.song_url);
    expect(inspection.checks.map((check) => check.status)).toEqual([
      "present", "present", "present", "present",
    ]);
    expect(inspection.checks.find((check) => check.id === "song-link")?.detail).toContain(
      "contents still require review",
    );
  });

  it("flags missing metadata and treats absent media links as manual rather than invalid", () => {
    const checks = inspectOrganizerEntrySource({
      artist: " ", song_title: null, song_url: null,
    }).checks;
    expect(checks.map((check) => check.status)).toEqual([
      "attention", "attention", "manual",
    ]);
  });

  it("flags malformed media links while never exposing them as safe URLs", () => {
    const inspection = inspectOrganizerEntrySource({
      artist: "Artist", song_title: "Song", song_url: "javascript:alert(1)",
    });
    expect(inspection.songUrl).toBeNull();
    expect(inspection.checks.find((check) => check.id === "song-link")?.status).toBe("attention");
  });

  it("checks only explicitly required replacement video and distinguishes bad/missing links", () => {
    expect(inspectOrganizerEntrySource(valid).checks.some((check) =>
      check.id === "replacement-video")).toBe(false);
    const missing = inspectOrganizerEntrySource({
      ...valid, replacement_video_required: true, replacement_video_url: null,
    });
    expect(missing.checks.find((check) => check.id === "replacement-video")?.status).toBe("attention");
    const broken = inspectOrganizerEntrySource({
      ...valid, replacement_video_required: true, replacement_video_url: "data:video/mp4;base64,AA",
    });
    expect(broken.replacementVideoUrl).toBeNull();
    expect(broken.checks.find((check) => check.id === "replacement-video")?.detail).toContain("cannot be safely opened");
    const present = inspectOrganizerEntrySource({
      ...valid, replacement_video_required: true, replacement_video_url: "https://example.test/video.mp4",
    });
    expect(present.checks.find((check) => check.id === "replacement-video")?.status).toBe("present");
  });

  it("warns when accepted or declined review evidence belongs to an older version", () => {
    for (const status of ["accepted", "declined"]) {
      const inspection = inspectOrganizerEntrySource({
        ...valid, review_status: status, reviewed_version_id: "version-1",
      });
      expect(inspection.checks.find((check) => check.id === "review-version")?.status).toBe("attention");
      const legacy = inspectOrganizerEntrySource({
        ...valid, review_status: status, reviewed_version_id: null,
      });
      expect(legacy.checks.find((check) => check.id === "review-version")?.status).toBe("attention");
    }
    expect(inspectOrganizerEntrySource({
      ...valid, review_status: "pending",
    }).checks.some((check) => check.id === "review-version")).toBe(false);
  });

  it("uses source checks as display guidance without creating a competing approval gate", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("EntrySourceInspection");
    expect(route).toContain("inspectOrganizerEntrySource(entry)");
    expect(route).toContain("safeOrganizerEntrySourceUrl(entry.replacement_video_url)");
    expect(route).toContain("rel=\"noopener noreferrer\"");
    expect(route).toContain("This checklist is not the authoritative validation");
    expect(route).toContain("studio2_apply_confirmation_entry_review");
    expect(route).not.toContain("href={entry.song_url}");
    expect(route).not.toContain("href={entry.replacement_video_url}");
  });

  it("keeps accepted and declined decisions current only for exactly reviewed immutable versions", () => {
    expect(effectiveOrganizerEntryReviewStatus(valid)).toBe("accepted");
    expect(effectiveOrganizerEntryReviewStatus({ ...valid, review_status: "declined" })).toBe("declined");
    expect(effectiveOrganizerEntryReviewStatus({ ...valid, reviewed_version_id: "version-1" })).toBe("pending");
    expect(effectiveOrganizerEntryReviewStatus({ ...valid, reviewed_version_id: null })).toBe("pending");
    expect(effectiveOrganizerEntryReviewStatus({ ...valid, current_version_id: null })).toBe("pending");
    expect(effectiveOrganizerEntryReviewStatus({ ...valid, review_status: "removed" })).toBe("removed");
    expect(effectiveOrganizerEntryReviewStatus({ ...valid, removed: true })).toBe("removed");
    expect(effectiveOrganizerEntryReviewStatus({ ...valid, review_status: "unknown" })).toBe("pending");
  });

  it("requires the detail card and summary to use a single fail-closed effective status", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("return effectiveOrganizerEntryReviewStatus(entry);");
    expect(route).toContain("const reviewStates = entries.map(reviewLabel)");
    expect(route).toContain("reviewStates.some((status) => status !== \"accepted\")");
    expect(route).not.toContain('entry.review_status === "declined")) return "issue"');
    expect(route).not.toContain('entry.review_status === "pending"))');
  });

});
