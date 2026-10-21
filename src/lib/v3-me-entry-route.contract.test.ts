import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/routes/me/index.tsx"), "utf8");

describe("Public V3 Me entry-route ownership", () => {
  it("brands the user-facing destination as Me rather than legacy MySolaris", () => {
    const route = source();

    expect(route).toContain('title: "Me — Solaris Studio"');
    expect(route).toContain('title="Me"');
    expect(route).toContain('id="app-me-sign-in">Me</h2>');
    expect(route).not.toContain('title="MySolaris"');
    expect(route).not.toContain("Sign in to open MySolaris");
  });

  it("keeps responsibilities in Participate and personal state in Me", () => {
    const route = source();

    expect(route).toContain("Current responsibilities live in Participate.");
    expect(route).toContain(
      "Your identity, history, saved content, preferences and account live here after sign-in.",
    );
    expect(route).not.toContain("Open your country, tasks, participation tools");
  });

  it("preserves the compatibility redirect while the authenticated V3 Me root still lives there", () => {
    const route = source();

    expect(route).toContain('navigate({ to: "/my-solaris", replace: true })');
    expect(route).toContain('search={{ redirect: "/my-solaris" }}');
  });
});
