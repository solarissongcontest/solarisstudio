# V3 Navigation & Viewport: single authoritative implementation source

This is the **only active navigation and safe-area design specification**. It combines the exact-domain instructions previously maintained in two separate sources. The canonical Public app destinations are Home / Explore / Participate / Results / Me, and Organizer uses Overview / Tasks / Control / Live / More. Platform-safe and accessibility protections always override visual imitation. No mobile browser should get the installed-PWA tab bar solely due to viewport width.

## Part 1. Floating bottom navigation and gestures

Solaris Studio App V3

Instagram-Parity Liquid Tab Navigation System

Canonical Visual · Interaction · Routing · Gesture · Accessibility · Performance · Testing · Release Specification


⸻


STATUS OF THIS SPECIFICATION

This document is an implementation-ready Solaris Studio V3 navigation specification.

It supplements:

1. Solaris Studio App V3 — Canonical Product Blueprint
2. Complete Public, Fan & Participant Implementation Specification
3. Organizer Operational System Implementation Specification
4. System Integrity, Integration, Reliability & Final Release Specification

This specification is authoritative where it is more specific about:

* mobile bottom-navigation appearance
* Instagram visual parity
* Liquid Glass material
* tab-selection lens geometry
* expanded/minimized navigation states
* direct manipulation
* tab dragging
* whole-page tab swiping
* navigation physics
* gesture arbitration
* per-tab route memory
* accessibility of enhanced navigation
* navigation performance
* visual-regression protection
* release acceptance for the navigation system

It does not replace the canonical V3 information architecture, domain ownership, permissions, server state, submission integrity, Organizer risk model or production-safety requirements.

If this specification conflicts with:

* canonical domain truth
* production safety
* security
* accessibility
* consequential workflow integrity

those requirements win.

The required public top-level areas remain:

Home · Explore · Participate · Results · Me

The required Organizer top-level areas remain:

Overview · Tasks · Control · Live · More


⸻


PART I

PRODUCT TARGET


1. THE EXACT TARGET

The Solaris Studio V3 mobile bottom navigation must intentionally reproduce the current Instagram iPhone floating Liquid-Glass navigation treatment as closely as practical in visible geometry and interaction.

The target is:

CURRENT INSTAGRAM IPHONE FLOATING TAB BAR
+
SOLARIS SYMBOLS AND DESTINATIONS
+
SLIGHTLY MORE APPLE-LIKE LIQUID GLASS MATERIAL

This is stronger than:

* Instagram-inspired
* Instagram-like
* social-app style
* similar floating navigation
* modern glass tab bar

Those descriptions are insufficient.

The first-glance reaction should be:

“That is the Instagram-style bottom bar, but it belongs to Solaris Studio.”

The only intentional visual departures are:

1. Solaris uses Solaris destinations and symbols.
2. Solaris uses a slightly more Apple-like interpretation of the glass material.

Everything else should pursue measurable visual and interaction parity.


⸻


2. WHAT “EXACTLY THE SAME” MEANS

“Exactly the same” in this specification means observable parity, not copying Meta’s private implementation.

Solaris should match the approved Instagram reference in:

* overall silhouette
* pill geometry
* screen placement
* horizontal inset
* safe-area relationship
* resting height
* compact/minimized height
* tab spacing
* icon optical size
* icon center positions
* selected-item treatment
* selected-lens dimensions
* selected-lens corner curvature
* selected-lens relation to shell
* selected/unselected icon emphasis
* scroll minimization morphology
* press response
* drag response
* lens movement
* directional stretch
* page-swipe synchronization
* release continuation
* perceived spring feel
* visual density
* shadow extent
* content-under-glass relationship

Solaris does not claim to use:

* Instagram source code
* Instagram private shader code
* Instagram proprietary spring constants
* Meta private implementation details

The internal implementation may differ.

The visible result is what must match.


⸻


3. ONLY TWO INTENTIONAL DIFFERENCES

Difference A — symbols and content

Instagram symbols are replaced by Solaris destinations:

Home
Explore
Participate
Results
Me

Organizer mode uses:

Overview
Tasks
Control
Live
More

Solaris symbols must still match the reference icon system in:

* optical footprint
* line-weight family
* visual balance
* center alignment
* selected/unselected emphasis
* spacing

Difference B — slightly more Apple-like glass

Solaris may use:

* slightly stronger real refraction
* slightly clearer edge specular highlights
* slightly more convincing material depth
* more adaptive luminance
* slightly more physical lens deformation
* better light/dark adaptation

Apple changes the material.

Apple does not change the geometry.


⸻


4. WHAT MUST NOT BE “IMPROVED” AWAY

Developers and designers must not change the following merely to make the bar more “Solaris”:

* pill proportions
* horizontal inset
* icon distribution
* selected-lens proportions
* general visual density
* floating placement
* compact-state morphology
* icon-only appearance
* interaction choreography

Solaris identity comes from:

* Solaris symbols
* Solaris content
* Solaris context
* Solaris accent contamination
* slightly richer Liquid Glass

not from redesigning the reference geometry.


⸻


PART II

REFERENCE BASELINE


5. FREEZE ONE INSTAGRAM REFERENCE

Instagram uses staged rollout and A/B testing.

Therefore implementation must not target an undefined concept called “Instagram’s nav.”

Before final geometry tuning, create one approved reference-baseline package for the current iPhone floating translucent navigation variant.

Record:

* capture date
* Instagram app version where available
* iOS version
* iPhone model or CSS viewport equivalent
* display scale where relevant
* light/dark appearance
* selected first tab
* selected middle tab
* selected last tab
* resting expanded state
* compact/minimized state
* pressed state
* drag state where reproducible
* page-swipe state where reproducible

That package becomes the visual reference for the V3 release.

Instagram changing after the baseline is frozen must not silently change Solaris during that release cycle.


