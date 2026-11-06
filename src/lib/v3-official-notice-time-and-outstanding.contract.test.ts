import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Official Notice canonical time and outstanding acknowledgements", () => {
  it("formats notice and receipt timestamps in canonical Solaris time", () => {
    const screen = source("src/components/v3/V3OfficialNoticesScreen.tsx");
    expect(screen).toContain('import { formatEventWallTime } from "@/lib/public-time"');
    expect(screen).toContain('formatEventWallTime(date, { locale: "en-GB" })');
    expect(screen).not.toContain("new Intl.DateTimeFormat(undefined");
  });

  it("counts archived-but-unacknowledged required notices without manufacturing unread state", () => {
    const screen = source("src/components/v3/V3OfficialNoticesScreen.tsx");
    const model = source("src/lib/v3-official-notices.ts");
    expect(screen).toContain(
      "v3OfficialNoticeOutstandingAcknowledgement(item.notice, item.inboxState, item.receipt)",
    );
    expect(screen).toContain('item.inboxState === "archived"');
    expect(screen).toContain("Archiving does not complete a required acknowledgement.");
    expect(screen).toContain("Choose the Archived filter and restore each notice");
    expect(model).toContain('state === "archived-unacknowledged"');
    expect(model).toContain('if (receipt?.acknowledgedAt) return "recorded"');
  });
});
