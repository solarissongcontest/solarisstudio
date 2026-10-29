import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";
import { describe, expect, it } from "vitest";

const wrapper = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const published = () => <div>IMMUTABLE-PUBLISHED-22</div>;
const gates = ["Explore", "Edition", "Delegation"] as const;
function renderGate(name: string, state: { bundleError?: boolean; missingBundle?: boolean; rolloutError?: boolean; missingRollout?: boolean; disabled?: boolean; web?: boolean }) {
  const file = `V3${name}RouteGate`;
  const source = readFileSync(`src/components/v3/${file}.tsx`, "utf8").replace(/^import[\s\S]*?;\n/gm, "");
  const bundle = {
    isLoading: false, isError: state.bundleError === true,
    data: state.bundleError || state.missingBundle ? undefined : { shell: {}, projection: {} },
  };
  const probe = {
    isLoading: false, isError: state.rolloutError === true,
    data: state.missingRollout ? undefined : { enabled: !state.disabled, exploreEnabled: !state.disabled, editionHubEnabled: !state.disabled, delegationEnabled: !state.disabled },
  };
  const exports: Record<string, React.ComponentType<{ legacy: React.ReactNode; slug: string; code: string }>> = {};
  runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.React } }).outputText, {
    exports, React, useRef: React.useRef,
    useSolarisApp: () => ({ isAppMode: !state.web, platformResolved: true }),
    useRouterState: () => "unused-path",
    useV3RolloutProbe: () => probe, useV3EditionRolloutProbe: () => probe,
    useV3ExploreBundle: () => bundle, useV3EditionBundle: () => bundle, useV3DelegationBundle: () => bundle,
    V3AppShell: wrapper, V3ExploreScreen: published, V3EditionSpoilerSafeScreen: published, V3DelegationScreen: published,
    V3ResultCoverageNotice: () => null, PublicCommandPalette: () => null,
    V3ResultReadUnavailable: () => <div role="alert">Published results unavailable</div>,
    useAppExperiencePreferences: () => ({ preferences: { spoilerFree: false } }),
    useNotificationPreferences: () => ({ isPending: false, isError: false }),
    resolveV3ResultsSpoilerProtection: () => false,
    decideV3ShellForRoute: () => ({ useV3Shell: true, rootTab: "explore" }),
  });
  return renderToStaticMarkup(React.createElement(exports[file], { slug: "edition", code: "AA", legacy: <div>LEGACY-MUTABLE-999</div> }));
}

describe("Public discovery gates preserve immutable publication authority on failure", () => {
  for (const gate of gates) {
    it(`${gate} never mounts legacy archive consumers on enabled read or rollout errors`, () => {
      for (const state of [{ bundleError: true }, { missingBundle: true }, { rolloutError: true }, { missingRollout: true }]) {
        const html = renderGate(gate, state);
        expect(html).toContain("Published results unavailable");
        expect(html).not.toContain("LEGACY-MUTABLE-999");
        expect(html).not.toContain("IMMUTABLE-PUBLISHED-22");
      }
    });
    it(`${gate} keeps public-web and explicit server-disabled rollback, and renders published success`, () => {
      expect(renderGate(gate, { disabled: true })).toContain("LEGACY-MUTABLE-999");
      expect(renderGate(gate, { web: true })).toContain("LEGACY-MUTABLE-999");
      expect(renderGate(gate, {})).toContain("IMMUTABLE-PUBLISHED-22");
    });
  }
});
