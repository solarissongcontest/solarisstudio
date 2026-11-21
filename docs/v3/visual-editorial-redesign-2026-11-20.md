# Solaris Studio V3 — Visual & UX Redesign Implementation

**Date:** 20 November 2026  
**Branch:** `feature/v3-visual-ux-redesign-20261120`  
**Status:** IN PROGRESS / DRAFT PR. Not merged, not release certified.

## Scope and intent

Implements a first integrated web-focused wave of the 19 November 2026 Visual & UX Redesign Masterplan. The relevant screenshot review includes ordinary **mobile web** and **desktop web**, plus Organizer and MySolaris. The screenshot audit deliberately excludes the incorrect installed-PWA design baseline. Installed PWA must keep its own separately governed navigation and safe-area geometry.

Design language: **Cinematic / Editorial / Data-driven / Operational**. Fewer nested cards and filler descriptions; visible content, authored artwork, flags, points and real user actions get precedence. Do not invent public content or substitute a fake image for an official flag/artwork.

## Changes in this PR

- A dedicated web-only editorial CSS composition loaded through the root stylesheet order. All V3 presentation rules are scoped to browser mode; Organizer task selector rules are scoped to Admin.
- Home/current contest editorial feature, shorter text and simplified supplementary sections.
- Explore and collection directories: quieter surfaces and more direct labels.
- Countries directory: less dominating scope controls, flag-forward rows, responsive desktop cards.
- Country detail: improved hero scale and content panels while retaining the canonical published Country Design V2 / personality engine and 3:2 flag geometry.
- Edition detail: larger typography, editorial artwork presentation and less intrusive navigation while retaining canonical artwork and release/spoiler controls.
- Shows and reference directories: better filters, clearer information density.
- Results: scoreboard-first spacing, simpler archive selection and related links. Server-authoritative result publications and spoiler boundaries unchanged.
- Records: headline figures and record holders prioritized over explanatory panels; source provenance preserved.
- Wiki: editorial reading width, article typography and more considered directory presentation.
- MySolaris: constrained form controls and more consistent workspace spacing.
- Organizer Tasks: **structural** readable horizontal scrolling for many filters rather than dividing all options into cramped equal-width columns. Default equal-width selector behavior remains available for other consumers.
- Unit tests protect the selector's new opt-in layout and default compatibility.

## Constraints

- This PR must remain **draft and unmerged** until reviewed. Do not enable auto-merge, change main, or deploy.
- Must coexist with active V3 feature work, including PR #2593 (Country/Edition cinematic and Hero Studio) and other active public-navigation changes. Reconcile overlapping implementations during review. Do not cherry-pick or silently replace unrelated PRs.
- This patch does **not** implement the canonical server-authoritative Country Hero Studio upload/publish/rollback workflow. That requires a separately verified full-stack implementation; the visual selectors do not pretend to create storage or publication authority.
- No changes to backend schema, RLS, Supabase, publication switches, data provenance, score computation, show lifecycle, roles or permissions.
- Never run CI, E2E, Playwright, screenshot capture or automated builds against hosted/production Supabase. Only use local loopback Supabase or truly isolated fixtures; fail closed when local backend is unavailable.
- Keep release gating and spoilers protected, even during visual validation.

## Validation needed before release

1. Typecheck, lint and unit tests in isolated CI.
2. Mobile-web 320, 390, 430 and 768 px and desktop 1024, 1440 px layout checks using **local fixture data only**.
3. Countries, Edition, Shows, Results, Records, Wiki, MySolaris and Organizer Tasks, including normal, empty, loading, error, locked and published states.
4. Verify flag 3:2 shape, media-fallback state, proper results disclosure and minimum 44 px target sizing.
5. Verify installed-app PWA chrome/safe areas are not affected by web-only styling.
6. Contrast, focus, keyboard, reduced-motion, long translations and long country names.
7. Rebase/merge-conflict audit against current main and active domain design PRs **before any future merge**, not automatically here.

## Remaining work

The 19 November full masterplan includes further page-by-page **structural** recompositions, full Country/Edition Hero Studio publishing, contextual Story/Archive/World designs, comprehensive MySolaris history editor restructuring, deeper Organizer workflow layouts, and cross-persona browser certification. Those requirements are **not** claimed complete by this first integrated patch. Keep everything within the owner-requested single review PR as implementation progresses, and do not present partial polish as release-ready.
