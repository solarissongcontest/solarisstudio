import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const shell = () => read("src/components/v3/V3ConfirmationRouteShell.tsx");
const indexRoute = () => read("src/routes/confirmations/index.tsx");
const editRoute = () => read("src/routes/confirmations/edit/$token.tsx");
const receiptWrapper = () => read("src/components/ConfirmationFormWithReceipt.tsx");

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

  it("uses the canonical V3 app shell instead of nesting the legacy app shell", () => {
    const source = shell();

    expect(source).toContain("<V3AppShell");
    expect(source).toContain("<V3Screen");
    expect(source).toContain('data-v3-confirmation-route-content=""');
    expect(source).toContain('to="/participate"');
    expect(source).toContain('to="/guide"');
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

  it("does not introduce hosted Supabase endpoints into the route cutover", () => {
    const combined = [shell(), indexRoute(), editRoute(), receiptWrapper()].join("\n");

    expect(combined).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);
  });
});
