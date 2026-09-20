import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(resolve(process.cwd(), "src/routes/index.tsx"), "utf8");

describe("homepage field-performance layout contract", () => {
  it("keeps the stable contest hero before asynchronous optional home modules", () => {
    const hero = home.indexOf("<CurrentContestHero");
    const pulse = home.indexOf("<PulseStrip");
    const attention = home.indexOf("<HomePersonalAttention");

    expect(hero).toBeGreaterThan(-1);
    expect(pulse).toBeGreaterThan(hero);
    expect(attention).toBeGreaterThan(hero);
  });
});
