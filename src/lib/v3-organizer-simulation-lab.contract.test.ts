import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Organizer Simulation Lab", () => {
  const route = source("src/routes/_authenticated/admin/edition-simulator.tsx");
  const engine = source("src/lib/edition-simulator.ts");
  const more = source("src/routes/_authenticated/admin/more.tsx");

  it("keeps the canonical simulation warning persistent and explicit", () => {
    expect(route).toContain('title="Simulation Lab"');
    expect(route).toContain('>SIMULATION</p>');
    expect(route).toContain('No production data will be changed.');
    expect(route).toContain('aria-label="Simulation isolation status"');
    expect(route).toContain('<SimulationIsolationBanner />');
  });

  it("remounts the local simulation whenever Organizer edition context changes", () => {
    expect(route).toContain('component: EditionSimulatorRoute');
    expect(route).toContain('function EditionSimulatorRoute()');
    expect(route).toContain("<EditionSimulatorPage key={editionId ?? 'unscoped'} />");
    expect(route).toContain("enabled: featureQuery.data === true && Boolean(editionId)");
  });

  it("takes one read snapshot and prevents automatic production refresh from replacing rehearsal state", () => {
    expect(route).toContain('getControlRoomModel');
    expect(route).toContain("queryKey: ['studio2-simulator-source', editionId ?? 'none']");
    expect(route).toContain('staleTime: Infinity');
    expect(route).toContain('gcTime: 0');
    expect(route).toContain('refetchOnWindowFocus: false');
    expect(route).toContain('refetchOnReconnect: false');
    expect(route).toContain('const refreshed = await controlRoomQuery.refetch();');
    expect(route).toContain('Refresh source & reset');
  });

  it("covers every canonical O17 simulation domain", () => {
    for (const label of [
      'Confirmation',
      'Entries',
      'Voting',
      'Results',
      'Publication',
      'Progression',
      'Live state',
    ]) {
      expect(route).toContain(`label: '${label}'`);
    }
  });

  it("keeps the simulation engine pure and outside production mutation authority", () => {
    expect(engine).not.toContain('supabase');
    expect(engine).not.toContain('.rpc(');
    expect(engine).not.toContain('.insert(');
    expect(engine).not.toContain('.update(');
    expect(engine).not.toContain('.delete(');
    expect(engine).not.toContain('fetch(');
    expect(route).not.toContain('useMutation');
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
    expect(route).not.toContain('.delete(');
    expect(route).not.toContain('.rpc(');
  });

  it("remains visibly discoverable from More", () => {
    expect(more).toContain('label: "Simulation Lab"');
    expect(more).toContain('to: "/admin/edition-simulator"');
  });
});
