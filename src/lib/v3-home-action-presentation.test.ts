import { describe, expect, it } from "vitest";
import { homeActionRequirementLabel, homeActionTone, homeCalmPresentation } from "./v3-home-action-presentation";

describe("V3 Home attention semantics", () => {
  it("keeps optional and recommended actions non-mandatory when not urgent", () => {
    expect(homeActionTone({
      sourceState: "available", urgency: "low", deliveryClass: "optional",
    })).toBe("neutral");
    expect(homeActionTone({
      sourceState: "available", urgency: "medium", deliveryClass: "recommended",
    })).toBe("neutral");
    expect(homeActionTone({
      sourceState: "available", urgency: "low", deliveryClass: "required",
    })).toBe("required");
  });

  it("can present an urgent optional vote without turning it into a requirement", () => {
    expect(homeActionTone({
      sourceState: "available", urgency: "immediate", deliveryClass: "optional",
    })).toBe("urgent");
    expect(homeActionRequirementLabel("optional")).toBe("Optional");
    expect(homeActionRequirementLabel("recommended")).toBe("Recommended");
    expect(homeActionRequirementLabel("required")).toBe("Required");
  });

  it("does not treat an anonymous visitor's empty task list as personal completion", () => {
    expect(homeCalmPresentation(null)).toEqual({
      title: "Discover what's happening in Solaris",
      showSignIn: true,
    });
    expect(homeCalmPresentation("verified-viewer")).toEqual({
      title: "You're all caught up",
      showSignIn: false,
    });
  });

  it("reserves problem treatment for a canonical problem state", () => {
    expect(homeActionTone({
      sourceState: "problem", urgency: "none", deliveryClass: "optional",
    })).toBe("problem");
  });
});