⸻


6. REFERENCE STATES

Minimum approved visual reference set:

A. Expanded / resting
B. Minimized / scrolled
C. First item selected
D. Middle item selected
E. Last item selected
F. Pressed item
G. Lens moving between two items
H. Dark appearance
I. Light appearance
J. High-detail content passing beneath glass

If real-device evidence is available for full page-swipe choreography, include:

K. 25% page transition
L. 50% page transition
M. 75% page transition
N. cancelled release
O. committed release


⸻


7. REFERENCE OWNERSHIP

The frozen Instagram reference owns:

* visible geometry
* visual density
* interaction choreography
* minimization morphology
* selected-state composition

The Solaris V3 design system owns:

* accessibility
* semantic structure
* safe-area correctness
* reduced-motion alternatives
* reduced-transparency alternatives
* exact Solaris symbols
* production reliability
* route semantics
* data/state integrity


⸻


PART III

VISUAL PARITY CONTRACT


8. SHELL SILHOUETTE

The bottom navigation shell must match the approved Instagram reference as closely as practical.

Match:

* aspect ratio
* overall width
* overall height
* edge curvature
* floating gap from viewport/safe-area edge
* amount of content visible around it
* visual weight

Do not create:

* a taller card
* a shorter chip
* a full-width iOS stock tab bar
* a thick toolbar
* a desktop-looking dock


⸻


9. HORIZONTAL PLACEMENT

The bar must occupy approximately the same horizontal proportion of the viewport as the reference.

Implementation must derive:

* left inset
* right inset
* maximum width
* narrow-device fallback

from the approved reference geometry.

The bar must remain visually centered.


⸻


10. VERTICAL PLACEMENT

The bar floats above:

* safe area
* home indicator
* browser/PWA bottom edge

Match the reference visual gap after safe-area adjustment.

Do not:

* attach the bar directly to the screen edge
* float it excessively high
* let it collide with the home indicator
* let visualViewport keyboard changes place it halfway up a form


⸻


11. ICON-ONLY DEFAULT

Normal mobile navigation is icon-first and visually icon-only when the approved Instagram reference uses icon-only navigation.

Visible labels should not be present by default.

Every destination must still expose:

* accessible name
* aria-label
* semantic link text for assistive technology
* VoiceOver/screen-reader meaning

A visible-label fallback is permitted only if real usability/accessibility validation demonstrates that Solaris’s symbols are not understandable enough without labels.

That must be documented as an exception.

Developer preference is not evidence.


⸻


12. ICON OPTICAL PARITY

Solaris icons should occupy the same perceived visual footprint as the reference icons.

Normalize by optical size, not raw SVG viewBox dimensions.

Match:

* apparent height
* apparent width
* stroke family
* baseline
* center
* selected emphasis
* inactive emphasis

The five slots remain evenly distributed unless the frozen reference demonstrates otherwise.


⸻


13. SELECTED LENS

The selected item receives the local liquid/glass lens treatment.

Match the reference in:

* resting width
* resting height
* curvature
* placement around symbol
* internal inset
* distance from shell edges
* optical thickness
* relationship to active icon

Do not make the lens:

* a giant bubble
* a text pill
* a circular FAB
* a full-height slab
* a saturated coloured button


⸻


14. INACTIVE ITEMS

Inactive icons remain visually quieter.

Match the reference hierarchy through:

* opacity
* stroke weight
* material contrast
* scale where appropriate

Do not make every icon equally dominant.


⸻


15. BADGES

Solaris badges remain anchored to the relevant symbol.

Badges:

* do not change tab width
* do not stretch with the lens
* do not change shell geometry
* do not shift icon centers

Badge treatment should remain restrained enough not to destroy reference parity.


⸻


16. SHADOW AND ELEVATION

Match the reference’s floating separation from content.

Do not exaggerate elevation.

Avoid:

* deep black card shadow
* giant halo
* neon glow
* hard outline

The material should appear suspended, not sticker-like.


⸻


PART IV

APPLE-LIKE MATERIAL OVERRIDE


17. APPLE AFFECTS MATERIAL, NOT SHAPE

The more Apple-like requirement applies to:

* refraction
* translucency
* highlight
* material thickness
* adaptive contrast
* subtle light response

It does not justify changing:

* shell width
* shell height
* radii
* icon positions
* selected-lens dimensions
* minimized proportions


⸻


18. MATERIAL STACK

Preferred visual stack:

content behind
→ backdrop sampling
→ refraction/distortion
→ translucent neutral tint
→ adaptive luminance/contrast
→ fine edge highlight
→ local selected lens
→ icons

The bar must still read as the Instagram composition.


⸻


19. REFRACTION

Use the existing V3/Kube liquid-glass infrastructure where practical.

Refraction should:

* respond to underlying content
* remain visually stable during scroll
* remain bounded to navigation geometry
* avoid excessive distortion behind icons
* avoid making text below unreadable

More Apple-like means more physically convincing, not more dramatic.


⸻


20. ADAPTIVE TINT

Glass tint may respond subtly to:

* light/dark appearance
* underlying content luminance
* edition accent

Edition colour contamination must remain subtle.

The bar must not turn into a brightly coloured contest-themed capsule.


⸻


21. EDGE HIGHLIGHT

Use restrained optical highlights that suggest material thickness.

Do not draw obvious white borders around the whole bar.

The highlight should feel like light interacting with glass rather than CSS decoration.


⸻


22. REDUCED TRANSPARENCY

With Reduced Transparency:

* replace heavy refraction with a more opaque raised surface
* preserve geometry
* preserve icon hierarchy
* preserve selected lens
* preserve all navigation semantics

The fallback should still resemble the same object.


⸻


PART V

EXPANDED AND MINIMIZED STATES


23. EXPANDED STATE

At rest or near the top of content:

