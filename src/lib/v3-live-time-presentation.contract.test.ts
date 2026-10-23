import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  resolve(process.cwd(), "src/components/v3/V3LiveScreen.tsx"),
  "utf8",
);

describe("V3 Public Live canonical time presentation", () => {
  it("uses fixed canonical Solaris formatting instead of browser-default locale formatting", () => {
    expect(screen).toContain('import { formatEventDateTime } from "@/lib/public-time";');
    expect(screen).toContain('formatEventDateTime(iso, { locale: "en-GB" })');
    expect(screen).toContain("<time");
    expect(screen).toContain("{canonicalSnapshotLabel(row.value)}");
    expect(screen).not.toContain("EventTime");
    expect(screen).not.toContain(".toLocaleTimeString(");
    expect(screen).not.toContain(".toLocaleString(");
  });

  it("requires strict UTC ISO instants and calendar-valid values", () => {
    expect(screen).toContain("ISO_INSTANT_PATTERN");
    expect(screen).toContain("ISO_INSTANT_PATTERN.exec(value)");
    expect(screen).toContain("parsed.getUTCFullYear() === year");
    expect(screen).toContain("parsed.getUTCMonth() === month - 1");
    expect(screen).toContain("parsed.getUTCDate() === day");
    expect(screen).toContain("parsed.getUTCHours() === hour");
    expect(screen).toContain("parsed.getUTCMinutes() === minute");
    expect(screen).toContain("parsed.getUTCSeconds() === second");
    expect(screen).toContain("parsed.getUTCMilliseconds() === millisecond");
    expect(screen).toContain("validSnapshotMoment(row.value)");
    expect(screen).not.toContain("Number.isFinite(Date.parse(value))");
  });

  it("keeps timestamps presentation-only rather than using them to advance live workflow state", () => {
    expect(screen).toContain("They do not independently advance show, voting or result state");
    expect(screen).not.toContain("Date.now()");
    expect(screen).not.toContain("setTimeout(");
    expect(screen).not.toContain("setInterval(");
  });
});
