import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { expect, it } from "vitest";

function render(state: { bundleError?: boolean; missing?: boolean; rolloutError?: boolean; disabled?: boolean }) {
  const source = readFileSync("src/components/v3/V3EntryRouteGate.tsx", "utf8").replace(/^import[\s\S]*?;\n/gm, "");
  const exports: Record<string, React.ComponentType<{legacy: React.ReactNode; organizerInspection: boolean; focusReadiness: boolean}>> = {};
  const panel = () => <div>CANONICAL-ENTRY</div>;
  runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.React } }).outputText, {
    exports, React,
    useSolarisApp: () => ({ isAppMode: true, platformResolved: true }),
    useV3RolloutProbe: () => ({ isLoading: false, isError: state.rolloutError, data: { enabled: !state.disabled, entryEnabled: !state.disabled, userId: "actor" } }),
    useV3EntryBundle: () => ({ isLoading: false, isError: state.bundleError, data: state.missing ? null : {shell: {}, projection: {}} }),
    resolveV3FocusedTaskChrome: () => ({}),
    V3FocusedTaskShell: ({children}: {children: React.ReactNode}) => <main>{children}</main>,
    V3EntryScreen: panel, V3EntryLifecyclePanel: panel, V3EntryCreditsSummaryPanel: panel, V3EntryResubmissionPanel: panel,
  });
  return renderToStaticMarkup(React.createElement(exports.V3EntryRouteGate, {legacy: <div>LEGACY-PRIVATE-ENTRY</div>, organizerInspection: false, focusReadiness: false}));
}
it("never mounts the legacy private reader on canonical data or rollout failure", () => {
  for (const state of [{bundleError: true}, {missing: true}, {rolloutError: true}]) {
    const html = render(state);
    expect(html).toContain("Entry unavailable");
    expect(html).not.toContain("LEGACY-PRIVATE-ENTRY");
    expect(html).not.toContain("CANONICAL-ENTRY");
  }
});
it("preserves explicit disabled rollback and successful canonical rendering", () => {
  expect(render({disabled: true})).toContain("LEGACY-PRIVATE-ENTRY");
  expect(render({})).toContain("CANONICAL-ENTRY");
});