* use the reference resting geometry
* show full visual spacing
* use normal icon distribution
* use full shell height
* retain comfortable touch targets


⸻


24. MINIMIZED STATE

During sustained downward scroll:

reproduce the approved Instagram compact/retracted morphology.

Match:

* apparent reduction
* density change
* width/height relationship
* return behaviour
* selected-state visibility

Do not merely apply:

transform: scale(...)

to the entire bar if that:

* shrinks hit targets
* blurs icons
* distorts safe-area placement
* changes glass quality
* breaks reference proportions


⸻


25. HYSTERESIS

Compaction must use intent, not scroll noise.

Expand after a shorter upward intent.

Collapse after meaningful sustained downward movement.

Near top:

expanded wins.

Tiny oscillations:

no state change.


⸻


PART VI

PRESS AND DIRECT TAB INTERACTION


26. PRESS RESPONSE

Initial visual response should be effectively immediate.

Target family:

approximately 80–120 ms.

Press may produce:

* small local compression
* material thickening
* subtle icon response
* light haptic where supported

Do not animate the whole bar aggressively.


⸻


27. DIRECT LENS DRAG

Users may directly drag the selected lens across the tab bar when the enhanced interaction is enabled.

During drag:

* lens follows pointer
* leading edge stretches toward direction
* trailing edge lags subtly
* icon emphasis interpolates
* edge resistance occurs at first/last destination
* tab hit geometry remains stable


⸻


28. EDGE RUBBER BAND

At Home and Me boundaries:

attempted outward drag gets resisted nonlinearly.

The lens may overshoot visually by a small bounded amount.

The page must not reveal nonexistent sixth destinations.


⸻


29. RELEASE

Release target uses:

* displacement
* velocity
* direction
* boundary constraints

Fast flick:

may commit with less displacement.

Slow drag:

requires more deliberate travel.

Release velocity must not be thrown away.


⸻


PART VII

WHOLE-PAGE INSTAGRAM-STYLE TAB SWIPE


30. REQUIRED EXPERIENCE

The complete V3 navigation must support the Instagram-style top-level page gesture.

The intended sequence:

finger drags horizontally
→ current page follows finger
→ adjacent page appears continuously
→ selected lens moves with exactly the same progress
→ icon emphasis interpolates
→ release velocity determines destination
→ page and lens settle together
→ canonical route becomes target
→ previous tab retains valid state

This is a required final V3 navigation capability, not an optional decorative idea.


⸻


31. SHARED NAVIGATION PROGRESS

Use one continuous navigation-progress value.

Public:

0 = Home
1 = Explore
2 = Participate
3 = Results
4 = Me

Example:

1.42

means:

42% from Explore toward Participate.

The same value drives:

* page position
* selected-lens center
* lens deformation
* icon emphasis
* label/accessibility state where applicable
* release target calculation


⸻


32. NO SEPARATE ANIMATIONS

Do not create:

pageProgress
lensProgress
iconProgress
routeProgress

that independently chase one another.

One interaction owns the motion.

All optical layers derive from it.


⸻


33. CURRENT / PREVIOUS / NEXT COMPOSITION

During eligible navigation, render at most:

previous
current
next

visual surfaces.

Do not permanently mount all five top-level applications.


⸻


34. NO SCREENSHOT FAKE

Do not slide screenshots of pages.

Use live DOM surfaces.

Screenshot transitions would break:

* accessibility
* dynamic content
* focus
* device scaling
* interactivity
* fidelity


⸻


35. PAGE POSITION

Conceptually:

offsetX =
  -(visualProgress - canonicalIndex) × viewportWidth

Finger-owned motion should be direct.

No spring runs while the finger is actively dragging.


⸻


36. RELEASE SPRING

After release:

* preserve release velocity
* select target
* settle page
* settle lens
* settle icons

All share:

* direction
* destination
* release event

Different optical layers may use slightly different spring tuning only if they remain perceptually synchronized.


⸻


37. CANCEL

If target threshold is not met:

* canonical route remains unchanged
* page returns
* lens returns
* no history entry is created
* temporary adjacent preview is released after settle


⸻


38. COMMIT

If target wins:

* establish target immediately
* commit router navigation promptly
* visually continue the same transition
* do not trigger a second page animation
* preserve previous tab memory
* restore target tab memory


⸻


PART VIII

GESTURE ARBITRATION


39. FAIL CLOSED

Whole-page swipe starts only when it is safe.

If ownership is uncertain:

content wins.


⸻


40. DO NOT STEAL VERTICAL SCROLL

Initial pointer movement remains undecided.

Suggested classifier starting point:

movement < ~7 px:
undecided

abs(dx) > abs(dy) × ~1.25:
horizontal navigation candidate

abs(dy) > abs(dx) × ~1.25:
vertical scroll wins

Exact constants are tuned on device.


⸻


41. NESTED HORIZONTAL CONTENT WINS

Examples:

* results tables
* charts
* carousels* timeline rails
* media rails
* sortable rows
* sliders
* horizontal chips
* organizer monitoring tables

Global tab swipe does not steal those gestures.


⸻


42. IOS BACK EDGE WINS

Do not capture the native iOS leading-edge back gesture.

Reserve an exclusion zone near the system back edge.

Tune on actual iPhones.


⸻


43. ROUTE SWIPE POLICY

Every screen resolves:

enabled
content-priority
disabled
critical-flow

Critical workflow routes should generally disable global swipe.


⸻


44. PUBLIC DEFAULT POLICY

Home:
enabled

Explore root:
enabled

Explore complex horizontal detail:
content-priority

Participate root:
enabled

Jury/televote/submission forms:
critical-flow

Results root:
enabled

Results complex visualization:
content-priority

Me root:
enabled

Settings/forms:
content-priority


⸻


45. ORGANIZER DEFAULT POLICY

Overview:
enabled

Tasks:
enabled

