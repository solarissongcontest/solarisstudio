import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const shell = () => read("src/components/v3/V3ConfirmationRouteShell.tsx");
const presentation = () => read("src/components/v3/V3ConfirmationPresentation.tsx");
const presentationCss = () => read("src/components/v3/V3ConfirmationPresentation.css");
const indexRoute = () => read("src/routes/confirmations/index.tsx");
const editRoute = () => read("src/routes/confirmations/edit/$token.tsx");
const receiptWrapper = () => read("src/components/ConfirmationFormWithReceipt.tsx");
const rolloutRuntime = () => read("src/lib/v3-primary-runtime.ts");

describe("V3 Confirmation route cutover", () => {
  it("keeps the route cutover app-only, persisted and fail-closed", () => {
    const source = shell();

    expect(source).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(source).toContain("!isAppMode || rollout.isError || rollout.data?.confirmationEnabled !== true");
    expect(source).toContain("<ParticipationRouteChrome>");
    expect(source).toContain('service="confirmations"');
    expect(source).not.toContain("VITE_SOLARIS_APP_V3_CONFIRMATION");
    expect(source).not.toContain("localStorage");
  });

  it("uses the canonical focused critical-task shell in the installed V3 app", () => {
    const source = shell();

    expect(source).toContain('resolveV3FocusedTaskChrome("/confirmations")');
    expect(source).toContain("<V3FocusedTaskShell");
    expect(source).toContain("chrome={CONFIRMATION_FOCUSED_CHROME}");
    expect(source).toContain("<V3Screen");
    expect(source).toContain('data-v3-confirmation-route-content=""');
    expect(source).toContain("<V3ConfirmationPresentation>{children}</V3ConfirmationPresentation>");
    expect(source).not.toContain("<V3AppShell");
    expect(source).not.toContain("Back to Participate");
    expect(source).not.toContain('to="/guide"');
  });

  it("keeps V3 presentation separate from the canonical confirmation engine", () => {
    const source = presentation();
    const css = presentationCss();

    expect(source).toContain('data-v3-confirmation-presentation=""');
    expect(source).toContain('data-v3-confirmation-shared-engine=""');
    expect(source).toContain("Identity");
    expect(source).toContain("Plan");
    expect(source).toContain("Entry");
    expect(source).toContain("Review");
    expect(source).not.toContain('from "@/components/ConfirmationForm"');
    expect(source).not.toContain("submitConfirmation");
    expect(source).not.toContain("saveDraft");
    expect(source).not.toContain("loadDraft");
    expect(css).toContain(".v3-confirmation-engine .animate-rise > .surface");
    expect(css).toContain("var(--v3-surface)");
    expect(css).toContain("@media (max-width: 720px)");
  });

  it("cuts both the round chooser and edit route over through the shared route shell", () => {
    const roundChooser = indexRoute();
    const editor = editRoute();

    expect(roundChooser).toContain('import { V3ConfirmationRouteShell } from "@/components/v3/V3ConfirmationRouteShell"');
    expect(roundChooser).toContain("<V3ConfirmationRouteShell");
    expect(roundChooser).not.toContain("<ParticipationRouteChrome>");
    expect(roundChooser).not.toContain("<ParticipationServiceShell");

    expect(editor).toContain('import { V3ConfirmationRouteShell } from "@/components/v3/V3ConfirmationRouteShell"');
    expect(editor).toContain("<V3ConfirmationRouteShell");
    expect(editor).not.toContain("<ParticipationRouteChrome>");
    expect(editor).not.toContain("<ParticipationServiceShell");
  });

  it("preserves the independently guarded V3 and legacy form implementations", () => {
    const wrapper = receiptWrapper();

    expect(wrapper).toContain("function LegacyConfirmationFlow");
    expect(wrapper).toContain("function V3ConfirmationFlow");
    expect(wrapper).toContain("rollout.data?.confirmationEnabled !== true");
    expect(wrapper).toContain("return <LegacyConfirmationFlow {...props} />;");
    expect(wrapper).toContain("return <V3ConfirmationFlow {...props} />;");
  });

  it("reuses the active route probe instead of racing it from nested confirmation consumers", () => {
    const runtime = rolloutRuntime();

    expect(runtime).toContain("useQueryClient");
    expect(runtime).toContain("getObserversCount()");
    expect(runtime).toContain('refetchOnMount: activeProbeObservers > 0 ? false : "always"');
    expect(runtime).toContain("gcTime: 0");
    expect(runtime).toContain("retry: false");
  });

  it("does not introduce hosted Supabase endpoints into the route cutover", () => {
    const combined = [
      shell(),
      presentation(),
      presentationCss(),
      indexRoute(),
      editRoute(),
      receiptWrapper(),
      rolloutRuntime(),
    ].join("\n");

    expect(combined).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);
  });
});
