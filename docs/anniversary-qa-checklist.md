# Anniversary QA checklist

Run against the deployed Worker after the fix is merged.

- fresh/private browser session
- `/?anniversary=active` at 390 px and 430 px
- desktop homepage takeover
- reduced-motion mode
- direct reload and client-side navigation for `/anniversary`, `/countries`, `/records`, `/my-solaris`, `/archive-games`
- Homepage headline facts: 7 chapters, 61 countries, 307 entries, Diaria SSC21 611 latest champion
- Anniversary Hub must not treat SSC22 private zero-point standings as history
- MySolaris displays `Your Solaris story` for a linked country account
- `?anniversary=off` clears sticky preview state
- countdown and afterglow stay task-safe
- final CI rerun must use a clean checkout of the current PR head