Control:
content-priority

Live:
content-priority or disabled during consequential operations

More:
enabled

Review/decision workflows:
critical-flow


⸻


PART IX

ROUTING AND TAB MEMORY


46. ROUTES REMAIN CANONICAL

The selected tab derives from canonical route ownership.

Visual drag progress is temporary.

Never treat a half-swiped page as a canonical route.


⸻


47. PER-TAB MEMORY

Each top-level area remembers its last valid internal location where appropriate.

Example:

Explore
/editions/22/countries/oland

Results
/results/22/final

Me
/me/notifications

Switching away and returning should restore that internal location when valid.


⸻


48. DEEP LINKS WIN

Opening:

/results/22/final

activates Results immediately.

Do not animate through Home → Explore → Participate → Results.


⸻


49. BACK REMAINS REAL HISTORY

Browser/PWA Back follows actual navigation history.

Back does not mean “one tab to the left.”


⸻


50. SCROLL RESTORATION

Returning to a remembered top-level tab should restore:

* route
* valid filters
* scroll position

according to existing route contracts.


⸻


PART X

ACCESSIBILITY


51. SWIPE IS NEVER REQUIRED

Every destination remains available through:

* semantic links
* tap
* keyboard
* screen reader
* direct URL
* browser history


⸻


52. REDUCED MOTION

With Reduced Motion:

disable or greatly simplify:

* whole-page large translation
* elastic page overshoot
* lens stretch
* large scale effects

Use:

* instant selection
* small opacity/colour transition
* normal semantic navigation

Information remains identical.


⸻


53. SCREEN READERS

Only the active canonical page participates normally in accessibility traversal.

Adjacent visual preview surfaces must be:

inert
and/or
aria-hidden

until committed.


⸻


54. FOCUS

Focus cannot remain inside an offscreen retained page.

After commit:

move focus according to route/navigation semantics.


⸻


55. TARGET SIZE

Primary interaction areas remain at least approximately:

44 × 44 CSS px

even if the visible icon is much smaller.


⸻


56. LARGE TEXT

Because the normal reference appearance is icon-only, text scaling must not distort bar geometry.

Accessible names remain available regardless of visible labels.


⸻


PART XI

PERFORMANCE


57. FRAME TARGET

Navigation should remain smooth on realistic iPhones.

Target:

60 fps minimum
120 Hz-friendly where hardware/browser permits


⸻


58. HOT GESTURE LOOP

Do not trigger full React rerenders on every pointer pixel.

Prefer:

* refs
* CSS custom properties
* requestAnimationFrame
* compositor transforms
* motion values

React handles semantic state changes.


⸻


59. PRE-MEASURE

Measure required geometry at gesture start.

Avoid repeated layout reads on every pointer event.


⸻


60. GLASS BUDGET

The navigation material is the dominant glass effect.

Do not combine:

* huge blur
* several glows
* animated gradients
* multiple backdrop filters
* heavy coloured shadows

More optical complexity does not equal better Liquid Glass.


⸻


61. QUALITY DEGRADATION

If performance is insufficient:

degrade optical richness before interaction correctness.

Tier A:
full refraction + deformation

Tier B:
blur + highlights + deformation

Tier C:
opaque/raised material + correct navigation


⸻


PART XII

DATA AND SUPABASE SAFETY


62. NO NAVIGATION STATE IN SUPABASE

Do not store:

* pointer positions
* visualProgress
* animation state
* lens geometry

in the database.

This is client interaction state.


⸻


63. ADJACENT PREVIEW MUST NOT CAUSE EGRESS EXPLOSION

Do not:

* mount five realtime subscriptions
* fetch all tabs on every gesture
* reload large archives
* duplicate queries
* prefetch huge results matrices merely because a user moved 8 pixels horizontally


⸻


64. AUTOMATED TESTING MUST NEVER USE PRODUCTION SUPABASE

Permanent rule:

CI
Playwright
Browser Audit
screenshots
QA
migration rehearsal

must use isolated/local infrastructure.

If local Supabase is unavailable:

fail closed.

Never fall back to production.


⸻


PART XIII

VISUAL MEASUREMENT


65. REFERENCE GEOMETRY TOKENS

Derive a documented token set from the approved Instagram baseline.

At minimum:

shellWidth
shellMaxWidth
shellHeightExpanded
shellHeightCompact
horizontalInset
bottomInset
shellRadius
slotWidth
iconOpticalSize
iconCenterX[]
lensWidth
lensHeight
lensRadius
lensOvershootMax
compactWidth
compactHeight
shadowSpreadBudget


⸻


66. STARTING TOLERANCES

Target approximately:

major shell dimensions:
within 2–4 CSS px on reference viewport

icon centers:
within 2 CSS px

selected-lens center:
within 2 CSS px

overall proportion:
within roughly 3%

safe-area visual placement:
within 2–4 CSS px after platform adjustment

These are starting engineering tolerances.

If a mismatch is obviously visible despite satisfying numeric tolerance:

visual review wins.


⸻


67. FIRST-GLANCE TEST

A reviewer who knows the approved Instagram reference should not immediately notice differences in:

* shell silhouette
* spacing
* proportions
* selected-lens placement
* compact morphology

before noticing the Solaris symbols.

If geometry is the first obvious difference:

parity failed.


⸻


PART XIV

TESTING


68. PURE PHYSICS TESTS

Test:

* velocity projection
* slow drag
* fast flick
* rubber-band edges
* progress clamping
* cancel
* commit
* RTL
* interruption
* reduced-motion path


⸻


69. GESTURE OWNERSHIP TESTS

Test:

vertical scroll → content wins

nested horizontal scroller → child wins

critical workflow → global swipe disabled

iOS edge gesture → global swipe disabled

valid horizontal gesture → navigation wins

modal → modal wins


⸻


