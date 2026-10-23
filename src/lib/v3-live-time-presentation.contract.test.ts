import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  resolve(process.cwd(), "src/components/v3/V3LiveScreen.tsx"),
  "utf8",
);

describe("V3 Public Live canonical time presentation", () => {
  it("uses the shared Solaris time primitives instead of browser-default locale formatting", () => {
    expect(screen).toContain('import { EventTime } from "@/components/public/EventTime";');
    expect(screen).toContain('import { formatEventDateTime } from "@/lib/public-time";');
    expect(screen).toContain('formatEventDateTime(iso, { locale: "en-GB" })');
    expect(screen).toContain('<EventTime value={row.value} className="text-right" />');
    expect(screen).not.toContain(".toLocaleTimeString(");
    expect(screen).not.toContain(".toLocaleString(");
  });

  it("drops malformed timing values rather than rendering them as authoritative moments", () => {
    expect(screen).toContain('typeof value === "string" && Number.isFinite(Date.parse(value))');
    expect(screen).toContain("validSnapshotMoment(row.value)");
  });

  it("keeps timestamps presentation-only rather than using them to advance live workflow state", () => {
    expect(screen).toContain("They do not independently advance show, voting or result state");
    expect(screen).not.toContain("Date.now()");
    expect(screen).not.toContain("setTimeout(");
    expect(screen).not.toContain("setInterval(");
  });
});
