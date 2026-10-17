import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const anniversary = readFileSync("src/routes/_authenticated/admin/anniversary.tsx", "utf8");

describe("V3 Organizer Anniversary ownership", () => {
  it("keeps Storytelling as the canonical editorial parent", () => {
    expect(anniversary).toContain('eyebrow="Storytelling · Anniversary"');
    expect(anniversary).toContain('to="/admin/storytelling"');
    expect(anniversary).toContain("Storytelling is the canonical editorial parent");
    expect(anniversary).toContain("Open Storytelling → Anniversary");
  });

  it("keeps historical date maintenance discoverable without making it the editor", () => {
    expect(anniversary).toContain('to="/admin/anniversary-dates"');
    expect(anniversary).toContain("Historical edition dates");
    expect(anniversary).toContain("Maintain historical dates");
  });

  it("keeps the compatibility preview read-only until governed milestone authority exists", () => {
    expect(anniversary).toContain("They do not publish or alter anniversary data");
    expect(anniversary).toContain("governed Anniversary authority");
    expect(anniversary).not.toContain("supabase");
    expect(anniversary).not.toContain(".insert(");
    expect(anniversary).not.toContain(".update(");
    expect(anniversary).not.toContain(".delete(");
  });
});
