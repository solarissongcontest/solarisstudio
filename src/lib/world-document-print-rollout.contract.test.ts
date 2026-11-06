import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** The print/PDF entrypoint must not escape the World publication gate. */
describe("TG4 public print rollout contract", () => {
  it("mounts the authorized public print reader only after World rollout", () => {
    const route = readFileSync(resolve(
      process.cwd(),
      "src/routes/world/documents/$organization/$document/print.tsx",
    ), "utf8");
    expect(route).toContain('import { WorldPublicGate } from "@/components/world/WorldPublic"');
    expect(route).toMatch(/<WorldPublicGate>\s*<WorldDocumentPrintPage/);
    expect(route).toContain("</WorldPublicGate>");
  });
});
