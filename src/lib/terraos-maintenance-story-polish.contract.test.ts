import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const baseCss = readFileSync("public/assets/terraos-maintenance.css", "utf8");
const polish = readFileSync(
  "public/assets/terraos-maintenance-story-polish.js",
  "utf8",
);
const storyData = readFileSync(
  "src/lib/terraos-maintenance-stories.ts",
  "utf8",
);

describe("TerraOS maintenance Story interaction polish", () => {
  it("loads the small interaction layer after the canonical Story runtime", () => {
    const runtimeIndex = page.indexOf("/assets/terraos-maintenance-story.js");
    const polishIndex = page.indexOf(
      "/assets/terraos-maintenance-story-polish.js",
    );
    expect(runtimeIndex).toBeGreaterThan(-1);
    expect(polishIndex).toBeGreaterThan(runtimeIndex);
  });

  it("keeps the entire Story card tappable even over its fixture preview", () => {
    expect(baseCss).toContain(".terra-preview-frame");
    expect(baseCss).toContain("pointer-events:none");
  });

  it("makes the TerraOS 3 hero brand lockup structurally unbreakable without shrinking away its hero scale", () => {
    expect(polish).toContain("lockHeroWordmarkToSingleLine");
    expect(polish).toContain("title.textContent = 'TerraOS\\u00a03'");
    expect(polish).toContain("title.style.maxWidth = 'none'");
    expect(polish).toContain("title.style.whiteSpace = 'nowrap'");
    expect(polish).toContain("title.style.fontSize = 'clamp(3.35rem, 18vw, 10.5rem)'");
  });

  it("owns the full Confirmation card foreground palette on the dark maintenance surface", () => {
    expect(polish).toContain("installConfirmationContrastStyle");
    expect(polish).toContain("terraos-confirmation-contrast");
    expect(polish).toContain(".hod-portal {");
    expect(polish).toContain(".hod-portal h2");
    expect(polish).toContain(".hod-portal .hod-country");
    expect(polish).toContain(".hod-portal .hod-summary strong");
    expect(polish).toContain(".hod-portal .hod-entry-title");
    expect(polish).toContain("color: #ffffff !important");
    expect(polish).toContain("color: rgba(255, 255, 255, .88) !important");
  });

  it("gives direct Story deep links an intentional accessible focus target", () => {
    expect(polish).toContain("focusDirectDeepLink");
    expect(polish).toContain("[data-story-close]");
    expect(polish).toContain("focus({ preventScroll: true })");
  });

  it("completes the Participate responsibility story without changing workflow authority", () => {
    expect(polish).toContain("enrichParticipateStory");
    expect(polish).toContain("Country confirmed");
    expect(polish).toContain("Entry ready");
    expect(polish).toContain("✓ Complete");
    expect(polish).toContain("data-participate-ready");
    expect(storyData).toContain("No scavenger hunts. Just the next step.");
  });

  it("extends Me into a continuous SSC 19 through SSC 22 fixture timeline", () => {
    expect(polish).toContain("enrichMeStory");
    for (const edition of ["SSC 19", "SSC 20", "SSC 21", "SSC 22"]) {
      expect(polish).toContain(edition);
    }
    expect(polish).toContain("data-me-timeline-ready");
  });

  it("finishes Me with the five-destination system and TerraOS brand lockup", () => {
    expect(storyData).toContain("Five perspectives. One Solaris.");
    expect(polish).toContain("data-me-finale-ready");
    expect(polish).toContain("data-me-brand-finale");
    expect(polish).toContain("TerraOS 3");
    expect(polish).toContain("Solaris, reimagined.");
    expect(polish).toContain("finale.insertBefore(destinations, heading)");
  });

  it("keeps the canonical Results finale", () => {
    expect(storyData).toContain("See what happened. Understand why.");
  });

  it("binds enrichment lazily when the Story layer is first created", () => {
    expect(polish).toContain("MutationObserver");
    expect(polish).toContain("bindLayerEnhancer");
    expect(polish).toContain("attributeFilter: ['data-story']");
    expect(polish).toContain(
      "bodyObserver.observe(document.body, { childList: true })",
    );
  });

  it("uses transform-only FLIP movement for Results perspective reordering", () => {
    expect(polish).toContain("getBoundingClientRect()");
    expect(polish).toContain("translate3d(${deltaX}px, ${deltaY}px, 0)");
    expect(polish).toContain("translate3d(0, 0, 0)");
    expect(polish).toContain("duration: 420");
    expect(polish).toContain("cubic-bezier(.2,.75,.2,1)");
  });

  it("removes reordering motion for Reduced Motion and performs no network IO", () => {
    expect(polish).toContain("prefers-reduced-motion: reduce");
    expect(polish).toContain("reducedMotion.matches");
    expect(polish).not.toContain("fetch(");
    expect(polish).not.toContain("XMLHttpRequest");
    expect(polish).not.toContain("supabase.co");
  });
});
