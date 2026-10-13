from pathlib import Path

path = Path('src/lib/studio2-product-surfaces.ts')
source = path.read_text()

if 'solaris_app_v3_rules_guidance: {' not in source:
    anchor = '''    solaris_app_v3_results: {\n'''
    if source.count(anchor) != 1:
        raise SystemExit('Results product-surface anchor changed')
    rules_surface = '''    solaris_app_v3_rules_guidance: {\n      key: "solaris_app_v3_rules_guidance",\n      label: "Solaris App V3 · Rules & Guidance",\n      state: "integrated",\n      audience: "public",\n      route: "/rules",\n      surfaceLabel: "Rules & Guidance V3",\n      dependsOn: ["solaris_app_v3"],\n      description:\n        "Reversible installed-app Rules landing and contextual workflow guidance over the canonical versioned rulebook, with full rule detail, search, chapter and governance tooling remaining canonically owned by the existing Rules domain.",\n    },\n'''
    source = source.replace(anchor, rules_surface + anchor, 1)

path.write_text(source)
