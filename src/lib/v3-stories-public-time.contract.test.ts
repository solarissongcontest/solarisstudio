import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const indexScreen = read("src/components/v3/V3StoriesIndexScreen.tsx");
const detailScreen = read("src/components/v3/V3StoryDetailScreen.tsx");

describe("Public V3 Stories chronology presentation", () => {
  it("surfaces the canonical Story publication timestamp through the shared public time primitive", () => {
    expect(indexScreen).toContain('import { EventTime } from "@/components/public/EventTime"');
    expect(detailScreen).toContain('import { EventTime } from "@/components/public/EventTime"');

    expect(indexScreen).toContain('data-v3-story-published-at=""');
    expect(indexScreen).toContain("value={story.publishedAt}");
    expect(indexScreen).toContain('label="Published"');

    expect(detailScreen).toContain('data-v3-story-published-at=""');
    expect(detailScreen).toContain("value={story.publishedAt}");
    expect(detailScreen).toContain('label="Published"');
  });

  it("renders timeline chronology from the projected occurredAt timestamp without browser-locale date authority", () => {
    expect(detailScreen).toContain("value={item.occurredAt}");
    expect(detailScreen).toContain('label="Occurred"');
    expect(detailScreen).toContain("showLocalTime={false}");

    expect(detailScreen).not.toContain("toLocaleDateString");
    expect(detailScreen).not.toContain("toLocaleString");
    expect(detailScreen).not.toContain("new Date(");
    expect(detailScreen).not.toContain("Intl.DateTimeFormat");
    expect(detailScreen).not.toContain("function formatDate");
  });

  it("keeps chronology as presentation over the existing Story projection", () => {
    const combined = `${indexScreen}\n${detailScreen}`;

    expect(combined).not.toContain(".from(");
    expect(combined).not.toContain(".rpc(");
    expect(combined).not.toContain("createClient(");
    expect(combined).not.toContain("useQuery(");
    expect(combined).not.toContain("useMutation(");
  });

  it("leaves spoiler-protected branches in front of Story content", () => {
    expect(indexScreen).toContain("protectedView ? (");
    expect(indexScreen).toContain('data-v3-stories-spoiler-protected=""');
    expect(detailScreen).toContain("if (hideSpoilers && !revealed)");
    expect(detailScreen).toContain('data-v3-story-spoiler-protected=""');
  });
});
