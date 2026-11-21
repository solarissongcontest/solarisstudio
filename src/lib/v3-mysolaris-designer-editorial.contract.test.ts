import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("MySolaris Country Design web preview-first layout", () => {
  it("keeps one official renderer and one private Hero Studio on the same V2 design draft", () => {
    const source = read("src/components/mysolaris/modules/MySolarisDesignV2Module.tsx");
    expect(source).toContain('className="mysolaris-designer-web-shell');
    expect(source).toContain('className="mysolaris-designer-web-settings');
    expect(source).toContain('className="mysolaris-designer-web-preview');
    expect(source.match(/<CountryHeroStudioPreview/g)).toHaveLength(1);
    expect(source).toContain('design={design}');
    expect(source).toContain('<DesignPreview');
    expect(source).toContain('usePublishCountryDesignV2(country.id)');
    expect(source).toContain('useCountryDesignV2(country.id)');
  });

  it("keeps V3 Hero Studio a private, non-publishing preview and delegates real writes", () => {
    const source = read("src/components/mysolaris/CountryHeroStudioPreview.tsx");
    expect(source).toContain("DESIGN PREVIEW ONLY");
    expect(source).toContain("URL.createObjectURL(file)");
    expect(source).toContain("URL.revokeObjectURL");
    expect(source).not.toContain("supabase.from(");
    expect(source).not.toContain("usePublishCountryDesignV2");
    expect(source).not.toContain("uploadCountryBackground(");
  });

  it("reorders only ordinary web; leaves the installed app unchanged", () => {
    const css = read("src/styles/v3-mysolaris-designer-editorial.css");
    expect(css).toContain('html:not([data-solaris-app]) .mysolaris-designer-web-preview');
    expect(css).toContain('html:not([data-solaris-app]) .mysolaris-designer-web-settings');
    expect(css).toContain("max-width: 1535px");
    expect(css).toContain("order: -1");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (forced-colors: active)");
  });
});
