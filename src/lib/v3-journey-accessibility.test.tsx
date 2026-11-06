import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  V3Journey,
  V3JourneyStep,
  type V3JourneyState,
} from "@/components/v3/V3Foundation";

describe("shared V3 journey accessibility", () => {
  it.each([
    ["complete", "Complete"],
    ["active", "In progress"],
    ["waiting", "Waiting"],
    ["locked", "Locked"],
    ["problem", "Action needed"],
  ] as const)("announces the %s state without relying on a color or icon", (state, label) => {
    const html = renderToStaticMarkup(
      <V3Journey>
        <V3JourneyStep title="Jury submission" state={state as V3JourneyState} detail="Current phase" />
      </V3Journey>,
    );

    expect(html).toContain('class="v3-journey" role="list"');
    expect(html).toContain('role="listitem"');
    expect(html).toContain(`data-state="${state}"`);
    expect(html).toContain(`Status: ${label}`);
    expect(html).toContain("Jury submission");
    expect(html).toContain("Current phase");
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("keeps multiple items in one list and preserves optional trailing content", () => {
    const html = renderToStaticMarkup(
      <V3Journey>
        <V3JourneyStep title="Task A" state="complete" trailing={<span>Receipt</span>} />
        <V3JourneyStep title="Task B" state="waiting" />
      </V3Journey>,
    );

    expect(html.match(/role="list"/g)).toHaveLength(1);
    expect(html.match(/role="listitem"/g)).toHaveLength(2);
    expect(html).toContain("Receipt");
    expect(html).toContain("Status: Complete");
    expect(html).toContain("Status: Waiting");
  });
});
