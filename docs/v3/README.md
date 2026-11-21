# Solaris Studio V3: canonical specifications

**One feature, one source of truth.** This directory is the persistent GitHub home for Solaris Studio V3 specifications. It is intended to replace the confusing collection of competing uploaded plans with one active authority per subject. The documents were sourced from the project's owner-provided attachments; this reorganization is proposed for owner review and becomes the repository's canonical documentation structure after approval/integration.

## Start here

1. Read root `AGENTS.md` for repository safety, coordination, and merge procedures.
2. Use **this index** to select the one active specification that owns your task.
3. Read the full applicable file in `specs/` before changing the relevant code.
4. Check current `main`, open PRs, current feature/migration registries and exact-head CI. Documentation specifies intended behavior; the current repository proves implementation status.
5. Use `archive/` only for historical comparison or to reconcile an omitted requirement into the active spec. Do not implement archived design plans as separate, simultaneous authorities.

## Active feature owners

| What you are implementing | Read this single active authority | Boundary |
|---|---|---|
| Overall V3 product, capability coverage, information architecture and cross-product cohesion | [PRODUCT.md](specs/PRODUCT.md) | Does not replace domain-specific authority |
| Public / Fan / Participant workflows and features | [PUBLIC.md](specs/PUBLIC.md) | Current authorization/publication comes from System |
| Organizer operations, O0–O18, edition/show context, risk-tiered administration | [ORGANIZER.md](specs/ORGANIZER.md) | No independent System authority |
| Database, canonical writers, recovery, migration, security, events and cross-system integrity | [SYSTEM.md](specs/SYSTEM.md) | One authority for critical state |
| Terra Solaris World, GUARD, UNITY, institutions, elections, courts, TG0–TG19 | [WORLD.md](specs/WORLD.md) | Do not invent world canon |
| **All visual design: Country/Edition cinema, other pages, responsive layouts, three experiences, Organizer visual UX** | **[DESIGN.md](specs/DESIGN.md)** | The **only** active page-layout/design guide. Earlier overlapping design plans are archived. |
| **Navigation, floating bottom bar, gestures and global top-system safe zone** | **[NAVIGATION.md](specs/NAVIGATION.md)** | The **only** active navigation/viewport geometry guide; accessibility and safety override visual imitation |
| Release classification, exact-SHA proof and full V3 certification | [RELEASE.md](specs/RELEASE.md) | No implied release authorization |
| Production Supabase isolation and egress protection | [SAFETY.md](specs/SAFETY.md) | Absolute protection, never overridden for convenience |
| Engineering implementation process and efficient execution | [EXECUTION.md](specs/EXECUTION.md) | Follow current one-task-one-owner queue and merge policy |
| Jury Vote Share Cards (specific product feature) | [JURY_SHARE.md](specs/JURY_SHARE.md) | Public/Security/Results rules override visual customization |

## A feature must not have two active design owners

Examples:
- Country detail and MySolaris cinematic editor layout → **DESIGN**, media pipeline and publish authority → **SYSTEM**.
- Edition detail and chronology composition → **DESIGN**, winner/publication identity → **PUBLIC/SYSTEM**.
- Installed dock and iPhone safe region → **NAVIGATION**, page layouts around it → **DESIGN**.
- World body page composition → **DESIGN**, institutional votes or membership → **WORLD/SYSTEM**.
- Organizer filter layout and accessibility → **DESIGN**, review/authorization and operational consequences → **ORGANIZER/SYSTEM**.

These splits are **non-overlapping responsibilities**, not competing versions of the same feature. If two documents appear to govern the same rule, reconcile that rule into the single correct owning file with a focused review; do not silently pick an older paragraph.

## Precedence and change control

1. Explicit newer owner instructions.
2. Security, privacy, production Supabase isolation and canonical data integrity.
3. Domain-specific active spec for that responsibility.
4. [DESIGN.md](specs/DESIGN.md) for visual composition and three frontend experiences.
5. [NAVIGATION.md](specs/NAVIGATION.md) for shell viewport/gesture rules.
6. [PRODUCT.md](specs/PRODUCT.md) for cross-domain product ambiguity.
7. Archived historical plans **only** for provenance or a newly discovered unresolved requirement.

The more-specific domain rules do not give permission to bypass production safety. The current repository and exact-head test evidence determine whether an implementation is actually finished, independent of what a plan says.

## Evidence and release rules

- Do not interpret repository file presence, merged code, preview layouts or passing component tests as full V3 certification.
- A candidate needs exact-SHA checks, meaningful workflow and visual evidence, correct rollback and relevant owner approvals.
- Automated QA uses isolated loopback Supabase only; never hosted production, including browser, screenshot and migration rehearsals.
- Production migration, production deployment, public writes and rollout activation each require separate explicit authorization.
- GitHub-connected `main` may trigger Cloudflare deployment. **Do not merge this documentation PR solely because it is docs-only without checking and obtaining the necessary authorization.**
- Current task/integration coordination remains [issue #574](https://github.com/solarissongcontest/solarisstudio/issues/574) and [merge-review-policy.md](merge-review-policy.md).

## Historical full sources

See [archive/README.md](archive/README.md). Older uploaded sources have been kept for auditability, but **must not be offered to coding agents as a second set of active instructions**. The former `Solaris Studio tasks.pdf` is a dated 8 November execution queue, not a canonical product spec; it is not needed to interpret the active plans and is not reproduced here.

## Imported-text fidelity

Active original-source texts were copied from the project attachments through an indexed text interface. A few long documents may have trivial normalized line-boundary differences from the uploaded UTF-8 originals; no semantic edits were intended in these source copies. The synthesized `DESIGN.md` is intentionally **not a byte-exact original**: it resolves and organizes overlapping visual requirements. For legal/archival byte-for-byte proof, compare against the original source bundle's SHA256 manifest rather than assuming the GitHub text import preserves byte identity.
