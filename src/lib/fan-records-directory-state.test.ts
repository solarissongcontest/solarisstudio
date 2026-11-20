import { describe, expect, it } from "vitest";
import {
  createRecordsDirectorySearch,
  parseRecordsDirectoryState,
} from "./fan-records-directory-state";

describe("Records browser URL discovery", () => {
  it("defaults to Career and treats unknown category values safely", () => {
    expect(parseRecordsDirectoryState("")).toEqual({ category: "career", search: "" });
    expect(parseRecordsDirectoryState("?category=invalid&q=Oland")).toEqual({
      category: "career", search: "Oland",
    });
  });

  it("restores every category and international names without changing them", () => {
    for (const category of ["all", "career", "streaks", "edition", "voting", "regional", "unusual"]) {
      expect(parseRecordsDirectoryState(`?category=${category}&q=%C3%98rn%C3%A5dal`)).toEqual({
        category, search: "Ørnådal",
      });
    }
  });

  it("keeps unrelated URL search fields and drops default filters", () => {
    expect(createRecordsDirectorySearch("?ref=home&category=voting&q=Reya", {
      category: "career", search: "",
    })).toBe("?ref=home");
    expect(createRecordsDirectorySearch("", { category: "voting", search: "  Reya  " }))
      .toBe("?category=voting&q=Reya");
  });

  it("caps oversized queries without losing the category", () => {
    const long = "x".repeat(300);
    expect(parseRecordsDirectoryState(`?category=all&q=${long}`))
      .toEqual({ category: "all", search: "x".repeat(160) });
    const params = new URLSearchParams(createRecordsDirectorySearch("", {
      category: "voting", search: long,
    }));
    expect(params.get("q")).toHaveLength(160);
    expect(params.get("category")).toBe("voting");
  });
});
