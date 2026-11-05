# Solaris V3: finish the outstanding recoverable media safely

**2026-11-05 operator addendum to PR #2045.** No CI/build/browser test may contact hosted Supabase. All production operations below are owner-initiated manual actions, retaining platform `read_only` and the original private quarantine.

## Verified live baseline

- Current country flags: 60/67. Missing original files for **Agrise, Calgaria, Perster, Piglio, Poutsa, Tal Di Fjeme and Zeronia**. None of their flags appears in the pinned 54-object legacy public archive, other destination Storage buckets, `contest_entities.flag_image` or `voters.flag_image`. Do not invent them or borrow another country's flag.
- 7 recovered edition artworks already referenced.
- 8 verified, active country backgrounds, synchronized in legacy and `design_v2.background`.
- 9 existing gallery rows, linked to 9 restored public images with audited entries.
- 25 `country_edition_identities` rows have deliberately preserved historical display names and null historical flag references; 17 have at least one candidate flag belonging to the same country in the restored archive; **8 Asteria/Epito or Diaria/Duto entries have no original flag candidate**.
- 1 Yaria original gallery JPEG (`img_6209.jpeg`, 5,679,181 bytes) still in private `solaris-upload-quarantine`, never republish the original over 5 MiB.
- Every recovery remains distinct from normal Organizer/Participant workflows.

## A. Original image for Yaria's remaining gallery photo

The original image from `verified-public-media.zip` was independently validated:
- Original 5,679,181 bytes; SHA-256 `c9acea728aa70feaa60ce1693d4d0251772debc9f40a57f7979b84ca970fe028`.
- Optimized derivative `img_6209-v3-5mib-candidate.jpeg`: **5,107,168 bytes**, JPEG 5184 x 3456, SHA-256 `5db557d0f713442570fd6a5a7466ea593ecc3a3e493c6f3f17c8f2ac5188ee0b`.
- Optimized candidate ZIP is a **conversation artifact**, NOT committed to the repository, to protect recovery provenance.
- Approved new public path is **not** the original name:
  `e38e88bf-0d17-4eae-9e7e-7b27acf6f4eb/gallery/yaria-img_6209-recovered-optimized-v3-5db557d0f713.jpeg`.

In the browser download `Yaria-SSC-gallery-optimized-recovery.zip` from the chat and upload it into the Codespaces explorer, e.g. the repository root. Run:

```bash
git switch v3/sys-media-storage-recovery-20261104
git pull --ff-only
node --test scripts/lib/v3-yaria-gallery-derivative.test.mjs

unzip -j ./Yaria-SSC-gallery-optimized-recovery.zip -d ~/solaris-yaria-recovery

node scripts/v3-yaria-optimized-gallery-recovery.mjs \
  --manifest ./checksums.json \
  --candidate ~/solaris-yaria-recovery/img_6209-v3-5mib-candidate.jpeg \
  --inspect
```

Inspect the candidate image before authorizing publication. The **original private quarantine object remains untouched** in every path.

If the candidate is the approved visually faithful derivative and the exact-head tests pass, explicitly authorize **this distinct Storage upload**, using credentials already protected as Codespaces secrets:

```bash
export SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED=YES_READ_DESTINATION
export SOLARIS_RECOVERY_YARIA_DERIVATIVE_APPROVED=I_APPROVE_PUBLISHING_VERIFIED_YARIA_OPTIMIZED_GALLERY_DERIVATIVE

node scripts/v3-yaria-optimized-gallery-recovery.mjs \
  --manifest ./checksums.json \
  --candidate ~/solaris-yaria-recovery/img_6209-v3-5mib-candidate.jpeg \
  --execute
```

The owner-only command checks actual GitHub admin owner, the destination mode and bucket privacy, confirms Yaria's canonical row, checks no duplicate gallery reference, downloads/verifies private ORIGINAL by SHA-256, uploads the optimized exact pinned public derivative to a new non-overwriting key, downloads/verifies public derivative by SHA-256 and generates a **separate, audited, guarded SQL** file:

`~/solaris-yaria-optimized-gallery-reference.sql`

The command has NOT added a DB reference. Review this file before running it **once** in the destination project's protected Supabase SQL Editor: https://supabase.com/dashboard/project/dkxmnvekiopyesuzggeu/sql/new

The SQL checks mode, original private and optimized public Storage objects, byte size/MIME, no existing reference, inserts exactly one new `country_media` item, and writes one audit entry. Expected gallery total then 10 (including 4 Yaria photographs); original private object remains intact.

## B. 25 historical country-edition identities

Historical names, flags and `contest_entities.historical_identity_override` are display-only snapshots. Never change `public.countries.flag_image` to adjust any of them.

