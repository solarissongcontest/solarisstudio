import { describe, expect, it, vi } from "vitest";

import { loadOrganizerTaskCountV5, loadOrganizerTasksV5 } from "./admin-tasks-v5";

describe("Organizer Tasks edition RPC boundary", () => {
  it("maps an unselected or whitespace-only edition to SQL null", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const client = { rpc };

    await loadOrganizerTasksV5("", "all", client);
    await loadOrganizerTasksV5("   ", "mine", client);

    expect(rpc).toHaveBeenNthCalledWith(1, "admin_organizer_tasks", {
      p_edition_id: null,
      p_filter: "all",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "admin_organizer_tasks", {
      p_edition_id: null,
      p_filter: "mine",
    });
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

  it("applies the same null normalization to Organizer task counts", async () => {
    const rpc = vi.fn(async () => ({ data: 0, error: null }));
    const client = { rpc };

    await expect(loadOrganizerTaskCountV5("", client)).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith("admin_organizer_task_count", {
      p_edition_id: null,
    });
  });
});