70. ROUTE MEMORY TESTS

Verify:

Explore detail → Results → Explore restores detail

Results edition → Me → Results restores edition

deep link → correct tab active immediately

reload → selected destination matches route

PWA resume → valid state restored

Back → actual history restored


⸻


71. ACCESSIBILITY TESTS

Verify:

* one navigation landmark
* correct aria-current
* every tab has accessible name
* inactive previews hidden from accessibility tree
* keyboard navigation works
* focus never remains offscreen
* 44×44 targets
* Reduced Motion
* Reduced Transparency


⸻


72. GLASS GEOMETRY REGRESSION TESTS

Explicitly prevent the historic giant-glass-slab defect.

Assert:

* shell remains in lower expected viewport region
* backdrop matches shell dimensions
* lens remains bounded
* compact height < expanded height
* compact width ≤ expanded width where reference requires
* no full-screen translucent rectangle
* no horizontal document overflow


⸻


73. SCREENSHOT GOLDENS

Maintain a small intentional Solaris golden set:

1. standard iPhone · light · first tab · expanded
2. standard iPhone · dark · middle tab · expanded
3. standard iPhone · light · last tab
4. standard iPhone · compact
5. narrow iPhone
6. controlled lens drag
7. page swipe at 50%
8. Reduced Transparency


⸻


74. INSTAGRAM PARITY REVIEW

Automated CI compares Solaris against Solaris golden images.

Final release certification also requires human side-by-side review against the frozen Instagram reference.

This review explicitly scores:

* shell geometry
* screen placement
* icon spacing
* icon size
* lens geometry
* compact geometry
* press appearance
* drag appearance
* page-swipe choreography
* overall first-glance similarity


⸻


75. REAL DEVICE TESTING

At minimum test on real iPhone hardware for:

* Safari
* installed PWA
* safe area
* home indicator
* browser chrome changes
* iOS back gesture
* keyboard
* 60/120 Hz feel
* touch latency
* haptics
* compact scrolling
* accidental swipe rate


⸻


PART XV

IMPLEMENTATION PHASES


76. N0 — FREEZE REFERENCE

Capture and approve the Instagram baseline.

Document geometry tokens.

No speculative implementation before the reference is fixed.


⸻


77. N1 — CURRENT BAR GEOMETRY PARITY

Starting from the existing V3 Liquid Tab Bar:

match:

* shell proportions
* placement
* icon-only composition
* icon centers
* selected-lens size
* resting appearance

Do not add whole-page swipe yet.


⸻


78. N2 — MATERIAL PARITY + APPLE OVERRIDE

Tune:

* refraction
* transparency
* highlights
* tint
* shadow
* light/dark adaptation

Preserve Instagram geometry.


⸻


79. N3 — COMPACT STATE PARITY

Match Instagram’s minimized/retracted scroll state.

Add geometry and screenshot regression protection.


⸻


80. N4 — SHARED VISUAL PROGRESS

Refactor selected lens and icons to accept continuous visualProgress.

Verify:

integer progress looks identical to resting reference.


⸻


81. N5 — DIRECT LENS INTERACTION PARITY

Tune:

* press
* drag
* stretch
* edge resistance
* release

against approved reference behaviour.


⸻


82. N6 — TOP-LEVEL PAGE VIEWPORT

Add previous/current/next page composition behind a feature flag.

Verify:

* accessibility isolation
* data isolation
* no duplicate subscriptions


⸻


83. N7 — GESTURE ARBITRATION

Implement:

* horizontal/vertical intent
* nested-horizontal exclusion
* iOS edge exclusion
* route swipe policy
* modal ownership


⸻


84. N8 — WHOLE-PAGE DIRECT MANIPULATION

Connect pointer progress to:

* page translation
* lens position
* icon interpolation

using one visualProgress.


⸻


85. N9 — RELEASE PHYSICS

Add:

* velocity sampling
* projected target
* spring settle
* cancel
* commit
* single transition ownership


⸻


86. N10 — TAB MEMORY

Add:

* remembered internal route
* scroll restoration
* deep-link correctness
* Back correctness


⸻


87. N11 — INTERRUPTION HARDENING

Test and recover from:

* pointercancel
* lost capture
* orientation
* resize
* background
* resume
* auth change
* route redirect
* keyboard
* modal opening


⸻


88. N12 — ACCESSIBILITY + PERFORMANCE

Finish:

* Reduced Motion
* Reduced Transparency
* screen-reader isolation
* focus
* large text
* frame profiling
* quality degradation


⸻


89. N13 — ORGANIZER PARITY

Apply shared physics to:

Overview
Tasks
Control
Live
More

Enable full page swipe only where route policy is safe.


⸻


90. N14 — FINAL PARITY CERTIFICATION

Required exact-candidate-SHA evidence:

* approved Instagram reference baseline
* geometry token comparison
* human parity review
* Solaris screenshot golden pass
* TypeScript
* unit tests
* lint
* production build
* V3 contract tests
* gesture tests
* accessibility tests
* local-Supabase Browser Audit
* real-device iPhone test
* performance evidence
* no production egress from automation


⸻


PART XVI

RELEASE BLOCKERS


91. VISUAL BLOCKERS

Do not call this complete if:

* silhouette visibly differs from reference
* bar width/height visibly differs
* screen inset visibly differs
* selected lens is wrong size
* selected lens sits differently
* icon centers differ noticeably
* icons are visibly oversized/undersized
* default mobile labels appear without approved exception
* compact state looks like a generic CSS scale
* bar resembles a generic frosted card
* Apple glass enhancement overwhelms Instagram geometry


⸻


92. INTERACTION BLOCKERS

Do not call this complete if:

* press feels delayed
* lens lags finger
* page lags finger
* page and lens desynchronize
* release discards velocity
* fast flick behaves like slow drag
* edge resistance feels hard/clipped
* compact/expanded state jitters
* whole-page swipe triggers a second route animation


