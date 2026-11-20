import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SolarisMorphingSelection } from "./SolarisMorphingSelection";

const options = [
  { value: "all", label: "All" },
  { value: "actionable", label: "Actionable" },
  { value: "blocked", label: "Blocked" },
  { value: "waiting", label: "Waiting" },
  { value: "failed", label: "Failed" },
  { value: "overdue", label: "Overdue" },
] as const;

describe("SolarisMorphingSelection layouts", () => {
  it("keeps task filters readable without equal-width squeeze", () => {
    const html = renderToStaticMarkup(
      <SolarisMorphingSelection
        value="blocked"
        options={options}
        onChange={() => {}}
        ariaLabel="Task filters"
        layout="scroll"
      />,
    );

    expect(html).toContain('data-solaris-morphing-layout="scroll"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("whitespace-nowrap");
    expect(html).not.toContain("grid-template-columns:");
    expect(html).not.toContain("pointer-events-none absolute inset-y-1");
  });

  it("preserves the default equal-width selection for other consumers", () => {
    const html = renderToStaticMarkup(
      <SolarisMorphingSelection
        value="all"
        options={options.slice(0, 2)}
        onChange={() => {}}
        ariaLabel="Views"
      />,
    );

    expect(html).toContain('data-solaris-morphing-layout="equal"');
    expect(html).toContain("grid-template-columns:");
    expect(html).toContain("pointer-events-none absolute inset-y-1");
  });
});
