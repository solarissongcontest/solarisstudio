import { describe, expect, it } from "vitest";
import { resolveLineupShowSelection } from "./show-lineup-selection";

const shows = [{ id: "semi-one" }, { id: "semi-two" }, { id: "final" }];

describe("lineup show selection", () => {
  it("retains the final deep link while its query is consumed before show data loads", () => {
    let selected = "final";
    selected = resolveLineupShowSelection({ selected, initial: "final", shows: [], loading: true });
    expect(selected).toBe("final");
    selected = resolveLineupShowSelection({ selected, shows: [], loading: true });
    expect(selected).toBe("final");
    selected = resolveLineupShowSelection({ selected, shows, loading: false });
    expect(selected).toBe("final");
  });

  it("keeps manual show selection after consuming the entry-point query", () => {
    expect(resolveLineupShowSelection({ selected: "semi-two", shows, loading: false })).toBe("semi-two");
  });

  it("validates a requested show against the loaded edition", () => {
    expect(resolveLineupShowSelection({ selected: "other-edition", initial: "missing", shows, loading: false })).toBe("semi-one");
    expect(resolveLineupShowSelection({ selected: "final", shows: [], loading: false })).toBe("");
  });
});
