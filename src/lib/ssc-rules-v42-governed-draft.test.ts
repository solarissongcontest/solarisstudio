import { describe, expect, it } from "vitest";

import { buildV42GovernedDraftChanges } from "@/lib/ssc-rules/v42-governed-draft";
import { SSC_RULEBOOK } from "@/lib/ssc-rules/current";

describe("SSC v4.2 governed draft importer", () => {
  it("retains v4.1 as the bundled authoritative rules pending official publication", () => {
    expect(SSC_RULEBOOK.version).toBe("4.1");
  });

  it("prepares all 113 unique before/after snapshots, without publishing anything", () => {
    const changes = buildV42GovernedDraftChanges();
    expect(changes).toHaveLength(113);
    expect(new Set(changes.map(({ rule_id }) => rule_id)).size).toBe(113);
    expect(changes.every((change) => change.change_kind === "modified")).toBe(true);
    expect(changes.every((change) => change.before_snapshot?.body?.length && change.after_snapshot?.body?.length)).toBe(true);
    expect(changes.find((change) => change.rule_id === "6.5")?.after_snapshot?.body?.join(" ")).toContain("in 2015 or any later year");
    expect(changes.find((change) => change.rule_id === "6.4")?.after_snapshot?.body?.join(" ")).toContain("most-viewed");
    expect(changes.find((change) => change.rule_id === "17.2")?.after_snapshot?.body?.join(" ")).toContain("negative score");
    expect(changes.find((change) => change.rule_id === "22.5")?.after_snapshot?.body?.join(" ")).toContain("six consecutive SSC Editions");
    expect(changes.find((change) => change.rule_id === "17.2")?.after_snapshot?.bullets).toHaveLength(10);
  });
});
