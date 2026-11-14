import { describe, expect, it } from "vitest";
import { requireS16NetworklessFixture } from "./v3-s16-catalog-transport";
const valid = () => ({
  container: "a".repeat(64),
  database: "recovery_operator_baseline",
  fixtureSourceSha: "b".repeat(40),
  inspect: JSON.stringify([
    { State: { Running: true }, HostConfig: { NetworkMode: "none", PortBindings: {} } },
  ]),
});
describe("networkless S16 recovery catalog transport", () => {
  it("retains separate fixture provenance and fixed target", () =>
    expect(requireS16NetworklessFixture(valid())).toEqual({
      container: "a".repeat(64),
      database: "recovery_operator_baseline",
      fixtureSourceSha: "b".repeat(40),
    }));
  for (const [field, value] of [
    ["container", "abc"],
    ["database", "postgres"],
    ["database", "production"],
    ["fixtureSourceSha", ""],
  ] as const)
    it("rejects invalid " + field + " " + value, () =>
      expect(() => requireS16NetworklessFixture({ ...valid(), [field]: value })).toThrow(),
    );
  for (const details of [
    { State: { Running: false }, HostConfig: { NetworkMode: "none" } },
    { State: { Running: true }, HostConfig: { NetworkMode: "bridge" } },
    {
      State: { Running: true },
      HostConfig: { NetworkMode: "none", PortBindings: { "5432/tcp": [{}] } },
    },
  ])
    it("rejects nonisolated or stopped fixtures " + JSON.stringify(details), () =>
      expect(() =>
        requireS16NetworklessFixture({ ...valid(), inspect: JSON.stringify([details]) }),
      ).toThrow(),
    );
});
