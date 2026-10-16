import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmationReviewStatus } from "@/components/ConfirmationReviewStatus";
import { assertDisplayedEntryVersion } from "./v3-entry-review-preview";

describe("canonical Entry review version evidence", () => {
  it("rejects review of content changed since the displayed entry was loaded", () => {
    expect(() => assertDisplayedEntryVersion("displayed", "new-version")).toThrow("Refresh");
    expect(() => assertDisplayedEntryVersion(undefined, "new-version")).toThrow("Refresh");
    expect(() => assertDisplayedEntryVersion("displayed", undefined)).toThrow("Refresh");
    expect(() => assertDisplayedEntryVersion("displayed", "displayed")).not.toThrow();
    expect(() => assertDisplayedEntryVersion(undefined, undefined)).not.toThrow();
  });
  it("distinguishes accepted legacy observations from exact current review", () => {
    const entry = {
      artist: "Artist",
      song_title: "Song",
      review_status: "accepted",
      current_version_id: "v1",
      content_revision: 1,
    };
    const legacy = renderToStaticMarkup(
      <ConfirmationReviewStatus selectionMethod="internal" internalEntry={entry} />,
    );
    expect(legacy).toContain("Earlier review has no version binding");
    expect(legacy).not.toContain("Review applies to this version");
    const bound = renderToStaticMarkup(
      <ConfirmationReviewStatus
        selectionMethod="internal"
        internalEntry={{ ...entry, reviewed_version_id: "v1" }}
      />,
    );
    expect(bound).toContain("Review applies to this version");
    const pending = renderToStaticMarkup(
      <ConfirmationReviewStatus
        selectionMethod="internal"
        internalEntry={{
          ...entry,
          review_status: "pending",
          content_revision: 2,
          current_version_id: "v2",
        }}
      />,
    );
    expect(pending).toContain("Awaiting review of this version");
    expect(pending).not.toContain("Your entry was accepted");
  });
  it("shows stale-version evidence for National Final candidates without presenting the current song as accepted", () => {
    const html = renderToStaticMarkup(
      <ConfirmationReviewStatus
        selectionMethod="national_final"
        nationalFinal={{
          entries: [
            {
              id: "entry",
              review_status: "accepted",
              current_version_id: "v2",
              reviewed_version_id: "v1",
              content_revision: 2,
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Entry changed after review");
    expect(html).toContain("Review applies to an earlier version");
    expect(html).toContain("waiting for review");
    expect(html).not.toContain("All 1 song is accepted");
  });
});

it("the real Organizer review handler rejects an unseen preview before mutation", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const { default: ts } = await import("typescript");
  const source = ts.createSourceFile(
    "response.tsx",
    readFileSync("src/routes/confirmations/admin/responses/$id.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let handler: import("typescript").FunctionDeclaration | undefined;
  function visit(node: import("typescript").Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "review") handler = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!handler) throw new Error("Production review handler missing");
  const code = ts.transpileModule(handler.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const previewVersion of ["displayed", "unseen"]) {
    const writes: string[] = [];
    const errors: unknown[] = [];
    let changed = false;
    await runInNewContext(code + '\nreview("accepted");', {
      entry: { id: "entry", current_version_id: "displayed" },
      targetType: "internal",
      editionId: "edition",
      submissionId: "submission",
      reason: "",
      assertDisplayedEntryVersion,
      setBusy: () => {},
      setError: (error: unknown) => {
        if (error) errors.push(error);
      },
      setOpen: () => {},
      confirmationsSupabase: {
        rpc: async (name: string) => {
          if (name.endsWith("preview"))
            return { data: { expectedVersion: 3, currentVersionId: previewVersion }, error: null };
          writes.push(name);
          return { data: { status: "succeeded" }, error: null };
        },
      },
      createOrganisationCommand: () => ({
        operationId: "operation",
        idempotencyKey: "key",
        correlationId: "correlation",
      }),
      normalizeSystemReceipt: () => ({ status: "succeeded" }),
      toSystemError: (error: unknown) => ({
        message: error instanceof Error ? error.message : "Review action failed.",
      }),
      setReceipt: () => {},
      toast: { success: () => {} },
      onChanged: async () => {
        changed = true;
      },
    });
    expect(writes).toEqual(
      previewVersion === "displayed" ? ["studio2_apply_confirmation_entry_review"] : [],
    );
    expect(errors.length).toBe(previewVersion === "displayed" ? 0 : 1);
    expect(changed).toBe(previewVersion === "displayed");
  }
});