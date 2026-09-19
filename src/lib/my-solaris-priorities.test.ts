import { describe, expect, it } from "vitest";

import {
  priorityBucket,
  sortMySolarisPriorities,
  type MySolarisPriorityItem,
} from "./my-solaris-priorities";

const NOW = new Date("2026-09-19T12:00:00Z").getTime();

function item(
  id: string,
  overrides: Partial<MySolarisPriorityItem> = {},
): MySolarisPriorityItem {
  return {
    id,
    title: id,
    description: id,
    to: "/my-solaris",
    priority: 50,
    deadline: null,
    severity: "info",
    actionRequired: false,
    kind: "info",
    ...overrides,
  };
}

describe("MySolaris priority sorting", () => {
  it("orders overdue required actions before current required actions", () => {
    const rows = sortMySolarisPriorities(
      [
        item("current", { actionRequired: true, severity: "high" }),
        item("overdue", {
          actionRequired: true,
          severity: "critical",
          deadline: "2026-09-18T12:00:00Z",
        }),
      ],
      NOW,
    );

    expect(rows.map((row) => row.id)).toEqual(["overdue", "current"]);
  });

  it("puts upcoming deadlines before unread important notices and information", () => {
    const rows = sortMySolarisPriorities(
      [
        item("info"),
        item("notice", { severity: "high" }),
        item("deadline", { deadline: "2026-09-20T12:00:00Z", severity: "medium" }),
      ],
      NOW,
    );

    expect(rows.map((row) => row.id)).toEqual(["deadline", "notice", "info"]);
  });

  it("uses explicit priority inside the same bucket", () => {
    const rows = sortMySolarisPriorities(
      [
        item("lower", { actionRequired: true, priority: 40 }),
        item("higher", { actionRequired: true, priority: 90 }),
      ],
      NOW,
    );

    expect(rows.map((row) => row.id)).toEqual(["higher", "lower"]);
    expect(priorityBucket(rows[0], NOW)).toBe(1);
  });
});
