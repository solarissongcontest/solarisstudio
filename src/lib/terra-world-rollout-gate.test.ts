import { describe, expect, it } from "vitest";
import { publicWorldRolloutDisplay, type PublicWorldRolloutSnapshot } from "./terra-world-rollout-gate";

const published: PublicWorldRolloutSnapshot = {
  isError: false,
  isPending: false,
  isFetching: false,
  isFetchedAfterMount: true,
  data: true,
};

describe("TG3 strict public World rollout gate", () => {
  it("reveals institutional body routes only after a successful current-mount check", () => {
    expect(publicWorldRolloutDisplay(published, true)).toBe("enabled");
  });

  it("rejects a previously cached enabled flag before revalidation starts", () => {
    expect(publicWorldRolloutDisplay({ ...published, isFetchedAfterMount: false }, true))
      .toBe("checking");
  });

  it("hides a cached enabled flag while a fresh revalidation is running", () => {
    expect(publicWorldRolloutDisplay({ ...published, isFetching: true }, true))
      .toBe("checking");
  });

  it("reports an updated disabled rollout rather than revealing cached institutional content", () => {
    expect(publicWorldRolloutDisplay({ ...published, data: false }, true))
      .toBe("disabled");
  });

  it("fails closed on a refetch error even when an old enabled flag remains cached", () => {
    expect(publicWorldRolloutDisplay({ ...published, isError: true, isFetching: false }, true))
      .toBe("error");
    expect(publicWorldRolloutDisplay({
      ...published, isError: true, isFetchedAfterMount: false,
    }, true)).toBe("error");
  });

  it("keeps genuinely pending states hidden regardless of stale data", () => {
    expect(publicWorldRolloutDisplay({ ...published, isPending: true }, true))
      .toBe("checking");
  });

  it("preserves legacy World page behavior when strict verification was not requested", () => {
    expect(publicWorldRolloutDisplay({
      ...published, isFetchedAfterMount: false, isFetching: true,
    }, false)).toBe("enabled");
    expect(publicWorldRolloutDisplay({ ...published, data: false }, false))
      .toBe("disabled");
    expect(publicWorldRolloutDisplay({ ...published, isError: true }, false))
      .toBe("error");
  });
});
