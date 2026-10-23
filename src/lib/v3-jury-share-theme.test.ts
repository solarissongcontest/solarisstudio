import { describe, expect, it, vi } from "vitest";

import {
  createDefaultJuryShareThemeComposition,
  createJuryShareThemeOperationIdentity,
  loadJuryShareThemeSnapshot,
  reconcileJuryShareThemeOperation,
  saveJuryShareThemeDraft,
  setJuryShareThemeState,
  type JuryShareThemeRpcClient,
} from "./v3-jury-share-theme";

const EDITION_ID = "11111111-1111-4111-8111-111111111111";
const THEME_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";

function validTheme() {
  return {
    id: THEME_ID,
    editionId: EDITION_ID,
    version: 2,
    state: "draft",
    composition: createDefaultJuryShareThemeComposition("edition/artwork.webp"),
    validation: { valid: true, errors: [], warnings: [] },
    activatedAt: null,
    archivedAt: null,
    updatedAt: "2026-10-23T17:00:00Z",
  };
}

describe("Organizer Jury Share Edition theme adapter", () => {
  it("creates a bounded structured default recipe without arbitrary executable content", () => {
    const composition = createDefaultJuryShareThemeComposition("edition/artwork.webp");
    expect(composition.artwork?.assetId).toBe("edition/artwork.webp");
    expect(composition.safeArea).toEqual({ top: 160, right: 72, bottom: 190, left: 72 });
    expect(Object.keys(composition).sort()).toEqual([
      "artwork",
      "background",
      "decorativeAssets",
      "footer",
      "header",
      "safeArea",
      "scoreboard",
    ]);
    expect(JSON.stringify(composition).toLowerCase()).not.toMatch(/customcss|customhtml|customjavascript|<script|javascript:/);
  });

  it("freezes one operation and idempotency identity per reviewed action", () => {
    const identity = createJuryShareThemeOperationIdentity(
      { editionId: EDITION_ID, action: "save_draft", version: 2 },
      () => OPERATION_ID,
    );
    expect(identity.operationId).toBe(OPERATION_ID);
    expect(identity.idempotencyKey).toBe(`jury-share-theme:save_draft:${EDITION_ID}:v2:${OPERATION_ID}`);
  });

  it("loads only the exact requested edition snapshot", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        editionId: EDITION_ID,
        themes: [validTheme()],
        serverTime: "2026-10-23T17:00:01Z",
      },
      error: null,
    }));
    const snapshot = await loadJuryShareThemeSnapshot(EDITION_ID, { rpc } as JuryShareThemeRpcClient);
    expect(rpc).toHaveBeenCalledWith("studio2_jury_share_theme_snapshot", { p_edition_id: EDITION_ID });
    expect(snapshot.editionId).toBe(EDITION_ID);
    expect(snapshot.themes[0]?.version).toBe(2);
  });

  it("fails closed if a snapshot returns another edition", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        editionId: "99999999-9999-4999-8999-999999999999",
        themes: [],
        serverTime: "2026-10-23T17:00:01Z",
      },
      error: null,
    }));
    await expect(loadJuryShareThemeSnapshot(EDITION_ID, { rpc } as JuryShareThemeRpcClient)).rejects.toThrow("wrong edition");
  });

  it("saves the reviewed composition through the receipted System RPC instead of a table write", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, operationId: OPERATION_ID }, error: null }));
    const composition = createDefaultJuryShareThemeComposition("edition/artwork.webp");
    await saveJuryShareThemeDraft({
      editionId: EDITION_ID,
      composition,
      expectedVersion: 2,
      identity: {
        operationId: OPERATION_ID,
        idempotencyKey: `jury-share-theme:save_draft:${EDITION_ID}:v2:${OPERATION_ID}`,
      },
    }, { rpc } as JuryShareThemeRpcClient);
    expect(rpc).toHaveBeenCalledWith("studio2_save_jury_share_theme_draft", expect.objectContaining({
      p_edition_id: EDITION_ID,
      p_composition: composition,
      p_expected_version: 2,
      p_operation_id: OPERATION_ID,
      p_correlation_id: OPERATION_ID,
    }));
  });

  it("activates Ready through the exact versioned transition authority", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, operationId: OPERATION_ID }, error: null }));
    await setJuryShareThemeState({
      editionId: EDITION_ID,
      version: 3,
      targetState: "ready",
      identity: {
        operationId: OPERATION_ID,
        idempotencyKey: `jury-share-theme:ready:${EDITION_ID}:v3:${OPERATION_ID}`,
      },
    }, { rpc } as JuryShareThemeRpcClient);
    expect(rpc).toHaveBeenCalledWith("studio2_set_jury_share_theme_state", expect.objectContaining({
      p_edition_id: EDITION_ID,
      p_version: 3,
      p_target_state: "ready",
      p_operation_id: OPERATION_ID,
    }));
  });

  it("reconciles an uncertain result by the same operation id", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, operationId: OPERATION_ID }, error: null }));
    await reconcileJuryShareThemeOperation(OPERATION_ID, { rpc } as JuryShareThemeRpcClient);
    expect(rpc).toHaveBeenCalledWith("studio2_reconcile_operation", { p_operation_id: OPERATION_ID });
  });
});
