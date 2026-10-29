import { describe, expect, it } from "vitest";

import type { NoticeInboxState, OperationalNotice } from "./official-communications";
import {
  v3OfficialNoticeNeedsAction,
  v3OfficialNoticeResolved,
} from "./v3-official-notices";

function notice(acknowledgementRequired: boolean): Pick<OperationalNotice, "acknowledgementRequired"> {
  return { acknowledgementRequired };
}

describe("V3 official-notice state semantics", () => {
  it("requires action only when canonical acknowledgement state requires it", () => {
    const states: NoticeInboxState[] = [
      "unread",
      "read",
      "acknowledgement_required",
      "acknowledged",
      "archived",
    ];

    expect(states.filter((state) => v3OfficialNoticeNeedsAction(notice(true), state))).toEqual([
      "unread",
      "acknowledgement_required",
    ]);
    expect(states.some((state) => v3OfficialNoticeNeedsAction(notice(false), state))).toBe(false);
  });

  it("keeps acknowledged, archived and ordinary read notices out of unresolved state", () => {
    expect(v3OfficialNoticeResolved("acknowledged")).toBe(true);
    expect(v3OfficialNoticeResolved("archived")).toBe(true);
    expect(v3OfficialNoticeResolved("read")).toBe(true);
    expect(v3OfficialNoticeResolved("unread")).toBe(false);
    expect(v3OfficialNoticeResolved("acknowledgement_required")).toBe(false);
  });
});