⸻


93. SAFETY BLOCKERS

Do not call this complete if:

* vertical scroll is stolen
* charts/carousels are stolen
* iOS Back is blocked
* critical forms can be accidentally swiped away
* accessibility tree exposes preview pages
* hidden focus remains offscreen
* preview loading causes duplicated production reads
* CI touches production Supabase
* interrupted gesture leaves stale transforms


⸻


PART XVII

DEFINITION OF DONE


94. VISUAL

At first glance:

the mobile bottom navigation is recognizably the same composition and proportions as the approved current Instagram iPhone floating tab bar.

The obvious differences are:

* Solaris symbols
* Solaris content
* slightly more Apple-like Liquid Glass


⸻


95. INTERACTION

The user can:

tap
press
drag the lens
flick to a neighboring tab
slow-swipe the whole page
cancel
commit
scroll to minimize
scroll upward to restore

and all of those interactions feel like one coherent physical system.


⸻


96. ROUTING

The interaction remains honest:

route owns canonical selection
gesture owns temporary visual progress
deep links work
Back works
per-tab memory works
refresh works
PWA resume works

⸻


97. ACCESSIBILITY

No important capability requires:

* swipe
* drag
* motion
* colour
* haptics
* long press


⸻


98. PERFORMANCE

Direct manipulation remains responsive.

Optical richness degrades before interaction correctness.


⸻


99. RELIABILITY

Every gesture ends in a valid canonical state.

Every preview obeys auth/publication/permission rules.

Every automated test remains isolated from production Supabase.


⸻


100. FINAL ACCEPTANCE STATEMENT

Solaris Studio V3 navigation is complete only when:

a reviewer can place the approved Instagram reference beside Solaris and see essentially the same mobile tab-bar geometry and interaction composition,

while Solaris visibly differs through its own symbols and content,

and Solaris’s material feels slightly closer to Apple’s richer Liquid Glass treatment.

The implementation underneath may be completely different.

The observable experience must not look like a loose interpretation.

It must look like the intended reference has been transplanted into Solaris Studio and then given a modestly more Apple-like glass material.


⸻


APPENDIX A

CANONICAL OWNERSHIP SUMMARY

Instagram frozen reference
Owns:
visible geometry and interaction-parity target

Solaris V3 design system
Owns:
symbols, accessibility, material enhancement and responsive constraints

V3AppShell
Owns:
shell integration

SolarisTopLevelNavigationController
Owns:
visualProgress, gesture lifecycle, target resolution and transition coordination

V3LiquidTabBar
Owns:
shell, glass, lens, icons and local pointer interaction

TopLevelNavigationViewport
Owns:
previous/current/next live-page composition

TopLevelGestureCoordinator
Owns:
gesture arbitration

interaction-physics
Owns:
rubber band, velocity projection, release and spring helpers

TanStack Router
Owns:
canonical route and history

V3 projections
Own:
domain-facing state

Supabase/backend
Own:
canonical domain truth, never transient animation state


⸻


APPENDIX B

SOURCE BASIS

Design/reference direction should be validated against:

* current approved Instagram iPhone floating Liquid Glass reference
* Meta public documentation of the simplified swipe-between-tabs navigation direction
* Apple Human Interface Guidelines for tab bars
* Apple Liquid Glass design guidance
* existing Solaris Studio V3 canonical blueprint
* Public V3 specification
* Organizer V3 specification
* V3 System Integrity specification

The Instagram reference is a visual and behavioral benchmark.

It does not imply access to Meta proprietary source code or private implementation details.

---

## Part 2. Top System Safe Zone and viewport protection

CRITICAL SOLARIS STUDIO V3 UI RULE

TOP SYSTEM SAFE ZONE / MOBILE TOP-EDGE PROTECTION

STATUS

This instruction is permanent and canonical for Solaris Studio V3 / TerraOS 3.

It applies to:

* Public;
* Participant;
* Fan;
* Organizer;
* Confirmation;
* maintenance;
* Live;
* Results;
* Me;
* authentication;
* settings;
* PWA;
* all current and future mobile screens;
* all shared shell/header components.

This rule must not be forgotten, weakened, bypassed or replaced by page-specific hacks.

⸻

1. WHY THIS RULE EXISTS

Solaris Studio has already exhibited a real mobile/PWA failure where meaningful top-screen content, including TerraOS branding, entered the operating-system/top-edge visual region and became blurred or partially obscured.

This is unacceptable.

The mobile operating system, browser, PWA container, status bar, Dynamic Island/sensor region, browser chrome or future platform UI may visually interfere with the uppermost area of the viewport.

Solaris must therefore never assume that the physical top edge of the viewport is safe for important content.

⸻

2. ABSOLUTE RULE

NO meaningful, semantic or interactive Solaris Studio UI may enter the Top System Safe Zone.

The Top System Safe Zone is a protected exclusion region between the physical top of the viewport and the beginning of meaningful application chrome/content.

This rule applies even if content appears technically visible on one device.

If meaningful UI can overlap, blur into, clip behind, visually merge with or become obscured by system chrome on another supported device or PWA mode, the implementation is incorrect.

⸻

3. WHAT MAY ENTER THE SAFE ZONE

Only nonessential decorative material may extend into the Top System Safe Zone.

Allowed:

* background colours;
* gradients;
* ambient glow;
* nonessential artwork;
* decorative imagery;
* decorative blur;
* noninteractive material continuation;
* background Liquid Glass treatment;
* purely visual effects.

These elements may render edge-to-edge so Solaris can retain a premium full-screen appearance.

⸻

4. WHAT MUST NEVER ENTER THE SAFE ZONE

The following must remain completely below the effective safe-content boundary:

