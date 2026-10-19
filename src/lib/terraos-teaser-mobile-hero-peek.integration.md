# TerraOS mobile hero peek integration contract

This tiny note exists to make the production intent explicit for future regression work:

- Initial mobile viewport: TerraOS copy + launch date + countdown remain dominant.
- The real centre Home phone may expose only a restrained top-edge hint at the viewport bottom (target: about 26 px).
- The hint must not enter the countdown region.
- The centre phone rises only as the countdown finishes.
- Side phones remain hidden until the later ensemble phase owned by the main mobile sequencing layer.
- The peek yields completely before the hero-to-first-look handoff owns the centre device.
