import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const anniversary = readFileSync("src/routes/_authenticated/admin/anniversary.tsx", "utf8");

describe("V3 Organizer Anniversary ownership", () => {
  it("keeps Storytelling as the canonical editorial parent", () => {
    expect(anniversary).toContain('eyebrow="Storytelling · Anniversary"');
    expect(anniversary).toContain('to="/admin/storytelling"');
    expect(anniversary).toContain("canonical Storytelling operation contract");
    expect(anniversary).toContain("Full Storytelling workspace");
    expect(anniversary).toContain("executeStudio2StoryOperation");
  });

  it("keeps historical date maintenance discoverable without making it the editor", () => {
    expect(anniversary).toContain('to="/admin/anniversary-dates"');
    expect(anniversary).toContain("Historical edition dates");
    expect(anniversary).toContain("Open historical date editor");
    expect(anniversary).toContain("System #633");
  });

  it("keeps presentation previews separate from governed milestone authority", () => {
    expect(anniversary).toContain("Preview URLs change only the current browser presentation");
    expect(anniversary).toContain("Official milestone/publication state comes from the canonical Storytelling snapshot");
    expect(anniversary).toContain("loadStudio2Storytelling");
    expect(anniversary).toContain("AdminConfirmSheet");
    expect(anniversary).not.toContain("supabase");
    expect(anniversary).not.toContain(".insert(");
    expect(anniversary).not.toContain(".update(");
    expect(anniversary).not.toContain(".delete(");
  });
});
