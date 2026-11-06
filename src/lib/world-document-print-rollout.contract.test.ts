import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** The print/PDF entrypoint must not escape the World publication gate. */
describe("TG4 public print rollout contract", () => {
  it("mounts the authorized public print reader only after World rollout", () => {
    const route = readFileSync(resolve(
      process.cwd(),
      "src/routes/world/documents/$organization/$document_/print.tsx",
    ), "utf8");
    expect(route).toContain('import { WorldPublicGate } from "@/components/world/WorldPublic"');
    expect(route).toMatch(/<WorldPublicGate verifyOnMount>\s*<WorldDocumentPrintPage/);
    expect(route).toContain("</WorldPublicGate>");
    expect(route).toContain('createFileRoute("/world/documents/$organization/$document_/print")');
    expect(route).toContain("parseWorldDocumentVersionQuery(search.version)");

    const page = readFileSync(resolve(
      process.cwd(), "src/components/world/WorldDocumentPrintPage.tsx",
    ), "utf8");
    expect(page).toContain('refetchOnMount: "always"');
    expect(page).toContain("query.isFetchedAfterMount && !query.isFetching");
    expect(page).toContain("getWorldDocumentDetail({ organization, document, version: version ?? undefined }, signal)");
    // The version's complete legal wording may contain binding preamble text
    // outside the structured provisions; printing must not silently omit it.
    expect(page).toContain('model.articles.length > 0 && model.plainText');
    expect(page).toContain('Complete published text');
    expect(page).toContain('{model.plainText}');
    expect(page).toContain('Repealed provision');
    expect(page).toContain('Omitted provision');
  });
});
