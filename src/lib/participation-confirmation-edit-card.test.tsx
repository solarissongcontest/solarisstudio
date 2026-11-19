import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mock = vi.hoisted(() => ({ actor: "country-account", state: "open" as "open" | "closed" | "error" }));

vi.mock("@/lib/confirmation-country-account", () => ({
  createCountryAccountConfirmationEditToken: vi.fn(),
}));
vi.mock("@/lib/participation-confirmation-edit", () => ({
  useParticipationConfirmationEdit: () => ({
    actor: mock.actor,
    query: {
      isPending: false,
      isError: mock.state === "error",
      data: mock.state === "open"
        ? { status: "open", roundId: "round-22", countryName: "Oland", editionName: "SSC 22", changesRequested: false }
        : { status: "closed", roundId: null },
      refetch: vi.fn(),
    },
  }),
}));

import { ParticipationConfirmationEdit } from "@/components/public/ParticipationConfirmationEdit";

function html() {
  return renderToStaticMarkup(createElement(ParticipationConfirmationEdit));
}

describe("Participate existing Confirmation edit action", () => {
  it("surfaces the actual editable response and a functional edit control", () => {
    mock.actor = "country-account";
    mock.state = "open";
    expect(html()).toContain('data-participate-confirmation-edit="open"');
    expect(html()).toContain("Continue editing your confirmation");
    expect(html()).toContain("Edit confirmation");
    expect(html()).toContain("Oland");
    expect(html()).toContain("SSC 22");
    const code = readFileSync("src/components/public/ParticipationConfirmationEdit.tsx", "utf8");
    expect(code).toContain("createCountryAccountConfirmationEditToken(edit.roundId)");
    expect(code).toContain("encodeURIComponent(result.token)");
    expect(code).toContain("window.location.assign");
    expect(code).toContain('key={actor}');
    expect(code).toContain('data-participate-confirmation-edit="closed"');
    expect(code).toContain('Confirmation editing is no longer available');
    expect(code).not.toContain('window.location.assign("/confirmations")');
  });

  it("does not reveal an editor when editing is closed", () => {
    mock.actor = "country-account";
    mock.state = "closed";
    expect(html()).toBe("");
  });

  it("states uncertainty rather than advertising closed or open on an RPC error", () => {
    mock.actor = "country-account";
    mock.state = "error";
    const page = html();
    expect(page).toContain('data-participate-confirmation-edit="unknown"');
    expect(page).toContain("cannot determine whether editing is open");
    expect(page).toContain("Retry");
    expect(page).not.toContain("Edit confirmation");
  });

  it("does not fetch or reveal private editor state to signed-out visitors", () => {
    mock.actor = "";
    mock.state = "open";
    expect(html()).toBe("");
  });

  it("is mounted above the personal responsibility list in both V3 and legacy Participate", () => {
    for (const path of ["src/routes/participate/index.tsx", "src/components/v3/V3ParticipateScreen.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("<ParticipationConfirmationEdit />");
      expect(source.indexOf("<ParticipationConfirmationEdit />")).toBeLessThan(
        source.indexOf("<ParticipationServiceDirectory />"),
      );
    }
  });
});
