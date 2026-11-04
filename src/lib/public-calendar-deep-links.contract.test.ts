import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/calendar/index.tsx", "utf8");
const screen = readFileSync("src/components/v3/V3PublicShowCalendarScreen.tsx", "utf8");

describe("public show calendar shareable edition selection", () => {
  it("validates the edition query before it reaches a server read", () => {
    expect(route).toContain("validateSearch:");
    expect(route).toContain("isCalendarSlug(search.edition)");
  });

  it("uses the router query as the sole edition source, including history navigation", () => {
    expect(screen).toContain("useSearch({ from: '/calendar/' })");
    expect(screen).toContain("const selection = searchEdition ?? null");
    expect(screen).not.toContain("setSelection");
    expect(screen).toContain("queryKey: ['public-published-show-calendar', selection]");
    expect(screen).toContain("getPublicShowCalendar({ data: { editionSlug: selection } })");
  });

  it("changes the shareable URL when the visitor selects a different published edition", () => {
    expect(screen).toContain("useNavigate({ from: '/calendar/' })");
    expect(screen).toContain("navigate({ search: { edition }, replace: true })");
  });

  it("refreshes the upcoming filter while the visitor keeps the calendar open", () => {
    expect(screen).toContain("upcomingPublicCalendarEvents(allEvents, currentTimeMs)");
    expect(screen).toContain("window.setInterval(refresh, 60_000)");
    expect(screen).toContain("window.clearInterval(interval)");
    expect(screen).toContain("if (filter !== 'upcoming') return");
  });
});
