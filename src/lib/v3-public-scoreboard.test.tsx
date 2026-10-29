import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";
import { describe, expect, it } from "vitest";
import { loadV3PublicScoreboard } from "@/integrations/v3/scoreboard-source.server";
import { V3ScoreboardPresentation } from "@/components/v3/V3ScoreboardPresentation";
import { PublicDataState } from "@/components/public/PublicDataState";
import type { PublicResultSnapshot } from "./v3-public-result-snapshots";
import type { Country } from "./data";
import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";

const country: Country = {
  id: "A",
  name: "Published country",
  short_code: "AA",
  native_name: null,
  flag_image: null,
  region: "Solaris",
  accent_color: "#123456",
  description: null,
  first_participation: null,
};
const payload = {
  schemaVersion: 1,
  publicationState: "public",
  resultVersion: 2,
  publicationVersion: 4,
  show: { id: "semi-final", editionId: "edition" },
  edition: { id: "edition" },
  availability: { results: true, jury: false, televote: false, detailedVoting: false },
  rowCount: 2,
  rows: ["A", "B"].map((countryId) => ({
    countryId,
    contestEntityId: null,
    finalRank: 1,
    totalPoints: 22,
  })),
};

function gate(
  snapshot: PublicResultSnapshot | null,
  state: { failed?: boolean; disabled?: boolean; pending?: boolean; rolloutFailed?: boolean } = {},
) {
  const exports: { V3PublicScoreboardGate?: React.ComponentType<Record<string, unknown>> } = {};
  const source = readFileSync("src/components/v3/V3PublicScoreboardGate.tsx", "utf8").replace(
    /^import[\s\S]*?;\n/gm,
    "",
  );
  runInNewContext(
    transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.React },
    }).outputText,
    {
      exports,
      React,
      V3ScoreboardPresentation,
      PublicDataState,
      useSolarisApp: () => ({ isAppMode: true, platformResolved: true }),
      useV3RolloutProbe: () => ({
        isLoading: false,
        isError: state.rolloutFailed,
        data: { enabled: true, scoreboardEnabled: !state.disabled },
      }),
      useV3PublicScoreboard: (showId: string, enabled: boolean) => {
        expect(showId).toBe("semi-final");
        expect(enabled).toBe(!state.disabled);
        return { data: snapshot, isLoading: state.pending, isError: state.failed };
      },
    },
  );
  return React.createElement(exports.V3PublicScoreboardGate!, {
    showId: "semi-final",
    countries: new Map([
      ["A", country],
      ["B", { ...country, id: "B", name: "Other country" }],
    ]),
    fallback: <div>LEGACY-MUTABLE-999</div>,
  });
}
async function render(node: React.ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({ getParentRoute: () => root, path: "/", component: () => node });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("exact-show immutable Public Scoreboard cutover", () => {
  it("accepts the exact-show owner only with its runtime, route and immutable publication evidence", () => {
    const capability = V3_PUBLIC_CAPABILITY_REGISTRY.find((row) => row.id === "scoreboard")!;
    expect(capability.specificationStatus).toBe("cutover");
    expect(capability.backendOwners).toEqual(["results", "publication"]);
    for (const path of [
      "src/components/v3/V3PublicScoreboardGate.tsx",
      "src/integrations/v3/scoreboard-source.server.ts",
      "src/lib/v3-public-scoreboard.test.tsx",
      "scripts/rehearse-v3-public-result-snapshot.sh",
    ])
      expect(capability.migrationEvidence).toContain(path);
    expect(readFileSync("src/routes/shows/$showId.tsx", "utf8")).toContain(
      "<V3PublicScoreboardGate",
    );
  });

  it("loads only the nominated semi-final publication, preserving version, tied rank and redacted components", async () => {
    const calls: unknown[] = [];
    const snapshot = await loadV3PublicScoreboard("semi-final", {
      async rpc(name, args) {
        calls.push([name, args]);
        return { data: [payload], error: null };
      },
    });
    expect(calls).toEqual([
      [
        "v3_public_published_result_snapshots",
        { p_show_ids: ["semi-final"], p_include_rows: true },
      ],
    ]);
    expect(snapshot).toMatchObject({
      resultVersion: 2,
      publicationVersion: 4,
      availability: { jury: false, televote: false },
      rows: [
        { final_rank: 1, total_points: 22 },
        { final_rank: 1, total_points: 22 },
      ],
    });
    const html = await render(gate(snapshot));
    expect(html).toContain("Published country");
    expect(html).toContain("Other country");
    expect(html).toContain(">Tie<");
    expect(html).not.toContain(">Winner<");
    expect(html).toContain('data-v3-scoreboard-result-version="2"');
    expect(html).toContain('data-v3-scoreboard-publication-version="4"');
    expect(html).not.toContain("999");
  });

  it("never substitutes another final or mutable standings for a missing/private show", async () => {
    const snapshot = await loadV3PublicScoreboard("semi-final", {
      async rpc() {
        return { data: [], error: null };
      },
    });
    expect(snapshot).toBeNull();
    const html = await render(gate(snapshot));
    expect(html).toContain("No published ranking yet");
    expect(html).not.toContain("LEGACY-MUTABLE-999");
    expect(html).not.toContain("Published country");
    await expect(
      loadV3PublicScoreboard("semi-final", {
        async rpc() {
          return {
            data: [{ ...payload, show: { ...payload.show, id: "different-final" } }],
            error: null,
          };
        },
      }),
    ).rejects.toThrow();
  });

  it("fails closed on canonical RPC/rollout failure and during loading, preserving explicit disabled rollback", async () => {
    await expect(
      loadV3PublicScoreboard("semi-final", {
        async rpc() {
          return { data: null, error: { message: "private backend failure" } };
        },
      }),
    ).rejects.toThrow("Canonical published Results are unavailable");
    for (const state of [{ failed: true }, { rolloutFailed: true }, { pending: true }]) {
      const html = await render(gate(null, state));
      expect(html).not.toContain("LEGACY-MUTABLE-999");
      expect(html).not.toContain("private backend failure");
      expect(html).not.toContain("Published country");
    }
    expect(await render(gate(null, { disabled: true }))).toContain("LEGACY-MUTABLE-999");
  });
});
