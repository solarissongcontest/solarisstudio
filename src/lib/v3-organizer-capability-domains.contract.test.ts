import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

function capability(id: string) {
  const item = V3_ORGANIZER_CAPABILITY_REGISTRY.find((candidate) => candidate.legacyId === id);
  if (!item) throw new Error(`Missing Organizer capability ${id}`);
  return item;
}

describe("V3 Organizer canonical capability domains", () => {
  it("keeps specialist labs out of ordinary live/control ownership", () => {
    expect(capability("live-review-simulation-lab").targetDomain).toBe("specialist-labs");
    expect(capability("live-review-time-machine").targetDomain).toBe("specialist-labs");
    expect(capability("live-review-voting-lab").targetDomain).toBe("specialist-labs");
    expect(capability("workspace-command-assistant").targetDomain).toBe("specialist-labs");
  });

  it("keeps engagement/editorial tools separate from Contest operations", () => {
    expect(capability("current-edition-storytelling").targetDomain).toBe("engagement-editorial");
    expect(capability("workspace-anniversary-settings").targetDomain).toBe("engagement-editorial");
    expect(capability("workspace-predictions").targetDomain).toBe("engagement-editorial");
    expect(capability("workspace-fantasy").targetDomain).toBe("engagement-editorial");
  });

  it("keeps product QA tools out of ordinary platform operations", () => {
    expect(capability("workspace-flag-qa").targetDomain).toBe("product-qa");
    expect(capability("workspace-public-ux").targetDomain).toBe("product-qa");
    expect(capability("workspace-acceptance-test").targetDomain).toBe("product-qa");
    expect(capability("workspace-beta-coverage").targetDomain).toBe("product-qa");
  });

  it("keeps Eligibility and Media in Contest rather than Delegations", () => {
    expect(capability("operations-eligibility").targetDomain).toBe("contest");
    expect(capability("operations-media-assets").targetDomain).toBe("contest");
    expect(capability("delegation-confirmation-overview").targetDomain).toBe("delegations");
  });
});
