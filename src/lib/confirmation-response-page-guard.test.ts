import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isCurrentConfirmationResponsePage } from "./confirmation-response-page-guard";

describe("Organizer Confirmation response pagination epoch", () => {
  it("accepts a page only for the exact live edition and generation", () => {
    expect(isCurrentConfirmationResponsePage(
      { editionId: "edition-a", generation: 3 },
      { editionId: "edition-a", generation: 3 },
    )).toBe(true);
    expect(isCurrentConfirmationResponsePage(
      { editionId: "edition-a", generation: 3 },
      { editionId: "edition-b", generation: 4 },
    )).toBe(false);
  });

  it("rejects stale A → B → A completion, even with the original edition id", () => {
    const pendingPage = { editionId: "edition-a", generation: 8 };
    const returnedToEditionA = { editionId: "edition-a", generation: 10 };
    expect(isCurrentConfirmationResponsePage(pendingPage, returnedToEditionA)).toBe(false);
    expect(isCurrentConfirmationResponsePage(
      { editionId: "edition-a", generation: 10 }, returnedToEditionA,
    )).toBe(true);
  });

  it("fails closed on unscoped or invalid request identities", () => {
    expect(isCurrentConfirmationResponsePage(
      { editionId: "", generation: 1 }, { editionId: "", generation: 1 },
    )).toBe(false);
    expect(isCurrentConfirmationResponsePage(
      { editionId: "edition-a", generation: -1 }, { editionId: "edition-a", generation: -1 },
    )).toBe(false);
  });

  it("resets the old edition's in-flight lock and hides its private responses", () => {
    const source = readFileSync(
      "src/routes/confirmations/admin/responses.tsx", "utf8",
    );
    expect(source).toContain("responseGenerationRef.current += 1;");
    expect(source).toContain("loadingMoreRef.current = false;");
    expect(source).toContain("setLoadingMoreResponses(false);");
    expect(source).toContain("if (!isCurrent()) return;");
    expect(source).toContain("if (!editionId || editionId !== organizerEditionId) return [];");
    expect(source).toContain("loadingMoreRef.current || editionId !== organizerEditionId");
  });

  it("restarts exact-edition pagination after an invalidated snapshot without accepting old pages", () => {
    const route = readFileSync("src/routes/confirmations/admin/responses.tsx", "utf8");
    expect(route).toContain("const [responseReloadNonce, setResponseReloadNonce] = useState(0)");
    expect(route).toContain("}, [editionId, responseReloadNonce]);");
    expect(route).toContain("setResponseReloadNonce((nonce) => nonce + 1)");
    expect(route).toContain("Reload current edition");
    expect(route).toContain("responseGenerationRef.current += 1;");
  });

  it("provides a real retry if Organizer edition metadata fails to load", () => {
    const route = readFileSync("src/routes/confirmations/admin/responses.tsx", "utf8");
    expect(route).toContain("const [editionLoadError, setEditionLoadError] = useState<string | null>(null);");
    expect(route).toContain("const [editionLoadNonce, setEditionLoadNonce] = useState(0);");
    expect(route).toContain("setLoadingEditions(true);");
    expect(route).toContain("setEditionLoadError(caught instanceof Error");
    expect(route).toContain("}, [editionLoadNonce]);");
    expect(route).toContain("Retry edition list");
    expect(route).toContain("setEditionLoadNonce((nonce) => nonce + 1)");
    expect(route).not.toContain("setEditionId(selected)");
  });

  it("reports Next in Line failures instead of an empty-state lie and checks returned editions", () => {
    const route = readFileSync("src/routes/confirmations/admin/responses.tsx", "utf8");
    expect(route).toContain("const [loadingNextLine, setLoadingNextLine] = useState(false);");
    expect(route).toContain("const [nextLineError, setNextLineError] = useState<string | null>(null);");
    expect(route).toContain('if (!Array.isArray(result.data)) {');
    expect(route).toContain("returned.some((row) => row.edition_id !== editionId)");
    expect(route).toContain("setNextLineError(caught instanceof Error");
    expect(route).toContain("}, [editionId, nextLineReloadNonce]);");
    expect(route).toContain("Retry Next in Line");
    expect(route).toContain("setNextLineReloadNonce((nonce) => nonce + 1)");
  });

  it("keeps the round selector based on canonical edition metadata, not the first response page", () => {
    const source = readFileSync(
      "src/routes/confirmations/admin/responses.tsx", "utf8",
    );
    expect(source).toContain("editions.find((item) => item.id === editionId)?.rounds");
    expect(source).not.toContain("rows.forEach((row) => {\n      const round = row.submission_rounds;");
  });
});