* readable logos;
* product names;
* edition names;
* text;
* headings;
* breadcrumbs;
* page titles;
* buttons;
* navigation controls;
* menus;
* avatars;
* status chips;
* badges where meaningful;
* tabs;
* form controls;
* search fields;
* confirmation controls;
* sign-in/sign-out controls;
* back buttons;
* close buttons;
* Organizer context;
* edition/show context;
* interactive icons;
* tap targets;
* accessibility-critical content;
* any other semantic or interactive UI.

If the user needs to read it, understand it, tap it, focus it or navigate with it, it belongs below the safe zone.

⸻

5. CANONICAL MOBILE TOP STRUCTURE

All supported mobile layouts should conceptually follow:

PHYSICAL SCREEN TOP
│
├─ Operating-system / browser chrome
│
├─ SystemTopBackdrop
│   decorative background may continue here
│
├─ TOP SYSTEM SAFE ZONE
│   NO meaningful UI
│
├─ AppTopChrome
│   branding / context / actions
│
├─ Page content
│
├─ Bottom obstruction space
│
├─ Floating bottom navigation
│
└─ System bottom safe area

The top safe zone and the application header are not the same thing.

Do not create a giant header merely to absorb safe-area spacing.

Correct architecture:

safe space
+
compact application header
+
content

Not:

one huge header with arbitrary top padding

⸻

6. SHARED SHELL OWNERSHIP

The Top System Safe Zone is owned by the global V3 application shell / viewport system.

Individual routes must not independently invent their own safe-area handling.

Do not allow:

padding-top: 54px;

on one page,

padding-top: 62px;

on another,

and yet another custom workaround elsewhere.

That produces inconsistent behaviour and guarantees future regressions.

The shell must expose one canonical top-safe boundary which all screens inherit.

⸻

7. CANONICAL SAFE-AREA INPUT

The implementation should use platform-provided safe-area information where available, including:

env(safe-area-inset-top)

through a central shared token or layout primitive.

Individual components should consume the shared Solaris token rather than repeatedly reading platform environment values themselves.

Conceptually:

platform safe-area information
↓
Solaris safe-area resolver
↓
canonical top-safe token
↓
global shell
↓
all screens

⸻

8. DEFENSIVE IOS / PWA RULE

Solaris must not blindly trust that iOS standalone PWA safe-area values are always perfect.

The shared shell must support a defensive iOS standalone fallback where the reported top inset is absent, suspiciously small or otherwise known to be unreliable.

Conceptually:

effectiveTopSafeArea =
max(
  reportedPlatformSafeArea,
  requiredStandaloneIOSMinimum
)

The exact fallback must be validated against supported iPhones.

The fallback belongs in the shared platform/shell system.

It must never be copied into individual routes.

⸻

9. COMFORT MARGIN

Meaningful UI should not begin exactly on the mathematical safe-area boundary.

A small additional Solaris comfort margin should exist between:

system-safe boundary

and:

meaningful AppTopChrome

This protects against visual edge effects, blur, clipping and cramped composition.

The value should be centralized as a design token.

⸻

10. EDGE-TO-EDGE DESIGN MUST REMAIN

This rule does not mean Solaris should stop being visually edge-to-edge.

Backgrounds may still fill the entire display.

For example:

status bar
████████████████████████
decorative background
████████████████████████
protected safe region
╭────────────────────────────╮
│ TerraOS 3      Confirmation│
╰────────────────────────────╯

The screen should still feel immersive.

Only important content is moved into a guaranteed readable region.

Do not solve this by placing a visibly unrelated black rectangle above every page.

⸻

11. LIQUID GLASS RULE

Liquid Glass may visually extend into the Top System Safe Zone only as noninteractive material/background.

Meaningful content inside glass must remain below the safe-content boundary.

Allowed:

system area
≈≈≈ ambient glass/background continuation ≈≈≈
safe boundary
[ readable glass control ]

Forbidden:

system blur
[ important text + button inside it ]

The existence of a glass container does not make otherwise unsafe content acceptable.

⸻

12. STICKY AND FIXED HEADERS

Sticky and fixed top chrome must obey the same safe-zone contract.

A sticky header must never move into the system exclusion region.

Preferred architecture:

Global shell reserves safe zone
↓
sticky header operates inside safe application viewport
↓
header may use top: 0 inside that safe viewport

Avoid requiring each sticky component to independently calculate device safe areas.

⸻

13. SCROLLING

Scrolling must never pull meaningful header content into an unsafe region.

If top chrome:

* collapses;
* minimizes;
* morphs;
* becomes translucent;
* becomes sticky;
* hides;
* reappears;

the effective safe boundary must remain respected throughout the transition.

Animation must never temporarily move semantic or interactive content into the unsafe region.

⸻

14. ORIENTATION

The implementation must remain correct after:

* portrait → landscape;
* landscape → portrait;
* device rotation;
* viewport resize;
* browser chrome changes;
* PWA resume.

Do not cache one safe-area value forever if the platform can change it.

⸻

15. KEYBOARD AND VISUAL VIEWPORT

Keyboard opening or closing must not cause the top chrome to jump into the system area.

Changes to the visual viewport must preserve the canonical top exclusion region.

Keyboard-specific viewport logic must not overwrite or bypass safe-area handling.

⸻

16. PWA LAUNCH AND RESUME

The safe-zone behaviour must work during:

* cold PWA launch;
* warm launch;
* session restore;
* PWA resume;
* navigation after restore;
* orientation changes after resume.

The application must not initially render meaningful UI in the unsafe region and then shift it downward after JavaScript loads.

Where possible, the initial frame should already respect the safe area.

⸻

17. PLATFORM BEHAVIOUR

The system must degrade correctly across platforms.

iPhone / iOS

Use real safe area plus defensive standalone-PWA handling.

Android

Use platform-safe values without inheriting iOS-only fallback behaviour.

Tablet

Use the actual platform/layout context.

