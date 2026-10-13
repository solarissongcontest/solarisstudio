from pathlib import Path

path = Path('src/lib/studio2-product-surfaces.ts')
source = path.read_text()

if 'solaris_app_v3_search: {' not in source:
    anchor = '''    solaris_app_v3_results: {\n'''
    if source.count(anchor) != 1:
        raise SystemExit('Results product-surface anchor changed')
    search_surface = '''    solaris_app_v3_search: {\n      key: "solaris_app_v3_search",\n      label: "Solaris App V3 · Search",\n      state: "integrated",\n      audience: "public",\n      surfaceLabel: "Search V3",\n      dependsOn: ["solaris_app_v3"],\n      description:\n        "Server-gated global V3 shell entry to the canonical installed-app Search experience, backed by the publication-safe lightweight search projection and existing search-return continuity.",\n    },\n'''
    source = source.replace(anchor, search_surface + anchor, 1)

path.write_text(source)
