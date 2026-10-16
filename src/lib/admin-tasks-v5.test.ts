import { describe, expect, it, vi } from "vitest";

import { loadOrganizerTaskCountV5, loadOrganizerTasksV5 } from "./admin-tasks-v5";

describe("Organizer Tasks edition RPC boundary", () => {
  it("fails closed before RPC when Organizer edition scope is missing", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const client = { rpc };

    await expect(loadOrganizerTasksV5("", "all", client)).rejects.toThrow(
      "Organizer Tasks requires an explicit edition scope.",
    );
    await expect(loadOrganizerTasksV5("   ", "mine", client)).rejects.toThrow(
      "Organizer Tasks requires an explicit edition scope.",
    );

    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves a selected UUID while trimming accidental surrounding whitespace", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const client = { rpc };
    const editionId = "00000000-0000-4000-8000-00000000e220";

    await loadOrganizerTasksV5(`  ${editionId}  `, "waiting", client);

    expect(rpc).toHaveBeenCalledWith("admin_organizer_tasks", {
      p_edition_id: editionId,
      p_filter: "waiting",
    });
  });

  it("fails closed before count RPC when Organizer edition scope is missing", async () => {
    const rpc = vi.fn(async () => ({ data: 0, error: null }));
    const client = { rpc };

    await expect(loadOrganizerTaskCountV5("", client)).rejects.toThrow(
      "Organizer Tasks requires an explicit edition scope.",
    );

    expect(rpc).not.toHaveBeenCalled();
  });
});
