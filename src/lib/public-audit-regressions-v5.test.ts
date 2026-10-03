import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("public audit regressions after Organisation OS V5 hardening", () => {
  it("keeps account text actions large enough to be real touch targets", () => {
    const auth = source("src/routes/auth/index.tsx");
    expect(auth).toContain(
      'className="mt-3 inline-flex min-h-10 w-full items-center justify-center',
    );
    expect(auth).toContain(
      'className="mt-4 inline-flex min-h-10 w-full items-center justify-center',
    );
  });

  it("keeps Rules search controls named and physically tappable", () => {
    const home = source("src/components/rules/RulesHomeV5.tsx");
    const search = source("src/routes/rules/search.tsx");
    expect(home).toContain('"min-h-10 min-w-0 flex-1');
    expect(home).toContain(
      'className="inline-flex min-h-8 items-center font-semibold text-primary"',
    );
    expect(search).toContain('aria-label="Search rules"');
    expect(search).toContain(
      'className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"',
    );
  });

  it("keeps Result Lab range interaction at a full target height", () => {
    const lab = source("src/routes/result-lab/index.tsx");
    expect(lab).toContain(
      'className="mt-4 block h-10 w-full min-w-0 cursor-pointer"',
    );
  });

  it("keeps rule detail inside AppShell's single main landmark", () => {
    const detail = source("src/components/rules/RuleDetailV5.tsx");
    const route = source("src/routes/rules/$ruleId.tsx");
    expect(detail).not.toContain('<main className="min-w-0 space-y-7">');
    expect(detail).toContain('<div className="min-w-0 space-y-7">');
    expect(route).not.toContain(
      'import { RuleInterpretationsPanel } from "@/components/rules/RuleInterpretationsPanel";',
    );
    expect(route.match(/<RuleDetailV5 rule=\{rule\} \/>/g)).toHaveLength(1);
  });

  it("gives the installed Countries directory one screen-level H1", () => {
    const primitives = source("src/components/app/AppPrimitives.tsx");
    const countries = source("src/routes/countries/index.tsx");
    expect(primitives).toContain('const Heading = headingLevel === 1 ? "h1" : "h2"');
    expect(countries).toContain("headingLevel={1}");
  });
});