Desktop

Do not create a large artificial empty top strip where no safe inset is required.

Never implement the feature using a rule such as:

if screen width < X:
    add 60px

Viewport width is not a safe-area model.

⸻

18. ACCESSIBILITY

The Top System Safe Zone must not:

* alter semantic document order;
* create invisible focusable elements;
* hide focused controls;
* reduce touch-target size;
* require transparency to understand controls;
* interfere with VoiceOver or screen readers.

Semantic order remains normal.

The safe zone is primarily a layout boundary.

⸻

19. REQUIRED SHARED PRIMITIVE

Solaris should maintain one reusable viewport/shell primitive responsible for safe-area behaviour.

Conceptually:

MobileSafeViewport
├─ SystemTopBackdrop
├─ SystemTopSafeZone
├─ AppTopChrome
├─ PageViewport
├─ BottomObstructionZone
└─ BottomNavigation

The exact component name may differ.

The architecture may not.

⸻

20. NO PAGE-SPECIFIC SAFE-AREA HACKS

When a new page has a top-overlap problem:

DO NOT immediately add local padding.

First inspect:

1. whether the global shell is being used;
2. whether the route bypasses the safe viewport;
3. whether a fixed/sticky component escapes the safe shell;
4. whether the platform inset is being resolved incorrectly;
5. whether an old legacy layout is overriding global tokens.

Fix the shared/root cause whenever applicable.

Local compensation is acceptable only for a genuinely unique layout and must not duplicate system safe-area logic.

⸻

21. REQUIRED REGRESSION PROTECTION

The safe-zone invariant must have automated regression coverage.

At minimum verify:

meaningfulTopChrome.top
>=
effectiveSafeContentBoundary

Representative semantic children must also remain below the boundary.

Examples:

logo.top >= safeBoundary
button.top >= safeBoundary
headerTitle.top >= safeBoundary

Visual screenshots alone are not sufficient.

Use geometric assertions wherever practical.

⸻

22. REQUIRED REFERENCE CASE

The TerraOS 3 maintenance / Confirmation screen that exposed this defect must become a permanent regression reference.

Tests must prove that:

TerraOS 3 branding

does not intersect the Top System Safe Zone.

And:

Confirmation

does not intersect the Top System Safe Zone.

The layout should remain visually edge-to-edge without either element entering system blur.

⸻

23. REQUIRED DEVICE / MODE COVERAGE

Representative validation should include:

* narrow iPhone portrait;
* large iPhone portrait;
* standalone iOS PWA;
* regular iOS browser where supported;
* iPhone landscape;
* Android mobile;
* Android PWA where relevant;
* tablet;
* desktop.

Also test:

* normal top header;
* sticky header;
* scroll/collapse behaviour;
* PWA cold launch;
* PWA resume.

⸻

24. TEST INFRASTRUCTURE SAFETY

Any Playwright, Browser Audit, visual-regression or PWA test created for this rule must use Solaris Studio’s isolated/local test infrastructure.

Automated testing must never connect to hosted production Supabase.

Do not trade production safety for visual verification.

⸻

25. IMPLEMENTATION REVIEW CHECKLIST

Any new or modified mobile shell/header must be reviewed against:

* [ ]	Does meaningful content remain below the effective top safe boundary?
* [ ]	Does the background remain visually edge-to-edge?
* [ ]	Is safe-area logic centralized?
* [ ]	Is standalone iOS protected?
* [ ]	Is there any hard-coded page-specific top inset?
* [ ]	Does landscape work?
* [ ]	Does PWA launch work?
* [ ]	Does PWA resume work?
* [ ]	Do sticky headers remain safe?
* [ ]	Do scrolling transitions remain safe?
* [ ]	Does Android avoid iOS-specific fallback?
* [ ]	Does desktop avoid unnecessary empty space?
* [ ]	Are interactive controls fully tappable?
* [ ]	Does VoiceOver/focus remain correct?
* [ ]	Are geometric regression checks present?

If any required answer is no, the implementation is incomplete.

⸻

26. DEFINITION OF DONE

Top safe-area support is considered complete only when:

1. meaningful mobile UI never enters the system top exclusion zone;
2. the shell centrally owns the boundary;
3. iOS standalone PWA has defensive protection;
4. backgrounds still render edge-to-edge;
5. sticky/fixed headers respect the boundary;
6. scrolling animations cannot violate it;
7. orientation changes remain correct;
8. PWA launch and resume remain correct;
9. Android behaviour remains correct;
10. desktop does not receive unnecessary spacing;
11. route-specific safe-area hacks have been removed where superseded;
12. geometric regression tests enforce the rule;
13. representative device screenshots are correct;
14. automated verification uses isolated test infrastructure.

⸻

27. DECISION RULE FOR FUTURE CHATGPT / CODING AGENTS

When implementing or modifying any Solaris Studio mobile page, shell, header, navigation surface or PWA layout:

Always inspect top safe-area behaviour before considering the work complete.

If meaningful content can enter the operating-system top region:

FIX THE SHARED SHELL OR LAYOUT ARCHITECTURE.

Do not merely reposition one screenshot until it happens to look acceptable.

Do not remove the exclusion zone because another design looks visually tighter.

Do not trade safe-area protection for a few extra pixels of screen space.

Do not assume a page is safe because it works on one phone.

The Top System Safe Zone is part of the permanent Solaris Studio V3 layout contract.

⸻

FINAL CANONICAL RULE

Solaris Studio V3 must always reserve a platform-aware Top System Safe Zone above meaningful mobile application content. Background and decorative material may extend edge-to-edge through this zone, but readable, semantic and interactive UI must remain fully below the effective safe-content boundary. The global application shell owns this boundary using platform safe-area information plus defensive standalone-iOS handling where necessary. Individual screens must never bypass, duplicate or independently recreate this protection.
