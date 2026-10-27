import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";
import { describe, expect, it } from "vitest";

// Execute the actual production gate, replacing only transport hooks and shell
// dependencies. There is no browser client, credentials or network in this VM.
const gates = [
  ["V3ResultsRootGate", "V3ResultsRootGate"],
  ["V3RecordsGate", "V3RecordsGate"],
  ["V3ScorechartsGate", "V3ScorechartsGate"],
  ["V3ResultLabGate", "V3ResultLabGate"],
  ["V3BroadcastIntelligenceGate", "V3BroadcastIntelligenceGate"],
  ["V3RelationshipsGate", "V3RelationshipsIndexGate"],
  ["V3RelationshipsGate", "V3RelationshipDetailGate"],
] as const;
const wrapper = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const published = () => <div>PUBLISHED-22</div>;
const unavailable = () => <div role="alert">Published results unavailable</div>;

function renderGate(
  file: string,
  name: string,
  state: {
    bundleError?: boolean;
    missingBundle?: boolean;
    rolloutError?: boolean;
    missingRollout?: boolean;
    disabled?: boolean;
    edition?: boolean;
  },
) {
  const source = readFileSync(`src/components/v3/${file}.tsx`, "utf8").replace(
    /^import[\s\S]*?;\n/gm,
    "",
  );
  const bundle = {
    isError: state.bundleError === true,
    isLoading: false,
    isSuccess: !state.bundleError,
    isFetching: false,
    data:
      state.bundleError || state.missingBundle
        ? undefined
        : {
            rolloutEditionSlug: state.edition ? "ssc-22" : "",
            editionSlug: state.edition ? "ssc-22" : "",
            shell: { editionLabel: "Published edition", phaseLabel: "Archive" },
            input: { showId: "show" },
            resultCoverage: { includedShows: 1, unavailableShows: 0 },
          },
  };
  const probe = {
    isLoading: false,
    isError: state.rolloutError === true,
    data: state.missingRollout
      ? undefined
      : { enabled: !state.disabled, resultsEnabled: !state.disabled, userId: null },
  };
  const exports: Record<
    string,
    React.ComponentType<{ fallback: React.ReactNode; pair: string }>
  > = {};
  runInNewContext(
    transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.React },
    }).outputText,
    {
      exports,
      React,
      useState: React.useState,
      useEffect: React.useEffect,
      useMemo: React.useMemo,
      V3AppShell: wrapper,
      V3Screen: wrapper,
      V3Surface: wrapper,
      V3ResultCoverageNotice: () => null,
      V3ResultReadUnavailable: unavailable,
      V3ResultsScreen: published,
      V3RecordsScreen: published,
      V3ScorechartsScreen: published,
      V3ResultLabScreen: published,
      V3BroadcastIntelligenceScreen: published,
      V3RelationshipsIndexScreen: published,
      V3RelationshipDetailScreen: published,
      useV3ResultsBundle: () => bundle,
      useV3RecordsBundle: () => bundle,
      useV3ScorechartsBundle: () => bundle,
      useV3ResultLabBundle: () => bundle,
      useV3BroadcastIntelligenceBundle: () => bundle,
      useV3RelationshipsIndexBundle: () => bundle,
      useV3RelationshipDetailBundle: () => bundle,
      useV3RolloutProbe: () => probe,
      useV3EditionRolloutProbe: () => probe,
      useMyCountryAccount: () => ({ isPending: false, isError: false, data: null }),
      useAppExperiencePreferences: () => ({ preferences: { spoilerFree: false } }),
      useNotificationPreferences: () => ({
        isPending: false,
        isError: false,
        data: { spoiler_free: false },
      }),
      resolveV3ResultsSpoilerProtection: () => false,
    },
  );
  return renderToStaticMarkup(
    React.createElement(exports[name], { pair: "A-VS-B", fallback: <div>LEGACY-MUTABLE-999</div> }),
  );
}

describe("Public immutable read failures never select legacy result authority", () => {
  for (const [file, name] of gates) {
    it(`${name} fails closed when canonical transport or rollout authority fails`, () => {
      for (const state of [
        { bundleError: true },
        { missingBundle: true },
        { rolloutError: true },
        { missingRollout: true },
      ]) {
        const html = renderGate(file, name, state);
        expect(html, JSON.stringify(state)).toContain("Published results unavailable");
        expect(html).not.toContain("LEGACY-MUTABLE-999");
        expect(html).not.toContain("PUBLISHED-22");
      }
    });
    it(`${name} preserves explicit server-disabled rollback and published success for both edition/current probes`, () => {
      for (const edition of [false, true]) {
        expect(renderGate(file, name, { edition, disabled: true })).toContain("LEGACY-MUTABLE-999");
        const html = renderGate(file, name, { edition });
        expect(html).toContain("PUBLISHED-22");
        expect(html).not.toContain("LEGACY-MUTABLE-999");
      }
    });
  }
});
