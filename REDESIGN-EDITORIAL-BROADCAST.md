# Solaris Studio Editorial Broadcast Redesign

This branch shifts Solaris Studio from glass-first UI to a broadcast newsroom + data platform system.

## Core rules

- Editorial/data UI is the default.
- Atmospheric imagery remains, but is darker and better integrated.
- Liquid glass is reserved for navigation, overlays and a small number of premium interactive surfaces.
- Default content panels use denser solid surfaces and smaller radii.
- Page headers use stronger display typography and editorial divider treatment.
- Mobile spacing is tighter and controls remain touch-friendly.

## Shared primitives

`Panel` now supports four variants:

- `data` (default): dense analytics/data surface
- `editorial`: open content section with divider
- `glass`: selective liquid-glass treatment
- `plain`: container-free layout

`PageHeader` now provides the newsroom hierarchy used across public and analytics pages.

`StatTile` is more number-led and designed to work in compact statistical strips.

## Navigation

Primary desktop navigation is Home / Editions / Countries / Analysis / Tools, with role-specific and secondary items following. Advanced tools stay grouped under Tools.

## Visual balance

Target balance:

- 70% editorial/data interface
- 20% atmospheric imagery
- 10% glass

The shared-system changes intentionally affect existing pages globally so the redesign remains consistent instead of creating isolated redesign islands.
