import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_JURY_SHARE_EDITION_COMPOSITION,
  loadJuryShareThemeSnapshot,
  saveJuryShareThemeDraft,
  setJuryShareThemeState,
  validateJuryShareEditionComposition,
  type JuryShareThemeRpcClient,
} from "./v3-jury-share-theme-client";

const EDITION_ID = "11111111-1111-4111-8111-111111111111";
const THEME_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";

function validValidation() {
  return { valid: true, errors: [], warnings: [] };
}

function themeRow() {
  return {
    id: THEME_ID,
    editionId: EDITION_ID,
    version: 2,
    state: "draft",
    composition: DEFAULT_JURY_SHARE_EDITION_COMPOSITION,
    validation: validValidation(),
    activatedAt: null,
    archivedAt: null,
    updatedAt: "2026-10-23T17:00:00.000Z",
  };
}

function operationReceipt(state: "draft" | "ready" | "archived" = "draft") {
  return {
    status: "succeeded",
    replayed: false,
    result: {
      ok: true,
      editionId: EDITION_ID,
      themeId: THEME_ID,
      version: 2,
      state,
      validation: validValidation(),
      operationId: OPERATION_ID,
    },
  };
}

describe("Organizer Jury Share Edition theme client", () => {
  it("accepts the bounded default composition and checks that all ten rows fit", () => {
    const result = validateJuryShareEditionComposition(
      DEFAULT_JURY_SHARE_EDITION_COMPOSITION,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "INHERITED_SCOREBOARD_PREVIEW",
    );
  });

  it("fails closed when Story geometry cannot fit ten score rows", () => {
    const composition = structuredClone(DEFAULT_JURY_SHARE_EDITION_COMPOSITION);
    composition.safeArea.top = 300;
    composition.safeArea.bottom = 300;
    composition.scoreboard.rowHeight = 128;

    const result = validateJuryShareEditionComposition(composition);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("TEN_ROWS_DO_NOT_FIT");
  });

  it("loads only the exact requested Edition snapshot", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        editionId: EDITION_ID,
        themes: [themeRow()],
        serverTime: "2026-10-23T17:00:01.000Z",
      },
      error: null,
    }));

    const snapshot = await loadJuryShareThemeSnapshot(EDITION_ID, { rpc });

    expect(snapshot.editionId).toBe(EDITION_ID);
    expect(snapshot.themes[0]?.version).toBe(2);
    expect(rpc).toHaveBeenCalledWith("studio2_jury_share_theme_snapshot", {
      p_edition_id: EDITION_ID,
    });
  });

  it("rejects a snapshot that crosses Organizer Edition scope", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        editionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        themes: [],
        serverTime: "2026-10-23T17:00:01.000Z",
      },
      error: null,
    }));

    await expect(loadJuryShareThemeSnapshot(EDITION_ID, { rpc })).rejects.toThrow(
      "different edition",
    );
  });

  it("reconciles the same operation after an uncertain draft-save response instead of blind retry", async () => {
    const transportError = new Error("network lost after commit");
    const rpc = vi
      .fn<JuryShareThemeRpcClient["rpc"]>()
      .mockResolvedValueOnce({ data: null, error: transportError })
      .mockResolvedValueOnce({ data: operationReceipt(), error: null });

    const result = await saveJuryShareThemeDraft(
      {
        editionId: EDITION_ID,
        composition: DEFAULT_JURY_SHARE_EDITION_COMPOSITION,
        expectedVersion: 2,
        operationId: OPERATION_ID,
        idempotencyKey: `jury-share-theme:save-draft:${OPERATION_ID}`,
      },
      { rpc },
    );

    expect(result.operationId).toBe(OPERATION_ID);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "studio2_save_jury_share_theme_draft", {
      p_edition_id: EDITION_ID,
      p_composition: DEFAULT_JURY_SHARE_EDITION_COMPOSITION,
      p_expected_version: 2,
      p_operation_id: OPERATION_ID,
      p_idempotency_key: `jury-share-theme:save-draft:${OPERATION_ID}`,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "studio2_reconcile_operation", {
      p_operation_id: OPERATION_ID,
    });
  });

  it("keeps Ready as a canonical receipted state transition", async () => {
    const rpc = vi.fn(async () => ({ data: operationReceipt("ready"), error: null }));

    const result = await setJuryShareThemeState(
      {
        editionId: EDITION_ID,
        version: 2,
        targetState: "ready",
        operationId: OPERATION_ID,
        idempotencyKey: `jury-share-theme:ready:${OPERATION_ID}`,
      },
      { rpc },
    );

    expect(result.state).toBe("ready");
    expect(rpc).toHaveBeenCalledWith("studio2_set_jury_share_theme_state", {
      p_edition_id: EDITION_ID,
      p_version: 2,
      p_target_state: "ready",
      p_operation_id: OPERATION_ID,
      p_idempotency_key: `jury-share-theme:ready:${OPERATION_ID}`,
    });
  });
});
