from pathlib import Path

seed = Path('.github/scripts/seed-browser-e2e-local.sh')
seed_source = seed.read_text()
seed_anchor = '\nlog "Creating local-only browser identities"\n'
if seed_source.count(seed_anchor) != 1:
    raise SystemExit('Browser seed insertion anchor changed')
fixture = r'''

log "Seeding publication-safe local Results fixture"
db_exec "
insert into public.shows (
  id, edition_id, name, kind, sort_order, published, publication_config
)
values (
  '00000000-0000-4000-8000-00000000e231'::uuid,
  '00000000-0000-4000-8000-00000000e220'::uuid,
  'Browser Audit Grand Final',
  'grand-final',
  3,
  true,
  '{\"participants\":true,\"artists\":true,\"songs\":true,\"semi_split\":true,\"running_order\":true,\"qualifiers\":true,\"results\":true,\"jury_results\":true,\"televote_results\":true,\"detailed_voting\":false}'::jsonb
)
on conflict (id) do update
set name = excluded.name,
    kind = excluded.kind,
    sort_order = excluded.sort_order,
    published = excluded.published,
    publication_config = excluded.publication_config;

insert into public.results (
  id, edition_id, show_id, country_id,
  jury_points, televote_points, total_points, final_rank
)
values
  (
    '00000000-0000-4000-8000-00000000e241'::uuid,
    '00000000-0000-4000-8000-00000000e220'::uuid,
    '00000000-0000-4000-8000-00000000e231'::uuid,
    '00000000-0000-4000-8000-00000000e201'::uuid,
    160, 152, 312, 1
  ),
  (
    '00000000-0000-4000-8000-00000000e242'::uuid,
    '00000000-0000-4000-8000-00000000e220'::uuid,
    '00000000-0000-4000-8000-00000000e231'::uuid,
    '00000000-0000-4000-8000-00000000e202'::uuid,
    140, 144, 284, 2
  )
on conflict (id) do update
set edition_id = excluded.edition_id,
    show_id = excluded.show_id,
    country_id = excluded.country_id,
    jury_points = excluded.jury_points,
    televote_points = excluded.televote_points,
    total_points = excluded.total_points,
    final_rank = excluded.final_rank,
    updated_at = now();
"
'''
seed_source = seed_source.replace(seed_anchor, fixture + seed_anchor, 1)

assertion_anchor = '''[[ "$(db_scalar "select count(*) from public.editions where id in ('00000000-0000-4000-8000-00000000e219'::uuid,'00000000-0000-4000-8000-00000000e220'::uuid) and published;")" == "2" ]]   || fail "Both current and archived Edition browser fixtures were not published"\n'''
if seed_source.count(assertion_anchor) != 1:
    raise SystemExit('Browser seed assertion anchor changed')
result_assertion = '''[[ "$(db_scalar "select count(*) from public.results where show_id='00000000-0000-4000-8000-00000000e231'::uuid and final_rank in (1,2);")" == "2" ]]   || fail "Published V3 Results browser fixture was not created"\n'''
seed_source = seed_source.replace(assertion_anchor, assertion_anchor + result_assertion, 1)
seed.write_text(seed_source)

e2e = Path('e2e/account-states.e2e.ts')
e2e_source = e2e.read_text()

enable_anchor = '''  await setV3FeatureForLocalUser(
    url!,
    publishableKey!,
    session,
    "solaris_app_v3_delegation",
    true,
  );
'''
if e2e_source.count(enable_anchor) != 1:
    raise SystemExit('V3 feature enable anchor changed')
enable_results = enable_anchor + '''  await setV3FeatureForLocalUser(
    url!,
    publishableKey!,
    session,
    "solaris_app_v3_results",
    true,
  );
'''
e2e_source = e2e_source.replace(enable_anchor, enable_results, 1)

results_anchor = '''    await expect(primaryNav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await primaryNav.getByRole("link", { name: "Explore", exact: true }).click();
'''
if e2e_source.count(results_anchor) != 1:
    raise SystemExit('Primary navigation Results insertion anchor changed')
results_proof = '''    await expect(primaryNav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await primaryNav.getByRole("link", { name: "Results", exact: true }).click();
    await expect(page).toHaveURL(/\\/results\\/?$/);
    const v3Results = page.locator("[data-v3-results]");
    await expect(v3Results).toBeVisible();
    await expect(page.getByRole("heading", { name: "Results", exact: true })).toBeVisible();
    await expect(v3Results).toContainText("Browser Audit Grand Final");
    await expect(v3Results).toContainText("Browserland");
    await expect(v3Results).toContainText("312");
    await expect(page.locator(".solaris-app-result-hero")).toHaveCount(0);
    await expect(primaryNav.getByRole("link", { name: "Results", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("body")).not.toContainText(/This page didn't load|missing supabase/i);

    await primaryNav.getByRole("link", { name: "Explore", exact: true }).click();
'''
e2e_source = e2e_source.replace(results_anchor, results_proof, 1)

fallback_anchor = '''    // Re-scope only the Edition Hub flag to a non-current published edition. The
'''
if e2e_source.count(fallback_anchor) != 1:
    raise SystemExit('Results fallback insertion anchor changed')
fallback_proof = '''    // Disabling only Results must fail closed to the proven legacy Results root
    // while the global V3 shell remains eligible.
    await setV3FeatureForLocalUser(
      url!,
      publishableKey!,
      session,
      "solaris_app_v3_results",
      false,
    );
    await page.goto("/results", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-v3-results]")).toHaveCount(0);
    await expect(page.locator(".solaris-app-result-hero")).toBeVisible();
    await expect(page.getByText("Browserland", { exact: true })).toBeVisible();

'''
e2e_source = e2e_source.replace(fallback_anchor, fallback_proof + fallback_anchor, 1)

finally_anchor = '''  } finally {
    await setV3FeatureForLocalUser(
      url!,
      publishableKey!,
      session,
      "solaris_app_v3_delegation",
      false,
    );
'''
if e2e_source.count(finally_anchor) != 1:
    raise SystemExit('V3 cleanup anchor changed')
finally_results = '''  } finally {
    await setV3FeatureForLocalUser(
      url!,
      publishableKey!,
      session,
      "solaris_app_v3_results",
      false,
    );
    await setV3FeatureForLocalUser(
      url!,
      publishableKey!,
      session,
      "solaris_app_v3_delegation",
      false,
    );
'''
e2e_source = e2e_source.replace(finally_anchor, finally_results, 1)
e2e.write_text(e2e_source)