Existing historical names are: Asteria/Epito (2), Diaria/Duto (6), Linem (7), Oland & Velithara (1), Otelia (2), Yaria (7). **No archived flag image exists for Asteria/Epito or Diaria/Duto**, so 8 rows are explicitly unresolvable without finding their original art.

The remaining 17 rows have candidate files from *their own country's* restored Storage objects. Those candidates are NOT automatically valid for all editions, even if a filename contains a year.

The manual read-only reviewer fetches the **live current historical-identity snapshot** and its linked `contest_entities`, checks per-edition historical overrides, and builds a public-only preview.

```bash
git switch v3/sys-media-storage-recovery-20261104
git pull --ff-only
node --test scripts/lib/v3-historical-country-flag-recovery.test.mjs

export SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED=YES_READ_DESTINATION
node scripts/v3-historical-country-flag-reference-recovery.mjs \
  --manifest ./checksums.json \
  --prepare
```

Private files generated:

- `~/solaris-historical-flags-preview/index.html`
- `~/solaris-historical-edition-flags-selection.json` (ALL choices null).

To review, start a server serving **only this directory**, keep port 8768 Private in Codespaces:

```bash
python3 -m http.server 8768 --bind 127.0.0.1 \
  --directory ~/solaris-historical-flags-preview
```

Choose a historical image only when you know which flag the country used in the specific SSC edition. Unselected edition = keep existing fallback. Download the selection JSON and upload it into Codespaces; move to private home:

```bash
mv ./solaris-historical-edition-flags-selection.json \
   ~/solaris-historical-edition-flags-selection.json
```

Stop the server with Ctrl+C. Only after confirming the exact selected edition mapping, explicitly authorize this **separate historical-reference-only** change:

```bash
export SOLARIS_RECOVERY_HISTORICAL_FLAGS_APPROVED=I_APPROVE_SELECTED_EDITION_SPECIFIC_FLAG_RESTORATION

node scripts/v3-historical-country-flag-reference-recovery.mjs \
  --manifest ./checksums.json \
  --approve \
  --selection ~/solaris-historical-edition-flags-selection.json
```

The `--approve` phase checks GitHub repository ownership; compares the complete live 25-row identity snapshot to the one you reviewed; rechecks public flag bytes (SHA-256/size/MIME) and generates SQL **without writing a reference**:

`~/solaris-historical-edition-flags-reference-repair.sql`

Review the SQL and run once in protected destination Supabase SQL Editor. It atomically rechecks current historical names, edition IDs, canonical country IDs, `historical_identity_override=true`, blank historic flags and original Storage identities. Only the selected `country_edition_identities.flag_image` and corresponding `contest_entities.flag_image` are updated, plus audit. No current flag changes, identity renaming or voting changes. If any historical mapping is uncertain, **leave it unselected** rather than inventing history.

## C. Seven country flags missing from every recovered source

The remaining missing countries are:
- Agrise (`AGR`)
- Calgaria (`CAL`)
- Perster (`PER`)
- Piglio (`PIG`)
- Poutsa (`POU`)
- Tal Di Fjeme (`TAL`)
- Zeronia (`ZER`)

No available verified original flag files exist in the old 54-image ZIP, current public Storage, `contest_entities.flag_image` or `voters.flag_image`. Re-creating or borrowing flags would be a content change, NOT original recovery.

Find official source files in:
- older local backups/phone downloads of participant flags;
- legacy CDN/R2 backup or export for the earlier Solaris deployments;
- original Organizer/HoD media uploads or saved country identity artwork.

Once one original is supplied, verify ownership/visual identity and use the approved verified country-media upload process plus a new **scoped, no-overwrite** flag reference repair. Keep `read_only` for general mutations. Never insert fictional image placeholders merely to reach 67/67.

## Final certification

Do not conflate these manual recovery outcomes with complete V3 release certification:
- Re-verify live DB reference counts, original/current flag distinctions, stored-object MIME/size, no orphan records and audit tickets.
- Render Country/Hero/Wiki/Explore on desktop and mobile (especially V2 image backgrounds).
- Ensure public CountryMedia photos appear in page gallery. Check Yaria's gallery order; any duplicate-looking Jaudia img_0108 variants should be deliberate.
- Original private Yaria asset stays private; public derivative is under 5 MiB.
- Global maintenance and `read_only` restrictions stay effective for unrelated workflows.
- PR #2045 remains draft until exact final-head Quality, Browser Audit, S13, S15 and bundle checks and reviewed release gates all pass.

Never expose service_role tokens or local private JSON in Git, preview web pages, or chat.
