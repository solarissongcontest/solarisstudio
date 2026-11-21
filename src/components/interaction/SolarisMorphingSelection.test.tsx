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
  it("positions the marker from the logical start for either reading direction", () => {
    const html = renderToStaticMarkup(<SolarisMorphingSelection value="blocked"
      options={options} onChange={() => {}} ariaLabel="Views" />);
    expect(html).toContain("inset-inline-start:calc(.25rem + 2 * (100% - .5rem) / 6)");
    expect(html).not.toContain("translateX");
  });
  it.each(["missing", "disabled"])("does not mark an unavailable selection (%s)", (value) => {
    const html = renderToStaticMarkup(<SolarisMorphingSelection value={value}
      options={[{ value: "disabled", label: "Disabled", disabled: true }, ...options]}
      onChange={() => {}} ariaLabel="Views" />);
    expect(html).not.toContain("pointer-events-none absolute inset-y-1");
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });
  it("exposes one tab stop, falling back safely when selection is unavailable", () => {
    for (const value of ["blocked", "missing", "disabled"]) {
      const html = renderToStaticMarkup(
        <SolarisMorphingSelection value={value} options={[
          { value: "disabled", label: "Disabled", disabled: true }, ...options,
        ]} onChange={() => {}} ariaLabel="Task filters" />,
      );
      expect(html.match(/tabindex="0"/g)).toHaveLength(1);
      expect(html).toContain('tabindex="-1" disabled=""');
      expect(html).toContain("min-h-11");
    }
  });
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
