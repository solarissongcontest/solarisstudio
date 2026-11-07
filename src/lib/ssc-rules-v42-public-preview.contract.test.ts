import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SSC_RULEBOOK, SSC_RULE_CHAPTERS } from "@/lib/ssc-rules/current";
import { withPlainLanguage } from "@/lib/ssc-rules/plain-language-v42";

const previewRoute = readFileSync(
  new URL("../routes/rules/v4-2-preview.tsx", import.meta.url),
  "utf8",
);
const rulesHome = readFileSync(
  new URL("../components/rules/RulesHomeV5.tsx", import.meta.url),
  "utf8",
);

describe("Public v4.2 reference independent of official publication", () => {
  it("offers the full 113 reference rule texts in all 22 chapters", () => {
    const chapters = SSC_RULE_CHAPTERS.map((chapter) => ({
      ...chapter,
      rules: chapter.rules.map(withPlainLanguage),
    }));
    const all = chapters.flatMap((chapter) => chapter.rules);
    expect(chapters).toHaveLength(22);
    expect(all).toHaveLength(113);
    expect(new Set(all.map((rule) => rule.id)).size).toBe(113);
    expect(all.every((rule) => rule.body.length > 0)).toBe(true);
  });

  it("keeps v4.1 as bundled fallback while governed published Current is authoritative", () => {
    expect(SSC_RULEBOOK.version).toBe("4.1");
    expect(previewRoute).toContain('createFileRoute("/rules/v4-2-preview")');
    expect(previewRoute).toContain("SSC General Regulations v4.2");
    expect(previewRoute).toContain("REFERENCE COPY · NOT AUTHORITATIVE.");
    expect(previewRoute).not.toContain("have not been ratified");
    expect(previewRoute).toContain('to="/rules"');
    expect(previewRoute).not.toContain("admin_publish_rulebook_release");
    expect(previewRoute).not.toContain("applyPublishedRulebookRelease");
    expect(rulesHome).toContain('to="/rules/v4-2-preview"');
    expect(rulesHome).toContain('compareRulebookVersions(version, "4.2") < 0');
  });
});
