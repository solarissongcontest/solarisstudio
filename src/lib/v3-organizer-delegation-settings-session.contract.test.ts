import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settings = readFileSync("src/routes/confirmations/admin/settings.tsx", "utf8");
const session = readFileSync("src/lib/account-session.ts", "utf8");

describe("Organizer delegation settings use canonical Solaris session exit", () => {
  it("signs out through the shared account authority instead of the legacy Confirmations client", () => {
    expect(settings).toContain('import { signOutSolarisAccount } from "@/lib/account-session"');
    expect(settings).toContain("await signOutSolarisAccount();");
    expect(settings).not.toContain("confirmationsSupabase.auth.signOut()");
    expect(session).toContain("if (error) throw error;");
  });

  it("does not claim an ended session or navigate away when sign-out fails", () => {
    expect(settings).toContain("let sessionEnded = false;");
    expect(settings.indexOf("await signOutSolarisAccount();")).toBeLessThan(
      settings.indexOf("sessionEnded = true;"),
    );
    expect(settings.indexOf("sessionEnded = true;")).toBeLessThan(
      settings.indexOf('await navigate({ to: "/auth" });'),
    );
    expect(settings).toContain("Your session may still be active.");
  });

  it("blocks duplicate taps and gives recoverable error feedback", () => {
    expect(settings).toContain("const signOutInFlightRef = useRef(false);");
    expect(settings).toContain("if (signOutInFlightRef.current) return;");
    expect(settings).toContain("signOutInFlightRef.current = false;");
    expect(settings).toContain("disabled={signingOut}");
    expect(settings).toContain("Could not copy the Confirmation link.");
  });
});
